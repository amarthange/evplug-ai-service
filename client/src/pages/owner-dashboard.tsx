import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";
import { db } from "@/lib/firebase";
import { 
  doc, getDoc, collection, query, where, getDocs, 
  onSnapshot, updateDoc, serverTimestamp, setDoc, addDoc,
  Timestamp, orderBy, limit
} from "firebase/firestore";
import { subscribeToOwnerChats, closeChat } from "@/services/chatService";
import ChatWindow from "@/components/ChatWindow";
import { type Station } from "@/lib/owner-service";
import { type PeakHour } from '@/lib/autopilot-engine';
import AutopilotCard from '@/components/owner/AutopilotCard';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { isSameMonth, subMonths, subDays, startOfDay, endOfDay, isWithinInterval, addDays, eachDayOfInterval, subHours, startOfHour, endOfHour } from "date-fns";
import { toJSDate, toTimestamp, safeFormat, safeFormatDistanceToNow } from "@/lib/date-utils";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip as RechartsTooltip, CartesianGrid, PieChart, Pie, Cell, BarChart, Bar, ResponsiveContainer as RespCont, Legend, LineChart, Line } from "recharts";
import { 
  DollarSign, Zap, Users, TrendingUp, ArrowUp, ArrowDown,
  Bell, AlertTriangle, Info, CheckCircle, Radio, Clock, 
  MapPin, Repeat, Power, ShieldAlert, ZapOff,
  QrCode, Download
} from "lucide-react";
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { BOOKING_STATUS } from "@/constants/bookingStatus";
// SHORTFALL ALERT — imports
import {
  computeForecastMetrics,
  isShortfallAlertDismissed,
  dismissShortfallAlert,
  formatRsCompact,
  formatRsFull,
  type ForecastMetrics
} from '@/lib/revenue-forecast-engine';
import ShortfallAlertCard from '@/components/owner/ShortfallAlertCard';
import RevenueForecastSparkline from '@/components/owner/RevenueForecastSparkline';
import ExtendHoursModal from '@/components/owner/ExtendHoursModal';
import { AnimatePresence } from 'framer-motion';
import SurgeScheduleEditor from "@/components/owner/SurgeScheduleEditor";
import SurgeRuleCard from "@/components/owner/SurgeRuleCard";
import SurgeOverridePanel from "@/components/owner/SurgeOverridePanel";
import { 
  SurgeRule, SurgeOverride, computeDesiredPeakPricing, 
  isOverrideActive, isRuleActiveNow, detectOverlappingRules 
} from "@/lib/surge-scheduler";
import { StationBenchmarkTable } from "@/components/owner/StationBenchmarkTable";
import { useOwnerStations } from "@/hooks/useOwnerStations";
import SchedulerMount from "@/components/owner/SchedulerMount";
import { parseMaintenanceWindow, type StationWithWindows } from "@/lib/maintenance-scheduler";


const COLORS = ["#4f46e5", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];
const fmt = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

// AnimatedNumber is now imported from @/components/ui/animated-number

export default function OwnerDashboard() {
  const [, setLocation] = useLocation();
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [stations, setStations] = useState<Station[]>([]);
  const [liveStations, setLiveStations] = useState<Record<string, Station>>({});
  const [kpis, setKpis] = useState({ 
    revenue: 0, sessions: 0, customers: 0, activeStations: 0, 
    thisMonthDrivers: 0, lastMonthDrivers: 0, returningDrivers: 0,
    revenueChange: 0, sessionsChange: 0, todayDrivers: 0,
    satisfactionScore: 0, satisfactionCount: 0, ratingChange: 0,
    thisMonthRevenue: 0
  });
  const [monthlyTarget, setMonthlyTarget] = useState<number>(0);
  const [allBookingsState, setAllBookingsState] = useState<any[]>([]);
  const [allReviewsState, setAllReviewsState] = useState<any[]>([]);
  const [isEditingTarget, setIsEditingTarget] = useState(false);
  const [newTargetInput, setNewTargetInput] = useState("");
  const [trend, setTrend] = useState<{ date: string; revenue: number }[]>([]);
  const [donut, setDonut] = useState<{ name: string; value: number }[]>([]);
  const [recentBookings, setRecentBookings] = useState<any[]>([]);
  const [peakHours, setPeakHours] = useState<any[]>([]);
  const [analyticsData, setAnalyticsData] = useState<any>(null);
  const [sentimentData, setSentimentData] = useState<{ name: string; value: number; color: string }[]>([]);
  const [aiInsights, setAiInsights] = useState<{ type: 'positive' | 'warning' | 'tip'; text: string }[]>([]);
  
  // Chat State
  const [ownerChats, setOwnerChats] = useState<any[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [activeChatData, setActiveChatData] = useState<any>(null);

  // Autopilot Analytics State
  const [autopilotPerformance, setAutopilotPerformance] = useState<{
    autopilotRevenue: number;
    manualRevenue: number;
    autopilotAvg: number;
    manualAvg: number;
    aiLift: number;
    currentConfidence: number;
    autopilotCount: number;
    manualCount: number;
  } | null>(null);
  const [autopilotHistory, setAutopilotHistory] = useState<{ date: string; confidence: number; aiLift: number }[]>([]);
  const [decayStats, setDecayStats] = useState({
    revenueRecovered: 0,
    slotsRecovered: 0,
    avgDiscount: 0
  });
  
  // Custom Hook for real-time station data
  const { stations: stationsData, loading: stationsLoading } = useOwnerStations(user?.uid);

  // Alert & Surge State
  const [alerts, setAlerts] = useState<any[]>([]);
  const [surgeConfig, setSurgeConfig] = useState<any>(null);

  // SHORTFALL ALERT — state
  const [isShortfallDismissed, setIsShortfallDismissed] = useState(() => isShortfallAlertDismissed());
  const [isHoursModalOpen, setIsHoursModalOpen] = useState(false);

  // New Surge Scheduler State
  const [surgeRules, setSurgeRules] = useState<SurgeRule[]>([]);
  const [surgeOverride, setSurgeOverride] = useState<SurgeOverride | null>(null);
  const [isRuleEditorOpen, setIsRuleEditorOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<SurgeRule | null>(null);
  const [isSurgeActionLoading, setIsSurgeActionLoading] = useState(false);
  
  // Competitor Awareness State
  const [showCompetitors, setShowCompetitors] = useState(false);
  const [competitors, setCompetitors] = useState<any[]>([]);

  // Refs for scheduler to avoid stale closures
  const rulesRef = useRef<SurgeRule[]>([]);
  const overrideRef = useRef<SurgeOverride | null>(null);
  const currentPeakPricingRef = useRef<any>(null);

  useEffect(() => { rulesRef.current = surgeRules; }, [surgeRules]);
  useEffect(() => { overrideRef.current = surgeOverride; }, [surgeOverride]);
  useEffect(() => { currentPeakPricingRef.current = surgeConfig; }, [surgeConfig]);


  const processAnalytics = useCallback(async (stationsList: Station[]) => {
    if (!user || stationsList.length === 0) { setLoading(false); return; }
    const ids = stationsList.map(s => s.id);
    const allReviews: any[] = [];

    // Fetch all bookings for this owner directly (by ownerId and by stationId to catch seeded/older bookings)
    const bookingsMap = new Map<string, any>();
    const bookSnapOwner = await getDocs(query(collection(db, "bookings"), where("ownerId", "==", user.uid)));
    bookSnapOwner.forEach((d) => bookingsMap.set(d.id, { id: d.id, ...d.data() }));

    for (let i = 0; i < ids.length; i += 10) {
      const chunk = ids.slice(i, i + 10);
      const bookSnapStation = await getDocs(query(collection(db, "bookings"), where("stationId", "in", chunk)));
      bookSnapStation.forEach((d) => bookingsMap.set(d.id, { id: d.id, ...d.data() }));
    }
    const allBookings = Array.from(bookingsMap.values());

    // Fetch reviews by station chunks
    for (let i = 0; i < ids.length; i += 10) {
      const chunk = ids.slice(i, i + 10);
      const revSnap = await getDocs(query(collection(db, "station_reviews"), where("stationId", "in", chunk)));
      revSnap.forEach((d) => allReviews.push({ id: d.id, ...d.data() }));
    }
    
    setAllBookingsState(allBookings);
    setAllReviewsState(allReviews);

    // KPIs
    let revenue = 0, sessions = 0;
    const uniqueUsers = new Set<string>();
    const now = new Date();
    const thisMonthDriversSet = new Set<string>();
    const lastMonthDriversSet = new Set<string>();
    const userTripCounts: Record<string, number> = {};

    allBookings.forEach((b) => {
      const isSuccessful = (b.status === BOOKING_STATUS.CONFIRMED || 
                            b.status === BOOKING_STATUS.ACTIVE || 
                            b.status === BOOKING_STATUS.COMPLETED) && 
                           b.paymentStatus === "paid";

      if (isSuccessful) {
        revenue += b.totalPrice || 0;
        sessions += 1;
        const bDate = toJSDate(b.startTime);
        if (b.userId) {
          uniqueUsers.add(b.userId);
          userTripCounts[b.userId] = (userTripCounts[b.userId] || 0) + 1;
          if (isSameMonth(bDate, now)) thisMonthDriversSet.add(b.userId);
          if (isSameMonth(bDate, subMonths(now, 1))) lastMonthDriversSet.add(b.userId);
        }
      }
    });
    const returningCount = Object.values(userTripCounts).filter(c => c > 1).length;

    // Today vs Yesterday logic
    const t = new Date();
    const y = new Date(Date.now() - 86400000);

    // REVENUE MILESTONE TRIGGER
    const milestones = [10000, 50000, 100000, 500000, 1000000];
    for (const milestone of milestones) {
      if (revenue >= milestone) {
        const milestoneId = `REVENUE_${user.uid}_${milestone}`;
        const milestoneRef = doc(db, "notifications", milestoneId);
        const milestoneSnap = await getDoc(milestoneRef);
        if (!milestoneSnap.exists()) {
          await setDoc(milestoneRef, {
            ownerId: user.uid,
            type: "REVENUE_MILESTONE",
            title: "New Revenue Milestone! 💰",
            message: `Congratulations! Your total revenue has exceeded ₹${milestone.toLocaleString()}. Your network is growing!`,
            amount: milestone,
            read: false,
            createdAt: Date.now()
          });
        }
      }
    }

    // COMPETITOR AWARENESS FETCH
    const fetchCompetitors = async () => {
      const allStationsSnap = await getDocs(query(
        collection(db, "stations"),
        where("status", "==", "active")
      ));
      
      const allActiveStations = allStationsSnap.docs
        .map(d => ({ id: d.id, ...d.data() } as any))
        .filter(s => s.ownerId !== user.uid);
      
      const nearby: any[] = [];
      const calculateDist = (lat1: number, lon1: number, lat2: number, lon2: number) => {
        const R = 6371;
        const dLat = ((lat2 - lat1) * Math.PI) / 180;
        const dLon = ((lon2 - lon1) * Math.PI) / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
      };

      stationsList.forEach(myStation => {
        const myLat = Number(myStation.lat || (myStation as any).location?.lat);
        const myLon = Number(myStation.lon || (myStation as any).location?.lon);
        if (isNaN(myLat) || isNaN(myLon)) return;
        
        allActiveStations.forEach(other => {
          const otherLat = Number(other.lat || other.location?.lat);
          const otherLon = Number(other.lon || other.location?.lon);
          if (isNaN(otherLat) || isNaN(otherLon)) return;
          
          const dist = calculateDist(myLat, myLon, otherLat, otherLon);
          if (dist <= 5) {
            if (!nearby.find(n => n.id === other.id)) {
              nearby.push({
                ...other,
                distanceKm: dist.toFixed(1),
                nearMyStation: myStation.name
              });
            }
          }
        });
      });
      setCompetitors(nearby.slice(0, 5));
    };
    fetchCompetitors().catch(console.error);
    
    const todayB = allBookings.filter(b => {
      const d = toJSDate(b.startTime);
      const isSuccessful = b.status === BOOKING_STATUS.CONFIRMED || 
                           b.status === BOOKING_STATUS.COMPLETED ||
                           ["paid", "completed", "success"].includes(b.paymentStatus);
      return d.toDateString() === t.toDateString() && isSuccessful;
    });
    const yesterdayB = allBookings.filter(b => {
      const d = toJSDate(b.startTime);
      const isSuccessful = b.status === BOOKING_STATUS.CONFIRMED || 
                           b.status === BOOKING_STATUS.COMPLETED ||
                           ["paid", "completed", "success"].includes(b.paymentStatus);
      return d.toDateString() === y.toDateString() && isSuccessful;
    });
    
    const tRev = todayB.reduce((s, b) => s + (b.totalPrice || 0), 0);
    const yRev = yesterdayB.reduce((s, b) => s + (b.totalPrice || 0), 0);
    const revC = yRev > 0 ? Number(((tRev - yRev) / yRev * 100).toFixed(1)) : 0;
    const sesC = yesterdayB.length > 0 ? Number(((todayB.length - yesterdayB.length) / yesterdayB.length * 100).toFixed(1)) : 0;
    const newD = new Set(todayB.map(b => b.userId)).size;

    // Satisfaction Logic
    const avgRating = allReviews.length > 0 ? (allReviews.reduce((s,r) => s + (r.rating || 0), 0) / allReviews.length) : 0;
    const tRevM = allReviews.filter(r => r.createdAt && isSameMonth(toJSDate(r.createdAt), t));
    const lRevM = allReviews.filter(r => r.createdAt && isSameMonth(toJSDate(r.createdAt), subMonths(t, 1)));
    const tAvg = tRevM.length > 0 ? tRevM.reduce((s,r) => s + (r.rating || 0), 0) / tRevM.length : 0;
    const lAvg = lRevM.length > 0 ? lRevM.reduce((s,r) => s + (r.rating || 0), 0) / lRevM.length : 0;
    const rChange = Number((tAvg - lAvg).toFixed(1));

    let thisMRev = 0;
    allBookings.forEach(b => {
       const isSuccessful = b.status === BOOKING_STATUS.CONFIRMED || 
                            b.status === BOOKING_STATUS.COMPLETED ||
                            ["paid", "completed", "success"].includes(b.paymentStatus);
       if (isSuccessful && b.startTime) {
         const bDate = toJSDate(b.startTime);
         if (isSameMonth(bDate, t)) thisMRev += (b.totalPrice || 0);
       }
    });

    setKpis({ 
      revenue, sessions, 
      customers: uniqueUsers.size, 
      activeStations: stationsList.filter((s) => s.status === "active").length,
      thisMonthDrivers: thisMonthDriversSet.size,
      lastMonthDrivers: lastMonthDriversSet.size,
      returningDrivers: returningCount,
      revenueChange: revC, sessionsChange: sesC, todayDrivers: newD,
      satisfactionScore: avgRating, satisfactionCount: allReviews.length, ratingChange: rChange,
      thisMonthRevenue: thisMRev
    });

    // 30-day Revenue Trend
    const last30 = subDays(now, 30).getTime();
    const trendMap = new Map<string, number>();
    allBookings
      .filter((b) => {
        const ts = toJSDate(b.createdAt || b.startTime).getTime();
        const isSuccessful = b.status === BOOKING_STATUS.CONFIRMED || 
                             b.status === BOOKING_STATUS.COMPLETED ||
                             ["paid", "completed", "success"].includes(b.paymentStatus);
        return ts >= last30 && isSuccessful;
      })
      .forEach((b) => {
        const dDate = toJSDate(b.createdAt || b.startTime);
        const d = safeFormat(dDate, "dd MMM");
        trendMap.set(d, (trendMap.get(d) || 0) + (b.totalPrice || 0));
      });
    setTrend(Array.from(trendMap, ([date, revenue]) => ({ date, revenue })));

    // Income by station
    const pieMap = new Map<string, number>();
    allBookings
      .filter((b) => b.status === BOOKING_STATUS.CONFIRMED || b.status === BOOKING_STATUS.COMPLETED)
      .forEach((b) => {
        const station = stationsList.find((s) => s.id === b.stationId);
        pieMap.set(station?.name || "Other", (pieMap.get(station?.name || "Other") || 0) + (b.totalPrice || 0));
      });
    setDonut(Array.from(pieMap, ([name, value]) => ({ name, value })));

    // Peak Hours logic & Autopilot Data
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const hourGroups: Record<string, { revenue: number; sessions: number }> = {};
    let totalConfirmedRevenue = 0;
    let totalConfirmedSessions = 0;

    allBookings.forEach(b => {
      if ((b.status === BOOKING_STATUS.CONFIRMED || b.status === BOOKING_STATUS.COMPLETED) && b.startTime) {
        const d = new Date(b.startTime);
        const dayIdx = d.getDay();
        const hour = d.getHours();
        const hourPadded = hour.toString().padStart(2, '0');
        const key = `${days[dayIdx]}-${hourPadded}:00`;
        
        if (!hourGroups[key]) hourGroups[key] = { revenue: 0, sessions: 0 };
        hourGroups[key].revenue += (b.totalPrice || 0);
        hourGroups[key].sessions += 1;

        totalConfirmedRevenue += (b.totalPrice || 0);
        totalConfirmedSessions += 1;
      }
    });

    const overallAvg = totalConfirmedSessions > 0 ? totalConfirmedRevenue / totalConfirmedSessions : 0;

    const peakSorted = Object.entries(hourGroups)
      .map(([bucket, data]) => {
        const [dName, hTime] = bucket.split("-");
        return { 
          bucket,
          day: dName,
          time: `${hTime} - ${parseInt(hTime)+1}:00`,
          revenue: data.revenue,
          sessionCount: data.sessions,
          totalRevenue: data.revenue,
          avgRevenue: data.revenue / data.sessions
        };
      })
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);

    const maxRevenue = peakSorted[0]?.revenue || 1;
    const finalPeakHours = peakSorted.map(p => ({ ...p, percentage: (p.revenue / maxRevenue) * 100 }));
    
    setPeakHours(finalPeakHours);
    setAnalyticsData({
      peakHours: finalPeakHours,
      overallAvgPerSession: overallAvg
    });

    // Autopilot Performance Logic
    const compB = allBookings.filter(b => 
      (b.status === BOOKING_STATUS.COMPLETED || b.status === BOOKING_STATUS.CONFIRMED) && 
      (b.paymentStatus === "paid" || b.paymentStatus === "completed")
    );

    const autoB = compB.filter(b => b.pricingMode === "autopilot" || b.surgeApplied === true);
    const manB = compB.filter(b => b.pricingMode === "manual" || !b.surgeApplied);

    const autoRev = autoB.reduce((s, b) => s + (b.totalPrice || 0), 0);
    const manRev = manB.reduce((s, b) => s + (b.totalPrice || 0), 0);

    const autoAvg = autoB.length > 0 ? autoRev / autoB.length : 0;
    const manAvg = manB.length > 0 ? manRev / manB.length : 0;

    const aiLiftValue = manAvg > 0 ? ((autoAvg - manAvg) / manAvg) * 100 : 0;
    const currConf = Math.min(Math.round((autoB.length / 20) * 100), 100);

    setAutopilotPerformance({
      autopilotRevenue: autoRev,
      manualRevenue: manRev,
      autopilotAvg: autoAvg,
      manualAvg: manAvg,
      aiLift: aiLiftValue,
      currentConfidence: currConf,
      autopilotCount: autoB.length,
      manualCount: manB.length
    });

    const decayB = compB.filter(b => b.decayApplied === true);
    const decayRev = decayB.reduce((s, b) => s + (b.totalPrice || 0), 0);
    const decayDiscSum = decayB.reduce((s, b) => {
      const orig = b.originalPricePerKwh || 15;
      const actual = b.pricePerKwh || (b.totalPrice / (b.powerKw * (b.duration/60))) || orig;
      return s + (1 - actual/orig);
    }, 0);

    setDecayStats({
      revenueRecovered: decayRev,
      slotsRecovered: decayB.length,
      avgDiscount: decayB.length > 0 ? (decayDiscSum / decayB.length) * 100 : 0
    });

    setRecentBookings([...allBookings].sort((a,b) => toTimestamp(b.startTime) - toTimestamp(a.startTime)).slice(0, 5));

    // Sentiment Calculation
    const pos = allReviews.filter(r => r.rating >= 4).length;
    const neu = allReviews.filter(r => r.rating === 3).length;
    const neg = allReviews.filter(r => r.rating <= 2).length;
    const total = allReviews.length || 1;
    setSentimentData([
      { name: 'Positive', value: Math.round((pos/total)*100), color: '#10b981' },
      { name: 'Neutral', value: Math.round((neu/total)*100), color: '#f59e0b' },
      { name: 'Negative', value: Math.round((neg/total)*100), color: '#ef4444' },
    ]);

    // AI Insights Logic
    const insights: { type: 'positive' | 'warning' | 'tip'; text: string }[] = [];
    if (avgRating > 4.5) insights.push({ type: 'positive', text: "High driver satisfaction! Your service quality is in the top 5% of the network." });
    if (neg > 2) insights.push({ type: 'warning', text: "Multiple negative reviews detected. Check connector health at your busiest stations." });
    if (returningCount / (uniqueUsers.size || 1) < 0.2) insights.push({ type: 'tip', text: "Customer loyalty is below average. Consider launching a 'Returning Driver' discount." });
    const currentDays = new Date().getDate();
    const localDailyAvg = thisMRev / currentDays;
    if (peakSorted.length > 0 && peakSorted[0].revenue > localDailyAvg * 2) insights.push({ type: 'tip', text: `Huge demand spike on ${peakSorted[0].day}s. Try surge pricing (1.5x) during ${peakSorted[0].time} to maximize revenue.` });
    if (insights.length === 0) insights.push({ type: 'positive', text: "Steady performance. Keep monitoring live occupancy for any hardware faults." });
    setAiInsights(insights);

    setLoading(false);
  }, [user, toast]);

  // Track station data updates independently
  useEffect(() => {
    if (!user) return;
    if (stationsData && stationsData.length > 0) {
      const typedStations = stationsData as unknown as Station[];
      setStations(typedStations);
      setLiveStations(Object.fromEntries(typedStations.map((s: Station) => [s.id, s])));
      processAnalytics(typedStations);
    } else if (stationsData && stationsData.length === 0 && !stationsLoading) {
      setLoading(false);
    }
  }, [user, stationsData, stationsLoading, processAnalytics]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { setLocation("/owner/login"); return; }

    let unsubOwner: (() => void) | undefined = undefined;
    let unsubAlerts: (() => void) | undefined = undefined;

    const loadOwnerContext = async () => {
      try {
        const ownerRef = doc(db, "owners", user.uid);
        
        // 1. Real-time Owner Data (Rules, Overrides, PeakPricing)
        unsubOwner = onSnapshot(ownerRef, (snap) => {
          if (!snap.exists()) {
            toast({ variant: "destructive", title: "Not a Station Owner" });
            setTimeout(() => setLocation("/owner/login"), 500);
            return;
          }
          const data = snap.data();
          setSurgeConfig(data.peakPricing || { enabled: false, multiplier: 1.5 });
          setMonthlyTarget(data.monthlyTarget || 0);
          setSurgeRules(data.surgeSchedule || []);
          setSurgeOverride(data.surgeOverride || null);
          setLoading(false);
        });

        // 2. Subscribe to Undismissed Alerts
        const alertsQuery = query(
          collection(db, "owners", user.uid, "alerts"), 
          where("dismissed", "==", false),
          orderBy("createdAt", "desc"),
          limit(10)
        );
        unsubAlerts = onSnapshot(alertsQuery, (snap) => {
          const list: any[] = [];
          const data = snap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];
          data.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
          setAlerts(data);
        });

      } catch (err) {
        console.error(err);
        toast({ variant: "destructive", title: "Error loading dashboard" });
      }
    };

    loadOwnerContext();
    return () => { 
      unsubOwner?.(); 
      unsubAlerts?.(); 
    };
  }, [user, authLoading, setLocation, toast]);

  // Section D: Client-side Surge Scheduler (Ticks every 60s)
  useEffect(() => {
    if (!user) return;
    
    const tick = async () => {
      const { result, desired } = computeDesiredPeakPricing(
        rulesRef.current,
        overrideRef.current,
        currentPeakPricingRef.current
      );
      const { action } = result;

      if (action !== 'no_change') {
        console.info(`[SeniorDevOps Surge] Updating state: ${action}`, desired);
        try {
          await updateDoc(doc(db, "owners", user.uid), {
            peakPricing: desired
          });
        } catch (err) {
          console.error("[SeniorDevOps Surge] Tick failed:", err);
        }
      }
    };

    tick(); // Run immediately
    const interval = setInterval(tick, 60_000);
    return () => clearInterval(interval);
  }, [user]);

  // Section G: Autopilot History & Confidence Snapshots
  useEffect(() => {
    if (!user) return;
    
    // 1. Fetch 7-day History
    const historyQuery = query(
      collection(db, "owners", user.uid, "autopilotHistory"),
      orderBy("date", "desc"),
      limit(7)
    );
    
    const unsubHistory = onSnapshot(historyQuery, (snap) => {
      const history = snap.docs.map(d => ({
        date: safeFormat(toJSDate(d.data().date), "dd MMM"),
        confidence: d.data().confidence || 0,
        aiLift: d.data().aiLift || 0
      })).reverse();
      setAutopilotHistory(history);
    });

    return () => unsubHistory();
  }, [user]);

  useEffect(() => {
    if (!user || !autopilotPerformance) return;

    const saveSnapshot = async () => {
      try {
        const todayId = safeFormat(new Date(), "yyyy-MM-dd");
        const snapRef = doc(db, "owners", user.uid, "autopilotHistory", todayId);
        
        await setDoc(snapRef, {
          date: serverTimestamp(),
          confidence: autopilotPerformance.currentConfidence,
          aiLift: autopilotPerformance.aiLift
        }, { merge: true });
      } catch (err) {
        console.error("[Autopilot] Failed to save snapshot:", err);
      }
    };

    // Throttle: Save once per hour or if confidence changes
    const lastSaveKey = `autopilot_last_save_${user.uid}`;
    const lastSave = localStorage.getItem(lastSaveKey);
    const oneHour = 60 * 60 * 1000;

    if (!lastSave || (Date.now() - parseInt(lastSave)) > oneHour) {
      saveSnapshot();
      localStorage.setItem(lastSaveKey, Date.now().toString());
    }
  }, [user, autopilotPerformance?.currentConfidence]);

  // Handle Driver Chats
  useEffect(() => {
    if (!user) return;
    const unsub = subscribeToOwnerChats(user.uid, setOwnerChats);
    return () => unsub();
  }, [user]);

  const totalUnread = ownerChats.reduce((sum, chat) => sum + (chat.ownerUnread || 0), 0);

  const handleOpenChat = (chat: any) => {
    setActiveChatId(chat.id);
    setActiveChatData(chat);
  };

  const handleCloseChatInstance = async (chatId: string) => {
    if (window.confirm("Close this conversation? It will be moved to history.")) {
      await closeChat(chatId);
      if (activeChatId === chatId) setActiveChatId(null);
      toast({ title: "Chat Closed" });
    }
  };


  // Health Check System
  useEffect(() => {
    if (!user || stations.length === 0) return;

    const runHealthChecks = async () => {
      const stationIds = stations.map(s => s.id);
      const now = Date.now();
      const last24h = subDays(new Date(), 1).getTime();
      const last1h = subHours(new Date(), 1).getTime();

      // check 1: Fault Reports
      const faultCounts: Record<string, { count: number; name: string; stationId: string }> = {};
      
      for (let i = 0; i < stationIds.length; i += 10) {
        const chunk = stationIds.slice(i, i + 10);
        const reviewsSnap = await getDocs(query(
          collection(db, "station_reviews"), 
          where("stationId", "in", chunk)
        ));
        
        reviewsSnap.forEach(d => {
          const r = d.data();
          // Client-side filtering for rating and age
          if (r.rating <= 2 && r.createdAt > last24h) {
            const key = r.stationId;
            faultCounts[key] = { count: (faultCounts[key]?.count || 0) + 1, name: "Connector", stationId: r.stationId };
          }
        });
      }

      Object.entries(faultCounts).forEach(async ([sid, data]) => {
        if (data.count >= 3) {
          const station = stations.find(s => s.id === data.stationId);
          await createAlert("CONNECTOR_FAULT", `Multiple drivers reported issues at ${station?.name}. Please inspect urgently.`, data.stationId);
        }
      });

      // check 3: High Cancellations
      const bookingsMap = new Map<string, any>();
      const bookSnapOwner = await getDocs(query(
        collection(db, "bookings"), 
        where("ownerId", "==", user.uid)
      ));
      bookSnapOwner.forEach(d => bookingsMap.set(d.id, d.data()));

      for (let i = 0; i < stationIds.length; i += 10) {
        const chunk = stationIds.slice(i, i + 10);
        const bookSnapStation = await getDocs(query(
          collection(db, "bookings"),
          where("stationId", "in", chunk)
        ));
        bookSnapStation.forEach(d => bookingsMap.set(d.id, d.data()));
      }
      
      const cancelCounts: Record<string, number> = {};
      bookingsMap.forEach(b => {
        if (b.status === BOOKING_STATUS.CANCELLED && b.startTime > last1h) {
          cancelCounts[b.stationId] = (cancelCounts[b.stationId] || 0) + 1;
        }
      });

      Object.entries(cancelCounts).forEach(async ([sid, count]) => {
        if (count >= 3) {
          const station = stations.find(s => s.id === sid);
          await createAlert("HIGH_CANCELLATIONS", `${count} bookings cancelled in the last hour at ${station?.name}.`, sid);
        }
      });
    };

    const createAlert = async (type: string, message: string, stationId: string) => {
      const q = query(collection(db, "owners", user.uid, "alerts"), where("type", "==", type), where("stationId", "==", stationId), where("dismissed", "==", false));
      const existing = await getDocs(q);
      if (existing.empty) {
        await addDoc(collection(db, "owners", user.uid, "alerts"), {
          type, message, stationId, dismissed: false, createdAt: serverTimestamp()
        });
      }
    };

    runHealthChecks();
    const interval = setInterval(runHealthChecks, 5 * 60 * 1000); // 5 min
    return () => clearInterval(interval);
  }, [user, stations]);

  const handleDismissAlert = async (alertId: string) => {
    if (!user) return;
    await updateDoc(doc(db, "owners", user.uid, "alerts", alertId), { dismissed: true });
  };

  // Section E: Rule Management
  const handleSaveRule = async (rule: SurgeRule) => {
    if (!user) return;
    setIsSurgeActionLoading(true);
    try {
      const updatedRules = [...surgeRules];
      const index = updatedRules.findIndex(r => r.id === rule.id);
      if (index > -1) updatedRules[index] = rule;
      else updatedRules.push(rule);
      
      await updateDoc(doc(db, "owners", user.uid), { surgeSchedule: updatedRules });
      toast({ title: "Schedule Updated", description: `Rule "${rule.label}" saved successfully.` });
      setIsRuleEditorOpen(false);
      setEditingRule(null);
    } catch (err) {
      toast({ variant: "destructive", title: "Save Failed", description: "Could not update surge rules." });
    } finally {
      setIsSurgeActionLoading(false);
    }
  };

  const handleToggleRule = async (ruleId: string, isActive: boolean) => {
    if (!user) return;
    try {
      const updatedRules = surgeRules.map(r => r.id === ruleId ? { ...r, isActive } : r);
      await updateDoc(doc(db, "owners", user.uid), { surgeSchedule: updatedRules });
    } catch (err) {
      toast({ variant: "destructive", title: "Update Failed" });
    }
  };

  const handleDeleteRule = async (ruleId: string) => {
    if (!user || !window.confirm("Delete this surge rule?")) return;
    try {
      const updatedRules = surgeRules.filter(r => r.id !== ruleId);
      await updateDoc(doc(db, "owners", user.uid), { surgeSchedule: updatedRules });
      toast({ title: "Rule Deleted" });
    } catch (err) {
      toast({ variant: "destructive", title: "Delete Failed" });
    }
  };

  // Section F: Override Management
  const handleActivateOverride = async (multiplier: number) => {
    if (!user) return;
    setIsSurgeActionLoading(true);
    try {
      const override: SurgeOverride = {
        enabled: multiplier > 1.0,
        multiplier,
        overrideUntil: Date.now() + (30 * 60_000) // 30 minutes
      };
      await updateDoc(doc(db, "owners", user.uid), { surgeOverride: override });
      toast({ 
        title: multiplier > 1.0 ? "Manual Surge Active ⚡" : "Surge Forced Off", 
        description: `This override will expire in 30 minutes.` 
      });
    } catch (err) {
      toast({ variant: "destructive", title: "Action Failed" });
    } finally {
      setIsSurgeActionLoading(false);
    }
  };

  const handleClearOverride = async () => {
    if (!user) return;
    try {
      await updateDoc(doc(db, "owners", user.uid), { surgeOverride: null });
      toast({ title: "Override Cleared", description: "System returned to scheduled pricing." });
    } catch (err) {
      toast({ variant: "destructive", title: "Action Failed" });
    }
  };

  // SHORTFALL ALERT — dismiss handler
  const handleDismissShortfall = useCallback(() => {
    dismissShortfallAlert();
    setIsShortfallDismissed(true);
    toast({ title: "Alert Dismissed", description: "This forecast alert won't appear again for 24 hours." });
  }, [toast]);

  // SHORTFALL ALERT — enable surge from alert action button
  const handleEnableSurgeFromAlert = useCallback(() => {
    // Open the surge scheduler section or activate override
    const element = document.getElementById('surge-scheduler-section');
    if (element) element.scrollIntoView({ behavior: 'smooth' });
    
    // For immediate impact, we could trigger a 1.5x override:
    // handleActivateOverride(1.5);
  }, []);

  // Re-check dismissed state when component mounts
  useEffect(() => {
    setIsShortfallDismissed(isShortfallAlertDismissed());
  }, []);

  // SHORTFALL ALERT — compute metrics
  const forecastMetrics = useMemo(() => {
    if (!allBookingsState || allBookingsState.length === 0 || !monthlyTarget) return null;
    
    // Map Firestore bookings to the shape expected by the engine
    const mappedBookings = allBookingsState.map(b => ({
      startTime: toJSDate(b.startTime),
      currentCost: b.totalPrice || 0,
      status: b.status || ''
    }));

    return computeForecastMetrics(mappedBookings, monthlyTarget);
  }, [allBookingsState, monthlyTarget]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-background text-primary">
         <div className="text-center space-y-4 animate-pulse">
            <Radio className="w-12 h-12 mx-auto animate-ping opacity-50" />
            <p className="font-bold tracking-widest uppercase text-xs">Initializing Command Center...</p>
         </div>
      </div>
    );
  }

  // Map stations to include maintenance windows for the scheduler
  const stationsWithWindows: StationWithWindows[] = stations.map(s => ({
    stationId: s.id,
    stationName: s.name,
    currentStatus: s.status as any,
    totalConnectors: s.connectors?.length || 0,
    connectors: (s.connectors || []).map(c => ({ id: c.id, type: c.type, status: c.available ? 'active' : 'offline' })),
    maintenanceWindows: (s.maintenanceWindows || []).map(parseMaintenanceWindow)
  }));

  const handleSaveTarget = async () => {
    if (!user) return;
    const num = parseInt(newTargetInput.replace(/\D/g, ''), 10);
    if (!isNaN(num)) {
      await updateDoc(doc(db, "owners", user.uid), { monthlyTarget: num });
      setMonthlyTarget(num);
      setIsEditingTarget(false);
      toast({ title: "Goal Updated", description: `Monthly target set to ₹${num}` });
    }
  };

  const exportRevenueCSV = () => {
    if (allBookingsState.length === 0) return toast({ title: "No data", description: "No completed bookings to export.", variant: "destructive" });
    const headers = ["Station ID", "Status", "Price", "Date"];
    const rows = allBookingsState
      .filter(b => b.status === BOOKING_STATUS.COMPLETED || b.status === BOOKING_STATUS.CONFIRMED)
      .map(b => `${b.stationId},${b.status},${b.totalPrice},${b.startTime ? new Date(b.startTime).toISOString() : ""}`);
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `revenue_export_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast({ title: "Export Started", description: "Your CSV file is downloading." });
  };

  const TrendBadge = ({ change, type }: { change: number, type?: string }) => {
    if (type === 'new_today') {
      return <span className="text-emerald-500 font-bold whitespace-nowrap">{change} new today</span>;
    }
    if (type === 'rating') {
      return <span className={change >= 0 ? "text-emerald-500 font-bold whitespace-nowrap" : "text-destructive font-bold whitespace-nowrap"}>{change >= 0 ? "↑" : "↓"} {Math.abs(change).toFixed(1)} vs last month</span>;
    }
    return (
      <span className={change >= 0 ? "text-emerald-500 font-bold whitespace-nowrap" : "text-destructive font-bold whitespace-nowrap"}>
        {change >= 0 ? "↑ +" : "↓ "}{change}% vs yesterday
      </span>
    );
  };

  const kpiCards = [
    { label: "Total Revenue", value: kpis.revenue, prefix: "₹", icon: DollarSign, color: "text-primary", bg: "bg-primary/10", note: "All time earnings", change: kpis.revenueChange },
    { label: "Charging Sessions", value: kpis.sessions, icon: Zap, color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-900/20", note: "Completed charges", change: kpis.sessionsChange },
    { label: "Unique Drivers", value: kpis.customers, icon: Users, color: "text-sky-600", bg: "bg-sky-50 dark:bg-sky-900/20", note: `${kpis.returningDrivers} returning drivers`, change: kpis.todayDrivers, changeType: "new_today" },
    { label: "Active Stations", value: kpis.activeStations, suffix: ` / ${stations.length}`, icon: TrendingUp, color: "text-violet-600", bg: "bg-violet-50 dark:bg-violet-900/20", note: "Hardware online" },
    { label: "Driver Satisfaction", value: kpis.satisfactionScore.toFixed(1), suffix: " / 5.0", icon: CheckCircle, color: kpis.satisfactionScore >= 4.5 ? "text-emerald-500" : (kpis.satisfactionScore >= 4.0 ? "text-sky-500" : (kpis.satisfactionScore >= 3.5 ? "text-amber-500" : "text-destructive")), bg: "bg-white/5", note: `Based on ${kpis.satisfactionCount} reviews`, change: kpis.ratingChange, changeType: "rating" },
  ];

  // Quick Actions vars
  const unansweredReviews = allReviewsState.filter(r => !r.ownerResponse || r.ownerResponse?.text === "");
  const quickActions = [
    { icon: "🏢", label: "Add Station", action: () => setLocation("/owner/stations"), color: "blue" },
    { icon: "📝", label: "Review Dashboard", action: () => setLocation("/owner/reviews"), badge: unansweredReviews.length, color: "green" },
    { icon: "💰", label: "View Ledger", action: () => setLocation("/owner/ledger"), color: "purple" },
    { icon: "🔧", label: "Maintenance", action: () => setLocation("/owner/stations"), color: "orange" },
    { icon: "⚡", label: "Surge Schedule", action: () => {
      const element = document.getElementById('surge-scheduler-section');
      if (element) element.scrollIntoView({ behavior: 'smooth' });
    }, active: surgeConfig?.enabled, color: "yellow" },
    { icon: "📊", label: "Export CSV", action: () => exportRevenueCSV(), color: "gray" }
  ];

  // Goal logic
  const daysLeft = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate() - new Date().getDate();
  const remaining = Math.max(0, monthlyTarget - kpis.thisMonthRevenue);
  const dailyNeeded = daysLeft > 0 ? remaining / daysLeft : 0;
  const currentDays = new Date().getDate();
  const dailyAvg = kpis.thisMonthRevenue / currentDays;
  const targetPercent = monthlyTarget > 0 ? Math.min(100, Math.round((kpis.thisMonthRevenue / monthlyTarget) * 100)) : 0;
  let pbColor = "bg-primary";
  if (targetPercent >= 80) pbColor = "bg-emerald-500";
  else if (targetPercent >= 50) pbColor = "bg-amber-500";
  else if (daysLeft < 10 && targetPercent < 50) pbColor = "bg-destructive";
  const progressStatus = dailyAvg >= dailyNeeded ? "📈 On track to reach goal" : "⚠️ Behind pace — consider surge pricing";

  // Upcoming
  const twoHoursFromNow = new Date(Date.now() + 2 * 60 * 60 * 1000);
  const upcomingBookings = allBookingsState
    .filter(b => {
      if (!b.startTime) return false;
      const start = new Date(b.startTime);
      return start > new Date() && start <= twoHoursFromNow && b.status === BOOKING_STATUS.CONFIRMED;
    })
    .sort((a,b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
    .slice(0,3);

  const formatTime = (time: any) => safeFormat(toJSDate(time), "hh:mm a");

  return (
    <div className="space-y-6 pb-12 skeleton-fade-in">
      <SchedulerMount stations={stationsWithWindows} />
      {/* Dashboard Header with Alerts */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight flex items-center gap-2">
            Command Center <Badge variant="secondary" className="font-mono text-[10px] bg-primary/10 text-primary border-none">v2.1</Badge>
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5 font-medium">Real-time station monitoring and intelligence</p>
        </div>
        
        <div className="flex items-center gap-3">
           <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="relative h-12 w-12 rounded-2xl glass-card hover:bg-white/10 transition-all border-none">
                  <Bell className="w-5 h-5 shadow-sm" />
                  {alerts.length > 0 && (
                    <span className="absolute -top-1 -right-1 h-5 w-5 bg-destructive text-destructive-foreground rounded-full text-[10px] flex items-center justify-center font-bold animate-bounce shadow-lg">
                      {alerts.length}
                    </span>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-80 p-2 rounded-2xl glass-card shadow-2xl border-none">
                <DropdownMenuLabel className="flex items-center gap-2 px-3 py-2 text-primary font-black uppercase text-[10px] tracking-widest">
                  <Bell className="w-4 h-4" /> System Alerts ({alerts.length})
                </DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-white/10" />
                <div className="max-h-[70vh] overflow-y-auto">
                    {alerts.length === 0 ? (
                      <div className="p-8 text-center text-muted-foreground space-y-2">
                         <CheckCircle className="w-8 h-8 text-emerald-500 mx-auto" />
                         <p className="text-sm font-medium">All systems healthy</p>
                      </div>
                    ) : (
                      alerts.map(a => (
                        <div key={a.id} className="p-3 mb-2 rounded-xl bg-white/5 border border-white/10 hover:border-primary/20 transition-all space-y-2">
                           <div className="flex items-start gap-2">
                              {a.type === 'CONNECTOR_FAULT' ? <AlertTriangle className="w-4 h-4 text-destructive mt-1 shrink-0" /> : <Info className="w-4 h-4 text-sky-500 mt-1 shrink-0" />}
                              <p className="text-xs font-medium leading-relaxed">{a.message}</p>
                           </div>
                           <div className="flex gap-2 justify-end">
                              <Button size="sm" variant="ghost" className="h-7 text-[10px] px-2 font-black uppercase" onClick={() => handleDismissAlert(a.id)}>Dismiss</Button>
                              <Button size="sm" variant="outline" className="h-7 text-[10px] px-2 font-black uppercase text-primary border-primary/20 hover:bg-primary/10" onClick={() => setLocation("/owner/stations")}>Fix Hardware</Button>
                           </div>
                        </div>
                      ))
                    )}
                </div>
              </DropdownMenuContent>
           </DropdownMenu>
           <Button className="h-12 rounded-2xl font-black uppercase tracking-widest gap-2 px-6 shadow-xl shadow-primary/20" onClick={() => setLocation("/owner/stations")}>
              Manage Stations
           </Button>
        </div>
      </div>

      {surgeConfig?.enabled && (
        <div className="glass-card border-amber-500/20 p-4 flex items-center justify-between animate-in slide-in-from-top-4 duration-500 bg-amber-500/10">
           <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-amber-500/20 flex items-center justify-center">
                 <Zap className="w-5 h-5 text-amber-600 animate-pulse" />
              </div>
              <div>
                 <p className="text-sm font-black text-amber-800 dark:text-amber-400 uppercase tracking-widest">
                   {isOverrideActive(surgeOverride) ? 'Manual Surge Active ⚡' : 'Scheduled Surge Active ⚡'}
                 </p>
                 <p className="text-xs text-amber-700/70 dark:text-amber-400/70 font-medium">
                   {surgeConfig.multiplier.toFixed(1)}× Multiplier applied to all stations
                 </p>
              </div>
           </div>
           {isOverrideActive(surgeOverride) ? (
             <Button variant="outline" size="sm" className="bg-white/20 border-amber-500/20 text-amber-800 dark:text-amber-100 font-black uppercase text-[10px] tracking-widest hover:bg-amber-500/10" onClick={handleClearOverride}>
               Return to Schedule
             </Button>
           ) : (
             <Button variant="outline" size="sm" className="bg-white/20 border-amber-500/20 text-amber-800 dark:text-amber-100 font-black uppercase text-[10px] tracking-widest hover:bg-amber-500/10" onClick={() => handleActivateOverride(1.0)}>
               Force Off (30m)
             </Button>
           )}
        </div>
      )}

      {/* Revenue Forecast Alert Section */}
      {forecastMetrics?.isShortfall && !isShortfallDismissed && (
        <div className="mt-2">
          <ShortfallAlertCard
            metrics={forecastMetrics}
            monthlyTarget={monthlyTarget}
            onEnableSurge={() => handleActivateOverride(1.5)}
            onCreatePromotion={() => setLocation("/owner/promotions")}
            onExtendHours={() => setIsHoursModalOpen(true)}
            onDismiss={handleDismissShortfall}
          />
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
        {kpiCards.map(({ label, value, prefix, suffix, icon: Icon, color, bg, note, change, changeType }) => (
          <Card key={label} className="glass-card interactive-card p-5 group border-none flex flex-col justify-between">
            <div className="flex items-start justify-between relative z-10">
              <div className="space-y-1">
                <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">{label}</p>
                <div className={`text-2xl font-black tracking-tight ${color}`}>
                  {label === "Driver Satisfaction" ? (
                    <span>{value}{suffix}</span>
                  ) : (
                    <span className="flex items-center">
                      <AnimatedNumber value={typeof value === 'number' ? value : 0} prefix={prefix} suffix={suffix} />
                      {typeof value !== 'number' && value}
                    </span>
                  )}
                </div>
                {change !== undefined && (
                   <div className="mt-1">
                     <TrendBadge change={change} type={changeType} />
                   </div>
                )}
              </div>
              <div className={`p-3 rounded-2xl ${bg} group-hover:scale-110 transition-transform shadow-inner`}>
                <Icon className={`w-5 h-5 ${color}`} />
              </div>
            </div>
            <div className="flex items-center gap-1 mt-3 text-[10px] font-black text-muted-foreground/60 uppercase tracking-tighter">
              {label === "Unique Drivers" ? (
                <div className="flex flex-col gap-1 w-full">
                   <div className="flex items-center justify-between">
                      <span className="flex items-center text-emerald-600"><TrendingUp className="w-3 h-3 mr-1" /> {kpis.thisMonthDrivers} this month</span>
                      <span className="text-sky-600 opacity-80">{kpis.returningDrivers} returning</span>
                   </div>
                </div>
              ) : (
                <>
                  <CheckCircle className="w-3 h-3 text-emerald-500" />
                  <span>{note}</span>
                </>
              )}
            </div>
          </Card>
        ))}
      </div>

      {/* Driver Messages Widget */}
      {ownerChats.length > 0 && (
        <Card className="glass-card border-none overflow-hidden mt-6 bg-gradient-to-br from-primary/5 to-transparent shadow-xl shadow-primary/5">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div>
              <CardTitle className="text-lg font-black uppercase tracking-tight flex items-center gap-2">
                Driver Messages
                {totalUnread > 0 && (
                  <Badge className="bg-rose-500 animate-pulse">{totalUnread} New</Badge>
                )}
              </CardTitle>
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-tight">Real-time communication with active drivers</p>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {ownerChats.map((chat) => (
                <div 
                  key={chat.id} 
                  className={cn(
                    "p-4 rounded-2xl border transition-all cursor-pointer group relative overflow-hidden",
                    chat.ownerUnread > 0 
                      ? "bg-white/10 border-primary/30 shadow-lg shadow-primary/5" 
                      : "bg-white/5 border-white/10 hover:border-white/20"
                  )}
                  onClick={() => handleOpenChat(chat)}
                >
                  {chat.ownerUnread > 0 && (
                    <div className="absolute top-0 right-0 p-2">
                      <span className="flex h-2 w-2 rounded-full bg-primary animate-ping" />
                    </div>
                  )}
                  <div className="flex justify-between items-start mb-2">
                    <div className="space-y-0.5">
                      <p className="text-sm font-black text-foreground/90 uppercase tracking-tight truncate">{chat.driverName}</p>
                      <p className="text-[10px] text-muted-foreground font-bold truncate max-w-[150px] uppercase tracking-tighter">{chat.stationName}</p>
                    </div>
                    <p className="text-[9px] font-mono text-muted-foreground opacity-60">
                      {chat.lastMessageAt ? safeFormatDistanceToNow(chat.lastMessageAt, { addSuffix: true }) : "Just now"}
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-1 italic mb-3 opacity-80 group-hover:opacity-100 transition-opacity">"{chat.lastMessage}"</p>
                  <div className="flex items-center justify-between border-t border-white/5 pt-3">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-8 text-[10px] font-black uppercase tracking-widest text-primary hover:bg-primary/10 px-2"
                    >
                      Reply Now →
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-8 text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-destructive px-2"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCloseChatInstance(chat.id);
                      }}
                    >
                      Close Chat
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick Actions Row */}
      <div className="flex overflow-x-auto gap-4 py-2 mt-4 hide-scrollbar">
        {quickActions.map(qa => (
          <button key={qa.label} onClick={qa.action} className={`group flex flex-col items-center justify-center gap-2 p-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 hover:-translate-y-0.5 transition-all min-w-[90px] relative flex-1 ${qa.active ? 'bg-emerald-500/20 border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.2)]' : ''}`}>
            <span className="text-xl">{qa.icon}</span>
            <span className="text-xs font-bold text-muted-foreground group-hover:text-foreground whitespace-nowrap">{qa.label}</span>
            {qa.badge !== undefined && qa.badge > 0 && (
               <span className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center">
                 {qa.badge}
               </span>
            )}
          </button>
        ))}
      </div>

      {/* Widgets Row (Upcoming + Goal) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
        <Card className="glass-card border-none bg-black/20 p-5">
           <div className="font-black uppercase tracking-widest text-sm mb-4 border-b border-white/10 pb-2">⏰ Arriving Soon</div>
           {upcomingBookings.length === 0 ? (
             <div className="py-8 text-center text-emerald-500/70 font-bold text-sm bg-emerald-500/5 rounded-xl border border-emerald-500/10">✅ No bookings in next 2 hours</div>
           ) : (
             <div className="space-y-3">
                {upcomingBookings.map(b => {
                   const station = stations.find(s => s.id === b.stationId);
                   return (
                     <div key={b.id} className="flex justify-between items-center p-3 bg-white/5 rounded-xl border border-white/5">
                        <div className="flex items-center gap-3">
                           <div className="font-mono text-primary font-bold text-xs bg-primary/10 px-2 py-1 rounded">{formatTime(b.startTime || 0)}</div>
                           <div>
                              <p className="text-sm font-bold text-foreground/90">{b.connectorType || 'EV Plug'} • #{b.connectorId?.slice(-4)}</p>
                              <p className="text-xs text-muted-foreground">{station?.name || 'Station'}</p>
                           </div>
                        </div>
                     </div>
                   );
                })}
                <p className="text-xs text-center font-bold text-muted-foreground pt-2">"{upcomingBookings.length} drivers arriving in next 2 hours"</p>
             </div>
           )}
        </Card>

        <Card className="glass-card border-none bg-black/20 p-5 flex flex-col justify-between">
           <div className="flex items-center justify-between font-black uppercase tracking-widest text-sm mb-4 border-b border-white/10 pb-2">
             <span>🎯 Monthly Revenue Goal</span>
             {!isEditingTarget && (
                <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2 text-primary" onClick={() => setIsEditingTarget(true)}>Edit Goal ✏️</Button>
             )}
           </div>
           
           {monthlyTarget === 0 && !isEditingTarget ? (
              <div className="py-6 text-center space-y-3">
                 <p className="font-bold text-sm text-muted-foreground">Set a monthly revenue goal →</p>
                 <Button variant="outline" size="sm" onClick={() => setIsEditingTarget(true)} className="uppercase text-xs font-black tracking-widest text-primary border-primary/20">Set Goal</Button>
              </div>
           ) : (
             <div className="space-y-4">
                {isEditingTarget ? (
                   <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold text-muted-foreground">Goal:</span>
                      <input type="text" className="bg-white/5 border border-white/10 rounded-lg px-3 py-1 text-sm font-bold w-full max-w-[120px] outline-none focus:border-primary/50 text-foreground" placeholder="e.g. 20000" value={newTargetInput} onChange={(e) => setNewTargetInput(e.target.value)} autoFocus />
                      <Button size="sm" className="h-8 text-xs font-bold" onClick={handleSaveTarget}>Save</Button>
                      <Button size="sm" variant="ghost" className="h-8" onClick={() => setIsEditingTarget(false)}>Cancel</Button>
                   </div>
                ) : (
                   <div className="font-black text-sm text-foreground/80 tracking-widest">Goal: <span className="text-primary">{fmt.format(monthlyTarget)}</span></div>
                )}
                
                <div className="space-y-2">
                   <div className="flex items-center gap-2">
                      <div className="h-4 flex-1 bg-black/40 rounded-full overflow-hidden border border-white/5 relative">
                         <div className={`h-full ${pbColor} transition-all duration-1000 ease-out`} style={{ width: `${targetPercent}%` }} />
                      </div>
                      <span className="text-xs font-black w-10 text-right">{targetPercent}%</span>
                   </div>
                   <p className="text-xs font-bold text-muted-foreground">{fmt.format(kpis.thisMonthRevenue)} earned of {fmt.format(monthlyTarget)}</p>
                </div>

                {/* SHORTFALL ALERT — enhanced status */}
                {forecastMetrics && (
                  <div className="flex items-center justify-between mt-2">
                    <span className={cn(
                      'text-xs font-black uppercase tracking-tight',
                      forecastMetrics.isOnTrack
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : forecastMetrics.severity === 'critical'
                        ? 'text-destructive'
                        : 'text-amber-600 dark:text-amber-400'
                    )}>
                      {forecastMetrics.isOnTrack
                        ? `On track — projecting ${formatRsCompact(forecastMetrics.projectedMonthEnd)}`
                        : `Projecting ${formatRsCompact(forecastMetrics.projectedMonthEnd)}
                           (${formatRsCompact(forecastMetrics.shortfallAmount)} short)`}
                    </span>
                    <span className="text-xs font-black uppercase text-muted-foreground opacity-60">
                      {forecastMetrics.daysRemainingThisMonth}d left
                    </span>
                  </div>
                )}

                {/* SHORTFALL ALERT — sparkline */}
                {forecastMetrics && (
                  <div className="mt-3 pt-3 border-t border-white/5">
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/70 mb-2">
                      Revenue forecast (28D)
                    </p>
                    <RevenueForecastSparkline
                      sparklineData={forecastMetrics.sparklineData}
                      monthlyTarget={monthlyTarget}
                      trailing7DayAvgRevenue={forecastMetrics.trailing7DayAvgRevenue}
                    />
                  </div>
                )}

                {/* SHORTFALL ALERT — alert card */}
                <AnimatePresence>
                  {forecastMetrics?.isShortfall && !isShortfallDismissed && (
                    <div className="mt-3">
                      <ShortfallAlertCard
                        metrics={forecastMetrics}
                        monthlyTarget={monthlyTarget}
                        onEnableSurge={handleEnableSurgeFromAlert}
                        onCreatePromotion={() => setLocation('/owner/promotions')}
                        onExtendHours={() => setIsHoursModalOpen(true)}
                        onDismiss={handleDismissShortfall}
                      />
                    </div>
                  )}
                </AnimatePresence>

                {/* Autopilot Engine */}
                <AutopilotCard
                  peakHours={analyticsData?.peakHours ?? []}
                  overallAvgPerSession={analyticsData?.overallAvgPerSession ?? 0}
                  ownerId={user?.uid ?? ''}
                  db={db}
                  existingSurgeRules={surgeRules}
                  className="mt-6"
                />

                {/* Autopilot Performance Report */}
                {autopilotPerformance && (
                  <div className="mt-8 pt-6 border-t border-white/10 space-y-6">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-black uppercase tracking-widest text-foreground/90 flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-primary" />
                        AI Performance Report
                      </h3>
                      {autopilotPerformance.aiLift > 0 && (
                        <Badge className="bg-emerald-500/20 text-emerald-500 border-none font-black text-[10px] animate-pulse">
                          AI LIFT: +{autopilotPerformance.aiLift.toFixed(1)}%
                        </Badge>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-1">
                        <p className="text-[10px] font-black uppercase text-muted-foreground opacity-60">AI Autopilot</p>
                        <p className="text-lg font-black text-primary">{fmt.format(autopilotPerformance.autopilotAvg)}</p>
                        <p className="text-[10px] font-bold text-muted-foreground">Avg per session</p>
                      </div>
                      <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-1">
                        <p className="text-[10px] font-black uppercase text-muted-foreground opacity-60">Manual Pricing</p>
                        <p className="text-lg font-black text-foreground/70">{fmt.format(autopilotPerformance.manualAvg)}</p>
                        <p className="text-[10px] font-bold text-muted-foreground">Avg per session</p>
                      </div>
                    </div>

                    {/* Confidence Trend Chart */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">7-Day Confidence Trend</p>
                        <span className="text-[10px] font-black text-primary uppercase">{autopilotPerformance.currentConfidence}% Score</span>
                      </div>
                      
                      <div className="h-32 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={autopilotHistory}>
                            <defs>
                              <linearGradient id="colorConf" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                                <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                              </linearGradient>
                            </defs>
                            <CartesianGrid vertical={false} strokeDasharray="3 3" strokeOpacity={0.05} />
                            <XAxis 
                              dataKey="date" 
                              hide 
                            />
                            <YAxis hide domain={[0, 100]} />
                            <RechartsTooltip 
                              contentStyle={{ borderRadius: '12px', border: 'none', backgroundColor: 'rgba(0,0,0,0.8)', color: 'white', fontSize: '10px' }}
                              itemStyle={{ color: 'hsl(var(--primary))' }}
                            />
                            <Area 
                              type="monotone" 
                              dataKey="confidence" 
                              stroke="hsl(var(--primary))" 
                              fillOpacity={1} 
                              fill="url(#colorConf)" 
                              strokeWidth={2}
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {/* Strategy Insight */}
                    <div className="p-4 rounded-2xl bg-primary/5 border border-primary/10 flex gap-3">
                      <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                        <Zap className="w-4 h-4 text-primary" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-[10px] font-black uppercase text-primary">Strategy Insight</p>
                        <p className="text-xs font-medium leading-relaxed text-foreground/80">
                          {autopilotPerformance.aiLift > 5 
                            ? `Autopilot is currently outperforming manual pricing by ${autopilotPerformance.aiLift.toFixed(1)}%. We recommend keeping it active to capture high-demand revenue.`
                            : autopilotPerformance.currentConfidence < 50
                            ? `We need approx. ${20 - autopilotPerformance.autopilotCount} more autopilot sessions to reach 100% pricing confidence.`
                            : `Pricing performance is stable. AI confidence is at ${autopilotPerformance.currentConfidence}% based on recent session volume.`}
                        </p>
                      </div>
                    </div>

                    {/* Revenue Recovery Insight */}
                    {decayStats.slotsRecovered > 0 && (
                      <div className="mt-6 p-5 rounded-2xl bg-emerald-500/5 border border-emerald-500/10 space-y-4">
                        <div className="flex items-center justify-between">
                          <h4 className="text-[10px] font-black uppercase tracking-widest text-emerald-600 flex items-center gap-2">
                            <Clock className="w-3.5 h-3.5" />
                            Last-Minute Recovery
                          </h4>
                          <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-[9px] font-black uppercase">
                            Time-Decay Active
                          </Badge>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-6">
                          <div className="space-y-1">
                            <p className="text-2xl font-black text-foreground">{fmt.format(decayStats.revenueRecovered)}</p>
                            <p className="text-[10px] font-bold text-muted-foreground uppercase">Revenue Gained</p>
                          </div>
                          <div className="space-y-1">
                            <p className="text-2xl font-black text-foreground">{decayStats.slotsRecovered}</p>
                            <p className="text-[10px] font-bold text-muted-foreground uppercase">Slots Recovered</p>
                          </div>
                        </div>

                        <div className="pt-2 flex items-center gap-2 text-[10px] font-bold text-emerald-600">
                          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          Average recovery discount: {decayStats.avgDiscount.toFixed(0)}%
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </Card>
       </div>

       {/* Station Benchmarking Table */}
       <StationBenchmarkTable 
         stations={stations}
         bookings={allBookingsState}
         reviews={allReviewsState}
         alerts={alerts}
       />

      {/* SHORTFALL ALERT — extend hours modal */}
      <ExtendHoursModal 
        isOpen={isHoursModalOpen}
        onClose={() => setIsHoursModalOpen(false)}
        stations={stations}
        ownerId={user?.uid || ''}
      />

      {/* Live Occupancy Monitor */}
      <Card className="glass-card border-none overflow-hidden">
         <CardHeader className="flex flex-row items-center justify-between pb-4">
            <div>
               <CardTitle className="text-lg font-black flex items-center gap-2">Live Occupancy Monitor <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping" /></CardTitle>
               <p className="text-xs text-muted-foreground font-medium">Real-time connector telemetry streams</p>
            </div>
            <Badge variant="outline" className="font-mono text-[10px] opacity-70 bg-white/5 border-none">REFRESHING EVERY 5S</Badge>
         </CardHeader>
         <CardContent className="space-y-6">
            {stations.map(station => (
              <div key={station.id} className="space-y-3">
                 <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]" />
                    <h3 className="text-sm font-black uppercase tracking-tight">{station.name}</h3>
                    <span className="text-[10px] text-muted-foreground opacity-50 px-2 border-l border-white/10 font-medium">{station.address}</span>
                 </div>
                 <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-3">
                    {(liveStations[station.id]?.connectors || []).map((con, idx) => {
                       const isFaulty = alerts.some(a => a.stationId === station.id && a.type === 'CONNECTOR_FAULT');
                       let statusLabel = con.available ? "AVAILABLE" : "CHARGING";
                       let statusClass = con.available ? "border-emerald-500/20 bg-emerald-500/[0.02] text-emerald-600" : "border-sky-500/30 bg-sky-500/[0.02] text-sky-600 ring-2 ring-sky-400/20 badge-active";
                       
                       if (station.status === 'maintenance') {
                         statusLabel = "MAINTENANCE";
                         statusClass = "border-muted/50 bg-muted/20 text-muted-foreground";
                       } else if (isFaulty) {
                         statusLabel = "FAULT REPORTED";
                         statusClass = "border-destructive/30 bg-destructive/5 text-destructive animate-pulse shadow-[0_0_15px_rgba(239,68,68,0.2)]";
                       }

                       return (
                         <div key={con.id || `con-${idx}`} className={cn("p-4 rounded-2xl border-2 transition-all flex flex-col justify-between h-28 relative overflow-hidden backdrop-blur-sm", statusClass)}>
                            {!con.available && station.status !== 'maintenance' && !isFaulty && (
                              <div className="absolute top-0 right-0 p-2 opacity-10">
                                 <Radio className="w-8 h-8 animate-ping" />
                              </div>
                            )}
                            <div>
                               <p className="text-[10px] font-black opacity-60 uppercase tracking-widest">{con.type} • #{idx + 1}</p>
                               <p className="text-xs font-black mt-1 line-clamp-1">{con.powerKw}kW High-Flow</p>
                            </div>
                            <div className="mt-2 text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5">
                               {!con.available && station.status === 'active' && !isFaulty ? <Clock className="w-3 h-3" /> : null}
                               {statusLabel}
                            </div>
                         </div>
                       );
                    })}
                 </div>
              </div>
            ))}
         </CardContent>
      </Card>

      {/* Main Insights Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Charts Section */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="glass-card p-5 border-none">
            <CardHeader className="p-0 mb-6 flex flex-row items-center justify-between space-y-0">
               <div>
                  <CardTitle className="text-lg font-black uppercase tracking-tight">Revenue Trend</CardTitle>
                  <p className="text-xs text-muted-foreground font-medium">30-day continuous financial performance</p>
               </div>
               <div className="flex items-center gap-1 text-emerald-600 font-black bg-emerald-500/10 px-2 py-1 rounded-lg text-[10px] uppercase tracking-widest">
                  <TrendingUp className="w-4 h-4" /> 12% Growth
               </div>
            </CardHeader>
            <CardContent className="p-0">
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={trend}>
                  <Line 
                    type="monotone" 
                    dataKey="revenue" 
                    stroke="hsl(var(--primary))" 
                    strokeWidth={4} 
                    dot={{ r: 4, fill: "white", strokeWidth: 2, stroke: "hsl(var(--primary))" }} 
                    activeDot={{ r: 8, strokeWidth: 0 }}
                    isAnimationActive={true}
                    animationDuration={1500}
                    animationEasing="ease-out"
                  />
                  <CartesianGrid vertical={false} strokeDasharray="3 3" strokeOpacity={0.1} />
                  <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 11, fontWeight: 'bold', opacity: 0.5 }} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fontWeight: 'bold', opacity: 0.5 }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                  <RechartsTooltip contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', fontWeight: 'bold', fontSize: '12px' }} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="glass-card p-5 border-none">
            <CardHeader className="p-0 mb-6 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg font-black uppercase tracking-tight">Driver Sentiment</CardTitle>
                <p className="text-xs text-muted-foreground font-medium">AI-classified feedback analysis</p>
              </div>
              <Badge className="bg-emerald-500/10 text-emerald-600 border-none font-black text-[10px]">VERIFIED SESSIONS ONLY</Badge>
            </CardHeader>
            <CardContent className="p-0">
              <div className="grid grid-cols-1 md:grid-cols-2 items-center gap-6">
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie 
                      data={sentimentData} 
                      cx="50%" cy="50%" 
                      innerRadius={50} outerRadius={70} 
                      dataKey="value" stroke="none"
                    >
                      {sentimentData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Pie>
                    <RechartsTooltip />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-4">
                   {sentimentData.map((s, i) => (
                     <div key={i} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                           <div className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
                           <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{s.name}</span>
                        </div>
                        <span className="text-sm font-black">{s.value}%</span>
                     </div>
                   ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Intelligence Sidebar */}
        <div className="space-y-6">
          {/* AI Insights Widget */}
          <Card className="glass-card p-6 border-none bg-primary/5 relative overflow-hidden">
             <div className="absolute -top-10 -right-10 opacity-5">
                <Power className="w-40 h-40" />
             </div>
             <CardHeader className="p-0 mb-4">
                <div className="flex items-center gap-2 mb-1">
                   <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                   <CardTitle className="text-xs font-black uppercase tracking-widest text-primary">SeniorDevOps AI Insights</CardTitle>
                </div>
                <p className="text-[10px] text-muted-foreground font-black uppercase">Real-time strategy suggestions</p>
             </CardHeader>
             <CardContent className="p-0 space-y-4">
                {aiInsights.map((insight, idx) => (
                  <div key={idx} className={cn(
                    "p-3 rounded-xl border-l-4 text-xs font-medium leading-relaxed",
                    insight.type === 'positive' ? "bg-emerald-500/5 border-emerald-500 text-emerald-700 dark:text-emerald-400" :
                    insight.type === 'warning' ? "bg-destructive/5 border-destructive text-destructive" :
                    "bg-sky-500/5 border-sky-500 text-sky-700 dark:text-sky-400"
                  )}>
                    {insight.text}
                  </div>
                ))}
             </CardContent>
          </Card>

          {/* Competitor Awareness Widget */}
          <div className="competitor-widget glass-card border-none">
            <button
              className="competitor-toggle flex items-center justify-between w-full p-4 text-left hover:bg-white/5 transition-colors"
              onClick={() => setShowCompetitors(!showCompetitors)}>
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-primary" />
                <span className="font-black uppercase tracking-widest text-[10px]">📍 Nearby Competition</span>
                <Badge variant="outline" className="text-[9px] font-bold border-white/10">
                  {competitors.length} stations within 5km
                </Badge>
              </div>
              <span className="text-xs opacity-50">{showCompetitors ? "▲" : "▼"}</span>
            </button>
            
            {showCompetitors && (
              <div className="competitor-list divide-y divide-white/5">
                {competitors.map((comp, i) => (
                  <div key={i} className="comp-row p-4 space-y-3">
                    <div className="flex justify-between items-start">
                      <div className="comp-info">
                        <span className="comp-name font-black text-sm text-foreground/90">
                          {comp.name}
                        </span>
                        <span className="comp-distance text-[10px] font-bold text-muted-foreground uppercase tracking-tight">
                          {comp.distanceKm} km from {comp.nearMyStation}
                        </span>
                      </div>
                      <div className="comp-pricing font-mono font-black text-xs text-primary">
                        ₹{Math.min(
                          ...(comp.connectors?.map(
                            (c: any) => c.pricePerKwh || c.pricing?.baseRate || 0
                          ) || [0])
                        )}/kWh min
                      </div>
                    </div>
                    
                    <div className="comp-connectors flex flex-wrap gap-2">
                      {comp.connectors?.slice(0, 3).map((c: any, ci: number) => (
                        <span key={ci}
                          className={cn(
                            "comp-conn-chip text-[9px] font-black px-2 py-0.5 rounded-md uppercase tracking-tighter",
                            c.available ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500"
                          )}>
                          {c.type} {c.available ? "✅" : "⏳"}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
                
                {competitors.length === 0 && (
                  <div className="comp-empty p-8 text-center">
                    <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
                      <CheckCircle className="w-6 h-6 text-primary" />
                    </div>
                    <p className="text-xs font-black text-muted-foreground uppercase tracking-widest">No competition within 5km</p>
                    <p className="text-[10px] font-medium text-muted-foreground/60 mt-1">You have exclusive coverage! 🎯</p>
                  </div>
                )}
                
                {competitors.some(c => c.connectors?.some((cn: any) => !cn.available)) && (
                  <div className="comp-insight p-4 bg-amber-500/10 border-t border-amber-500/20 flex gap-3">
                    <Info className="w-4 h-4 text-amber-500 shrink-0" />
                    <span className="text-[10px] font-bold leading-relaxed text-amber-700 dark:text-amber-400">
                      STRATEGIC INSIGHT: Some nearby competitors are busy. Consider enabling surge pricing now to capture peak value.
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
          {/* Peak Hours Widget */}
          <Card className="glass-card bg-slate-900 border-none text-slate-100 p-6 overflow-hidden relative">
             <div className="absolute top-0 right-0 p-4 opacity-5">
                <Clock className="w-32 h-32" />
             </div>
             <CardHeader className="p-0 mb-6">
                <CardTitle className="text-lg font-black uppercase tracking-widest text-slate-400">🏆 Your Peak Hours</CardTitle>
                <p className="text-xs text-slate-500 font-black uppercase">Performance analytics (30D)</p>
             </CardHeader>
             <CardContent className="p-0 space-y-6">
                {peakHours.length === 0 ? (
                  <div className="py-12 text-center text-slate-500">Accumulating data...</div>
                ) : (
                  peakHours.map((p, idx) => (
                    <div key={idx} className="space-y-2">
                       <div className="flex justify-between items-end text-xs font-black uppercase tracking-tight">
                          <span className="flex items-center gap-2">
                             <span className={`h-5 w-5 rounded flex items-center justify-center text-[10px] ${idx === 0 ? 'bg-amber-500 text-slate-900' : 'bg-slate-800 text-slate-400'}`}>
                                {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : idx + 1}
                             </span>
                             {p.day} <span className="text-slate-500 font-medium">{p.time}</span>
                          </span>
                          <span className="text-slate-100">{fmt.format(p.revenue)} avg</span>
                       </div>
                       <div className="h-3 w-full bg-slate-800 rounded-full overflow-hidden shadow-inner">
                          <div 
                            className={`h-full rounded-full transition-all duration-1000 ease-out shadow-[0_0_10px_rgba(245,158,11,0.3)] ${idx === 0 ? 'bg-amber-500' : 'bg-primary'}`} 
                            style={{ width: `${p.percentage}%` }} 
                          />
                       </div>
                    </div>
                  ))
                )}
                
                <Separator className="bg-slate-800 my-4" />
                <div className="bg-primary/10 border border-primary/20 rounded-2xl p-4 space-y-2">
                   <p className="text-xs font-black text-primary flex items-center gap-2 uppercase tracking-widest"><Info className="w-4 h-4" /> Strategic Tip</p>
                   <p className="text-[10px] leading-relaxed text-slate-400 font-medium italic">
                     "Enable surge pricing during your peak hours to potentially boost your nightly revenue by up to 30%."
                   </p>
                   <Button variant="ghost" className="p-0 h-auto text-[10px] font-black text-primary underline uppercase tracking-widest hover:text-primary/80" onClick={() => setLocation("/settings")}>
                      Configure in Settings →
                   </Button>
                </div>
             </CardContent>
          </Card>

          {/* Surge Price Scheduler Card */}
          <Card id="surge-scheduler-section" className="glass-card border-none bg-muted/20">
             <CardHeader className="px-6 py-5 border-b border-white/5 flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-lg font-black uppercase tracking-tight flex items-center gap-2">
                   <Zap className="w-5 h-5 text-amber-500" /> Surge Scheduler
                </CardTitle>
                <Button 
                  size="sm" 
                  className="rounded-xl font-black uppercase h-8 text-[10px] tracking-widest"
                  onClick={() => { setEditingRule(null); setIsRuleEditorOpen(true); }}
                >
                  + Add Rule
                </Button>
             </CardHeader>
             <CardContent className="p-6 space-y-6">
                {/* Manual Override Section */}
                <SurgeOverridePanel 
                  override={surgeOverride}
                  currentPeakPricing={surgeConfig}
                  onActivateOverride={handleActivateOverride}
                  onClearOverride={handleClearOverride}
                  isSaving={isSurgeActionLoading}
                />

                <div className="space-y-3">
                   <div className="flex items-center justify-between">
                      <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground">Active Schedule</h3>
                      <Badge variant="outline" className="text-[9px] font-bold opacity-60">{surgeRules.length} Rules</Badge>
                   </div>
                   
                   <div className="space-y-3">
                      {surgeRules.length === 0 ? (
                        <div className="py-8 text-center rounded-xl border border-dashed border-white/10 bg-white/5">
                           <p className="text-xs text-muted-foreground font-medium italic">No scheduled rules yet</p>
                           <button 
                             className="text-[10px] font-black text-primary uppercase mt-1 hover:underline"
                             onClick={() => setIsRuleEditorOpen(true)}
                           >
                             Create your first rule →
                           </button>
                        </div>
                      ) : (
                        surgeRules.map(rule => (
                          <SurgeRuleCard 
                            key={rule.id}
                            rule={rule}
                            onToggle={handleToggleRule}
                            onEdit={(r) => { setEditingRule(r); setIsRuleEditorOpen(true); }}
                            onDelete={handleDeleteRule}
                            isDeleting={isSurgeActionLoading}
                            isToggling={isSurgeActionLoading}
                          />
                        ))
                      )}
                   </div>
                </div>

                <div className="bg-primary/5 rounded-2xl p-4 border border-primary/10">
                   <p className="text-[10px] text-muted-foreground font-medium italic leading-relaxed">
                     "Automated surge pricing optimizes your revenue by matching rates to your historical peak demand windows."
                   </p>
                </div>
             </CardContent>
          </Card>
        </div>

      </div>

      {/* Recent Bookings Ledger Table */}
      <Card className="glass-card border-none overflow-hidden">
        <CardHeader className="px-6 py-5 border-b border-white/10 bg-white/5 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-lg font-black uppercase tracking-tight">Real-time Transaction Ledger</CardTitle>
            <p className="text-xs text-muted-foreground font-medium">Most recent charging bookings across all stations</p>
          </div>
          <Button variant="outline" size="sm" className="rounded-xl font-black uppercase h-9 text-[10px] tracking-widest border-white/10 hover:bg-white/5" onClick={() => setLocation("/owner/ledger")}>
            Full History →
          </Button>
        </CardHeader>
        {recentBookings.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground uppercase font-black text-xs tracking-widest opacity-20">No history detected</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-white/5 text-left border-b border-white/10">
                  {["Station Profile", "Status", "Fiscal State", "Volume", "Timestamp"].map((h) => (
                    <th key={h} className="px-6 py-4 text-[10px] font-black text-muted-foreground uppercase tracking-widest">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {recentBookings.map((b) => (
                  <tr key={b.id} className="hover:bg-white/5 transition-colors group interactive-card">
                    <td className="px-6 py-5">
                      <p className="font-black text-sm text-foreground/80">{b.stationName || "Virtual Station"}</p>
                      <div className="flex items-center gap-1.5 mt-1">
                        <MapPin className="w-3 h-3 text-muted-foreground opacity-50" />
                        <span className="text-[10px] text-muted-foreground font-mono font-bold uppercase tracking-tighter">{b.connectorType || 'EV Plug'} • {b.connectorId?.slice(0, 8)}</span>
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <Badge className={`rounded-lg px-2 py-0.5 font-bold text-[10px] uppercase border-none ${
                        b.status === "completed" ? "bg-emerald-500/10 text-emerald-600 shadow-[0_0_8px_rgba(16,185,129,0.1)]" :
                        b.status === "confirmed" ? "bg-sky-500/10 text-sky-600 shadow-[0_0_8px_rgba(14,165,233,0.1)]" :
                        b.status === "active" ? "bg-primary/20 text-primary border-primary animate-pulse" :
                        "bg-muted text-muted-foreground"
                      }`} variant="outline">
                        {b.status}
                      </Badge>
                    </td>
                    <td className="px-6 py-5">
                       <div className="flex items-center gap-2">
                          <span className={`h-1.5 w-1.5 rounded-full ${b.paymentStatus === "paid" ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]"}`} />
                          <span className="text-[10px] font-black uppercase tracking-tighter text-muted-foreground">{b.paymentStatus || "pending"}</span>
                       </div>
                    </td>
                    <td className="px-6 py-5 font-mono font-black text-primary text-sm tracking-tighter">
                      {fmt.format(b.totalPrice || 0)}
                    </td>
                    <td className="px-6 py-5 whitespace-nowrap">
                       <p className="text-xs font-black text-foreground/70">{b.startTime ? safeFormat(toJSDate(b.startTime), "dd MMM, yyyy") : "—"}</p>
                       <p className="text-[10px] text-muted-foreground opacity-60 font-mono italic font-bold">{safeFormat(toJSDate(b.startTime), 'HH:mm') || ''}</p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Floating Chat Window */}
      {activeChatId && activeChatData && (
        <ChatWindow
          chatId={activeChatId}
          currentUserId={user?.uid || ""}
          currentUserRole="owner"
          currentUserName={user?.displayName || "Station Owner"}
          recipientName={activeChatData.driverName}
          stationName={activeChatData.stationName}
          onClose={() => setActiveChatId(null)}
        />
      )}
      {/* Surge Rule Editor Dialog */}
      <SurgeScheduleEditor
        isOpen={isRuleEditorOpen}
        onClose={() => { setIsRuleEditorOpen(false); setEditingRule(null); }}
        onSave={handleSaveRule}
        existingRule={editingRule}
        existingRules={surgeRules}
        isSaving={isSurgeActionLoading}
      />
    </div>
  );
}
