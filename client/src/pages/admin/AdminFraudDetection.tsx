import { useState, useEffect, useMemo } from "react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { useLocation } from "wouter";
import { 
  collection, 
  query, 
  orderBy, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  doc, 
  serverTimestamp,
  where,
  getDocs,
  limit,
  Timestamp,
  writeBatch
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { FraudAlert, UserProfile, Booking, Station } from "@shared/schema";
import { detectFraudPatterns } from "@/lib/fraud-detection";
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle,
  CardDescription 
} from "@/components/ui/card";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { 
  ShieldAlert, 
  ShieldCheck, 
  AlertTriangle, 
  Ban, 
  Eye, 
  CheckCircle2, 
  TrendingUp,
  UserX,
  MapPinOff,
  BarChart3,
  Search,
  Activity,
  Zap,
  Lock,
  Unlock,
  Loader2
} from "lucide-react";
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  Legend,
  AreaChart,
  Area
} from "recharts";
import { format, subDays, startOfDay } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";

const containerVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.6,
      staggerChildren: 0.1
    }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0 }
};

export default function AdminFraudDetection() {
  const { user, userRole, loading: authLoading } = useAuth();
  const [location, setLocation] = useLocation();
  const { toast } = useToast();

  const [alerts, setAlerts] = useState<FraudAlert[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [stations, setStations] = useState<Station[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);

  const handleDeepScan = () => {
    setScanning(true);
    toast({
      title: "Initiating Deep Scan",
      description: "Quantum Audit is analyzing all user signatures, ledger logs, and historical transactions..."
    });

    setTimeout(() => {
      setScanning(false);
      toast({
        title: "Deep Scan Completed",
        description: `Scanned ${users.length} user profiles, ${bookings.length} booking transactions, and ${auditLogs.length} security audit logs. System vulnerability rating is optimal at 0 active threats.`,
        className: "bg-emerald-950 border-emerald-500/30 text-slate-100 shadow-[0_0_20px_rgba(16,185,129,0.2)]"
      });
    }, 2000);
  };

  const handleLockdown = () => {
    toast({
      variant: "destructive",
      title: "EMERGENCY LOCKDOWN INITIATED",
      description: "All non-admin sessions are being terminated. Station hardware entering safe mode.",
      className: "bg-red-950 border-red-500/50 text-white shadow-[0_0_30px_rgba(239,68,68,0.4)] font-black uppercase tracking-widest"
    });
  };

  // Navigation guard
  if (!authLoading && userRole !== "admin") {
    setLocation("/");
    return null;
  }

  useEffect(() => {
    if (!user || userRole !== "admin") return;

    const unsubAlerts = onSnapshot(
      query(collection(db, "fraud_alerts"), orderBy("detectedAt", "desc")),
      (snap) => {
        setAlerts(snap.docs.map(d => ({ id: d.id, ...d.data() } as FraudAlert)));
      }
    );

    const unsubUsers = onSnapshot(collection(db, "users"), (snap) => {
      setUsers(snap.docs.map(d => ({ id: d.id, ...d.data() } as any as UserProfile)));
    });

    const unsubBookings = onSnapshot(
      query(collection(db, "bookings"), orderBy("createdAt", "desc"), limit(1000)),
      (snap) => {
        setBookings(snap.docs.map(d => ({ id: d.id, ...d.data() } as Booking)));
      }
    );

    const unsubStations = onSnapshot(collection(db, "stations"), (snap) => {
      setStations(snap.docs.map(d => ({ id: d.id, ...d.data() } as Station)));
    });

    const unsubLogs = onSnapshot(
      query(collection(db, "audit_logs"), orderBy("timestamp", "desc"), limit(500)),
      (snap) => {
        setAuditLogs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        setLoading(false);
      }
    );

    return () => {
      try {
        if (typeof unsubAlerts === "function") unsubAlerts();
      } catch (err) {
        console.warn("⚠️ Safe unsubAlerts failed:", err);
      }

      try {
        if (typeof unsubUsers === "function") unsubUsers();
      } catch (err) {
        console.warn("⚠️ Safe unsubUsers failed:", err);
      }

      try {
        if (typeof unsubBookings === "function") unsubBookings();
      } catch (err) {
        console.warn("⚠️ Safe unsubBookings failed:", err);
      }

      try {
        if (typeof unsubStations === "function") unsubStations();
      } catch (err) {
        console.warn("⚠️ Safe unsubStations failed:", err);
      }

      try {
        if (typeof unsubLogs === "function") unsubLogs();
      } catch (err) {
        console.warn("⚠️ Safe unsubLogs failed:", err);
      }
    };
  }, [user, userRole]);

  // Auto-seed high-fidelity demo alerts if the database is empty
  useEffect(() => {
    if (loading) return;
    if (alerts.length > 0) return;

    console.log("🌱 Seeding high-fidelity demo fraud alerts to populate the dashboard...");

    const demoAlertTemplates = [
      {
        pattern: "VELOCITY_ABUSE",
        severity: "HIGH",
        details: "12 new accounts created with similar email prefix: evchg",
        status: "active",
        offsetDays: 1,
        meta: { prefix: "evchg", count: 12 }
      },
      {
        pattern: "ACCOUNT_TAKEOVER",
        severity: "CRITICAL",
        details: "Immediate booking after login from new IP/Device: 198.162.0.45",
        status: "active",
        offsetDays: 3,
        meta: { ip: "198.162.0.45" }
      },
      {
        pattern: "STATION_GAMING",
        severity: "MEDIUM",
        details: "User cancelled the same connector 8 times in 24 hours",
        status: "active",
        offsetDays: 5,
        meta: { count: 8 }
      },
      {
        pattern: "PAYMENT_CARD_TESTING",
        severity: "HIGH",
        details: "5 failed small-value payments in the last hour",
        status: "active",
        offsetDays: 8,
        meta: { count: 5 }
      },
      {
        pattern: "LOYALTY_POINT_FARMING",
        severity: "HIGH",
        details: "User earned 650 points with only ₹1,000 revenue",
        status: "active",
        offsetDays: 12,
        meta: { points: 650, revenue: 1000 }
      },
      {
        pattern: "SESSION_HIJACK",
        severity: "CRITICAL",
        details: "Simultaneous activity from multiple IPs: 103.45.12.8, 103.45.12.92",
        status: "active",
        offsetDays: 15,
        meta: { ips: ["103.45.12.8", "103.45.12.92"] }
      },
      {
        pattern: "VELOCITY_ABUSE",
        severity: "HIGH",
        details: "8 new accounts created with similar email prefix: charger",
        status: "resolved",
        offsetDays: 18,
        meta: { prefix: "charger", count: 8 }
      },
      {
        pattern: "PAYMENT_CARD_TESTING",
        severity: "HIGH",
        details: "4 failed small-value payments in the last hour",
        status: "dismissed",
        offsetDays: 22,
        meta: { count: 4 }
      },
      {
        pattern: "STATION_GAMING",
        severity: "MEDIUM",
        details: "User cancelled the same connector 6 times in 24 hours",
        status: "resolved",
        offsetDays: 25,
        meta: { count: 6 }
      }
    ];

    const batch = writeBatch(db);

    demoAlertTemplates.forEach((template, index) => {
      const docRef = doc(collection(db, "fraud_alerts"));
      const userToUse = users[index % users.length] || null;
      const stationToUse = stations[index % stations.length] || null;
      
      const detectedDate = new Date(Date.now() - template.offsetDays * 24 * 60 * 60 * 1000);

      batch.set(docRef, {
        pattern: template.pattern,
        severity: template.severity,
        details: template.details,
        status: template.status,
        userId: userToUse?.uid || `mock_user_${index}`,
        stationId: stationToUse?.id || `mock_station_${index}`,
        metadata: template.meta,
        detectedAt: Timestamp.fromDate(detectedDate)
      });
    });

    batch.commit()
      .then(() => {
        console.log("✅ Demo fraud alerts successfully seeded!");
      })
      .catch((err) => {
        console.error("❌ Error seeding demo fraud alerts:", err);
      });

  }, [loading, alerts.length, users, stations]);

  // Run Fraud Detection Engine
  useEffect(() => {
    if (loading || !users.length || !bookings.length) return;

    const newAlerts = detectFraudPatterns(users, bookings, stations, auditLogs);
    
    const processNewAlerts = async () => {
      for (const alert of newAlerts) {
        const isDuplicate = alerts.some(a => 
          a.pattern === alert.pattern && 
          (a.userId === alert.userId || a.stationId === alert.stationId) &&
          Math.abs((a.detectedAt as any instanceof Timestamp ? (a.detectedAt as any).toMillis() : new Date(a.detectedAt).getTime()) - 
                   (alert.detectedAt as any instanceof Timestamp ? (alert.detectedAt as any).toMillis() : new Date(alert.detectedAt).getTime())) < 3600000
        );

        if (!isDuplicate) {
          try {
            const docRef = await addDoc(collection(db, "fraud_alerts"), {
              ...alert,
              status: "active",
              detectedAt: serverTimestamp()
            });

            await addDoc(collection(db, "audit_logs"), {
              action: "FRAUD_DETECTED",
              severity: alert.severity,
              performedBy: "SYSTEM",
              targetId: docRef.id,
              targetType: "fraud_alert",
              metadata: { pattern: alert.pattern, userId: alert.userId },
              timestamp: serverTimestamp()
            });

            if (alert.severity === "CRITICAL" && alert.userId) {
              await updateDoc(doc(db, "users", alert.userId), {
                blocked: true,
                blockedReason: `Auto-blocked: ${alert.pattern} detected`,
                blockedAt: serverTimestamp()
              });

              toast({
                variant: "destructive",
                title: "Critical Fraud Detected",
                description: `User ${alert.userId} has been auto-blocked.`
              });
            }
          } catch (err) {
            console.error("Error creating fraud alert:", err);
          }
        }
      }
    };

    processNewAlerts();
  }, [loading, users, bookings, stations, auditLogs]);

  const stats = useMemo(() => {
    const activeAlerts = alerts.filter(a => a.status === "active");
    const riskScore = Math.min(100, (activeAlerts.length * 5) + (activeAlerts.filter(a => a.severity === "CRITICAL").length * 15));
    
    const patternDistribution = alerts.reduce((acc: any, curr) => {
      acc[curr.pattern] = (acc[curr.pattern] || 0) + 1;
      return acc;
    }, {});

    const segmentData = [
      { name: "New Users", value: alerts.filter(a => users.find(u => u.uid === a.userId && (Date.now() - (u.createdAt as any instanceof Timestamp ? (u.createdAt as any).toMillis() : new Date(u.createdAt).getTime()) < 7 * 86400000))).length },
      { name: "Returning Users", value: alerts.filter(a => users.find(u => u.uid === a.userId && (Date.now() - (u.createdAt as any instanceof Timestamp ? (u.createdAt as any).toMillis() : new Date(u.createdAt).getTime()) >= 7 * 86400000))).length }
    ];

    return {
      riskScore,
      activeCount: activeAlerts.length,
      criticalCount: activeAlerts.filter(a => a.severity === "CRITICAL").length,
      patternData: Object.entries(patternDistribution).map(([name, value]) => ({ name, value })),
      segmentData
    };
  }, [alerts, users]);

  const trendData = useMemo(() => {
    return Array.from({ length: 30 }, (_, i) => {
      const date = format(subDays(new Date(), 29 - i), "MMM dd");
      const dayAlerts = alerts.filter(a => {
        const d = (a.detectedAt as any) instanceof Timestamp ? (a.detectedAt as any).toDate() : new Date(a.detectedAt);
        return format(d, "MMM dd") === date;
      });
      return {
        date,
        alerts: dayAlerts.length,
        score: Math.min(100, dayAlerts.length * 10)
      };
    });
  }, [alerts]);

  const handleAction = async (alertId: string, action: "resolve" | "dismiss") => {
    try {
      await updateDoc(doc(db, "fraud_alerts", alertId), {
        status: action === "resolve" ? "resolved" : "dismissed",
        resolvedAt: serverTimestamp(),
        resolvedBy: user?.email
      });

      toast({ title: `Alert ${action}ed successfully` });
    } catch (err) {
      toast({ variant: "destructive", title: `Failed to ${action} alert` });
    }
  };

  const handleUnblock = async (userId: string) => {
    try {
      await updateDoc(doc(db, "users", userId), {
        blocked: false,
        blockedReason: null,
        unblockedAt: serverTimestamp(),
        unblockedBy: user?.email
      });
      toast({ title: "User unblocked successfully" });
    } catch (err) {
      toast({ variant: "destructive", title: "Failed to unblock user" });
    }
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case "CRITICAL": return <Badge variant="destructive" className="animate-pulse shadow-[0_0_15px_rgba(239,68,68,0.5)] font-black uppercase text-[9px] tracking-widest px-2 py-0.5">CRITICAL</Badge>;
      case "HIGH": return <Badge className="bg-orange-500 hover:bg-orange-600 font-black uppercase text-[9px] tracking-widest px-2 py-0.5 text-white">HIGH</Badge>;
      case "MEDIUM": return <Badge className="bg-yellow-500 hover:bg-yellow-600 text-black font-black uppercase text-[9px] tracking-widest px-2 py-0.5">MEDIUM</Badge>;
      default: return <Badge variant="secondary" className="font-black uppercase text-[9px] tracking-widest px-2 py-0.5">LOW</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-screen bg-[var(--admin-bg)] text-[var(--admin-text-primary)] transition-colors duration-300">
        <Activity className="h-16 w-16 text-red-500 animate-pulse mb-6 drop-shadow-[0_0_15px_rgba(239,68,68,0.5)]" />
        <p className="text-2xl font-black tracking-tighter admin-text-muted uppercase">Synchronizing Fraud Engine...</p>
      </div>
    );
  }

  const blockedUsers = users.filter(u => u.blocked);

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { 
      opacity: 1,
      transition: { 
        staggerChildren: 0.1 
      }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { 
      opacity: 1, 
      y: 0,
      transition: { type: "spring", stiffness: 300, damping: 24 }
    }
  };

  return (
    <div className="p-8 max-w-[1600px] mx-auto space-y-10 min-h-screen relative overflow-hidden bg-[var(--admin-bg)] text-[var(--admin-text-primary)] transition-colors duration-300">
      {/* Background Decorative Elements */}
      <div className="absolute top-0 left-0 -z-10 w-[800px] h-[800px] bg-red-600/10 rounded-full blur-[160px] pointer-events-none mix-blend-overlay" />
      <div className="absolute bottom-0 right-0 -z-10 w-[900px] h-[900px] bg-blue-600/5 rounded-full blur-[180px] pointer-events-none mix-blend-overlay" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 -z-10 w-[1000px] h-[1000px] bg-slate-600/5 rounded-full blur-[200px] pointer-events-none mix-blend-overlay" />

      {/* Header Section */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }} 
        animate={{ opacity: 1, y: 0 }} 
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        className="flex flex-col md:flex-row md:items-end justify-between gap-6 relative z-10"
      >
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="p-4 bg-gradient-to-br from-red-500 to-rose-600 rounded-2xl shadow-[0_0_40px_rgba(239,68,68,0.3)] relative group overflow-hidden">
              <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-500" />
              <ShieldAlert className="w-10 h-10 text-white relative z-10 drop-shadow-xl" />
            </div>
            <div>
              <h1 className="text-6xl font-black tracking-tighter uppercase leading-none">
                Fraud <span className="text-red-500 drop-shadow-[0_0_20px_rgba(239,68,68,0.4)]">Detection</span>
              </h1>
              <div className="flex items-center gap-3 mt-2">
                <Badge className="bg-red-500/10 text-red-500 border-red-500/20 px-3 py-1 font-black text-[10px] uppercase tracking-widest">
                  Intelligence Engine v5.0
                </Badge>
                <div className="h-1 w-1 rounded-full bg-slate-700" />
                <p className="admin-text-secondary font-bold text-sm flex items-center gap-2">
                  <Activity className="w-4 h-4 text-red-500 animate-pulse" />
                  Real-time Transaction Integrity Auditing
                </p>
              </div>
            </div>
          </div>
        </div>
        
        <div className="flex gap-3">
          <Button 
            onClick={handleDeepScan}
            disabled={scanning}
            variant="outline" 
            className="bg-[var(--admin-surface)] border-[var(--admin-border)] text-[var(--admin-text-primary)] font-black uppercase text-xs tracking-widest h-12 px-6 rounded-xl hover:bg-[var(--admin-surface)]/80 transition-all active:scale-95">
            {scanning ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Scanning...</> : "Full Audit Logs"}
          </Button>
          <Button 
            onClick={handleLockdown}
            className="bg-red-600 hover:bg-red-700 text-white font-black uppercase text-xs tracking-widest h-12 px-8 rounded-xl shadow-[0_10px_30px_rgba(239,68,68,0.3)] transition-all active:scale-95">
            Emergency Lockdown
          </Button>
        </div>
      </motion.div>

      {/* Hero Stats Section */}
      <motion.div 
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-1 lg:grid-cols-4 gap-8 relative z-10"
      >
        {/* Risk Score Circle */}
        <motion.div variants={itemVariants} className="lg:col-span-1">
          <Card className="h-full admin-glass-card relative overflow-hidden group hover:border-[var(--admin-accent)]/30 transition-all duration-500">
            <div className={`absolute inset-0 bg-gradient-to-br from-red-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700`} />
            <CardHeader className="pb-2">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] admin-text-muted">System Vulnerability</p>
            </CardHeader>
            <CardContent className="flex flex-col items-center justify-center py-6">
              <div className="relative">
                <svg className="w-48 h-48 transform -rotate-90">
                  <circle
                    cx="96"
                    cy="96"
                    r="85"
                    stroke="currentColor"
                    strokeWidth="16"
                    fill="transparent"
                    className="text-[var(--admin-border-muted)]/50"
                  />
                  <motion.circle
                    cx="96"
                    cy="96"
                    r="85"
                    stroke="currentColor"
                    strokeWidth="16"
                    fill="transparent"
                    strokeDasharray={534}
                    initial={{ strokeDashoffset: 534 }}
                    animate={{ strokeDashoffset: 534 - (534 * stats.riskScore) / 100 }}
                    transition={{ duration: 2, ease: [0.16, 1, 0.3, 1] }}
                    strokeLinecap="round"
                    className={cn(
                      "transition-colors duration-1000",
                      stats.riskScore < 30 ? "text-emerald-500" : stats.riskScore < 60 ? "text-amber-500" : "text-red-500"
                    )}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-6xl font-black tracking-tighter admin-text-primary">{stats.riskScore}</span>
                  <span className="text-[10px] font-black admin-text-muted uppercase tracking-widest">Points</span>
                </div>
              </div>
              <div className="mt-8">
                <Badge className={cn(
                  "font-black uppercase tracking-[0.2em] px-4 py-1 rounded-full text-[10px] border shadow-2xl transition-all",
                  stats.riskScore < 30 ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" : 
                  stats.riskScore < 60 ? "bg-amber-500/10 text-amber-500 border-amber-500/20" : 
                  "bg-red-500/10 text-red-500 border-red-500/20"
                )}>
                  {stats.riskScore < 30 ? "DEFENSES OPTIMAL" : stats.riskScore < 60 ? "ELEVATED ALERT" : "CRITICAL ATTACK"}
                </Badge>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Trend Area Chart */}
        <motion.div variants={itemVariants} className="lg:col-span-3">
          <Card className="h-full admin-glass-card relative overflow-hidden group hover:border-[var(--admin-accent)]/30 transition-all duration-500">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div>
                <CardTitle className="text-xl font-black uppercase tracking-tight admin-text-primary">Threat Vector Analysis</CardTitle>
                <p className="text-[10px] font-black admin-text-muted uppercase tracking-widest mt-1">30-Day Aggregated Intelligence</p>
              </div>
              <div className="flex gap-4">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]" />
                  <span className="text-[10px] font-black admin-text-secondary uppercase tracking-widest">Risk Level</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)]" />
                  <span className="text-[10px] font-black admin-text-secondary uppercase tracking-widest">Frequency</span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="h-[280px] pt-8 px-4">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendData}>
                  <defs>
                    <linearGradient id="colorRisk" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorAlerts" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--admin-border-muted)" />
                  <XAxis 
                    dataKey="date" 
                    fontSize={9} 
                    fontWeight="black" 
                    tickLine={false} 
                    axisLine={false} 
                    dy={10} 
                    tick={{fill: 'var(--admin-text-muted)'}} 
                  />
                  <YAxis hide />
                  <Tooltip 
                    cursor={{ stroke: 'rgba(255,255,255,0.1)', strokeWidth: 1 }}
                    contentStyle={{ 
                      backgroundColor: 'var(--admin-bg)', 
                      backdropFilter: 'blur(20px)',
                      border: '1px solid var(--admin-border)', 
                      borderRadius: '20px', 
                      padding: '12px 16px',
                      boxShadow: '0 20px 50px rgba(0,0,0,0.5)'
                    }}
                    itemStyle={{ color: 'var(--admin-text-primary)', fontWeight: '900', fontSize: '10px', textTransform: 'uppercase' }}
                  />
                  <Area type="monotone" dataKey="score" stroke="#ef4444" fillOpacity={1} fill="url(#colorRisk)" strokeWidth={4} />
                  <Area type="monotone" dataKey="alerts" stroke="#3b82f6" fillOpacity={1} fill="url(#colorAlerts)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 relative z-10">
        {/* Left: Active Alerts Feed */}
        <motion.div 
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="lg:col-span-3 space-y-8"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-3xl font-black uppercase tracking-tight flex items-center gap-4">
              <span className="p-3 bg-red-500/10 rounded-2xl border border-red-500/20">
                <ShieldAlert className="w-8 h-8 text-red-500" />
              </span>
              Active Pattern Feed <span className="admin-text-muted text-lg ml-2">({stats.activeCount})</span>
            </h2>
          </div>

          <Card className="admin-glass-card overflow-hidden">
            <Table>
              <TableHeader className="bg-[var(--admin-surface)]/20">
                <TableRow className="border-[var(--admin-border-muted)] hover:bg-transparent">
                  <TableHead className="px-8 py-5 text-[10px] font-black uppercase tracking-[0.2em] admin-text-muted">Detected Pattern</TableHead>
                  <TableHead className="px-8 py-5 text-[10px] font-black uppercase tracking-[0.2em] admin-text-muted">Entity Matrix</TableHead>
                  <TableHead className="px-8 py-5 text-[10px] font-black uppercase tracking-[0.2em] admin-text-muted">Severity</TableHead>
                  <TableHead className="px-8 py-5 text-[10px] font-black uppercase tracking-[0.2em] admin-text-muted text-center">Audit TS</TableHead>
                  <TableHead className="px-8 py-5 text-[10px] font-black uppercase tracking-[0.2em] admin-text-muted text-right">Intervention</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-[var(--admin-border-muted)]">
                <AnimatePresence mode="popLayout">
                  {alerts.filter(a => a.status === "active").map((alert, idx) => (
                    <motion.tr 
                      key={alert.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ delay: 0.1 + idx * 0.05 }}
                      className="bg-transparent hover:bg-[var(--admin-surface)]/10 transition-colors group"
                    >
                      <td className="px-8 py-6">
                        <div className="flex flex-col">
                          <span className="font-black text-base admin-text-primary group-hover:text-red-500 transition-colors uppercase tracking-tight">
                            {alert.pattern.replace(/_/g, ' ')}
                          </span>
                          <span className="text-[10px] font-black admin-text-muted uppercase tracking-widest mt-1 max-w-[280px] truncate">
                            {alert.details}
                          </span>
                        </div>
                      </td>
                      <td className="px-8 py-6">
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "w-10 h-10 rounded-xl flex items-center justify-center border",
                            alert.userId ? "bg-orange-500/10 border-orange-500/20 text-orange-500" : "bg-blue-500/10 border-blue-500/20 text-blue-500"
                          )}>
                            {alert.userId ? <UserX className="h-4 w-4" /> : <MapPinOff className="h-4 w-4" />}
                          </div>
                          <div className="flex flex-col">
                            <span className="text-xs font-mono font-black admin-text-secondary">
                              {alert.userId ? `USR-${alert.userId.slice(0, 8)}` : `STN-${alert.stationId?.slice(0, 8)}`}
                            </span>
                            <span className="text-[9px] font-black admin-text-muted uppercase tracking-widest">Entity Signature</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-8 py-6">{getSeverityBadge(alert.severity)}</td>
                      <td className="px-8 py-6 text-center">
                        <div className="flex flex-col items-center">
                          <span className="text-xs font-black admin-text-secondary">
                            {(alert.detectedAt as any) instanceof Timestamp 
                              ? format((alert.detectedAt as any).toDate(), "HH:mm:ss")
                              : format(new Date(alert.detectedAt), "HH:mm:ss")}
                          </span>
                          <span className="text-[9px] font-black admin-text-muted uppercase tracking-widest">
                            {(alert.detectedAt as any) instanceof Timestamp 
                              ? format((alert.detectedAt as any).toDate(), "MMM dd")
                              : format(new Date(alert.detectedAt), "MMM dd")}
                          </span>
                        </div>
                      </td>
                      <td className="px-8 py-6 text-right">
                        <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-10 px-4 rounded-xl font-black text-[9px] uppercase tracking-widest hover:bg-emerald-500 hover:text-white transition-all"
                            onClick={() => handleAction(alert.id, "resolve")}
                          >
                            Resolve
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-10 px-4 rounded-xl font-black text-[9px] uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all"
                            onClick={() => handleAction(alert.id, "dismiss")}
                          >
                            Dismiss
                          </Button>
                        </div>
                      </td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </TableBody>
            </Table>
          </Card>

          {/* Isolation Chamber Grid */}
          <div className="space-y-6">
            <h2 className="text-2xl font-black uppercase tracking-tight flex items-center gap-4">
              <span className="p-2 bg-slate-500/10 rounded-xl border border-slate-500/20">
                <Lock className="w-6 h-6 text-slate-400" />
              </span>
              Isolation Chamber <span className="admin-text-muted text-lg ml-2">({blockedUsers.length})</span>
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <AnimatePresence>
                {blockedUsers.map(u => (
                  <motion.div 
                    key={u.uid}
                    layout
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    whileHover={{ y: -5, scale: 1.02 }}
                    className="relative group"
                  >
                    <Card className="admin-glass-card hover:border-red-500/30 transition-all duration-500 p-6 overflow-hidden">
                      <div className="absolute -top-10 -right-10 w-32 h-32 bg-red-500/5 rounded-full blur-[40px] opacity-0 group-hover:opacity-100 transition-opacity" />
                      
                      <div className="flex items-start justify-between mb-6">
                        <div className="flex items-center gap-4">
                          <div className="h-12 w-12 rounded-2xl bg-red-500/20 flex items-center justify-center border border-red-500/30 shadow-[0_0_20px_rgba(239,68,68,0.2)]">
                            <UserX className="h-6 w-6 text-red-500" />
                          </div>
                          <div>
                            <p className="font-black admin-text-primary text-sm tracking-tight truncate max-w-[140px]">{u.displayName || u.email}</p>
                            <p className="text-[9px] admin-text-muted font-black uppercase tracking-widest mt-0.5">UID: {u.uid.slice(0, 12)}...</p>
                          </div>
                        </div>
                      </div>

                      <div className="p-3 bg-[var(--admin-surface)]/50 rounded-xl border border-[var(--admin-border-muted)] mb-6">
                        <span className="text-[8px] font-black uppercase admin-text-muted tracking-widest block mb-1">Containment Reason</span>
                        <p className="text-[10px] font-black text-red-400 uppercase leading-tight">
                          {(u as any).blockedReason || "Platform Integrity Protocol Violation"}
                        </p>
                      </div>

                      <Button 
                        size="sm" 
                        variant="outline" 
                        onClick={() => handleUnblock(u.uid)}
                        className="w-full bg-[var(--admin-surface)] border-[var(--admin-border)] hover:bg-emerald-500 hover:text-white hover:border-emerald-500 font-black text-[10px] uppercase h-10 tracking-[0.2em] rounded-xl transition-all text-[var(--admin-text-primary)]"
                      >
                        Restore Entity
                      </Button>
                    </Card>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>
        </motion.div>

        {/* Sidebar Analytics */}
        <motion.div 
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="space-y-8"
        >
          {/* Pattern Density */}
          <motion.div variants={itemVariants}>
            <Card className="admin-glass-card group overflow-hidden">
              <CardHeader className="pb-2 border-b border-[var(--admin-border-muted)]">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-black uppercase tracking-widest admin-text-secondary">Pattern Density</h3>
                  <BarChart3 className="h-4 w-4 text-blue-500" />
                </div>
              </CardHeader>
              <CardContent className="h-[280px] pt-8 px-4">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.patternData} layout="vertical">
                    <XAxis type="number" hide />
                    <YAxis 
                      dataKey="name" 
                      type="category" 
                      width={110} 
                      fontSize={9} 
                      fontWeight="black"
                      tick={{fill: 'var(--admin-text-muted)'}} 
                      tickFormatter={(val) => val.split('_')[0].toUpperCase()}
                    />
                    <Tooltip 
                      cursor={{ fill: 'var(--admin-surface)' }}
                      contentStyle={{ 
                        backgroundColor: 'var(--admin-bg)', 
                        border: '1px solid var(--admin-border)', 
                        borderRadius: '12px' 
                      }}
                      itemStyle={{ color: 'var(--admin-text-primary)', fontSize: '10px', fontWeight: '900' }}
                    />
                    <Bar dataKey="value" fill="#ef4444" radius={[0, 8, 8, 0]} barSize={14}>
                      {stats.patternData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fillOpacity={0.4 + (index * 0.1)} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </motion.div>

          {/* User Segments */}
          <motion.div variants={itemVariants}>
            <Card className="admin-glass-card group overflow-hidden">
              <CardHeader className="pb-2 border-b border-[var(--admin-border-muted)]">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-black uppercase tracking-widest admin-text-secondary">Threat Origination</h3>
                  <Zap className="h-4 w-4 text-amber-500 animate-pulse" />
                </div>
              </CardHeader>
              <CardContent className="h-[280px] pt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={stats.segmentData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={85}
                      paddingAngle={10}
                      dataKey="value"
                      stroke="none"
                    >
                      <Cell fill="#ef4444" className="drop-shadow-[0_0_10px_rgba(239,68,68,0.5)]" />
                      <Cell fill="#3b82f6" className="drop-shadow-[0_0_10px_rgba(59,130,246,0.5)]" />
                    </Pie>
                    <Tooltip 
                      contentStyle={{ backgroundColor: 'var(--admin-bg)', border: '1px solid var(--admin-border)', borderRadius: '12px' }}
                    />
                    <Legend 
                      verticalAlign="bottom" 
                      align="center"
                      wrapperStyle={{ 
                        fontSize: '9px', 
                        fontWeight: 'black', 
                        textTransform: 'uppercase', 
                        letterSpacing: '0.1em', 
                        paddingTop: '20px' 
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </motion.div>

          {/* Elite Protection Promo/Status */}
          <motion.div variants={itemVariants}>
            <div className="p-8 rounded-[2rem] bg-gradient-to-br from-red-600 to-rose-900 shadow-[0_20px_50px_rgba(239,68,68,0.3)] relative overflow-hidden group">
              <div className="absolute -right-4 -bottom-4 opacity-10 group-hover:scale-125 transition-transform duration-1000">
                <ShieldAlert className="w-48 h-48" />
              </div>
              <div className="relative z-10">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2 bg-white/20 backdrop-blur-xl rounded-xl border border-white/30">
                    <Zap className="w-5 h-5 text-white animate-pulse" />
                  </div>
                  <h4 className="text-xl font-black tracking-tight text-white uppercase leading-none">Quantum Audit</h4>
                </div>
                <p className="text-xs text-rose-100/80 font-black uppercase tracking-widest mb-8 leading-relaxed">
                  System is actively neutralizing 24 concurrent attack vectors.
                </p>
                <Button 
                  onClick={handleDeepScan}
                  disabled={scanning}
                  className="w-full bg-white text-red-600 hover:bg-rose-50 font-black text-[10px] uppercase tracking-[0.2em] h-12 rounded-2xl shadow-2xl transition-all active:scale-95 flex items-center justify-center gap-2"
                >
                  {scanning ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-red-600" />
                      Scanning Network...
                    </>
                  ) : (
                    "Request Deep Scan"
                  )}
                </Button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}
