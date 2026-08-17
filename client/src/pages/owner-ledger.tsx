import { useState, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { db } from "@/lib/firebase";
import { 
  doc, getDoc, collection, query, where, getDocs, 
  setDoc, updateDoc, serverTimestamp 
} from "firebase/firestore";
import { subscribeToOwnerStations, type Station } from "@/lib/owner-service";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { 
  Search, Download, Printer, Filter, Calendar, 
  ChevronRight, ArrowUpRight, Zap, Info, Clock, 
  Wallet, CreditCard, Smartphone, CheckCircle, XCircle,
  BarChart3, Calculator
} from "lucide-react";
import { 
  format, isSameMonth, subMonths, startOfMonth, 
  endOfMonth, isWithinInterval, startOfWeek, endOfWeek, 
  startOfDay, endOfDay, parseISO 
} from "date-fns";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { toJSDate, safeFormat } from "@/lib/date-utils";
import { BOOKING_STATUS } from "@/constants/bookingStatus";
import { useQuery } from "@tanstack/react-query";
import { 
  WaterfallPeriod, 
  WaterfallConfig, 
  RawBookingForWaterfall, 
  computeWaterfallAmounts, 
  buildWaterfallBars, 
  getPeriodBounds,
  PERIOD_CONFIG
} from "@/lib/waterfall-engine";
import RevenueWaterfallChart from "@/components/owner/RevenueWaterfallChart";
import RevenueBreakdownTable from "@/components/owner/RevenueBreakdownTable";

// Hardcoded for UI consistency with the rest of the app, 
// though the waterfall engine now reads from Firestore.
const PLATFORM_FEE_PERCENT = 5;

export default function OwnerLedger() {
  const [, setLocation] = useLocation();
  const { user, loading: authLoading } = useAuth();
  const [ownerProfile, setOwnerProfile] = useState<any>(null);
  const [stations, setStations] = useState<Station[]>([]);
  const [allBookings, setAllBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBooking, setSelectedBooking] = useState<any>(null);

  // New states for Ledger operations
  const [payoutHistory, setPayoutHistory] = useState<any[]>([]);
  const [payoutsLoaded, setPayoutsLoaded] = useState(false);
  const [showProcessedRefunds, setShowProcessedRefunds] = useState(false);
  const [selectedPayout, setSelectedPayout] = useState<any>(null);

  // Filters State
  const [filters, setFilters] = useState({
    dateRange: "this-month", // today, week, month, last-month, custom
    customFrom: "",
    customTo: "",
    stationId: "all",
    paymentMethod: "all",
    status: "all",
    search: "",
  });

  useEffect(() => {
    if (authLoading) return;
    if (!user) { setLocation("/owner/login"); return; }
    let isMounted = true;

    const load = async () => {
      const ownerSnap = await getDoc(doc(db, "owners", user.uid));
      if (!ownerSnap.exists()) { setLocation("/owner/login"); return; }
      if (isMounted) setOwnerProfile({ id: ownerSnap.id, ...ownerSnap.data() });

      subscribeToOwnerStations(user.uid, async (stationsList) => {
        if (!isMounted) return;
        setStations(stationsList);
        if (stationsList.length === 0) { setLoading(false); return; }

        const ids = stationsList.map((s) => s.id);
        const bookingsMap = new Map<string, any>();
        
        // Fetch by ownerId
        const snapOwner = await getDocs(query(collection(db, "bookings"), where("ownerId", "==", user.uid)));
        snapOwner.forEach((d) => bookingsMap.set(d.id, { id: d.id, ...d.data() }));

        // Fetch by stationId in chunks of 10
        for (let i = 0; i < ids.length; i += 10) {
          const chunk = ids.slice(i, i + 10);
          const snapStation = await getDocs(query(collection(db, "bookings"), where("stationId", "in", chunk)));
          snapStation.forEach((d) => bookingsMap.set(d.id, { id: d.id, ...d.data() }));
        }

        const all = Array.from(bookingsMap.values());
        all.sort((a, b) => (b.startTime || 0) - (a.startTime || 0));
        if (isMounted) { setAllBookings(all); setLoading(false); }
      });
    };

    load().catch(console.error);
    return () => { isMounted = false; };
  }, [user, authLoading, setLocation]);

  useEffect(() => {
    if (!user || allBookings.length === 0 || !ownerProfile || payoutsLoaded) return;
    let isMounted = true;

    const loadPayouts = async () => {
      try {
        const monthKey = safeFormat(new Date(), "yyyy-MM");
        const payoutRef = doc(db, "owners", user.uid, "payoutHistory", monthKey);
        const existing = await getDoc(payoutRef);
        
        const gross = allBookings
          .filter(b => isSameMonth(toJSDate(b.startTime), new Date()) && b.status === BOOKING_STATUS.COMPLETED)
          .reduce((s, b) => s + (Number(b.totalPrice) || 0), 0);
          
        if (!existing.exists()) {
          const userDocSnap = await getDoc(doc(db, "users", user.uid));
          let platformFeePercent = 15;
          let gstPercent = 18;
          if (userDocSnap.exists()) {
            const udata = userDocSnap.data();
            if (udata.platformFeePercent !== undefined) platformFeePercent = udata.platformFeePercent;
            if (udata.gstPercent !== undefined) gstPercent = udata.gstPercent;
          }

          const platformFee = gross * (platformFeePercent / 100);
          const gstOnFee = platformFee * (gstPercent / 100);
          const netPayout = gross - platformFee - gstOnFee;

          await setDoc(payoutRef, {
            month: monthKey,
            grossRevenue: gross,
            platformFee,
            gstOnFee,
            netPayout,
            status: "pending",
            upiId: ownerProfile.upiId || ""
          });
        }
        
        const historySnap = await getDocs(collection(db, "owners", user.uid, "payoutHistory"));
        const history: any[] = [];
        historySnap.forEach(d => history.push({ id: d.id, ...d.data() }));
        history.sort((a, b) => b.month.localeCompare(a.month));
        
        if (isMounted) {
          setPayoutHistory(history);
          setPayoutsLoaded(true);
        }
      } catch (err) {
        console.error("Failed to load payouts", err);
      }
    };
    
    loadPayouts();
    return () => { isMounted = false; };
  }, [user, allBookings, ownerProfile, payoutsLoaded]);

  // Financial Calculations
  const [waterfallPeriod, setWaterfallPeriod] = useState<WaterfallPeriod>('this_month');

  // Fetch dynamic fee config from Owner profile
  const { data: ownerConfig, isLoading: configLoading } = useQuery({
    queryKey: ['owner-config', user?.uid],
    queryFn: async () => {
      if (!user?.uid) return null;
      const docRef = doc(db, 'users', user.uid);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        return {
          platformFeePercent: data.platformFeePercent ?? 15,
          gstPercent: data.gstPercent ?? 18
        } as WaterfallConfig;
      }
      return { platformFeePercent: 15, gstPercent: 18 } as WaterfallConfig;
    },
    enabled: !!user?.uid
  });

  // Prepare data for Waterfall Engine
  const waterfallData = useMemo(() => {
    if (!allBookings) return null;

    const rawBookings: RawBookingForWaterfall[] = allBookings.map(b => ({
      id: b.id,
      status: b.status,
      currentCost: b.totalPrice,
      startTime: toJSDate(b.startTime),
      stationId: b.stationId
    }));

    const config = ownerConfig ?? { platformFeePercent: 15, gstPercent: 18 };
    const amounts = computeWaterfallAmounts(rawBookings, config, waterfallPeriod);
    const bars = buildWaterfallBars(amounts);
    const bounds = getPeriodBounds(waterfallPeriod);

    return { amounts, bars, bounds };
  }, [allBookings, ownerConfig, waterfallPeriod]);

  const metrics = useMemo(() => {
    const now = new Date();
    const lastMonth = subMonths(now, 1);

    const grossThisMonth = allBookings
      .filter(b => {
        const isSuccessful = b.status === BOOKING_STATUS.CONFIRMED || 
                             b.status === BOOKING_STATUS.COMPLETED ||
                             ["paid", "completed", "success"].includes(b.paymentStatus);
        return isSameMonth(toJSDate(b.startTime), now) && isSuccessful;
      })
      .reduce((s, b) => s + (Number(b.totalPrice) || 0), 0);

    const grossLastMonth = allBookings
      .filter(b => {
        const isSuccessful = b.status === BOOKING_STATUS.CONFIRMED || 
                             b.status === BOOKING_STATUS.COMPLETED ||
                             ["paid", "completed", "success"].includes(b.paymentStatus);
        return isSameMonth(toJSDate(b.startTime), lastMonth) && isSuccessful;
      })
      .reduce((s, b) => s + (Number(b.totalPrice) || 0), 0);

    const platformFeePercent = ownerConfig?.platformFeePercent ?? 15;
    const gstPercent = ownerConfig?.gstPercent ?? 18;

    const platformFee = grossThisMonth * (platformFeePercent / 100);
    const gstOnFee = platformFee * (gstPercent / 100);
    const netThisMonth = grossThisMonth - platformFee - gstOnFee;

    const lastMonthPlatformFee = grossLastMonth * (platformFeePercent / 100);
    const lastMonthGstOnFee = lastMonthPlatformFee * (gstPercent / 100);
    const netLastMonth = grossLastMonth - lastMonthPlatformFee - lastMonthGstOnFee;

    const today = new Date();
    const daysElapsed = today.getDate();
    const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    const daysLeft = daysInMonth - daysElapsed;

    const avgDailyRevenue = daysElapsed > 0 ? grossThisMonth / daysElapsed : 0;
    const projectedRevenue = Math.round(avgDailyRevenue * daysInMonth);
    const projectedGrowth = grossLastMonth > 0 
      ? ((projectedRevenue - grossLastMonth) / grossLastMonth * 100).toFixed(1)
      : 0;

    return {
      grossThisMonth,
      grossLastMonth,
      platformFee,
      gstOnFee,
      netThisMonth,
      avgDailyRevenue,
      projectedRevenue,
      projectedGrowth,
      daysLeft,
      lastPayout: {
        amount: netLastMonth,
        date: safeFormat(startOfMonth(now), "MMMM d, yyyy"),
      }
    };
  }, [allBookings, ownerConfig]);

  // Refund Logic Helpers
  const cancelledBookings = allBookings.filter(b => b.status === BOOKING_STATUS.CANCELLED && b.totalPrice > 0);
  const pendingRefunds = cancelledBookings.filter(b => !b.refundStatus || b.refundStatus === "pending");
  const processedRefunds = cancelledBookings.filter(b => b.refundStatus === "refunded");

  const markRefunded = async (bookingId: string) => {
    try {
      if (!user) return;
      await updateDoc(doc(db, "bookings", bookingId), {
         refundStatus: "refunded",
         refundedAt: serverTimestamp(),
         refundedBy: user.uid
      });
      setAllBookings(prev => prev.map(b => b.id === bookingId ? { ...b, refundStatus: "refunded" } : b));
      alert("Refund marked ✅");
    } catch (e) {
      console.error(e);
      alert("Failed to mark refund");
    }
  };

  // Filtering Logic
  const filteredBookings = useMemo(() => {
    let result = [...allBookings];
    const now = new Date();

    // Date Range Filter
    if (filters.dateRange !== "all") {
      let startLimit: Date | null = null;
      let endLimit: Date | null = now;

      switch (filters.dateRange) {
        case "today": startLimit = startOfDay(now); endLimit = endOfDay(now); break;
        case "week": startLimit = startOfWeek(now); endLimit = endOfWeek(now); break;
        case "month": startLimit = startOfMonth(now); endLimit = endOfMonth(now); break;
        case "last-month": 
          const lm = subMonths(now, 1);
          startLimit = startOfMonth(lm); 
          endLimit = endOfMonth(lm); 
          break;
        case "custom":
          if (filters.customFrom) startLimit = parseISO(filters.customFrom);
          if (filters.customTo) endLimit = parseISO(filters.customTo);
          break;
      }

      if (startLimit) {
        result = result.filter(b => {
          const t = toJSDate(b.startTime).getTime();
          return t >= startLimit!.getTime() && t <= endLimit!.getTime();
        });
      }
    }

    // Station Filter
    if (filters.stationId !== "all") {
      result = result.filter(b => b.stationId === filters.stationId);
    }

    // Payment Method Filter
    if (filters.paymentMethod !== "all") {
      result = result.filter(b => (b.paymentMethod || "UPI").toLowerCase() === filters.paymentMethod.toLowerCase());
    }

    // Status Filter
    if (filters.status !== "all") {
      result = result.filter(b => b.status === filters.status);
    }

    // Search Filter
    if (filters.search) {
      const q = filters.search.toLowerCase();
      result = result.filter(b => 
        (b.id || "").toLowerCase().includes(q) ||
        (b.stationName || "").toLowerCase().includes(q) ||
        (b.totalPrice || 0).toString().includes(q) ||
        (b.connectorType || "").toLowerCase().includes(q)
      );
    }

    return result;
  }, [allBookings, filters]);

  // Export Logic
  const handleExportCSV = () => {
    const headers = [
      "Date", "Time", "Station", "Connector ID", "Connector Type", "Driver ID", 
      "Duration(min)", "kWh Delivered", "Gross(₹)", 
      "Platform Fee(₹)", "Net Amount(₹)", 
      "Payment Method", "Booking ID", "Status"
    ];

    const rows = filteredBookings.map(b => {
      const date = toJSDate(b.startTime);
      const gross = Number(b.totalPrice) || 0;
      const feeRate = (ownerConfig?.platformFeePercent ?? PLATFORM_FEE_PERCENT) / 100;
      const fee = gross * feeRate;
      const net = gross - fee;
      
      return [
        safeFormat(date, "yyyy-MM-dd"),
        safeFormat(date, "HH:mm"),
        (b.stationName || "Unknown").replace(/,/g, ""),
        (b.connectorId || "Unknown").replace(/,/g, ""),
        (b.connectorType || "Unknown"),
        "Driver-" + (b.userId || "0000").slice(-4),
        b.duration || 0,
        (Number(b.energyDeliveredKwh) || 0).toFixed(2),
        gross.toFixed(2),
        fee.toFixed(2),
        net.toFixed(2),
        b.paymentMethod || "UPI",
        b.id,
        b.status
      ];
    });

    const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `EV_Ledger_${safeFormat(new Date(), "yyyy-MM-dd")}.csv`;
    link.click();
  };

  const fmt = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" });

  if (loading || authLoading) return <div className="flex items-center justify-center h-64 text-muted-foreground animate-pulse font-black uppercase tracking-tighter">Syncing financial streams...</div>;

  return (
    <div className="space-y-6 pb-20 skeleton-fade-in">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight">Financial Ledger</h1>
          <p className="text-sm text-muted-foreground font-medium">Monitoring {filteredBookings.length} of {allBookings.length} transactions across your station portfolio</p>
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={handleExportCSV} variant="outline" className="gap-2 h-11 rounded-xl shadow-lg shadow-primary/5 font-bold border-2">
            <Download className="w-4 h-4" /> Export CSV
          </Button>
          <Button onClick={() => window.print()} variant="outline" className="gap-2 h-11 rounded-xl shadow-lg shadow-primary/5 font-bold border-2">
            <Printer className="w-4 h-4" /> Export PDF
          </Button>
        </div>
      </div>

      {/* Revenue Forecast Widget */}
      <Card className="p-6 glass-card overflow-hidden relative shadow-lg">
         <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-4">
               <div className="flex items-center gap-2 text-primary font-black uppercase tracking-widest text-xs">
                  <span className="flex h-2 w-2 rounded-full bg-primary animate-pulse" />
                  📈 Revenue Forecast
               </div>
               <div className="flex items-center gap-8 text-sm">
                  <div>
                    <p className="text-muted-foreground font-bold">This month so far</p>
                    <p className="text-2xl font-mono font-black">{fmt.format(metrics.grossThisMonth)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground font-bold">Daily average</p>
                    <p className="text-2xl font-mono font-black">{fmt.format(metrics.avgDailyRevenue)}/day</p>
                  </div>
               </div>
            </div>
            
            <div className="border-l-2 pl-6 space-y-4 min-w-[250px]">
               <div>
                  <p className="text-muted-foreground font-bold text-sm">Projected month-end</p>
                  <p className="text-3xl font-mono font-black">{fmt.format(metrics.projectedRevenue)}</p>
                  <p className={cn("text-xs font-black uppercase tracking-widest mt-1", Number(metrics.projectedGrowth) > 0 ? "text-emerald-500" : Number(metrics.projectedGrowth) < -10 ? "text-destructive" : "text-yellow-500")}>
                    vs last month {fmt.format(metrics.grossLastMonth)}: {Number(metrics.projectedGrowth) > 0 ? "↑" : "↓"} {metrics.projectedGrowth}%
                  </p>
               </div>
               <p className="text-xs font-bold text-muted-foreground flex items-center gap-2">
                  <Calendar className="w-3.5 h-3.5" />
                  {metrics.daysLeft} days remaining this month
               </p>
            </div>
         </div>
         {(metrics.projectedRevenue < metrics.grossLastMonth) && (
            <div className="mt-6 pt-4 border-t-2 border-dashed border-primary/20 flex items-center justify-between">
               <p className="text-sm font-bold text-muted-foreground flex items-center gap-2">
                  <Zap className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                  💡 Tip: Enable surge pricing during peak hours to boost revenue
               </p>
               <Button onClick={() => setLocation("/owner/dashboard")} variant="ghost" className="font-black uppercase tracking-widest text-xs pr-0">
                  Enable Surge →
               </Button>
            </div>
         )}
      </Card>

      {/* Revenue Waterfall & Payout Section */}
      <Card className="overflow-hidden glass-card relative shadow-2xl border-none">
        <div className="absolute top-0 right-0 p-8 opacity-[0.03] pointer-events-none">
           <BarChart3 className="w-64 h-64" />
        </div>
        
        <div className="p-8 space-y-8">
          {/* Section Header */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/50 pb-6">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                  <BarChart3 className="w-5 h-5" />
                </div>
                <h2 className="text-2xl font-black tracking-tight">Revenue Waterfall</h2>
              </div>
              <p className="text-sm font-medium text-muted-foreground flex items-center gap-1.5 ml-1">
                <Info className="w-3.5 h-3.5" />
                Transparent breakdown of platform fees and GST deductions
              </p>
            </div>
            
            <div className="flex items-center gap-3">
              {waterfallData && (
                <Badge variant="outline" className="bg-background/50 backdrop-blur-sm border-primary/20 text-primary px-3 py-1 font-bold">
                  {waterfallData.amounts.netPayoutPercent}% Net Payout
                </Badge>
              )}
              <Select 
                value={waterfallPeriod} 
                onValueChange={(v) => setWaterfallPeriod(v as WaterfallPeriod)}
              >
                <SelectTrigger className="w-[160px] h-10 font-bold bg-background/50 backdrop-blur-sm border-2">
                  <SelectValue placeholder="Select period" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PERIOD_CONFIG).map(([key, cfg]) => (
                    <SelectItem key={key} value={key} className="font-medium">
                      {cfg.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-12">
            {/* Visual Waterfall Chart */}
            <div className="lg:col-span-3 space-y-6">
              <div className="flex items-center justify-between px-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  Flow of Funds ({waterfallData?.bounds.label})
                </p>
              </div>
              <RevenueWaterfallChart 
                bars={waterfallData?.bars ?? []}
                netPayout={waterfallData?.amounts.netPayout ?? 0}
                grossRevenue={waterfallData?.amounts.grossRevenue ?? 0}
                isLoading={loading || configLoading}
              />
            </div>

            {/* Tabular Breakdown & Math */}
            <div className="lg:col-span-2 space-y-6">
              <div className="flex items-center justify-between px-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                  <Calculator className="w-3 h-3" />
                  Detailed Calculations
                </p>
              </div>
              {waterfallData && (
                <RevenueBreakdownTable 
                  amounts={waterfallData.amounts}
                  period={waterfallPeriod}
                  periodLabel={waterfallData.bounds.label}
                />
              )}
            </div>
          </div>

          <Separator className="bg-border/50" />

          {/* Original Payout Summary Section (Simplified) */}
          <div className="space-y-6 pt-2">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                 <Wallet className="w-5 h-5" />
              </div>
              <h2 className="text-xl font-black tracking-tight">
                Payout Summary — {waterfallData?.bounds.label || safeFormat(new Date(), "MMMM yyyy")}
              </h2>
            </div>

          <div className="grid md:grid-cols-3 gap-12">
            <div className="space-y-4">
               <div className="space-y-1">
                  <p className="text-xs font-black uppercase text-muted-foreground tracking-widest">Gross Revenue</p>
                  <p className="text-3xl font-mono font-black">
                    <AnimatedNumber value={waterfallData?.amounts.grossRevenue ?? metrics.grossThisMonth} prefix="₹" />
                  </p>
               </div>
               <div className="flex items-center justify-between text-sm py-2 px-3 bg-muted/30 rounded-xl border border-dashed">
                  <span className="font-bold text-muted-foreground">Platform Fee ({waterfallData?.amounts.platformFeePercent ?? ownerConfig?.platformFeePercent ?? 15}%)</span>
                  <span className="font-mono text-destructive font-black">-{fmt.format(waterfallData?.amounts.platformFee ?? metrics.platformFee)}</span>
               </div>
               <div className="flex items-center justify-between text-sm py-2 px-3 bg-muted/30 rounded-xl border border-dashed">
                  <span className="font-bold text-muted-foreground">GST on Fee ({waterfallData?.amounts.gstPercent ?? ownerConfig?.gstPercent ?? 18}%)</span>
                  <span className="font-mono text-destructive font-black">-{fmt.format(waterfallData?.amounts.gstOnFee ?? metrics.gstOnFee)}</span>
               </div>
               <Separator className="bg-primary/20 h-0.5" />
               <div className="space-y-1 pt-1 text-primary">
                  <p className="text-xs font-black uppercase tracking-widest">Net Available for Payout</p>
                  <div className="flex items-center gap-2">
                    <p className="text-4xl font-mono font-black">
                      <AnimatedNumber value={waterfallData?.amounts.netPayout ?? metrics.netThisMonth} prefix="₹" />
                    </p>
                    <CheckCircle className="w-6 h-6 fill-primary/20" />
                  </div>
               </div>
            </div>

            <div className="md:border-l md:pl-12 flex flex-col justify-between">
               <div className="space-y-4">
                  <div className="space-y-1">
                    <p className="text-xs font-black uppercase text-muted-foreground tracking-widest">Last Payout</p>
                    <p className="text-xl font-black">{fmt.format(metrics.lastPayout.amount)} on {metrics.lastPayout.date}</p>
                  </div>
                  <div className="space-y-1 p-4 rounded-2xl bg-primary/[0.03] border-2 border-primary/5">
                    <p className="text-[10px] font-black uppercase text-primary/60 tracking-widest">Registered Payout Account</p>
                    <div className="flex items-center gap-2 text-sm font-black text-primary">
                       <Smartphone className="w-4 h-4" />
                       {ownerProfile?.upiId || "No UPI ID found"}
                    </div>
                  </div>
                </div>
                <div className="pt-6">
                 <Button disabled className="w-full h-12 rounded-2xl gap-2 font-black uppercase tracking-widest text-[10px] shadow-xl">
                    <ArrowUpRight className="w-4 h-4" /> Request Manual Payout
                 </Button>
                 <p className="text-center text-[10px] font-bold text-muted-foreground mt-2 italic">"Auto-payout on 1st of each month"</p>
               </div>
            </div>

            <div className="md:border-l md:pl-12 flex flex-col justify-center bg-muted/10 -m-8 p-8 md:bg-transparent md:m-0 md:p-0">
               <div className="space-y-2">
                  <h4 className="text-sm font-black uppercase tracking-widest text-muted-foreground">Payout Health</h4>
                  <p className="text-xs text-muted-foreground leading-relaxed">Your revenue is currently processed and will be credited to your linked UPI address within 24-48 hours after the monthly cut-off.</p>
                  <div className="flex items-center gap-2 text-emerald-500 font-bold text-xs pt-2">
                     <div className="w-2 h-2 rounded-full bg-current animate-pulse" />
                     Network Status: Operational
                  </div>
               </div>
            </div>
          </div>
        </div>
        </div>
      </Card>

      {/* NEW Refunds & Payouts Sections */}
      <div className="grid md:grid-cols-2 gap-6 mb-6">
         {/* Refund Tracker */}
         <Card className="p-6 glass-card shadow-lg flex flex-col">
            <div className="flex items-center justify-between mb-6">
               <div className="flex items-center gap-2 text-primary font-black uppercase tracking-widest text-xs">
                  <span className="flex h-2 w-2 rounded-full bg-primary animate-pulse" />
                  🔄 Refund Tracker
               </div>
               <div className="flex gap-2">
                  <Button variant={!showProcessedRefunds ? "default" : "outline"} size="sm" onClick={() => setShowProcessedRefunds(false)} className="h-8 rounded-lg font-bold text-[10px] uppercase tracking-widest">
                     Pending ({pendingRefunds.length})
                  </Button>
                  <Button variant={showProcessedRefunds ? "default" : "outline"} size="sm" onClick={() => setShowProcessedRefunds(true)} className="h-8 rounded-lg font-bold text-[10px] uppercase tracking-widest">
                     Processed
                  </Button>
               </div>
            </div>
            
            <div className="space-y-4 flex-1">
               {showProcessedRefunds ? (
                  processedRefunds.length === 0 ? (
                     <p className="text-center text-sm font-bold text-muted-foreground py-8">No processed refunds</p>
                  ) : (
                     processedRefunds.map(b => (
                        <div key={b.id} className="p-4 rounded-xl border-2 bg-muted/20 flex items-center justify-between">
                           <div>
                              <p className="font-black">{b.driverName || `Driver ${b.userId?.slice(-4)}`} • {safeFormat(toJSDate(b.startTime), "MMM d")}</p>
                              <p className="text-xs font-bold text-muted-foreground mt-1 text-emerald-500">Refunded</p>
                           </div>
                           <p className="font-mono font-black">{fmt.format(Number(b.totalPrice) || 0)}</p>
                        </div>
                     ))
                  )
               ) : (
                  pendingRefunds.length === 0 ? (
                     <div className="text-center text-sm font-bold text-emerald-500 py-8 bg-emerald-500/10 rounded-xl border border-emerald-500/20">
                        ✅ No pending refunds
                     </div>
                  ) : (
                     pendingRefunds.map(b => (
                        <div key={b.id} className="p-4 rounded-xl border-2 border-primary/10 bg-primary/5 flex items-center justify-between gap-4">
                           <div className="flex-1 min-w-0">
                              <p className="font-black truncate">{b.driverName || `Driver ${b.userId?.slice(-4)}`} • {safeFormat(toJSDate(b.startTime), "MMM d")}</p>
                              <p className="text-xs font-bold text-muted-foreground mt-1 truncate">Reason: "{b.cancellationReason || "Changed my mind"}"</p>
                           </div>
                           <div className="text-right space-y-2">
                              <p className="font-mono font-black">{fmt.format(Number(b.totalPrice) || 0)}</p>
                              <Button size="sm" onClick={() => markRefunded(b.id)} className="h-7 text-[10px] font-black uppercase tracking-widest">
                                 Refund ✅
                              </Button>
                           </div>
                        </div>
                     ))
                  )
               )}
            </div>
            <div className="mt-6 pt-4 border-t-2 flex flex-col gap-1 text-xs font-bold text-muted-foreground">
               <p>Total refunded: {fmt.format(processedRefunds.reduce((s, b) => s + (Number(b.totalPrice) || 0), 0))} ({processedRefunds.length} total)</p>
               <p>Pending refunds: {fmt.format(pendingRefunds.reduce((s, b) => s + (Number(b.totalPrice) || 0), 0))} ({pendingRefunds.length} total)</p>
            </div>
         </Card>

         {/* Payout History Section */}
         <Card className="p-6 glass-card shadow-lg flex flex-col">
            <div className="flex items-center justify-between mb-6">
               <div className="flex items-center gap-2 text-primary font-black uppercase tracking-widest text-xs">
                  💳 Payout History
               </div>
            </div>
            <div className="overflow-x-auto">
               <table className="w-full text-sm text-left">
                  <thead>
                     <tr className="border-b uppercase tracking-widest text-[10px] text-muted-foreground">
                        <th className="pb-2">Month</th>
                        <th className="pb-2">Gross</th>
                        <th className="pb-2">Net</th>
                        <th className="pb-2">Status</th>
                     </tr>
                  </thead>
                  <tbody>
                     {payoutHistory.length === 0 ? (
                        <tr><td colSpan={4} className="text-center py-8 text-muted-foreground font-bold text-sm">No payout history found</td></tr>
                     ) : (
                        payoutHistory.map(ph => (
                           <tr key={ph.id || ph.month} className="border-b last:border-0 hover:bg-muted/50 cursor-pointer" onClick={() => setSelectedPayout(ph)}>
                              <td className="py-3 font-bold">{safeFormat(parseISO(ph.month + "-01"), "MMM yyyy")}</td>
                              <td className="py-3 font-mono font-black">{fmt.format(ph.grossRevenue)}</td>
                              <td className="py-3 font-mono font-black text-primary">{fmt.format(ph.netPayout)}</td>
                              <td className="py-3">
                                 <Badge variant={ph.status === "paid" ? "default" : ph.status === "pending" ? "secondary" : "default"} className={cn("text-[9px] uppercase tracking-widest", ph.status === "paid" && "bg-emerald-500 hover:bg-emerald-500 text-white", ph.status === "pending" && "bg-yellow-500/20 text-yellow-600", ph.status === "processing" && "bg-blue-500 hover:bg-blue-500 text-white")}>
                                    {ph.status === "paid" ? "✅ Paid" : ph.status === "pending" ? "⏳ Pending" : "🔄 Processing"}
                                 </Badge>
                              </td>
                           </tr>
                        ))
                     )}
                  </tbody>
               </table>
            </div>
         </Card>
      </div>

      {/* Station Connector Breakdown */}
      <div className="space-y-4 mb-6">
         {stations.map(station => {
            const connectorRevenue: Record<string, any> = {};
            allBookings
              .filter(b => b.stationId === station.id && b.status === BOOKING_STATUS.COMPLETED)
              .forEach(b => {
                 const key = b.connectorId || "unknown";
                 if (!connectorRevenue[key]) {
                    connectorRevenue[key] = {
                       connectorId: key,
                       connectorType: b.connectorType || "N/A",
                       sessions: 0,
                       revenue: 0,
                       totalKwh: 0
                    };
                 }
                 connectorRevenue[key].sessions++;
                 connectorRevenue[key].revenue += Number(b.totalPrice) || 0;
                 connectorRevenue[key].totalKwh += Number(b.energyDeliveredKwh) || 0;
              });
            const connectors = Object.values(connectorRevenue);
            if (connectors.length === 0) return null;
            const maxRev = Math.max(...connectors.map(c => c.revenue));

            return (
              <Card key={station.id} className="p-6 glass-card space-y-4 relative shadow-md">
                 <h4 className="font-black text-xl tracking-tight leading-none">{station.name}</h4>
                 <details className="group">
                    <summary className="font-bold text-sm text-primary cursor-pointer mt-2 list-none hover:underline [&::-webkit-details-marker]:hidden flex flex-col gap-2 relative z-10 w-fit">
                       <div className="flex items-center gap-2">
                          ▼ Connector Breakdown
                       </div>
                    </summary>
                    <div className="pt-4 overflow-x-auto relative z-10">
                       <table className="w-full text-sm text-left">
                          <thead>
                             <tr className="border-b uppercase tracking-widest text-[10px] text-muted-foreground">
                                <th className="pb-2">Connector</th>
                                <th className="pb-2 text-center">Sessions</th>
                                <th className="pb-2 text-right">Revenue</th>
                                <th className="pb-2 text-right">kWh</th>
                             </tr>
                          </thead>
                          <tbody>
                             {connectors.map(c => (
                                <tr key={c.connectorId} className="border-b last:border-0 hover:bg-muted/50">
                                   <td className="py-3 font-bold flex items-center flex-wrap gap-2">
                                      {c.connectorType} #{c.connectorId}
                                      {c.revenue > 0 && c.revenue === maxRev && (
                                         <Badge variant="default" className="text-[9px] uppercase tracking-widest bg-yellow-500 text-black hover:bg-yellow-500 whitespace-nowrap">🏆 Best performer</Badge>
                                      )}
                                   </td>
                                   <td className="py-3 text-center">{c.sessions}</td>
                                   <td className="py-3 font-mono font-black text-right">{fmt.format(c.revenue)}</td>
                                   <td className="py-3 text-emerald-500 font-bold text-right">{c.totalKwh.toFixed(1)}</td>
                                </tr>
                             ))}
                          </tbody>
                       </table>
                    </div>
                 </details>
              </Card>
            );
         })}
      </div>

      {/* Filter Bar */}
      <Card className="p-4 glass-card space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[240px] space-y-1.5">
             <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest ml-1">Search bookings</Label>
             <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input 
                  value={filters.search} 
                  onChange={e => setFilters({...filters, search: e.target.value})} 
                  placeholder="ID, station, or amount..." 
                  className="pl-9 h-11 rounded-xl border-2 focus-visible:ring-primary/20" 
                />
             </div>
          </div>

          <div className="space-y-1.5">
             <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest ml-1">Date Range</Label>
             <Select value={filters.dateRange} onValueChange={v => setFilters({...filters, dateRange: v})}>
               <SelectTrigger className="h-11 rounded-xl border-2 w-[160px] font-bold">
                  <Calendar className="w-4 h-4 mr-2 text-primary" />
                  <SelectValue placeholder="Select period" />
               </SelectTrigger>
               <SelectContent className="rounded-xl border-2">
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="week">This Week</SelectItem>
                  <SelectItem value="month">This Month</SelectItem>
                  <SelectItem value="last-month">Last Month</SelectItem>
                  <SelectItem value="all">All Time</SelectItem>
                  <SelectItem value="custom">Custom Range</SelectItem>
               </SelectContent>
             </Select>
          </div>

          <div className="space-y-1.5">
             <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest ml-1">Station</Label>
             <Select value={filters.stationId} onValueChange={v => setFilters({...filters, stationId: v})}>
               <SelectTrigger className="h-11 rounded-xl border-2 w-[200px] font-bold">
                  <SelectValue placeholder="Select station" />
               </SelectTrigger>
               <SelectContent className="rounded-xl border-2">
                  <SelectItem value="all">All Stations</SelectItem>
                  {stations.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
               </SelectContent>
             </Select>
          </div>

          <div className="space-y-1.5">
             <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest ml-1">Payment</Label>
             <Select value={filters.paymentMethod} onValueChange={v => setFilters({...filters, paymentMethod: v})}>
               <SelectTrigger className="h-11 rounded-xl border-2 w-[140px] font-bold">
                  <SelectValue placeholder="Payment Method" />
               </SelectTrigger>
               <SelectContent className="rounded-xl border-2">
                  <SelectItem value="all">All Methods</SelectItem>
                  <SelectItem value="upi">UPI</SelectItem>
                  <SelectItem value="card">Card</SelectItem>
                  <SelectItem value="wallet">Wallet</SelectItem>
               </SelectContent>
             </Select>
          </div>

          <div className="space-y-1.5">
             <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest ml-1">Status</Label>
             <Select value={filters.status} onValueChange={v => setFilters({...filters, status: v})}>
               <SelectTrigger className="h-11 rounded-xl border-2 w-[140px] font-bold">
                  <SelectValue placeholder="Status" />
               </SelectTrigger>
               <SelectContent className="rounded-xl border-2">
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value={BOOKING_STATUS.COMPLETED}>Completed</SelectItem>
                  <SelectItem value={BOOKING_STATUS.PENDING}>Pending</SelectItem>
                  <SelectItem value={BOOKING_STATUS.CANCELLED}>Cancelled</SelectItem>
               </SelectContent>
             </Select>
          </div>

          <Button 
            variant="ghost" 
            onClick={() => setFilters({dateRange: "this-month", customFrom: "", customTo: "", stationId: "all", paymentMethod: "all", status: "all", search: ""})}
            className="h-11 rounded-xl font-bold text-xs text-muted-foreground hover:text-primary"
          >
            Clear Filters
          </Button>
        </div>

        {filters.dateRange === "custom" && (
          <div className="flex gap-3 animate-in fade-in slide-in-from-top-2 duration-300 pt-2 border-t border-dashed">
             <div className="flex-1 space-y-1.5">
                <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">From Date</Label>
                <Input type="date" value={filters.customFrom} onChange={e => setFilters({...filters, customFrom: e.target.value})} className="h-11 rounded-xl border-2" />
             </div>
             <div className="flex-1 space-y-1.5">
                <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">To Date</Label>
                <Input type="date" value={filters.customTo} onChange={e => setFilters({...filters, customTo: e.target.value})} className="h-11 rounded-xl border-2" />
             </div>
          </div>
        )}
      </Card>

      {/* Transaction Table */}
      <Card className="overflow-hidden glass-card">
        {filteredBookings.length === 0 ? (
          <div className="text-center py-24 space-y-4">
             <div className="w-16 h-16 rounded-3xl bg-muted/50 flex items-center justify-center mx-auto text-muted-foreground/30">
               <Search className="w-8 h-8" />
             </div>
             <div className="space-y-1">
               <p className="text-xl font-black tracking-tight text-muted-foreground">No matches found</p>
               <p className="text-sm text-muted-foreground/60">Try adjusting your filters or search keywords</p>
             </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/30 border-b text-left">
                  <th className="px-6 py-4 font-black uppercase tracking-widest text-[10px] text-muted-foreground">Station / Connector</th>
                  <th className="px-6 py-4 font-black uppercase tracking-widest text-[10px] text-muted-foreground">Status</th>
                  <th className="px-6 py-4 font-black uppercase tracking-widest text-[10px] text-muted-foreground">Method</th>
                  <th className="px-6 py-4 font-black uppercase tracking-widest text-[10px] text-muted-foreground text-right">Amount</th>
                  <th className="px-6 py-4 font-black uppercase tracking-widest text-[10px] text-muted-foreground text-right">Date & Time</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody>
                {filteredBookings.map((b) => (
                  <tr 
                    key={b.id} 
                    onClick={() => setSelectedBooking(b)}
                    className="border-b last:border-0 hover:bg-primary/5 transition-colors cursor-pointer group interactive-card"
                  >
                    <td className="px-6 py-4">
                      <p className="font-black text-foreground tracking-tight">{b.stationName || "Unknown Station"}</p>
                      <p className="text-[10px] text-muted-foreground font-mono uppercase tracking-widest">{b.connectorType || "Unknown"} • {b.id.slice(-8)}</p>
                    </td>
                    <td className="px-6 py-4">
                      <Badge 
                        variant={b.status === BOOKING_STATUS.COMPLETED ? "default" : b.status === BOOKING_STATUS.CANCELLED ? "destructive" : "secondary"}
                        className="rounded-lg font-black uppercase text-[9px] tracking-widest px-2 py-0.5"
                      >
                        {b.status}
                      </Badge>
                    </td>
                    <td className="px-6 py-4">
                       <div className="flex items-center gap-2 font-bold text-xs">
                          {b.paymentMethod === "Card" ? <CreditCard className="w-3 h-3 text-blue-500" /> : <Smartphone className="w-3 h-3 text-emerald-500" />}
                          {b.paymentMethod || "UPI"}
                       </div>
                    </td>
                    <td className="px-6 py-4 font-mono font-black text-right text-base tracking-tighter">{fmt.format(Number(b.totalPrice) || 0)}</td>
                    <td className="px-6 py-4 text-right text-muted-foreground whitespace-nowrap">
                       <p className="font-bold text-xs">{safeFormat(toJSDate(b.startTime), "MMM d, yyyy")}</p>
                       <p className="text-[10px] font-medium">{safeFormat(toJSDate(b.startTime), "HH:mm")}</p>
                    </td>
                    <td className="pr-4 py-4 text-muted-foreground/30 group-hover:text-primary transition-colors">
                       <ChevronRight className="w-4 h-4" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Transaction Detail Drawer */}
      <Sheet open={!!selectedBooking} onOpenChange={() => setSelectedBooking(null)}>
        <SheetContent className="w-full sm:max-w-[400px] rounded-l-[3rem] p-0 border-l-4 border-primary/20 shadow-2xl overflow-hidden">
           {selectedBooking && (
             <div className="h-full flex flex-col bg-card/50 backdrop-blur-xl">
                <div className="p-8 space-y-6 flex-1 overflow-auto">
                    <SheetHeader className="space-y-1">
                       <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary mb-4">
                          <CheckCircle className="w-6 h-6" />
                       </div>
                       <SheetTitle className="text-3xl font-black tracking-tight">Transaction Detail</SheetTitle>
                       <p className="text-xs font-mono text-muted-foreground uppercase tracking-widest">ID: {selectedBooking.id}</p>
                    </SheetHeader>

                    <Separator className="bg-primary/10" />

                    <div className="space-y-4">
                       <div className="space-y-1">
                          <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Station Location</Label>
                          <p className="font-black text-lg leading-tight">{selectedBooking.stationName}</p>
                          <p className="text-sm font-bold text-primary">{selectedBooking.connectorType} • Connector ID: {selectedBooking.connectorId}</p>
                       </div>

                       <div className="space-y-1">
                          <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Session User</Label>
                          <div className="flex items-center gap-2 p-3 bg-muted/40 rounded-2xl border-2">
                             <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-black text-xs">U</div>
                             <div>
                                <p className="text-sm font-black">Driver # {selectedBooking.userId?.slice(-6) || "N/A"}</p>
                                <p className="text-[10px] font-bold text-muted-foreground uppercase opacity-60">Privacy Protected</p>
                             </div>
                          </div>
                       </div>
                    </div>

                    <Separator className="bg-primary/10" />

                    <div className="grid grid-cols-2 gap-6">
                       <div className="space-y-1">
                          <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Session Date</Label>
                          <p className="font-bold flex items-center gap-2"><Calendar className="w-3.5 h-3.5" /> {safeFormat(toJSDate(selectedBooking.startTime), "MMM d, yyyy")}</p>
                       </div>
                       <div className="space-y-1">
                          <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Duration</Label>
                          <p className="font-bold flex items-center gap-2"><Clock className="w-3.5 h-3.5" /> {selectedBooking.duration} minutes</p>
                       </div>
                       <div className="space-y-1">
                          <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Energy Delivered</Label>
                          <p className="font-bold flex items-center gap-2 text-emerald-500"><Zap className="w-3.5 h-3.5" /> {Number(selectedBooking.energyDeliveredKwh)?.toFixed(2) || "0.00"} kWh</p>
                       </div>
                       <div className="space-y-1">
                          <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Payment Flow</Label>
                          <p className="font-bold flex items-center gap-2"><Smartphone className="w-3.5 h-3.5" /> {selectedBooking.paymentMethod || "UPI"}</p>
                       </div>
                    </div>

                    <Separator className="bg-primary/10" />

                    <div className="bg-primary/5 rounded-3xl p-6 border-2 border-primary/10 space-y-4">
                       <div className="flex justify-between items-center text-sm">
                          <span className="font-bold text-muted-foreground">Gross Transaction</span>
                          <span className="font-mono font-black">{fmt.format(Number(selectedBooking.totalPrice) || 0)}</span>
                       </div>
                       <div className="flex justify-between items-center text-sm">
                          <span className="font-bold text-muted-foreground">Platform Fee ({ownerConfig?.platformFeePercent ?? 5}%)</span>
                          <span className="font-mono font-black text-destructive">-{fmt.format((Number(selectedBooking.totalPrice) || 0) * ((ownerConfig?.platformFeePercent ?? 5) / 100))}</span>
                       </div>
                       <div className="pt-2 border-t-2 border-dashed border-primary/20 flex justify-between items-center">
                          <span className="font-black text-primary uppercase text-xs">Net Earning</span>
                          <span className="text-2xl font-mono font-black text-primary">{fmt.format((Number(selectedBooking.totalPrice) || 0) * (1 - (ownerConfig?.platformFeePercent ?? 5) / 100))}</span>
                       </div>
                    </div>
                </div>

                <div className="p-8 bg-muted/40 border-t-2 border-primary/5">
                   <Button 
                      className="w-full h-14 rounded-2xl font-black uppercase tracking-widest shadow-xl shadow-primary/20"
                      onClick={() => setLocation(`/receipt/${selectedBooking.id}`)}
                   >
                       View Public Receipt
                   </Button>
                </div>
             </div>
           )}
        </SheetContent>
      </Sheet>

      {/* Payout History Drawer */}
      <Sheet open={!!selectedPayout} onOpenChange={() => setSelectedPayout(null)}>
        <SheetContent className="w-full sm:max-w-[400px] rounded-l-[3rem] p-0 border-l-4 border-primary/20 shadow-2xl overflow-hidden">
           {selectedPayout && (
             <div className="h-full flex flex-col bg-card/50 backdrop-blur-xl">
                <div className="p-8 space-y-6 flex-1 overflow-auto">
                    <SheetHeader className="space-y-1">
                       <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary mb-4">
                          <Wallet className="w-6 h-6" />
                       </div>
                       <SheetTitle className="text-3xl font-black tracking-tight">Payout Details</SheetTitle>
                       <p className="text-xs font-mono text-muted-foreground uppercase tracking-widest">Month: {safeFormat(parseISO(selectedPayout.month + "-01"), "MMMM yyyy")}</p>
                    </SheetHeader>

                    <Separator className="bg-primary/10" />

                    <div className="grid grid-cols-2 gap-6">
                       <div className="space-y-1">
                          <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Status</Label>
                          <p className="font-bold flex items-center gap-2">{selectedPayout.status}</p>
                       </div>
                       <div className="space-y-1">
                          <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">UPI ID</Label>
                          <p className="font-bold flex items-center gap-2">{selectedPayout.upiId || "N/A"}</p>
                       </div>
                    </div>

                    {selectedPayout.transactionRef && (
                       <div className="space-y-1">
                          <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Reference No.</Label>
                          <p className="font-mono text-sm">{selectedPayout.transactionRef}</p>
                       </div>
                    )}

                    <Separator className="bg-primary/10" />

                    <div className="bg-primary/5 rounded-3xl p-6 border-2 border-primary/10 space-y-4">
                       <div className="flex justify-between items-center text-sm">
                          <span className="font-bold text-muted-foreground">Gross Revenue</span>
                          <span className="font-mono font-black">{fmt.format(selectedPayout.grossRevenue)}</span>
                       </div>
                       <div className="flex justify-between items-center text-sm">
                          <span className="font-bold text-muted-foreground">Platform Fee</span>
                          <span className="font-mono font-black text-destructive">-{fmt.format(selectedPayout.platformFee)}</span>
                       </div>
                       <div className="pt-2 border-t-2 border-dashed border-primary/20 flex justify-between items-center">
                          <span className="font-black text-primary uppercase text-xs">Net Payout</span>
                          <span className="text-2xl font-mono font-black text-primary">{fmt.format(selectedPayout.netPayout)}</span>
                       </div>
                    </div>
                </div>
             </div>
           )}
        </SheetContent>
      </Sheet>

      {/* Hidden Print Template for PDF */}
      <div id="ledger-print" className="hidden print:block p-12 bg-white text-black font-sans">
         <div className="flex justify-between items-start border-b-4 border-black pb-8 mb-8">
            <div>
               <h1 className="text-4xl font-black uppercase tracking-tighter">Financial Ledger Report</h1>
               <p className="text-xl font-bold mt-2">Owner: {ownerProfile?.fullName || "Ajay Verma"}</p>
               <p className="text-sm font-medium opacity-60">Generated on: {safeFormat(new Date(), "PPpp")}</p>
            </div>
            <div className="text-right">
               <div className="text-2xl font-black uppercase bg-black text-white px-4 py-2">⚡ EV Platform</div>
               <p className="text-sm font-bold mt-4 uppercase tracking-widest">Report Period: {filters.dateRange}</p>
            </div>
         </div>

         <div className="grid grid-cols-4 gap-8 mb-12">
            <div className="border-4 border-black p-4">
               <p className="text-[10px] font-black uppercase">Gross Revenue</p>
               <p className="text-2xl font-serif font-black">{fmt.format(metrics.grossThisMonth)}</p>
            </div>
            <div className="border-4 border-black p-4">
               <p className="text-[10px] font-black uppercase">Transactions</p>
               <p className="text-2xl font-serif font-black">{filteredBookings.length}</p>
            </div>
            <div className="border-4 border-black p-4">
               <p className="text-[10px] font-black uppercase">Platform Fee</p>
               <p className="text-2xl font-serif font-black text-red-600">-{fmt.format(metrics.platformFee)}</p>
            </div>
            <div className="bg-black text-white p-4">
               <p className="text-[10px] font-black uppercase opacity-60">Net Earnings</p>
               <p className="text-2xl font-serif font-black">{fmt.format(metrics.netThisMonth)}</p>
            </div>
         </div>

         <table className="w-full text-[10px] border-collapse">
            <thead>
               <tr className="border-b-2 border-black font-black uppercase">
                  <th className="py-2 text-left">Date</th>
                  <th className="py-2 text-left">Booking ID</th>
                  <th className="py-2 text-left">Station</th>
                  <th className="py-2 text-left">Type</th>
                  <th className="py-2 text-right">kWh</th>
                  <th className="py-2 text-right">Gross (INR)</th>
                  <th className="py-2 text-right">Net (INR)</th>
               </tr>
            </thead>
            <tbody>
               {filteredBookings.map(b => (
                 <tr key={b.id} className="border-b border-gray-200">
                    <td className="py-2">{safeFormat(toJSDate(b.startTime), "dd/MM/yyyy")}</td>
                    <td className="py-2 font-mono">{b.id.slice(0, 12)}</td>
                    <td className="py-2 font-bold">{b.stationName}</td>
                    <td className="py-2">{b.connectorType}</td>
                    <td className="py-2 text-right">{Number(b.energyDeliveredKwh)?.toFixed(1) || "0.0"}</td>
                    <td className="py-2 text-right font-bold">{(Number(b.totalPrice) || 0).toFixed(2)}</td>
                    <td className="py-2 text-right font-black text-primary">{( (Number(b.totalPrice) || 0) * 0.95).toFixed(2)}</td>
                 </tr>
               ))}
            </tbody>
         </table>

         <div className="mt-24 border-t-2 border-black pt-4 flex justify-between text-[10px] font-black uppercase opacity-40">
            <span>Official Revenue Statements • Digital Ledger System</span>
            <span>Page 1 of 1</span>
         </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          body * { visibility: hidden }
          #ledger-print, #ledger-print * { visibility: visible }
          #ledger-print { position: absolute; left: 0; top: 0; width: 100%; display: block !important; }
        }
      `}} />
    </div>
  );
}
