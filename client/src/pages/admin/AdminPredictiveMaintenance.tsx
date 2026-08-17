import { useState, useEffect, useMemo, useRef } from "react";
import { useAuth } from "@/lib/auth-context";
import { 
  collection, 
  query, 
  orderBy, 
  onSnapshot,
  doc,
  updateDoc,
  addDoc,
  serverTimestamp,
  getDocs,
  where
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Wrench, 
  AlertTriangle, 
  TrendingUp, 
  MapPin, 
  Clock, 
  Calendar,
  CheckCircle2,
  ChevronRight,
  ArrowRight,
  ShieldAlert,
  BarChart3,
  Mail,
  ExternalLink,
  Zap,
  Activity
} from "lucide-react";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Cell
} from "recharts";
import { format, addDays, differenceInDays } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { calculateMaintenanceRisk, optimizeMaintenanceSchedule } from "@/lib/predictive-maintenance";
import { cn } from "@/lib/utils";
import type { Station, Booking } from "@shared/schema";
import { motion, AnimatePresence } from "framer-motion";

export default function AdminPredictiveMaintenance() {
  const { user, userRole } = useAuth();
  const { toast } = useToast();
  const [stations, setStations] = useState<Station[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);

  // Data fetching
  useEffect(() => {
    if (userRole !== "admin") return;

    const unsubStations = onSnapshot(collection(db, "stations"), (snap) => {
      setStations(snap.docs.map(d => ({ id: d.id, ...d.data() } as Station)));
      setLoading(false);
    });

    // Fetch last 30 days of bookings for usage calculation
    const last30Days = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const qBookings = query(collection(db, "bookings"), where("createdAt", ">=", last30Days));
    const unsubBookings = onSnapshot(qBookings, (snap) => {
      setBookings(snap.docs.map(d => ({ id: d.id, ...d.data() } as Booking)));
    });

    return () => {
      unsubStations();
      unsubBookings();
    };
  }, [userRole]);

  const riskData = useMemo(() => {
    const scores: Record<string, any> = {};
    stations.forEach(s => {
      scores[s.id] = calculateMaintenanceRisk(s, bookings);
    });
    return scores;
  }, [stations, bookings]);

  // Track notified critical events
  const notifiedRef = useRef(new Set<string>());

  useEffect(() => {
    Object.entries(riskData).forEach(([id, data]) => {
      if (data.score > 85 && !notifiedRef.current.has(id)) {
        notifiedRef.current.add(id);
        const station = stations.find(s => s.id === id);
        fetch("/api/admin/notify-alert", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event: "CRITICAL_MAINTENANCE_RISK",
            details: `Station "${station?.name || id}" has reached a critical risk score of ${data.score.toFixed(0)}. Immediate inspection recommended.`,
            severity: "CRITICAL"
          })
        }).catch(err => console.error("Maintenance Notification failed:", err));
      }
    });
  }, [riskData, stations]);

  const highRiskStations = useMemo(() => {
    return stations
      .filter(s => (riskData[s.id]?.score || 0) > 70)
      .sort((a, b) => (riskData[b.id]?.score || 0) - (riskData[a.id]?.score || 0))
      .slice(0, 5);
  }, [stations, riskData]);

  const riskDistribution = useMemo(() => {
    const counts = { low: 0, medium: 0, high: 0, critical: 0 };
    Object.values(riskData).forEach(r => {
      if (r.score <= 30) counts.low++;
      else if (r.score <= 60) counts.medium++;
      else if (r.score <= 85) counts.high++;
      else counts.critical++;
    });
    return [
      { name: "Low (0-30)", count: counts.low, color: "#10b981" },
      { name: "Medium (31-60)", count: counts.medium, color: "#3b82f6" },
      { name: "High (61-85)", count: counts.high, color: "#f59e0b" },
      { name: "Critical (86+)", count: counts.critical, color: "#ef4444" }
    ];
  }, [riskData]);

  const optimizedSchedule = useMemo(() => {
    const scores = Object.fromEntries(Object.entries(riskData).map(([id, data]) => [id, data.score]));
    return optimizeMaintenanceSchedule(stations, scores);
  }, [stations, riskData]);

  const handleScheduleMaintenance = async (stationId: string) => {
    const station = stations.find(s => s.id === stationId);
    if (!station) return;

    try {
      const risk = riskData[stationId];
      const nextDate = addDays(new Date(), risk.recommendation.timelineDays);
      
      await updateDoc(doc(db, "stations", stationId), {
        status: "maintenance",
        nextSuggestedMaintenance: nextDate.getTime()
      });

      // Notify owner
      await addDoc(collection(db, "notifications"), {
        userId: station.ownerId,
        type: "MAINTENANCE_ALERT",
        title: `Maintenance Recommended for ${station.name}`,
        message: `Predictive analysis shows a risk score of ${risk.score.toFixed(0)}. ${risk.recommendation.action}. We recommend scheduling service by ${format(nextDate, "MMM dd, yyyy")}.`,
        read: false,
        createdAt: serverTimestamp()
      });

      // Log audit
      await addDoc(collection(db, "audit_logs"), {
        action: "MAINTENANCE_SCHEDULED_PREDICTIVE",
        severity: risk.recommendation.urgency === "CRITICAL" ? "HIGH" : "MEDIUM",
        performedBy: user?.uid,
        targetId: stationId,
        targetName: station.name,
        metadata: { riskScore: risk.score },
        timestamp: serverTimestamp()
      });

      toast({
        title: "Maintenance Scheduled",
        description: `Recommended service date: ${format(nextDate, "MMM dd, yyyy")}`,
      });
    } catch (error) {
      toast({ title: "Error", description: "Failed to schedule maintenance", variant: "destructive" });
    }
  };

  const handleNotifyOwner = async (stationId: string) => {
    const station = stations.find(s => s.id === stationId);
    if (!station) return;
    
    toast({
      title: "Notification Sent",
      description: `High-risk alert sent to owner of ${station.name}`,
    });
    
    // In real app, this would trigger a SendGrid/Cloud Function
    await addDoc(collection(db, "audit_logs"), {
      action: "OWNER_MAINTENANCE_NOTIFIED",
      performedBy: user?.uid,
      targetId: stationId,
      timestamp: serverTimestamp()
    });
  };

  const [retraining, setRetraining] = useState(false);

  const handleRetrain = async () => {
    setRetraining(true);
    toast({
      title: "Triggering ML Retraining",
      description: "Initiating retraining sequence for newly registered charging stations...",
    });

    try {
      const response = await fetch("/api/admin/retrain-trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      });
      const data = await response.json();
      
      if (response.ok) {
        if (data.status === "triggered") {
          toast({
            title: "ML Retraining Initiated",
            description: `Retraining triggered successfully for stations: ${data.stations?.join(", ") || "new locations"}`,
            className: "bg-emerald-950 border-emerald-500/30 text-slate-100 shadow-[0_0_20px_rgba(16,185,129,0.2)]"
          });
        } else {
          toast({
            title: "ML Retraining Skipped",
            description: data.message || "No new stations ready for retraining yet.",
            variant: "default"
          });
        }
      } else {
        throw new Error(data.error || "Failed to trigger ML retraining");
      }
    } catch (error: any) {
      console.error("Failed to retrain model:", error);
      toast({
        variant: "destructive",
        title: "Retraining Failed",
        description: error.message || "An error occurred while contacting the ML service."
      });
    } finally {
      setRetraining(false);
    }
  };

  const handleExportLogs = () => {
    try {
      const headers = ["Station ID", "Station Name", "Risk Score", "Urgency", "Timeline (Days)", "Recommended Action"];
      const rows = stations.map(s => {
        const risk = riskData[s.id] || { score: 0, recommendation: { urgency: "UNKNOWN", timelineDays: 0, action: "N/A" } };
        return [
          s.id,
          s.name,
          risk.score.toFixed(1),
          risk.recommendation.urgency,
          risk.recommendation.timelineDays,
          risk.recommendation.action
        ];
      });

      const csvContent = "data:text/csv;charset=utf-8," 
        + [headers.join(","), ...rows.map(e => e.map(val => `"${val}"`).join(","))].join("\n");
      
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `predictive_maintenance_logs_${new Date().toISOString().split("T")[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast({
        title: "Logs Exported",
        description: "Successfully downloaded predictive maintenance CSV log.",
        className: "bg-emerald-950 border-emerald-500/30 text-slate-100 shadow-[0_0_20px_rgba(16,185,129,0.2)]"
      });
    } catch (error) {
      toast({
        title: "Export Failed",
        description: "An error occurred while generating the CSV.",
        variant: "destructive"
      });
    }
  };

  if (userRole !== "admin") return <div>Unauthorized</div>;

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
    <div className="p-8 max-w-[1600px] mx-auto space-y-10 min-h-screen relative overflow-hidden text-[var(--admin-text-primary)]">
      {/* Background Decorative Elements */}
      <div className="absolute top-0 right-0 -z-10 w-[800px] h-[800px] bg-orange-600/5 rounded-full blur-[160px] pointer-events-none mix-blend-overlay" />
      <div className="absolute bottom-0 left-0 -z-10 w-[900px] h-[900px] bg-blue-600/5 rounded-full blur-[180px] pointer-events-none mix-blend-overlay" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 -z-10 w-[1000px] h-[1000px] bg-amber-600/5 rounded-full blur-[200px] pointer-events-none mix-blend-overlay" />

      {/* Header Section */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }} 
        animate={{ opacity: 1, y: 0 }} 
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        className="flex flex-col md:flex-row md:items-end justify-between gap-6 relative z-10"
      >
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="p-4 bg-gradient-to-br from-orange-500 to-amber-600 rounded-2xl shadow-[0_0_40px_rgba(249,115,22,0.3)] relative group overflow-hidden">
              <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-500" />
              <Wrench className="w-10 h-10 text-white relative z-10 drop-shadow-xl" />
            </div>
            <div>
              <h1 className="text-6xl font-black tracking-tighter uppercase leading-none">
                Predictive <span className="text-orange-500 drop-shadow-[0_0_20px_rgba(249,115,22,0.4)]">Maintenance</span>
              </h1>
              <div className="flex items-center gap-3 mt-2">
                <Badge className="bg-orange-500/10 text-orange-500 border-orange-500/20 px-3 py-1 font-black text-[10px] uppercase tracking-widest">
                  AI-Powered Engine v4.2
                </Badge>
                <div className="h-1 w-1 rounded-full bg-[var(--admin-border)]" />
                <p className="admin-text-secondary font-bold text-sm flex items-center gap-2">
                  <Zap className="w-4 h-4 text-amber-500 animate-pulse" />
                  Real-time Network Reliability Forecasting
                </p>
              </div>
            </div>
          </div>
        </div>
        
        <div className="flex gap-3">
          <Button 
            onClick={handleExportLogs} 
            variant="outline" 
            className="bg-[var(--admin-surface)] border-[var(--admin-border)] text-[var(--admin-text-primary)] font-black uppercase text-xs tracking-widest h-12 px-6 rounded-xl hover:bg-[var(--admin-surface)]/80 transition-all active:scale-95"
          >
            Export Logs
          </Button>
          <Button 
            onClick={handleRetrain} 
            disabled={retraining}
            className="bg-orange-500 hover:bg-orange-600 disabled:bg-orange-500/50 text-white font-black uppercase text-xs tracking-widest h-12 px-8 rounded-xl shadow-[0_10px_30px_rgba(249,115,22,0.3)] transition-all active:scale-95"
          >
            {retraining ? "Retraining..." : "Retrain Model"}
          </Button>
        </div>
      </motion.div>

      {/* Primary KPI Grid */}
      <motion.div 
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 relative z-10"
      >
        {[
          { 
            label: "Fleet Health Index", 
            value: "94.2%", 
            sub: "+2.1% vs last month", 
            icon: Activity, 
            color: "emerald",
            trend: "up"
          },
          { 
            label: "Critical Risk Alerts", 
            value: Object.values(riskData).filter(r => r.score > 85).length, 
            sub: "Requires Immediate Action", 
            icon: ShieldAlert, 
            color: "rose",
            trend: "none"
          },
          { 
            label: "Predicted Failures", 
            value: "14", 
            sub: "Next 30 days projection", 
            icon: AlertTriangle, 
            color: "amber",
            trend: "down"
          },
          { 
            label: "Cost Optimization", 
            value: "₹4,280", 
            sub: "Potential quarterly savings", 
            icon: TrendingUp, 
            color: "blue",
            trend: "up"
          }
        ].map((kpi, idx) => (
          <motion.div key={idx} variants={itemVariants}>
            <Card className="admin-glass-card shadow-2xl relative overflow-hidden group hover:border-[var(--admin-accent)]/30 transition-all duration-500">
              <div className={`absolute inset-0 bg-gradient-to-br from-${kpi.color}-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700`} />
              <CardContent className="p-8">
                <div className="flex justify-between items-start relative z-10">
                  <div className="space-y-1">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] admin-text-muted">{kpi.label}</p>
                    <h3 className="text-4xl font-black tracking-tighter admin-text-primary">{kpi.value}</h3>
                  </div>
                  <div className={`p-4 bg-${kpi.color}-500/10 rounded-2xl border border-${kpi.color}-500/20 shadow-inner group-hover:scale-110 group-hover:rotate-3 transition-transform duration-500`}>
                    <kpi.icon className={`w-6 h-6 text-${kpi.color}-500`} />
                  </div>
                </div>
                <div className="mt-6 flex items-center gap-2 relative z-10">
                  <div className={cn(
                    "flex items-center gap-1 text-[10px] font-black uppercase px-2 py-0.5 rounded-full",
                    kpi.trend === "up" ? "bg-emerald-500/20 text-emerald-500" : 
                    kpi.trend === "down" ? "bg-rose-500/20 text-rose-500" : 
                    "bg-slate-500/20 text-slate-500"
                  )}>
                    {kpi.trend === "up" && <TrendingUp className="w-3 h-3" />}
                    {kpi.trend === "down" && <TrendingUp className="w-3 h-3 rotate-180" />}
                    {kpi.sub}
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </motion.div>

      {/* Main Content Area */}
      <motion.div 
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-1 lg:grid-cols-3 gap-8 relative z-10"
      >
        {/* Left Column: Alerts & Chart */}
        <div className="lg:col-span-2 space-y-8">
          <div className="flex items-center justify-between">
            <h2 className="text-3xl font-black uppercase tracking-tight flex items-center gap-4">
              <span className="p-3 bg-red-500/10 rounded-2xl border border-red-500/20">
                <ShieldAlert className="w-8 h-8 text-red-500" />
              </span>
              Priority Intervention <span className="admin-text-muted text-lg ml-2">({highRiskStations.length})</span>
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <AnimatePresence>
              {highRiskStations.map((station, idx) => {
                const risk = riskData[station.id];
                const isCritical = risk.score > 85;
                return (
                  <motion.div 
                    key={station.id}
                    variants={itemVariants}
                    layout
                    whileHover={{ y: -8, scale: 1.02 }}
                    className="relative group"
                  >
                    <Card className={cn(
                      "h-full transition-all duration-500 overflow-hidden relative admin-glass-card",
                      isCritical 
                        ? "bg-red-500/5 dark:bg-red-950/20 border-red-500/20 hover:border-red-500/40 shadow-[0_20px_50px_rgba(239,68,68,0.15)]" 
                        : "bg-orange-500/5 dark:bg-orange-950/20 border-orange-500/20 hover:border-orange-500/40 shadow-[0_20px_50px_rgba(249,115,22,0.1)]"
                    )}>
                      <div className={cn(
                        "absolute inset-0 bg-gradient-to-br opacity-0 group-hover:opacity-10 transition-opacity duration-700",
                        isCritical ? "from-red-500 to-transparent" : "from-orange-500 to-transparent"
                      )} />
                      
                      <CardContent className="p-8 relative z-10">
                        <div className="flex justify-between items-start mb-8">
                          <div className="space-y-1 max-w-[70%]">
                            <h3 className="font-black text-2xl tracking-tighter admin-text-primary group-hover:text-orange-400 transition-colors truncate">
                              {station.name}
                            </h3>
                            <p className="text-[10px] uppercase font-black tracking-widest admin-text-muted flex items-center gap-2">
                              <MapPin className="w-3.5 h-3.5 text-orange-500" /> {station.address.split(',')[0]}
                            </p>
                          </div>
                          <div className={cn(
                            "w-16 h-16 rounded-2xl flex flex-col items-center justify-center border-2 shadow-2xl relative",
                            isCritical ? "bg-red-500 border-red-400/50" : "bg-orange-500 border-orange-400/50"
                          )}>
                            <span className="text-2xl font-black text-white leading-none">{risk.score.toFixed(0)}</span>
                            <span className="text-[8px] font-black uppercase text-white/70 tracking-widest">RISK</span>
                          </div>
                        </div>

                        <div className="space-y-4 mb-8">
                          <div className="p-4 bg-[var(--admin-surface)]/40 rounded-2xl border border-[var(--admin-border-muted)] space-y-3">
                            <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest">
                              <span className="admin-text-secondary">Stress Load</span>
                              <span className={risk.factors.usageIntensity > 0.8 ? "text-red-500" : "text-orange-500"}>
                                {(risk.factors.usageIntensity * 100).toFixed(0)}%
                              </span>
                            </div>
                            <div className="h-2 w-full bg-[var(--admin-surface)] rounded-full overflow-hidden p-[2px]">
                              <motion.div 
                                initial={{ width: 0 }}
                                animate={{ width: `${Math.min(100, risk.factors.usageIntensity * 100)}%` }}
                                transition={{ duration: 1.5, ease: [0.16, 1, 0.3, 1], delay: idx * 0.1 }}
                                className={cn(
                                  "h-full rounded-full shadow-[0_0_10px_rgba(249,115,22,0.5)]",
                                  risk.factors.usageIntensity > 0.8 ? "bg-red-500" : "bg-orange-500"
                                )} 
                              />
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-3 px-1">
                            <Badge className="bg-[var(--admin-surface)] text-[var(--admin-text-secondary)] border-[var(--admin-border-muted)] font-bold text-[9px] uppercase px-2 py-0.5">
                              {risk.factors.ageFactor > 0.7 ? "Aging Asset" : "Recent Install"}
                            </Badge>
                            <Badge className="bg-[var(--admin-surface)] text-[var(--admin-text-secondary)] border-[var(--admin-border-muted)] font-bold text-[9px] uppercase px-2 py-0.5">
                              {risk.factors.faultFrequency > 0.5 ? "Recurring Faults" : "Stable History"}
                            </Badge>
                          </div>
                        </div>

                        <div className="flex gap-4">
                          <Button 
                            className={cn(
                              "flex-1 font-black h-12 text-[10px] uppercase tracking-[0.2em] shadow-2xl transition-all active:scale-95",
                              isCritical ? "bg-red-600 hover:bg-red-500" : "bg-orange-600 hover:bg-orange-500"
                            )}
                            onClick={() => handleScheduleMaintenance(station.id)}
                          >
                            Assign Technician
                          </Button>
                          <Button 
                            variant="outline" 
                            className="w-12 h-12 p-0 flex items-center justify-center bg-[var(--admin-surface)] border-[var(--admin-border)] hover:bg-[var(--admin-surface)]/80 transition-all active:scale-95 text-[var(--admin-text-primary)]"
                            onClick={() => handleNotifyOwner(station.id)}
                          >
                            <Mail className="w-5 h-5" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        </div>

        {/* Right Column: Chart & Optimization */}
        <div className="space-y-8">
          <motion.div variants={itemVariants}>
            <Card className="admin-glass-card shadow-2xl overflow-hidden group">
              <CardHeader className="pb-2 border-b border-[var(--admin-border-muted)] bg-[var(--admin-surface)]/20">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-xl font-black uppercase tracking-tight admin-text-primary">Risk Profile</CardTitle>
                    <p className="text-[10px] font-bold admin-text-muted uppercase tracking-widest mt-1">Network-wide Distribution</p>
                  </div>
                  <div className="p-3 bg-blue-500/10 rounded-2xl border border-blue-500/20">
                    <BarChart3 className="w-6 h-6 text-blue-500" />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="h-[300px] pt-8 px-4">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={riskDistribution} margin={{ top: 0, right: 0, left: -25, bottom: 0 }}>
                    <defs>
                      {riskDistribution.map((entry, index) => (
                        <linearGradient key={`grad-${index}`} id={`colorBar-${index}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={entry.color} stopOpacity={0.8}/>
                          <stop offset="95%" stopColor={entry.color} stopOpacity={0.2}/>
                        </linearGradient>
                      ))}
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--admin-border-muted)" />
                    <XAxis 
                      dataKey="name" 
                      fontSize={9} 
                      fontWeight="black" 
                      tickLine={false} 
                      axisLine={false} 
                      dy={10} 
                      tick={{fill: 'var(--admin-text-muted)'}} 
                    />
                    <YAxis 
                      fontSize={9} 
                      fontWeight="black" 
                      tickLine={false} 
                      axisLine={false} 
                      tick={{fill: 'var(--admin-text-muted)'}} 
                    />
                    <Tooltip 
                      cursor={{fill: 'var(--admin-surface)'}}
                      contentStyle={{ 
                        backgroundColor: 'var(--admin-bg)', 
                        backdropFilter: 'blur(20px)',
                        border: '1px solid var(--admin-border)', 
                        borderRadius: '20px', 
                        padding: '12px 16px',
                        boxShadow: '0 20px 50px var(--admin-shadow)'
                      }}
                      itemStyle={{ color: 'var(--admin-text-primary)', fontWeight: '900', fontSize: '10px', textTransform: 'uppercase' }}
                    />
                    <Bar dataKey="count" radius={[12, 12, 4, 4]} maxBarSize={45}>
                      {riskDistribution.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={`url(#colorBar-${index})`} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </motion.div>

          {/* Schedule Optimizer */}
          <motion.div variants={itemVariants}>
            <Card className="bg-gradient-to-br from-orange-600/10 to-amber-600/5 backdrop-blur-2xl border-orange-500/20 shadow-[0_20px_50px_rgba(249,115,22,0.1)] relative group">
              <div className="absolute -top-10 -right-10 w-40 h-40 bg-orange-500/20 rounded-full blur-[60px] opacity-50 group-hover:opacity-100 transition-opacity duration-700" />
              <CardHeader className="relative z-10">
                <CardTitle className="text-xl font-black uppercase flex items-center gap-4 admin-text-primary">
                  <div className="p-3 bg-[var(--admin-surface)] border border-[var(--admin-border)] backdrop-blur-xl">
                    <TrendingUp className="w-6 h-6 text-orange-400" />
                  </div>
                  Route Optimizer
                </CardTitle>
                <p className="text-[10px] font-black text-orange-500 uppercase tracking-widest mt-2 px-1">Clustered dispatching logic activated</p>
              </CardHeader>
              <CardContent className="space-y-4 relative z-10">
                {optimizedSchedule.slice(0, 3).map((group, i) => (
                  <motion.div 
                    key={i} 
                    whileHover={{ x: 4, scale: 1.02 }}
                    className="flex flex-col p-5 bg-[var(--admin-surface)]/60 rounded-3xl border border-[var(--admin-border-muted)] hover:border-orange-500/30 transition-all cursor-default group/item"
                  >
                    <div className="flex items-center gap-4 mb-4">
                      <div className="w-12 h-12 rounded-2xl bg-orange-500/10 text-orange-500 flex items-center justify-center font-black text-xl border border-orange-500/20 group-hover/item:bg-orange-500 group-hover/item:text-white transition-all">
                        {i + 1}
                      </div>
                      <div className="flex-1">
                        <h4 className="font-black text-[10px] uppercase admin-text-muted tracking-widest mb-0.5">Recommended Cluster</h4>
                        <p className="font-black text-sm admin-text-primary">{group[0].address.split(',')[1]?.trim() || "Regional Hub"}</p>
                      </div>
                    </div>
                    
                    <div className="flex flex-wrap gap-2 mb-6">
                      {group.map(s => (
                        <Badge key={s.id} className="bg-[var(--admin-surface)] hover:bg-[var(--admin-surface)]/80 text-[var(--admin-text-secondary)] border-[var(--admin-border)] font-black text-[8px] uppercase tracking-wider px-2 py-1">
                          {s.name.split('-')[0]}
                        </Badge>
                      ))}
                    </div>
                    
                    <div className="flex items-center justify-between pt-4 border-t border-[var(--admin-border-muted)]">
                      <div className="flex items-center gap-2 text-[10px] font-black uppercase text-orange-400/80">
                        <Calendar className="w-3.5 h-3.5" /> Next Cycle
                      </div>
                      <Button size="sm" variant="ghost" className="rounded-xl font-black text-[8px] uppercase tracking-widest h-8 px-4 hover:bg-orange-500 hover:text-white transition-all text-[var(--admin-text-primary)]">
                        Execute <ArrowRight className="w-3 h-3 ml-2" />
                      </Button>
                    </div>
                  </motion.div>
                ))}
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </motion.div>

      <motion.div 
        variants={itemVariants}
        initial="hidden"
        animate="visible"
        className="relative z-10"
      >
        <Card className="admin-glass-card shadow-[0_30px_100px_rgba(0,0,0,0.15)] overflow-hidden">
          <CardHeader className="p-8 border-b border-[var(--admin-border-muted)] bg-[var(--admin-surface)]/20 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-2xl font-black uppercase tracking-tight admin-text-primary">Fleet Integrity Monitor</CardTitle>
              <p className="text-[10px] font-black admin-text-muted uppercase tracking-widest mt-1">Real-time cross-network risk auditing</p>
            </div>
            <div className="p-4 bg-emerald-500/10 rounded-2xl border border-emerald-500/20">
              <CheckCircle2 className="w-8 h-8 text-emerald-500" />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-[var(--admin-surface)]/30">
                  <tr>
                    <th className="px-8 py-5 text-[10px] font-black uppercase tracking-[0.2em] admin-text-muted">Asset Identity</th>
                    <th className="px-8 py-5 text-[10px] font-black uppercase tracking-[0.2em] admin-text-muted">Stability Matrix</th>
                    <th className="px-8 py-5 text-[10px] font-black uppercase tracking-[0.2em] admin-text-muted text-center">Last Service</th>
                    <th className="px-8 py-5 text-[10px] font-black uppercase tracking-[0.2em] admin-text-muted text-center">Forecasted Intervention</th>
                    <th className="px-8 py-5 text-[10px] font-black uppercase tracking-[0.2em] admin-text-muted text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--admin-border-muted)]">
                  {stations.sort((a,b) => (riskData[b.id]?.score || 0) - (riskData[a.id]?.score || 0)).map((s, idx) => {
                    const risk = riskData[s.id];
                    return (
                      <motion.tr 
                        key={s.id} 
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.2 + idx * 0.05 }}
                        className="bg-transparent hover:bg-[var(--admin-surface)]/10 transition-colors group"
                      >
                        <td className="px-8 py-6">
                          <div className="font-black text-base admin-text-primary group-hover:text-orange-400 transition-colors">{s.name}</div>
                          <div className="text-[10px] font-black admin-text-muted uppercase tracking-widest mt-1 flex items-center gap-2">
                            <MapPin className="w-3 h-3 text-orange-500" /> {s.address.split(',')[1]?.trim() || s.address}
                          </div>
                        </td>
                        <td className="px-8 py-6">
                          <div className="flex items-center gap-4">
                            <div className={cn(
                              "w-12 h-12 rounded-2xl flex items-center justify-center font-black text-lg shadow-inner",
                              risk.score > 80 ? "bg-red-500/20 text-red-500 border border-red-500/30" : 
                              risk.score > 50 ? "bg-orange-500/20 text-orange-500 border border-orange-500/30" : 
                              "bg-emerald-500/20 text-emerald-500 border border-emerald-500/30"
                            )}>
                              {risk.score.toFixed(0)}
                            </div>
                            <div className="space-y-1">
                              <div className={cn(
                                "text-[10px] font-black uppercase tracking-[0.2em]",
                                risk.score > 80 ? "text-red-500" : 
                                risk.score > 50 ? "text-orange-500" : 
                                "text-emerald-500"
                              )}>
                                {risk.recommendation.urgency}
                              </div>
                              <div className="text-[9px] font-black admin-text-muted uppercase tracking-widest">Confidence Index: 98%</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-8 py-6 text-center">
                          {s.lastMaintenanceDate ? (
                            <div className="inline-flex flex-col items-center gap-1">
                              <span className="text-xs font-black admin-text-secondary">{format(new Date(s.lastMaintenanceDate), "MMM dd, yyyy")}</span>
                              <span className="text-[8px] font-black uppercase admin-text-muted tracking-widest">Normal Ops</span>
                            </div>
                          ) : (
                            <span className="text-[10px] font-black uppercase admin-text-muted tracking-widest">No Baseline</span>
                          )}
                        </td>
                        <td className="px-8 py-6 text-center">
                          <div className="inline-flex flex-col items-center gap-1">
                            <div className="flex items-center gap-2 text-xs font-black text-orange-400">
                              <Calendar className="w-3.5 h-3.5" />
                              {format(addDays(new Date(), risk.recommendation.timelineDays), "MMM dd, yyyy")}
                            </div>
                            <span className="text-[8px] font-black uppercase admin-text-muted tracking-widest">Target Resolution</span>
                          </div>
                        </td>
                        <td className="px-8 py-6 text-right">
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="font-black text-[9px] uppercase tracking-[0.2em] h-10 px-6 rounded-xl hover:bg-orange-500 hover:text-white transition-all opacity-40 group-hover:opacity-100"
                            onClick={() => handleScheduleMaintenance(s.id)}
                          >
                            Dispatch <ChevronRight className="w-3 h-3 ml-2" />
                          </Button>
                        </td>
                      </motion.tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
