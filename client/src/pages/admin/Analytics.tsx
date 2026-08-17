import { useEffect, useState, useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import { db } from "@/lib/firebase";
import { 
  collection, 
  query, 
  onSnapshot, 
  where, 
  orderBy,
  Timestamp 
} from "firebase/firestore";
import { 
  LineChart, Line, AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from "recharts";
import { 
  Card, CardContent, CardHeader, CardTitle, CardDescription 
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  Users, MapPin, Calendar, DollarSign, Download, 
  TrendingUp, TrendingDown, Clock, Zap, Leaf, Filter,
  BarChart3, PieChart as PieIcon, Activity, Map as MapIcon
} from "lucide-react";
import { 
  format, subDays, startOfDay, endOfDay, isWithinInterval, 
  startOfHour, eachDayOfInterval, startOfWeek, subWeeks,
  isSameDay, differenceInMinutes, parseISO, parse as parseDate
} from "date-fns";
import { parse as parseCsv } from "json2csv";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue 
} from "@/components/ui/select";

// --- Types ---
interface Booking {
  id: string;
  status: string;
  totalPrice: number;
  kwhDelivered: number;
  duration: number;
  stationId: string;
  stationName: string;
  userId: string;
  createdAt: Timestamp;
}

interface User {
  id: string;
  role: string;
  type?: string; // 'individual' | 'fleet'
  createdAt: Timestamp;
}

interface Station {
  id: string;
  name: string;
}

const COLORS = ["#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];

export default function AdminAnalytics() {
  const { user, userRole, loading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [stations, setStations] = useState<Station[]>([]);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [dateRange, setDateRange] = useState("30"); // days
  const [selectedStation, setSelectedStation] = useState("all");
  const [selectedUserType, setSelectedUserType] = useState("all");

  // --- Auth Guard ---
  useEffect(() => {
    if (!authLoading && (!user || userRole !== "admin")) {
      setLocation("/");
    }
  }, [user, authLoading]);

  // --- Data Fetching ---
  useEffect(() => {
    if (!user || userRole !== "admin") return;

    const unsubBookings = onSnapshot(collection(db, "bookings"), (snap) => {
      setBookings(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Booking)));
      setLastUpdated(new Date());
    });

    const unsubUsers = onSnapshot(collection(db, "users"), (snap) => {
      setUsers(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as User)));
    });

    const unsubStations = onSnapshot(collection(db, "stations"), (snap) => {
      setStations(snap.docs.map(doc => ({ id: doc.id, name: doc.data().name } as Station)));
    });

    return () => {
      unsubBookings();
      unsubUsers();
      unsubStations();
    };
  }, [user]);

  // --- Data Processing ---
  const filteredBookings = useMemo(() => {
    const rangeLimit = subDays(new Date(), parseInt(dateRange));
    return bookings.filter(b => {
      const date = b.createdAt.toDate();
      const inRange = date >= rangeLimit;
      const matchesStation = selectedStation === "all" || b.stationId === selectedStation;
      // Filter by user type would require joining with user data, for now we assume 'individual'
      return inRange && matchesStation;
    });
  }, [bookings, dateRange, selectedStation]);

  const stats = useMemo(() => {
    const totalRevenue = filteredBookings
      .filter(b => b.status === "completed")
      .reduce((sum, b) => sum + (b.totalPrice || 0), 0);
    
    const activeBookings = bookings.filter(b => b.status === "active").length;
    
    // Comparison (Prev 30 days)
    const prevRangeLimit = subDays(new Date(), parseInt(dateRange) * 2);
    const rangeLimit = subDays(new Date(), parseInt(dateRange));
    const prevRevenue = bookings
      .filter(b => b.status === "completed" && b.createdAt.toDate() >= prevRangeLimit && b.createdAt.toDate() < rangeLimit)
      .reduce((sum, b) => sum + (b.totalPrice || 0), 0);

    const revenueGrowth = prevRevenue === 0 ? 100 : ((totalRevenue - prevRevenue) / prevRevenue) * 100;

    return {
      totalRevenue,
      activeBookings,
      revenueGrowth,
      totalUsers: users.length,
      userGrowth: 12.5, // Mock growth for now
      totalStations: stations.length,
      stationGrowth: 5.2
    };
  }, [filteredBookings, bookings, users, stations, dateRange]);

  // Chart 1: Revenue Over Time
  const revenueData = useMemo(() => {
    const days = eachDayOfInterval({
      start: subDays(new Date(), parseInt(dateRange) - 1),
      end: new Date()
    });

    return days.map(day => {
      const dayRevenue = filteredBookings
        .filter(b => b.status === "completed" && isSameDay(b.createdAt.toDate(), day))
        .reduce((sum, b) => sum + (b.totalPrice || 0), 0);
      return {
        name: format(day, "MMM dd"),
        revenue: dayRevenue
      };
    });
  }, [filteredBookings, dateRange]);

  // Chart 2: Bookings by Status
  const statusData = useMemo(() => {
    const counts: Record<string, number> = {
      pending: 0, confirmed: 0, active: 0, completed: 0, cancelled: 0
    };
    filteredBookings.forEach(b => {
      if (counts[b.status] !== undefined) counts[b.status]++;
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [filteredBookings]);

  // Chart 3: Top Stations
  const topStationsData = useMemo(() => {
    const stationRevenue: Record<string, { name: string, revenue: number }> = {};
    filteredBookings
      .filter(b => b.status === "completed")
      .forEach(b => {
        if (!stationRevenue[b.stationId]) {
          stationRevenue[b.stationId] = { name: b.stationName || "Unknown", revenue: 0 };
        }
        stationRevenue[b.stationId].revenue += b.totalPrice;
      });
    
    return Object.values(stationRevenue)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);
  }, [filteredBookings]);

  // Chart 4: User Growth
  const userGrowthData = useMemo(() => {
    const weeks = Array.from({ length: 12 }).map((_, i) => subWeeks(new Date(), 11 - i));
    return weeks.map(week => {
      const count = users.filter(u => u.createdAt.toDate() <= week).length;
      return {
        name: `W${format(week, "w")}`,
        users: count
      };
    });
  }, [users]);

  // Chart 5: Session Metrics
  const sessionMetrics = useMemo(() => {
    const completed = filteredBookings.filter(b => b.status === "completed");
    if (completed.length === 0) return { avgKwh: 0, avgDur: 0, avgRev: 0, co2: 0 };

    const totalKwh = completed.reduce((sum, b) => sum + (b.kwhDelivered || 0), 0);
    const totalDur = completed.reduce((sum, b) => sum + (b.duration || 0), 0);
    const totalRev = completed.reduce((sum, b) => sum + (b.totalPrice || 0), 0);

    return {
      avgKwh: totalKwh / completed.length,
      avgDur: totalDur / completed.length,
      avgRev: totalRev / completed.length,
      co2: totalKwh * 0.43 // 0.43 kg CO2 per kWh average
    };
  }, [filteredBookings]);

  // Chart 6: Heatmap Data
  const heatmapData = useMemo(() => {
    const data: any[] = [];
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    
    for (let day = 0; day < 7; day++) {
      for (let hour = 0; hour < 24; hour++) {
        const count = filteredBookings.filter(b => {
          const d = b.createdAt.toDate();
          return d.getDay() === day && d.getHours() === hour;
        }).length;
        data.push({ day: days[day], hour, count });
      }
    }
    return data;
  }, [filteredBookings]);

  // --- Export Function ---
  const exportReport = () => {
    try {
      const fields = ['date', 'revenue', 'bookings', 'users'];
      const data = revenueData.map(r => {
        const reportDate = parseDate(r.name, "MMM dd", new Date());
        return {
          date: r.name,
          revenue: r.revenue,
          bookings: filteredBookings.filter(b => isSameDay(b.createdAt.toDate(), reportDate)).length,
          users: stats.totalUsers
        };
      });

      const csv = parseCsv(data, { fields });
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      link.setAttribute("href", url);
      link.setAttribute("download", `SeniorDevOps_Analytics_${format(new Date(), "yyyy-MM-dd")}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error("Export failed:", err);
    }
  };

  if (authLoading) return null;

  return (
    <div className="min-h-screen bg-[var(--admin-bg)] text-[var(--admin-text-primary)] transition-colors duration-300 p-6 pb-24 overflow-x-hidden">
      {/* Header */}
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="space-y-1">
            <h1 className="text-4xl font-black bg-gradient-to-r from-emerald-400 via-cyan-400 to-blue-500 bg-clip-text text-transparent tracking-tighter">
              Admin Insights
            </h1>
            <div className="flex items-center gap-2 admin-text-muted text-sm font-medium">
              <Activity className="w-4 h-4 text-emerald-400 animate-pulse" />
              Real-time platform telemetry
              <span className="mx-2">•</span>
              <Clock className="w-3.5 h-3.5" />
              Updated {Math.round((new Date().getTime() - lastUpdated.getTime()) / 1000)}s ago
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Select value={dateRange} onValueChange={setDateRange}>
              <SelectTrigger className="w-[140px] bg-[var(--admin-surface)] border-[var(--admin-border)] rounded-xl h-10 font-bold text-xs uppercase tracking-wider text-[var(--admin-text-primary)]">
                <SelectValue placeholder="Range" />
              </SelectTrigger>
              <SelectContent className="bg-[var(--admin-bg)] border-[var(--admin-border)] text-[var(--admin-text-primary)]">
                <SelectItem value="7">Last 7 Days</SelectItem>
                <SelectItem value="30">Last 30 Days</SelectItem>
                <SelectItem value="90">Last 90 Days</SelectItem>
              </SelectContent>
            </Select>

            <Button 
              onClick={exportReport}
              className="bg-emerald-500 hover:bg-emerald-600 text-black font-black h-10 px-6 rounded-xl uppercase tracking-widest text-[10px]"
            >
              Export Data <Download className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard 
            title="Total Revenue" 
            value={`₹${stats.totalRevenue.toLocaleString()}`} 
            trend={stats.revenueGrowth} 
            icon={DollarSign}
            color="emerald"
          />
          <StatCard 
            title="Active Drivers" 
            value={stats.totalUsers.toLocaleString()} 
            trend={stats.userGrowth} 
            icon={Users}
            color="blue"
          />
          <StatCard 
            title="Active Sessions" 
            value={stats.activeBookings.toString()} 
            trend={0} 
            icon={Activity}
            color="orange"
          />
          <StatCard 
            title="Managed Stations" 
            value={stats.totalStations.toString()} 
            trend={stats.stationGrowth} 
            icon={MapIcon}
            color="purple"
          />
        </div>

        {/* Main Charts Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Revenue Chart */}
          <Card className="lg:col-span-2 admin-glass-card rounded-[32px] overflow-hidden">
            <CardHeader className="border-b border-[var(--admin-border-muted)] bg-[var(--admin-surface)]/20">
              <CardTitle className="text-xl font-black flex items-center gap-2 admin-text-primary">
                <TrendingUp className="w-5 h-5 text-emerald-400" /> Revenue Trajectory
              </CardTitle>
              <CardDescription className="admin-text-muted">Daily completed booking revenue (last {dateRange} days)</CardDescription>
            </CardHeader>
            <CardContent className="p-6 h-[350px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={revenueData}>
                  <defs>
                    <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--admin-border-muted)" />
                  <XAxis dataKey="name" tick={{ fill: 'var(--admin-text-muted)' }} fontSize={10} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: 'var(--admin-text-muted)' }} fontSize={10} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${v}`} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'var(--admin-bg)', borderColor: 'var(--admin-border)', borderRadius: '16px', color: 'var(--admin-text-primary)' }}
                    itemStyle={{ color: "#10b981", fontWeight: 800 }}
                  />
                  <Area type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorRev)" />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Booking Status Distribution */}
          <Card className="admin-glass-card rounded-[32px] overflow-hidden">
            <CardHeader className="border-b border-[var(--admin-border-muted)] bg-[var(--admin-surface)]/20">
              <CardTitle className="text-xl font-black flex items-center gap-2 admin-text-primary">
                <PieIcon className="w-5 h-5 text-blue-400" /> Pipeline Status
              </CardTitle>
              <CardDescription className="admin-text-muted">Current booking distribution</CardDescription>
            </CardHeader>
            <CardContent className="p-6 h-[350px] flex flex-col items-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={statusData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={8}
                    dataKey="value"
                  >
                    {statusData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'var(--admin-bg)', borderColor: 'var(--admin-border)', borderRadius: '16px', color: 'var(--admin-text-primary)' }}
                  />
                  <Legend verticalAlign="bottom" height={36}/>
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Top Stations */}
          <Card className="admin-glass-card rounded-[32px] overflow-hidden lg:col-span-1">
            <CardHeader className="border-b border-[var(--admin-border-muted)] bg-[var(--admin-surface)]/20">
              <CardTitle className="text-xl font-black flex items-center gap-2 admin-text-primary">
                <BarChart3 className="w-5 h-5 text-orange-400" /> Leaderboard
              </CardTitle>
              <CardDescription className="admin-text-muted">Top 10 stations by total revenue</CardDescription>
            </CardHeader>
            <CardContent className="p-6 h-[400px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topStationsData} layout="vertical">
                  <XAxis type="number" hide />
                  <YAxis dataKey="name" type="category" tick={{ fill: 'var(--admin-text-muted)' }} fontSize={10} width={80} axisLine={false} tickLine={false} />
                  <Tooltip 
                    cursor={{fill: 'transparent'}}
                    contentStyle={{ backgroundColor: 'var(--admin-bg)', borderColor: 'var(--admin-border)', borderRadius: '16px', color: 'var(--admin-text-primary)' }}
                  />
                  <Bar dataKey="revenue" fill="#f59e0b" radius={[0, 8, 8, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* User Growth */}
          <Card className="admin-glass-card rounded-[32px] overflow-hidden lg:col-span-1">
            <CardHeader className="border-b border-[var(--admin-border-muted)] bg-[var(--admin-surface)]/20">
              <CardTitle className="text-xl font-black flex items-center gap-2 admin-text-primary">
                <Users className="w-5 h-5 text-purple-400" /> Driver Growth
              </CardTitle>
              <CardDescription className="admin-text-muted">Cumulative users over last 12 weeks</CardDescription>
            </CardHeader>
            <CardContent className="p-6 h-[400px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={userGrowthData}>
                  <XAxis dataKey="name" tick={{ fill: 'var(--admin-text-muted)' }} fontSize={10} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: 'var(--admin-text-muted)' }} fontSize={10} axisLine={false} tickLine={false} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'var(--admin-bg)', borderColor: 'var(--admin-border)', borderRadius: '16px', color: 'var(--admin-text-primary)' }}
                  />
                  <Area type="stepAfter" dataKey="users" stroke="#8b5cf6" fill="#8b5cf633" strokeWidth={3} />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Efficiency Stats */}
          <Card className="admin-glass-card rounded-[32px] overflow-hidden">
            <CardHeader className="border-b border-[var(--admin-border-muted)] bg-[var(--admin-surface)]/20">
              <CardTitle className="text-xl font-black flex items-center gap-2 admin-text-primary">
                <Leaf className="w-5 h-5 text-emerald-400" /> Efficiency KPIs
              </CardTitle>
              <CardDescription className="admin-text-muted">Average performance metrics</CardDescription>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              <KPIRow icon={Zap} label="Avg. Energy" value={`${Math.round(sessionMetrics.avgKwh)} kWh`} color="text-yellow-400" />
              <KPIRow icon={Clock} label="Avg. Duration" value={`${Math.round(sessionMetrics.avgDur)} mins`} color="text-blue-400" />
              <KPIRow icon={DollarSign} label="Avg. Ticket" value={`₹${Math.round(sessionMetrics.avgRev)}`} color="text-emerald-400" />
              <div className="pt-4 border-t border-[var(--admin-border-muted)]">
                <div className="bg-emerald-500/10 rounded-2xl p-4 flex flex-col items-center text-center">
                  <Leaf className="w-8 h-8 text-emerald-400 mb-2" />
                  <p className="text-2xl font-black text-emerald-400">{Math.round(sessionMetrics.co2).toLocaleString()} kg</p>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-400/60">Estimated CO2 Offset</p>
                </div>
              </div>
            </CardContent>
          </Card>

        </div>

        {/* Utilization Heatmap */}
        <Card className="admin-glass-card rounded-[32px] overflow-hidden">
          <CardHeader className="border-b border-[var(--admin-border-muted)] bg-[var(--admin-surface)]/20">
            <CardTitle className="text-xl font-black flex items-center gap-2 admin-text-primary">
              <Activity className="w-5 h-5 text-red-400" /> Network Utilization
            </CardTitle>
            <CardDescription className="admin-text-muted">Heatmap of session density by day and hour</CardDescription>
          </CardHeader>
          <CardContent className="p-6 overflow-x-auto">
            <div className="min-w-[800px] grid grid-cols-25 gap-1">
              <div className="h-8" /> {/* Empty corner */}
              {Array.from({ length: 24 }).map((_, h) => (
                <div key={h} className="text-[9px] font-black text-white/20 text-center uppercase">{h}h</div>
              ))}
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(day => (
                <>
                  <div key={day} className="text-[9px] font-black text-white/40 flex items-center uppercase">{day}</div>
                  {Array.from({ length: 24 }).map((_, hour) => {
                    const cell = heatmapData.find(d => d.day === day && d.hour === hour);
                    const intensity = Math.min((cell?.count || 0) * 20, 100);
                    return (
                      <div 
                        key={hour}
                        className="h-8 rounded-sm transition-all hover:scale-110 cursor-pointer"
                        style={{ backgroundColor: `rgba(16, 185, 129, ${intensity / 100})`, border: '1px solid var(--admin-border-muted)' }}
                        title={`${cell?.count} sessions at ${hour}:00`}
                      />
                    );
                  })}
                </>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({ title, value, trend, icon: Icon, color }: any) {
  const colorMap: any = {
    emerald: "from-emerald-500/20 to-emerald-500/5 text-emerald-400 border-emerald-500/20",
    blue: "from-blue-500/20 to-blue-500/5 text-blue-400 border-blue-500/20",
    orange: "from-orange-500/20 to-orange-500/5 text-orange-400 border-orange-500/20",
    purple: "from-purple-500/20 to-purple-500/5 text-purple-400 border-purple-500/20"
  };

  return (
    <Card className="admin-glass-card rounded-[28px] overflow-hidden transition-all hover:border-[var(--admin-accent)]/30 group">
      <CardContent className="p-6">
        <div className="flex justify-between items-start mb-4">
          <div className={`p-3 rounded-2xl bg-gradient-to-br ${colorMap[color]} border transition-all group-hover:scale-110`}>
            <Icon className="w-6 h-6" />
          </div>
          {trend !== 0 && (
            <div className={`flex items-center gap-1 text-[10px] font-black px-2 py-1 rounded-full ${trend > 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
              {trend > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              {Math.abs(trend).toFixed(1)}%
            </div>
          )}
        </div>
        <div className="space-y-1">
          <p className="text-3xl font-black tracking-tighter admin-text-primary">{value}</p>
          <p className="text-[10px] font-black uppercase tracking-widest admin-text-muted">{title}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function KPIRow({ icon: Icon, label, value, color }: any) {
  return (
    <div className="flex justify-between items-center group">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-xl bg-[var(--admin-surface)] border border-[var(--admin-border)] group-hover:bg-[var(--admin-surface)]/80 transition-colors">
          <Icon className={`w-4 h-4 ${color}`} />
        </div>
        <p className="text-xs font-bold admin-text-secondary">{label}</p>
      </div>
      <p className="text-sm font-black admin-text-primary">{value}</p>
    </div>
  );
}
