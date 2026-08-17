import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { collection, query, where, orderBy, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { 
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell
} from "recharts";
import { 
  Card, CardContent, CardHeader, CardTitle, CardDescription 
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Zap, Leaf, CreditCard, History, Download, Filter, ChevronRight, Calendar as CalendarIcon
} from "lucide-react";
import { format, subDays, startOfDay, isAfter, subMonths, startOfMonth } from "date-fns";
import download from "downloadjs";
import { cn } from "@/lib/utils";

type Booking = {
  id: string;
  stationName: string;
  kwhDelivered: number;
  totalPrice: number;
  duration: number;
  status: string;
  createdAt: number;
  startTime: number;
  connectorType: string;
};

const RANGES = [
  { label: "Last 7 days", value: 7 },
  { label: "Last 30 days", value: 30 },
  { label: "Last 90 days", value: 90 },
  { label: "All time", value: 0 },
];

export default function ChargingHistory() {
  const { user } = useAuth();
  const [range, setRange] = useState(30);

  const { data: bookings, isLoading } = useQuery({
    queryKey: ["charging-history", user?.uid],
    queryFn: async () => {
      if (!user) return [];
      const q = query(
        collection(db, "bookings"),
        where("userId", "==", user.uid),
        where("status", "==", "completed"),
        orderBy("createdAt", "desc")
      );
      const snap = await getDocs(q);
      return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Booking));
    },
    staleTime: 5 * 60 * 1000,
    enabled: !!user,
  });

  const filteredBookings = useMemo(() => {
    if (!bookings) return [];
    if (range === 0) return bookings;
    const cutoff = subDays(new Date(), range).getTime();
    return bookings.filter(b => b.createdAt >= cutoff);
  }, [bookings, range]);

  const stats = useMemo(() => {
    const totalKwh = filteredBookings.reduce((sum, b) => sum + (b.kwhDelivered || 0), 0);
    const totalSpent = filteredBookings.reduce((sum, b) => sum + (b.totalPrice || 0), 0);
    const totalCo2 = totalKwh * 0.82;
    return {
      totalKwh,
      totalSpent,
      totalCo2,
      count: filteredBookings.length
    };
  }, [filteredBookings]);

  const dailyKwhData = useMemo(() => {
    const data: Record<string, number> = {};
    const days = 30;
    for (let i = 0; i < days; i++) {
      const date = format(subDays(new Date(), i), "MMM dd");
      data[date] = 0;
    }

    bookings?.forEach(b => {
      const date = format(new Date(b.createdAt), "MMM dd");
      if (data[date] !== undefined) {
        data[date] += (b.kwhDelivered || 0);
      }
    });

    return Object.entries(data)
      .map(([date, kwh]) => ({ date, kwh }))
      .reverse();
  }, [bookings]);

  const monthlySpendData = useMemo(() => {
    const data: Record<string, number> = {};
    const months = 6;
    for (let i = 0; i < months; i++) {
      const date = format(subMonths(new Date(), i), "MMM yyyy");
      data[date] = 0;
    }

    bookings?.forEach(b => {
      const date = format(new Date(b.createdAt), "MMM yyyy");
      if (data[date] !== undefined) {
        data[date] += (b.totalPrice || 0);
      }
    });

    return Object.entries(data)
      .map(([month, spend]) => ({ month, spend }))
      .reverse();
  }, [bookings]);

  const handleExport = () => {
    if (!filteredBookings.length) return;
    const data = JSON.stringify(filteredBookings, null, 2);
    download(data, `charging_history_${format(new Date(), "yyyy-MM-dd")}.json`, "application/json");
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0f172a] text-white p-6 space-y-8 pb-32">
        <Skeleton className="h-10 w-48 bg-slate-800" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-32 bg-slate-800 rounded-3xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Skeleton className="h-80 bg-slate-800 rounded-3xl" />
          <Skeleton className="h-80 bg-slate-800 rounded-3xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0f172a] text-white pb-32 overflow-x-hidden">
      {/* Header */}
      <div className="bg-slate-900/50 backdrop-blur-xl border-b border-white/5 sticky top-0 z-30 px-6 py-6">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black tracking-tight flex items-center gap-3">
              <History className="w-8 h-8 text-blue-500" /> Charging History
            </h1>
            <p className="text-slate-400 text-sm mt-1 font-medium">Analytics & detailed session logs</p>
          </div>
          <Button 
            onClick={handleExport}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-2xl px-6 h-12 shadow-lg shadow-blue-600/20"
          >
            <Download className="w-4 h-4 mr-2" /> EXPORT JSON
          </Button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">
        {/* Date Filters */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 no-scrollbar">
          <Filter className="w-4 h-4 text-slate-500 shrink-0 mr-2" />
          {RANGES.map((r) => (
            <Badge
              key={r.value}
              onClick={() => setRange(r.value)}
              className={cn(
                "cursor-pointer px-4 py-2 rounded-full text-xs font-black uppercase tracking-widest transition-all whitespace-nowrap",
                range === r.value 
                  ? "bg-blue-600 text-white shadow-lg shadow-blue-600/30" 
                  : "bg-slate-800 text-slate-400 hover:bg-slate-700"
              )}
            >
              {r.label}
            </Badge>
          ))}
        </div>

        {/* Section A: Stats Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Energy (kWh)", value: stats.totalKwh.toFixed(1), icon: Zap, color: "text-amber-500", bg: "bg-amber-500/10" },
            { label: "CO₂ Saved (kg)", value: stats.totalCo2.toFixed(1), icon: Leaf, color: "text-emerald-500", bg: "bg-emerald-500/10" },
            { label: "Spent (₹)", value: stats.totalSpent.toLocaleString(), icon: CreditCard, color: "text-blue-500", bg: "bg-blue-500/10" },
            { label: "Sessions", value: stats.count.toString(), icon: History, color: "text-purple-500", bg: "bg-purple-500/10" },
          ].map((s, i) => (
            <Card key={i} className="bg-slate-900 border-white/5 rounded-3xl overflow-hidden shadow-xl">
              <CardContent className="p-6">
                <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center mb-4", s.bg)}>
                  <s.icon className={cn("w-5 h-5", s.color)} />
                </div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">{s.label}</p>
                <h3 className="text-2xl font-black">{s.value}</h3>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Section B: Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="bg-slate-900 border-white/5 rounded-[32px] overflow-hidden shadow-xl">
            <CardHeader>
              <CardTitle className="text-lg font-black flex items-center gap-2">
                <Zap className="w-5 h-5 text-amber-500" /> Energy Usage
              </CardTitle>
              <CardDescription className="text-slate-500">kWh delivered per day (Last 30 days)</CardDescription>
            </CardHeader>
            <CardContent className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={dailyKwhData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
                  <XAxis 
                    dataKey="date" 
                    stroke="#475569" 
                    fontSize={10} 
                    tickLine={false} 
                    axisLine={false} 
                  />
                  <YAxis 
                    stroke="#475569" 
                    fontSize={10} 
                    tickLine={false} 
                    axisLine={false} 
                    tickFormatter={(v) => `${v}`}
                  />
                  <Tooltip 
                    contentStyle={{ backgroundColor: "#0f172a", border: "none", borderRadius: "12px", color: "#fff" }}
                    itemStyle={{ color: "#3b82f6" }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="kwh" 
                    stroke="#3b82f6" 
                    strokeWidth={4} 
                    dot={false}
                    activeDot={{ r: 6, strokeWidth: 0 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="bg-slate-900 border-white/5 rounded-[32px] overflow-hidden shadow-xl">
            <CardHeader>
              <CardTitle className="text-lg font-black flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-blue-500" /> Monthly Spend
              </CardTitle>
              <CardDescription className="text-slate-500">Spending in ₹ (Last 6 months)</CardDescription>
            </CardHeader>
            <CardContent className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlySpendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
                  <XAxis 
                    dataKey="month" 
                    stroke="#475569" 
                    fontSize={10} 
                    tickLine={false} 
                    axisLine={false} 
                  />
                  <YAxis 
                    stroke="#475569" 
                    fontSize={10} 
                    tickLine={false} 
                    axisLine={false} 
                  />
                  <Tooltip 
                    contentStyle={{ backgroundColor: "#0f172a", border: "none", borderRadius: "12px", color: "#fff" }}
                    cursor={{ fill: "#ffffff05" }}
                  />
                  <Bar dataKey="spend" radius={[6, 6, 0, 0]}>
                    {monthlySpendData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={index === monthlySpendData.length - 1 ? "#3b82f6" : "#1e293b"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Section D: Session Table */}
        <Card className="bg-slate-900 border-white/5 rounded-[32px] overflow-hidden shadow-xl">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-lg font-black">Recent Sessions</CardTitle>
              <CardDescription className="text-slate-500">Detailed breakdown of last 10 charges</CardDescription>
            </div>
            <Button variant="ghost" size="icon" className="text-slate-500">
              <CalendarIcon className="w-5 h-5" />
            </Button>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader className="bg-slate-950/50">
                <TableRow className="border-white/5 hover:bg-transparent">
                  <TableHead className="text-[10px] font-black uppercase text-slate-500 px-6 h-12">Date</TableHead>
                  <TableHead className="text-[10px] font-black uppercase text-slate-500 px-6">Station</TableHead>
                  <TableHead className="text-[10px] font-black uppercase text-slate-500 px-6">Energy</TableHead>
                  <TableHead className="text-[10px] font-black uppercase text-slate-500 px-6">Duration</TableHead>
                  <TableHead className="text-[10px] font-black uppercase text-slate-500 px-6">Cost</TableHead>
                  <TableHead className="text-[10px] font-black uppercase text-slate-500 px-6">CO₂ Offset</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredBookings.slice(0, 10).map((b) => (
                  <TableRow key={b.id} className="border-white/5 hover:bg-white/5 transition-colors">
                    <TableCell className="px-6 py-4 font-medium">{format(new Date(b.createdAt), "MMM dd, yyyy")}</TableCell>
                    <TableCell className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="font-bold">{b.stationName || "Unknown Station"}</span>
                        <span className="text-[10px] text-slate-500 uppercase font-black">{b.connectorType || "Connector"}</span>
                      </div>
                    </TableCell>
                    <TableCell className="px-6 py-4 font-bold text-amber-500">{b.kwhDelivered?.toFixed(1)} kWh</TableCell>
                    <TableCell className="px-6 py-4 text-slate-400">{b.duration || 0} min</TableCell>
                    <TableCell className="px-6 py-4 font-black">₹{(b.totalPrice || 0).toLocaleString()}</TableCell>
                    <TableCell className="px-6 py-4">
                      <Badge className="bg-emerald-500/10 text-emerald-500 border-none font-bold">
                        🌱 {((b.kwhDelivered || 0) * 0.82).toFixed(1)} kg
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {filteredBookings.length === 0 && (
              <div className="py-20 text-center space-y-4">
                <History className="w-12 h-12 text-slate-700 mx-auto" />
                <p className="text-slate-500 font-bold">No sessions found for this period</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
