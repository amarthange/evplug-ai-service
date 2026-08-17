import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { 
  collection,
  query,
  where,
  doc,
  setDoc,
  addDoc,
  getDocs, 
  Timestamp,
  serverTimestamp
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { 
  format, 
  subMonths, 
  startOfMonth, 
  endOfMonth 
} from "date-fns";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { 
  BarChart3, 
  Download, 
  Printer, 
  Calendar, 
  FileText,
  Loader2,
  ChevronLeft,
  DollarSign,
  Zap,
  Users,
  Award,
  TrendingUp,
  AlertTriangle,
  History,
  CheckCircle,
  XCircle,
  Rocket,
  ArrowUpRight,
  ArrowDownRight
} from "lucide-react";
import { 
  ComposedChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Cell
} from "recharts";

interface Booking {
  id: string;
  totalPrice?: number;
  stationId: string;
  stationName: string;
  energyDeliveredKwh?: number;
  userId: string;
  status: string;
  paymentStatus: string;
  createdAt: any;
}

const REPORT_TYPES = [
  {
    id: "monthly_revenue",
    title: "Monthly Revenue Report",
    description: "Platform earnings, owner payouts, and commission breakdown",
    icon: "💰"
  },
  {
    id: "station_performance",
    title: "Station Performance Report",
    description: "Utilization rates, revenue per station, top performers",
    icon: "🏢"
  },
  {
    id: "user_activity",
    title: "User Activity Report",
    description: "New registrations, active users, retention metrics",
    icon: "👥"
  },
  {
    id: "network_health",
    title: "Network Health Report",
    description: "Uptime, faults, maintenance incidents, kWh delivered",
    icon: "⚡"
  }
];

const CustomWaterfallTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-popover border-2 border-border p-4 rounded-2xl shadow-2xl animate-in fade-in zoom-in duration-200 min-w-[200px]">
        <p className="text-sm font-black uppercase tracking-widest text-foreground border-b-2 border-border/50 pb-2 mb-2">
          {data.name}
        </p>
        <div className="space-y-1.5">
          {data.positive > 0 && (
            <div className="flex justify-between items-center gap-6">
              <span className="text-[10px] font-black uppercase text-emerald-500">Increase</span>
              <span className="text-sm font-black text-emerald-500">
                +₹{data.positive.toLocaleString('en-IN')}
              </span>
            </div>
          )}
          {data.negative > 0 && (
            <div className="flex justify-between items-center gap-6">
              <span className="text-[10px] font-black uppercase text-destructive">Decrease</span>
              <span className="text-sm font-black text-destructive">
                -₹{data.negative.toLocaleString('en-IN')}
              </span>
            </div>
          )}
          <div className="flex justify-between items-center gap-6 pt-1 border-t border-border/30 mt-1">
            <span className="text-[10px] font-black uppercase text-muted-foreground">Net Phase</span>
            <span className="text-sm font-black text-primary">
              {data.value < 0 ? "-" : ""}₹{Math.abs(data.value).toLocaleString('en-IN')}
            </span>
          </div>
          <div className="flex justify-between items-center gap-6">
            <span className="text-[10px] font-black uppercase text-muted-foreground">Total At Point</span>
            <span className="text-sm font-black text-foreground">
              ₹{data.cumulative.toLocaleString('en-IN')}
            </span>
          </div>
        </div>
      </div>
    );
  }
  return null;
};

export default function AdminReports() {
  const [, setLocation] = useLocation();
  const { user, userRole, loading: authLoading } = useAuth();

  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), "yyyy-MM"));
  const [selectedReport, setSelectedReport] = useState("monthly_revenue");
  const [reportData, setReportData] = useState<any>(null);
  const [generating, setGenerating] = useState(false);

  if (!authLoading && userRole !== "admin") {
    setLocation("/");
    return null;
  }

  const monthOptions = Array.from({ length: 12 }, (_, i) => {
    const d = subMonths(new Date(), i);
    return {
      value: format(d, "yyyy-MM"),
      label: format(d, "MMMM yyyy")
    };
  });

  const generateReport = async () => {
    setGenerating(true);
    try {
      const [yearStr, monthStr] = selectedMonth.split("-");
      const monthStart = startOfMonth(new Date(parseInt(yearStr), parseInt(monthStr) - 1));
      const monthEnd = endOfMonth(monthStart);

      const [stationsSnap, ownersSnap, usersSnap, monthBookings] = await Promise.all([
        getDocs(collection(db, "stations")),
        getDocs(collection(db, "owners")),
        getDocs(collection(db, "users")),
        getDocs(collection(db, "bookings"))
      ]);

      const stations = stationsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const owners = ownersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const allBookingsForMonth = monthBookings.docs.map(d => ({ id: d.id, ...d.data() } as any));
      
      const stationMap = stations.reduce((acc, s) => ({ ...acc, [s.id]: s }), {} as any);
      const ownerMap = owners.reduce((acc, o) => ({ ...acc, [o.id]: o }), {} as any);

      const completedBookings = allBookingsForMonth.filter((b: any) => {
        // 1. Date range filter (Robust)
        const bDate = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt);
        const isInMonth = bDate >= monthStart && bDate <= monthEnd;
        if (!isInMonth) return false;

        // 2. Status filters (Aligned with Dashboard)
        const isPaid = b.paymentStatus === "paid" || b.paymentStatus === "success";
        const isValidStatus = ["confirmed", "active", "completed"].includes(b.status);
        return isPaid && isValidStatus;
      });

      const totalRevenue = completedBookings.reduce((s: number, b: any) => s + (b.totalPrice || 0), 0);
      const platformCommission = totalRevenue * 0.05;
      const ownerPayouts = totalRevenue - platformCommission;

      const stationStats: Record<string, {name: string, revenue: number, sessions: number}> = {};
      completedBookings.forEach((b: any) => {
        if (!stationStats[b.stationId]) {
          stationStats[b.stationId] = { name: b.stationName || "Unknown Station", revenue: 0, sessions: 0 };
        }
        stationStats[b.stationId].revenue += b.totalPrice || 0;
        stationStats[b.stationId].sessions += 1;
      });

      setReportData({
        month: format(monthStart, "MMMM yyyy"),
        timestamp: format(new Date(), "PPP, p"),
        totalBookings: completedBookings.length,
        totalRevenue,
        platformCommission,
        ownerPayouts,
        totalKwh: completedBookings.reduce((s: number, b: any) => s + (b.energyDeliveredKwh || 0), 0),
        uniqueUsers: new Set(completedBookings.map((b: any) => b.userId)).size,
        allUsers: usersSnap.docs.map(d => ({ id: d.id, ...d.data() })),
        allBookingsForMonth,
        completedBookings,
        stationMap,
        ownerMap,
        userMap: usersSnap.docs.reduce((acc, d) => ({ ...acc, [d.id]: { id: d.id, ...d.data() } }), {} as any),
        topStationsByRevenue: Object.entries(stationStats)
          .sort((a, b) => b[1].revenue - a[1].revenue)
          .slice(0, 5)
          .map(([id, stats]) => ({ id, ...stats })),
      });
    } catch (e) {
      console.error(e);
    } finally {
      setGenerating(false);
    }
  };

  const calculateWaterfall = () => {
    if (!reportData) return [];
    
    const gross = reportData.totalRevenue;
    const platformFee = gross * 0.05;
    
    const refunds = reportData.allBookingsForMonth
      .filter((b: any) => b.status === "cancelled" && b.refundStatus === "refunded")
      .reduce((s: number, b: any) => s + (b.totalPrice || 0), 0);
    
    const ownerPayouts = gross * 0.95;
    const netPlatformEarning = gross - ownerPayouts - refunds;
    
    const segments = [
      {
        name: "Gross Revenue",
        value: gross,
        fill: "#22c55e",
        cumulative: gross,
        isTotal: true
      },
      {
        name: "Owner Payouts",
        value: -ownerPayouts,
        fill: "#ef4444",
        cumulative: gross - ownerPayouts
      },
      {
        name: "Refunds",
        value: -refunds,
        fill: "#f97316",
        cumulative: gross - ownerPayouts - refunds
      },
      {
        name: "Net Earnings",
        value: netPlatformEarning,
        fill: "#6366f1",
        cumulative: netPlatformEarning,
        isTotal: true
      }
    ];

    return segments.map((item, i) => ({
      ...item,
      base: item.isTotal ? 0 : Math.min(segments[i-1]?.cumulative || 0, item.cumulative),
      positive: item.value > 0 ? item.value : 0,
      negative: item.value < 0 ? Math.abs(item.value) : 0,
      total: item.cumulative
    }));
  };

  const calculateOwnerPayouts = () => {
    if (!reportData) return [];
    
    const { monthBookings, stationMap, ownerMap, completedBookings } = reportData;
    const ownerPayoutMap: Record<string, any> = {};
    
    completedBookings.forEach((b: any) => {
      const station = stationMap[b.stationId];
      if (!station?.ownerId) return;
      const ownerId = station.ownerId;
      const owner = ownerMap[ownerId];
      
      if (!ownerPayoutMap[ownerId]) {
        ownerPayoutMap[ownerId] = {
          ownerId,
          businessName: owner?.businessName || "Unknown Business",
          upiId: owner?.upiId || "",
          grossRevenue: 0,
          platformFee: 0,
          netPayout: 0,
          sessionCount: 0,
          stationCount: new Set(completedBookings.filter((mb: any) => stationMap[mb.stationId]?.ownerId === ownerId).map((mb: any) => mb.stationId)).size
        };
      }
      
      const gross = b.totalPrice || 0;
      ownerPayoutMap[ownerId].grossRevenue += gross;
      ownerPayoutMap[ownerId].platformFee += gross * 0.05;
      ownerPayoutMap[ownerId].netPayout += gross * 0.95;
      ownerPayoutMap[ownerId].sessionCount++;
    });
    
    return Object.values(ownerPayoutMap).sort((a: any, b: any) => b.netPayout - a.netPayout);
  };

  const exportPayoutCSV = (payouts: any[]) => {
    const headers = [
      "Business Name", "Owner Email", "UPI ID",
      "Sessions", "Gross Revenue (₹)",
      "Platform Fee (₹)", "Net Payout (₹)",
      "Station Count", "Month"
    ];
    
    const rows = payouts.map(p => [
      p.businessName,
      reportData.ownerMap[p.ownerId]?.email || "",
      p.upiId || "N/A",
      p.sessionCount,
      p.grossRevenue.toFixed(2),
      p.platformFee.toFixed(2),
      p.netPayout.toFixed(2),
      p.stationCount,
      reportData.month
    ]);
    
    const csv = [headers, ...rows]
      .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `owner-payouts-${selectedMonth}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const calculateRetention = () => {
    if (!reportData) return [];
    
    // Group users by registration month:
    const cohorts: Record<string, any> = {};
    const { allUsers, completedBookings, userMap } = reportData;
    
    allUsers.forEach((user: any) => {
      const regDate = user.createdAt?.toDate ? user.createdAt.toDate() : (user.createdAt ? new Date(user.createdAt) : null);
      if (!regDate) return;
      const cohortKey = format(regDate, "yyyy-MM");
      
      if (!cohorts[cohortKey]) {
        cohorts[cohortKey] = {
          cohortKey,
          cohortMonth: format(regDate, "MMM yyyy"),
          totalUsers: 0,
          activeInMonth: {}
        };
      }
      cohorts[cohortKey].totalUsers++;
    });
    
    // For each cohort check if they booked
    completedBookings.forEach((b: any) => {
      const user = userMap[b.userId];
      if (!user?.createdAt) return;
      
      const regDate = user.createdAt.toDate ? user.createdAt.toDate() : new Date(user.createdAt);
      const cohortKey = format(regDate, "yyyy-MM");
      const bookingMonth = format(b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.startTime), "yyyy-MM");
      
      if (cohorts[cohortKey]) {
        cohorts[cohortKey].activeInMonth[bookingMonth] = (cohorts[cohortKey].activeInMonth[bookingMonth] || 0) + 1;
      }
    });
    
    return Object.values(cohorts)
      .sort((a: any, b: any) => a.cohortKey.localeCompare(b.cohortKey))
      .slice(-6); // last 6 cohorts
  };

  const getRetentionRate = (cohort: any) => {
    if (!reportData) return 0;
    const { completedBookings, userMap } = reportData;

    const uniqueReturned = new Set(
      completedBookings
        .filter((b: any) => {
          const user = userMap[b.userId];
          if (!user?.createdAt) return false;
          const regDate = user.createdAt.toDate ? user.createdAt.toDate() : new Date(user.createdAt);
          const userCohort = format(regDate, "yyyy-MM");
          return userCohort === cohort.cohortKey;
        })
        .map((b: any) => b.userId)
    ).size;
    
    return cohort.totalUsers > 0
      ? Math.round((uniqueReturned / cohort.totalUsers) * 100)
      : 0;
  };

  const markAsPaid = async (ownerId: string, payout: any) => {
    try {
      const monthKey = selectedMonth; // e.g. "2026-04"
      await setDoc(doc(db, "owners", ownerId, "payoutHistory", monthKey), {
        month: monthKey,
        grossRevenue: payout.grossRevenue,
        platformFee: payout.platformFee,
        netPayout: payout.netPayout,
        status: "paid",
        paidAt: serverTimestamp(),
        paidBy: user?.uid,
        upiId: payout.upiId
      });

      await addDoc(collection(db, "audit_logs"), {
        action: "PAYOUT_PROCESSED",
        severity: "HIGH",
        performedBy: user?.uid,
        targetId: ownerId,
        targetType: "owner",
        metadata: {
          amount: payout.netPayout,
          month: reportData.month
        },
        timestamp: serverTimestamp()
      });

      // Refresh data
      generateReport();
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-8 min-h-screen pb-20">
      <style>{`
        @media print {
          body * { visibility: hidden !important; background: white !important; }
          #admin-report-print,
          #admin-report-print * { 
            visibility: visible !important; 
          }
          #admin-report-print {
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 40px !important;
          }
          .no-print { display: none !important; }
        }

        .waterfall-summary { 
          margin-top:16px; padding:16px;
          border-top:1px solid var(--border);
          background: var(--muted)/30;
          border-radius: 16px;
        }
        .wf-row { 
          display:flex; justify-content:space-between;
          padding:6px 0; font-size:13px;
          border-bottom:1px solid var(--border);
        }
        .wf-total { 
          font-weight:900; font-size:14px;
          border-bottom:none; padding-top:10px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .wf-green { color:#22c55e }
        .wf-red { color:#ef4444 }
        .wf-orange { color:#f97316 }
        .wf-purple { color:#6366f1 }
        
        .payout-table-container {
          margin-top: 32px;
        }
        .upi-badge {
          padding: 4px 8px;
          border-radius: 6px;
          font-size: 10px;
          font-weight: 800;
          text-transform: uppercase;
        }
        .upi-badge-set { background: #dcfce7; color: #166534; }
        .upi-badge-missing { background: #fee2e2; color: #991b1b; }
      `}</style>

      <div className="no-print">
        <Button 
          variant="ghost" 
          className="gap-2 font-bold mb-4" 
          onClick={() => setLocation("/admin")}
        >
          <ChevronLeft className="w-4 h-4" />
          Back to Dashboard
        </Button>

        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-4xl font-black tracking-tight flex items-center gap-3 italic uppercase">
              <BarChart3 className="w-10 h-10 text-primary" />
              Platform Reports
            </h1>
            <p className="text-muted-foreground font-medium mt-1">Generate and print analytical summaries</p>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-4 gap-8 no-print">
        <div className="lg:col-span-1 space-y-4">
          <Card className="rounded-[30px] border-2 shadow-xl overflow-hidden">
            <CardHeader className="bg-muted/30">
              <CardTitle className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                Select Period
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-muted-foreground">Month</label>
                <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                  <SelectTrigger className="rounded-xl border-2 h-12">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    {monthOptions.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button 
                onClick={generateReport} 
                className="w-full h-12 rounded-xl font-black uppercase tracking-widest shadow-xl shadow-primary/20"
                disabled={generating}
              >
                {generating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <FileText className="w-4 h-4 mr-2" />}
                Generate
              </Button>
            </CardContent>
          </Card>

          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase text-muted-foreground px-2">Report Type</label>
            {REPORT_TYPES.map(report => (
              <Card 
                key={report.id} 
                className={`rounded-2xl border-2 cursor-pointer transition-all hover:border-primary/50 ${selectedReport === report.id ? 'border-primary bg-primary/5 ring-2 ring-primary/10' : ''}`}
                onClick={() => setSelectedReport(report.id)}
              >
                <CardContent className="p-4 flex items-center gap-4">
                  <span className="text-2xl">{report.icon}</span>
                  <div className="flex-1">
                    <h4 className="text-sm font-black tracking-tight">{report.title}</h4>
                    <p className="text-[10px] text-muted-foreground font-medium leading-none mt-1">{report.description}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        <div className="lg:col-span-3 space-y-6">
          {reportData ? (
             <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                <Card className="rounded-[30px] border-2 shadow-2xl overflow-hidden">
                  <CardHeader className="flex flex-row justify-between items-center p-8 bg-muted/20 border-b-2">
                    <div>
                      <CardTitle className="text-2xl font-black italic tracking-tighter uppercase">
                        {REPORT_TYPES.find(r => r.id === selectedReport)?.title}
                      </CardTitle>
                      <CardDescription className="text-base font-bold text-primary">
                        {reportData.month} Summary
                      </CardDescription>
                    </div>
                    <Button variant="outline" className="rounded-xl font-black gap-2 border-2 px-6" onClick={() => window.print()}>
                      <Printer className="w-4 h-4" />
                      Print PDF
                    </Button>
                  </CardHeader>
                  <CardContent className="p-8 space-y-8">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {[
                        { label: "Total Revenue", value: `₹${reportData.totalRevenue.toLocaleString()}`, icon: DollarSign, color: "text-emerald-500" },
                        { label: "Sessions", value: reportData.totalBookings, icon: Zap, color: "text-amber-500" },
                        { label: "Unique Users", value: reportData.uniqueUsers, icon: Users, color: "text-blue-500" },
                        { label: "Energy (kWh)", value: reportData.totalKwh.toFixed(1), icon: Award, color: "text-indigo-500" }
                      ].map((stat, i) => (
                        <div key={i} className="p-4 rounded-2xl bg-muted/30 border border-border/50">
                          <div className="flex items-center gap-2 mb-2">
                            <stat.icon className={`w-4 h-4 ${stat.color}`} />
                            <span className="text-[10px] font-black uppercase text-muted-foreground">{stat.label}</span>
                          </div>
                          <p className="text-2xl font-black">{stat.value}</p>
                        </div>
                      ))}
                    </div>

                    {/* NEW WATERFALL SECTION */}
                    <div className="space-y-6 pt-4 border-t-2 border-dashed">
                      <h4 className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-2">
                        <TrendingUp className="w-4 h-4" />
                        Revenue Waterfall (Excl. Pending)
                      </h4>
                      
                      <div className="bg-muted/10 p-6 rounded-[24px] border-2">
                        <div className="h-[300px] w-full">
                          <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart data={calculateWaterfall()} margin={{ top: 20, right: 30, left: 40, bottom: 0 }}>
                              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" />
                              <XAxis dataKey="name" tick={{ fontSize: 10, fontWeight: 700 }} axisLine={false} tickLine={false} dy={10} />
                              <YAxis tickFormatter={(v) => `₹${(v/1000).toFixed(0)}k`} tick={{ fontSize: 10, fontWeight: 700 }} axisLine={false} tickLine={false} />
                              <Tooltip content={<CustomWaterfallTooltip />} />
                              <Bar dataKey="base" stackId="wf" fill="transparent" />
                              <Bar dataKey="positive" stackId="wf" fill="#22c55e" radius={[4, 4, 0, 0]} name="Increase" />
                              <Bar dataKey="negative" stackId="wf" fill="#ef4444" radius={[4, 4, 0, 0]} name="Decrease" />
                            </ComposedChart>
                          </ResponsiveContainer>
                        </div>

                        <div className="waterfall-summary">
                          {(() => {
                            const wf = calculateWaterfall();
                            const gross = wf.find(i => i.name === "Gross Revenue")?.value || 0;
                            const payouts = wf.find(i => i.name === "Owner Payouts")?.value || 0;
                            const refunds = wf.find(i => i.name === "Refunds")?.value || 0;
                            const net = wf.find(i => i.name === "Net Earnings")?.value || 0;

                            return (
                              <>
                                <div className="wf-row">
                                  <span className="font-bold">Gross Revenue:</span>
                                  <span className="wf-green font-black">₹{gross.toLocaleString('en-IN')}</span>
                                </div>
                                <div className="wf-row">
                                  <span className="font-bold">Owner Payouts (95% of Net):</span>
                                  <span className="wf-red font-black">-₹{Math.abs(payouts).toLocaleString('en-IN')}</span>
                                </div>
                                <div className="wf-row">
                                  <span className="font-bold">Refunds Issued:</span>
                                  <span className="wf-orange font-black">-₹{Math.abs(refunds).toLocaleString('en-IN')}</span>
                                </div>
                                <div className="wf-row wf-total">
                                  <span className="text-primary font-black">Net Platform Earnings:</span>
                                  <span className="wf-purple font-black">₹{net.toLocaleString('en-IN')}</span>
                                </div>
                              </>
                            );
                          })()}
                        </div>
                      </div>
                    </div>

                    {/* NEW OWNER PAYOUT SECTION */}
                    <div className="space-y-6 pt-4 border-t-2 border-dashed">
                      <div className="flex justify-between items-end">
                        <div>
                          <h4 className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-2">
                            <Users className="w-4 h-4" />
                            Owner Payout Report — {reportData.month}
                          </h4>
                          <p className="text-2xl font-black mt-1">
                            Total Due: <span className="text-primary">₹{calculateOwnerPayouts().reduce((s, p) => s + p.netPayout, 0).toLocaleString()}</span>
                          </p>
                        </div>
                        <Button 
                          onClick={() => exportPayoutCSV(calculateOwnerPayouts())}
                          className="rounded-xl font-black gap-2 h-10 px-4 bg-slate-900 hover:bg-slate-800"
                        >
                          <Download className="w-4 h-4" />
                          Export CSV
                        </Button>
                      </div>

                      {calculateOwnerPayouts().some(p => !p.upiId) && (
                        <div className="bg-amber-50 border-2 border-amber-200 p-4 rounded-2xl flex items-start gap-3">
                          <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" />
                          <div className="text-sm">
                            <p className="font-black text-amber-900">Missing UPI Configurations</p>
                            <p className="text-amber-700 font-medium">{calculateOwnerPayouts().filter(p => !p.upiId).length} owner(s) have no UPI ID configured. Payouts cannot be processed for these accounts.</p>
                          </div>
                        </div>
                      )}

                      <div className="border-2 rounded-[24px] overflow-hidden">
                        <Table>
                          <TableHeader className="bg-muted/50 font-black">
                            <TableRow className="border-b-2">
                              <TableHead className="font-black text-black">Business Name</TableHead>
                              <TableHead className="font-black text-black text-center">Sessions</TableHead>
                              <TableHead className="font-black text-black text-right">Gross (INR)</TableHead>
                              <TableHead className="font-black text-black text-right">Fee (5%)</TableHead>
                              <TableHead className="font-black text-black text-right">Net Due</TableHead>
                              <TableHead className="font-black text-black text-center">UPI Status</TableHead>
                              <TableHead className="font-black text-black text-right">Action</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {calculateOwnerPayouts().map((p: any) => (
                              <TableRow key={p.ownerId} className="hover:bg-muted/20">
                                <TableCell className="font-bold py-4">{p.businessName}</TableCell>
                                <TableCell className="text-center font-medium">{p.sessionCount}</TableCell>
                                <TableCell className="text-right font-bold text-slate-500">₹{p.grossRevenue.toLocaleString()}</TableCell>
                                <TableCell className="text-right font-medium text-red-500">₹{p.platformFee.toLocaleString()}</TableCell>
                                <TableCell className="text-right font-black text-emerald-600">₹{p.netPayout.toLocaleString()}</TableCell>
                                <TableCell className="text-center">
                                  <span className={`upi-badge ${p.upiId ? 'upi-badge-set' : 'upi-badge-missing'}`}>
                                    {p.upiId ? "✅ Set" : "❌ Not Set"}
                                  </span>
                                </TableCell>
                                <TableCell className="text-right">
                                  <Button 
                                    size="sm" 
                                    variant="outline"
                                    onClick={() => markAsPaid(p.ownerId, p)}
                                    className="rounded-lg font-bold border-2 h-8 px-3"
                                    disabled={!p.upiId}
                                  >
                                    Mark Paid
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>



                    {/* NEW RETENTION SECTION */}
                    <div className="space-y-6 pt-4 border-t-2 border-dashed">
                      <div>
                        <h4 className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-2">
                          <Rocket className="w-4 h-4" />
                          User Retention Analysis
                        </h4>
                        <p className="text-sm font-medium text-muted-foreground mt-1">
                          Shows what % of users who joined each month returned to book again in the reported period.
                        </p>
                      </div>

                      <div className="border-2 rounded-[24px] overflow-hidden">
                        <Table>
                          <TableHeader className="bg-muted/50">
                            <TableRow className="border-b-2">
                              <TableHead className="font-black text-black">Registration Cohort</TableHead>
                              <TableHead className="text-center font-black text-black">New Drivers</TableHead>
                              <TableHead className="text-center font-black text-black">Returned</TableHead>
                              <TableHead className="text-right font-black text-black">Retention Rate</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {calculateRetention().map((cohort: any) => {
                              const rate = getRetentionRate(cohort);
                              const colorClass = rate >= 60 ? "text-emerald-500" : rate >= 40 ? "text-amber-500" : "text-red-500";
                              const status = rate >= 60 ? "Healthy" : rate >= 40 ? "Moderate" : "Needs attention";
                              
                              return (
                                <TableRow key={cohort.cohortKey}>
                                  <TableCell className="font-bold py-4">{cohort.cohortMonth}</TableCell>
                                  <TableCell className="text-center font-medium">{cohort.totalUsers}</TableCell>
                                  <TableCell className="text-center font-medium">
                                    {new Set(reportData.completedBookings.filter((b: any) => {
                                      const u = reportData.userMap[b.userId];
                                      const rd = u?.createdAt?.toDate ? u.createdAt.toDate() : (u?.createdAt ? new Date(u.createdAt) : null);
                                      return rd && format(rd, "yyyy-MM") === cohort.cohortKey;
                                    }).map((b: any) => b.userId)).size}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    <div className="flex flex-col items-end">
                                      <span className={`text-xl font-black ${colorClass}`}>{rate}%</span>
                                      <span className="text-[9px] font-black uppercase tracking-widest opacity-60">{status}</span>
                                    </div>
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>

                      <div className="p-6 rounded-[24px] bg-slate-900 text-white flex items-center justify-between">
                         <div className="flex items-center gap-4">
                            <div className="p-3 bg-white/10 rounded-xl">
                              <Award className="w-6 h-6 text-primary" />
                            </div>
                            <div>
                               <p className="text-[10px] font-black uppercase tracking-widest opacity-60">Avg. Retention</p>
                               <h5 className="text-2xl font-black">
                                 {(() => {
                                   const cohorts = calculateRetention();
                                   const avg = cohorts.reduce((s, c) => s + getRetentionRate(c), 0) / cohorts.length;
                                   return avg.toFixed(0);
                                 })()}%
                               </h5>
                            </div>
                         </div>
                         <div className="text-right max-w-[300px]">
                            <p className="text-sm font-bold leading-snug">
                              {(() => {
                                const cohorts = calculateRetention();
                                const avg = cohorts.reduce((s, c) => s + getRetentionRate(c), 0) / cohorts.length;
                                return avg >= 60 ? "Strong platform loyalty; drivers are consistently returning to your network." : 
                                       avg >= 40 ? "Moderate retention; consider rewards or loyalty programs to keep drivers engaged." : 
                                       "Low loyalty indicators; investigate station availability or pricing competitiveness.";
                              })()}
                            </p>
                         </div>
                      </div>
                    </div>

                    <div className="space-y-4 pt-4">
                       <h4 className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground">Top 5 Stations by Revenue</h4>
                       <div className="grid gap-3">
                         {reportData.topStationsByRevenue.map((s: any, i: number) => (
                           <div key={i} className="flex items-center justify-between p-4 rounded-xl border-2 hover:border-primary/30 transition-all">
                              <div className="flex items-center gap-4">
                                <span className="text-xl font-black text-muted-foreground/30">#0{i+1}</span>
                                <span className="font-black tracking-tight">{s.name}</span>
                              </div>
                              <div className="flex items-center gap-6">
                                <span className="text-xs font-medium text-muted-foreground">{s.sessions} sessions</span>
                                <span className="font-black text-emerald-600">₹{s.revenue.toLocaleString()}</span>
                              </div>
                           </div>
                         ))}
                       </div>
                    </div>
                  </CardContent>
                </Card>
             </div>
          ) : (
            <div className="h-[600px] rounded-[30px] border-4 border-dashed border-muted flex flex-col items-center justify-center text-center p-12 space-y-4">
              <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center">
                <FileText className="w-10 h-10 text-muted-foreground" />
              </div>
              <div>
                <h3 className="text-2xl font-black uppercase italic tracking-tighter">Ready to Compute</h3>
                <p className="max-w-xs text-muted-foreground font-medium">Select a month and report type on the left to begin compiling platform analytics.</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* HIDDEN PRINTABLE COMPONENT */}
      <div id="admin-report-print" className="hidden">
        <div className="space-y-12">
          <div className="flex justify-between items-end border-b-4 border-black pb-8">
            <div>
              <h1 className="text-3xl font-black tracking-tighter italic">EVPLUGFINDER PLATFORM</h1>
              <p className="text-sm font-bold uppercase tracking-widest opacity-60">Operations & Logistics Command</p>
            </div>
            <div className="text-right">
              <h2 className="text-xl font-black uppercase tracking-tighter">{REPORT_TYPES.find(r => r.id === selectedReport)?.title}</h2>
              <p className="text-sm font-bold uppercase">{reportData?.month}</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-12">
            <div className="space-y-6">
               <h3 className="font-black text-xs uppercase tracking-widest border-b-2 border-black pb-2">Financial Summary</h3>
               <div className="space-y-4">
                 <div className="flex justify-between text-sm">
                   <span className="font-bold">Gross Revenue</span>
                   <span className="font-black">₹{reportData?.totalRevenue.toLocaleString()}</span>
                 </div>
                 <div className="flex justify-between text-sm">
                   <span className="font-bold">Platform Fee (5%)</span>
                   <span className="font-black">₹{reportData?.platformCommission.toLocaleString()}</span>
                 </div>
                 <div className="flex justify-between text-base border-t-2 border-black pt-2">
                   <span className="font-black uppercase">Net Payouts</span>
                   <span className="font-black italic">₹{reportData?.ownerPayouts.toLocaleString()}</span>
                 </div>
               </div>
            </div>

            <div className="space-y-6">
               <h3 className="font-black text-xs uppercase tracking-widest border-b-2 border-black pb-2">Operational Metrics</h3>
               <div className="space-y-4">
                 <div className="flex justify-between text-sm">
                   <span className="font-bold">Total Sessions</span>
                   <span className="font-black">{reportData?.totalBookings}</span>
                 </div>
                 <div className="flex justify-between text-sm">
                   <span className="font-bold">Unique Drivers</span>
                   <span className="font-black">{reportData?.uniqueUsers}</span>
                 </div>
                 <div className="flex justify-between text-sm">
                   <span className="font-bold">Energy Expended</span>
                   <span className="font-black">{reportData?.totalKwh.toFixed(1)} kWh</span>
                 </div>
               </div>
            </div>

            <div className="space-y-6">
               <h3 className="font-black text-xs uppercase tracking-widest border-b-2 border-black pb-2">Generation Metadata</h3>
               <div className="space-y-2 text-xs">
                 <p className="font-bold">Generated On: <span className="font-black">{reportData?.timestamp}</span></p>
                 <p className="font-bold">Authorized By: <span className="font-black italic underline">{user?.email}</span></p>
                 <p className="font-bold">Report ID: <span className="font-black opacity-40 uppercase">{selectedReport.substring(0,4)}-{Date.now().toString().slice(-6)}</span></p>
               </div>
            </div>
          </div>

          <div className="space-y-6 pt-8">
            <h3 className="font-black text-xs uppercase tracking-widest border-b-2 border-black pb-2">Performance: Top Revenue Generators</h3>
            <table className="w-full text-sm">
              <thead className="border-b-2 border-black">
                <tr>
                  <th className="text-left py-4 font-black">STATION IDENTITY</th>
                  <th className="text-center py-4 font-black">VOL (SESSIONS)</th>
                  <th className="text-right py-4 font-black">REVENUE YIELD</th>
                </tr>
              </thead>
              <tbody>
                {reportData?.topStationsByRevenue.map((s: any, i: number) => (
                  <tr key={i} className="border-b border-black/10">
                    <td className="py-4 font-bold">{s.name}</td>
                    <td className="py-4 text-center font-medium">{s.sessions}</td>
                    <td className="py-4 text-right font-black">₹{s.revenue.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="pt-20 text-[8px] font-black uppercase tracking-[0.5em] text-center opacity-20">
            System Generated Immutable Record • EVPlugFinder Logistics Division • Proprietary & Confidential
          </div>
        </div>
      </div>
    </div>
  );
}
