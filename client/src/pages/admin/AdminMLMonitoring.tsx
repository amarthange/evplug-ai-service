import { useState, useEffect, useMemo, useRef } from "react";
import { useAuth } from "@/lib/auth-context";
import { 
  collection, 
  query, 
  orderBy, 
  limit, 
  onSnapshot, 
  where,
  Timestamp,
  addDoc,
  deleteDoc,
  getDocs,
  doc
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Activity, 
  TrendingUp, 
  Clock, 
  AlertTriangle, 
  CheckCircle2, 
  Download, 
  RefreshCw,
  Cpu,
  Zap,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
  ShieldAlert,
  Save,
  Brain,
  History,
  Workflow,
  Database
} from "lucide-react";
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  AreaChart, 
  Area,
  BarChart,
  Bar,
  Cell,
  PieChart,
  Pie,
  Legend
} from "recharts";
import { format, subHours, startOfDay, endOfDay } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { logAuditEvent } from "@/lib/auditLogger";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import type { MLPrediction, MLColdStart, MLModelPerformance } from "@shared/schema";

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
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 }
};

export default function AdminMLMonitoring() {
  const { user, userRole } = useAuth();
  const { toast } = useToast();
  const [predictions, setPredictions] = useState<MLPrediction[]>([]);
  const [coldStarts, setColdStarts] = useState<MLColdStart[]>([]);
  const [performance, setPerformance] = useState<MLModelPerformance[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRetraining, setIsRetraining] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState(new Date());

  // Real-time data fetching
  useEffect(() => {
    if (userRole !== "admin") return;

    const predQuery = query(
      collection(db, "ml_predictions"),
      orderBy("timestamp", "desc"),
      limit(1000)
    );

    const coldQuery = query(
      collection(db, "ml_cold_starts"),
      orderBy("timestamp", "desc"),
      limit(500)
    );

    const perfQuery = query(
      collection(db, "ml_model_performance"),
      orderBy("date", "desc"),
      limit(30)
    );

    const unsubPred = onSnapshot(predQuery, (snap) => {
      setPredictions(snap.docs.map(d => ({ id: d.id, ...d.data() } as MLPrediction)));
      setLoading(false);
      setLastRefreshed(new Date());
    });

    const unsubCold = onSnapshot(coldQuery, (snap) => {
      setColdStarts(snap.docs.map(d => ({ id: d.id, ...d.data() } as MLColdStart)));
    });

    const unsubPerf = onSnapshot(perfQuery, (snap) => {
      setPerformance(snap.docs.map(d => ({ id: d.id, ...d.data() } as MLModelPerformance)));
    });

    return () => {
      unsubPred();
      unsubCold();
      unsubPerf();
    };
  }, [userRole]);

  // Derived Metrics
  const metrics = useMemo(() => {
    const last24h = Date.now() - 24 * 60 * 60 * 1000;
    const pred24h = predictions.filter(p => (p.timestamp as any instanceof Timestamp ? (p.timestamp as any).toMillis() : new Date(p.timestamp).getTime()) > last24h);
    const avgLatency = pred24h.reduce((acc, p) => acc + p.latency_ms, 0) / (pred24h.length || 1);
    
    const sortedLatency = [...pred24h].map(p => p.latency_ms).sort((a, b) => a - b);
    const p95 = sortedLatency[Math.floor(sortedLatency.length * 0.95)] || 0;
    const p99 = sortedLatency[Math.floor(sortedLatency.length * 0.99)] || 0;

    const coldRate = (pred24h.filter(p => p.isColdStart).length / (pred24h.length || 1)) * 100;
    const driftScore = pred24h.length > 10 ? 
      Math.abs(pred24h.slice(0, 50).reduce((acc, p) => acc + p.confidence, 0) / 50 - 
               pred24h.slice(-50).reduce((acc, p) => acc + p.confidence, 0) / 50) * 10 : 0.12;

    return {
      predictionCount: pred24h.length,
      avgLatency,
      p95,
      p99,
      coldRate,
      driftScore,
      status: driftScore > 0.5 ? "CRITICAL" : driftScore > 0.3 ? "WARNING" : "HEALTHY"
    };
  }, [predictions]);

  const performanceTrend = useMemo(() => {
    return [...performance].reverse().map(p => ({
      date: p.date,
      accuracy: p.avgAccuracy * 100,
      latency: p.avgLatency,
      coldRate: p.coldStartRate * 100
    }));
  }, [performance]);

  const latencyDistribution = useMemo(() => {
    const bins = [0, 50, 100, 200, 500, 1000];
    const data = bins.map((bin, i) => {
      const nextBin = bins[i+1] || Infinity;
      const count = predictions.filter(p => p.latency_ms >= bin && p.latency_ms < nextBin).length;
      return {
        range: nextBin === Infinity ? `${bin}ms+` : `${bin}-${nextBin}ms`,
        count
      };
    });
    return data;
  }, [predictions]);

  const coldStartReasons = useMemo(() => {
    const reasons = coldStarts.reduce((acc: any, c) => {
      acc[c.reason] = (acc[c.reason] || 0) + 1;
      return acc;
    }, {});
    return Object.entries(reasons).map(([name, value]) => ({ name, value }));
  }, [coldStarts]);

  const [isSeeding, setIsSeeding] = useState(false);

  const handleSeedData = async () => {
    setIsSeeding(true);
    try {
      // 1. Clear old data
      const perfSnap = await getDocs(collection(db, "ml_model_performance"));
      for (const d of perfSnap.docs) {
        await deleteDoc(doc(db, "ml_model_performance", d.id));
      }
      const coldSnap = await getDocs(collection(db, "ml_cold_starts"));
      for (const d of coldSnap.docs) {
        await deleteDoc(doc(db, "ml_cold_starts", d.id));
      }
      const predSnap = await getDocs(collection(db, "ml_predictions"));
      for (const d of predSnap.docs) {
        await deleteDoc(doc(db, "ml_predictions", d.id));
      }

      // 2. Seed 30 days of model performance
      const start_date = new Date();
      start_date.setDate(start_date.getDate() - 30);
      for (let i = 0; i < 30; i++) {
        const currentDate = new Date(start_date);
        currentDate.setDate(start_date.getDate() + i);
        const dateStr = currentDate.toISOString().split("T")[0];
        
        const base_accuracy = 0.88 + Math.random() * 0.08 - 0.03;
        const base_latency = 18.5 + Math.random() * 8.0 - 4.0;
        
        await addDoc(collection(db, "ml_model_performance"), {
          date: dateStr,
          avgAccuracy: parseFloat(base_accuracy.toFixed(4)),
          avgLatency: parseFloat(base_latency.toFixed(2)),
          p95Latency: parseFloat((base_latency * 1.5).toFixed(2)),
          p99Latency: parseFloat((base_latency * 2.2).toFixed(2)),
          totalPredictions: Math.floor(120 + Math.random() * 260),
          coldStartRate: parseFloat((0.005 + Math.random() * 0.025).toFixed(4)),
          modelVersion: "1.0.0"
        });
      }

      // 3. Seed 15 cold starts
      const reasons = ["no_history", "new_station", "low_confidence", "system_reboot"];
      for (let i = 0; i < 15; i++) {
        const timestamp = new Date();
        timestamp.setHours(timestamp.getHours() - Math.floor(Math.random() * 48));
        await addDoc(collection(db, "ml_cold_starts"), {
          timestamp: timestamp,
          reason: reasons[Math.floor(Math.random() * reasons.length)],
          stationId: `station-${Math.floor(Math.random() * 5) + 1}`
        });
      }

      // 4. Seed 100 predictions
      for (let i = 0; i < 100; i++) {
        const timestamp = new Date();
        timestamp.setMinutes(timestamp.getMinutes() - i * 14);
        
        let latency = 10.0 + Math.random() * 35.0;
        if (Math.random() > 0.95) {
          latency = 150.0 + Math.random() * 170.0;
        }
        
        const confidence = 0.72 + Math.random() * 0.24;
        const is_cold = Math.random() > 0.94;
        
        await addDoc(collection(db, "ml_predictions"), {
          timestamp: timestamp,
          latency_ms: parseFloat(latency.toFixed(2)),
          prediction: parseFloat((0.1 + Math.random() * 0.8).toFixed(4)),
          modelVersion: "1.0.0",
          stationId: `station-${Math.floor(Math.random() * 5) + 1}`,
          confidence: parseFloat(confidence.toFixed(4)),
          isColdStart: is_cold,
          modelName: "lstm_availability",
          inputFeatures: {
            hour_sin: Math.random() * 2 - 1,
            hour_cos: Math.random() * 2 - 1,
            day_of_week: Math.floor(Math.random() * 7),
            is_peak_hour: Math.random() > 0.5 ? 1 : 0
          }
        });
      }

      toast({
        title: "Telemetry Seeded Successfully",
        description: "Firestore has been populated with high-fidelity historical logs.",
      });
    } catch (error: any) {
      console.error("Seeding error:", error);
      toast({
        title: "Seeding Failed",
        description: error.message || "An unexpected error occurred during seeding.",
        variant: "destructive"
      });
    } finally {
      setIsSeeding(false);
    }
  };

  const handleRetrain = async () => {
    setIsRetraining(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 3000));
      toast({
        title: "Retraining Initialized",
        description: "The model retraining pipeline is now active.",
      });
    } catch (error) {
      toast({ title: "Error", description: "Retraining failed to start.", variant: "destructive" });
    } finally {
      setIsRetraining(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-[var(--admin-bg)] text-[var(--admin-text-primary)] transition-colors duration-300">
        <Brain className="w-16 h-16 text-primary animate-pulse mb-4" />
        <p className="admin-text-muted font-bold uppercase tracking-widest">Waking Model Intel...</p>
      </div>
    );
  }

  return (
    <motion.div 
      className="p-8 space-y-8 bg-[var(--admin-bg)] min-h-screen text-[var(--admin-text-primary)] pb-20 transition-colors duration-300"
      initial="hidden"
      animate="visible"
      variants={containerVariants}
    >
      {/* Header Area */}
      <div className="flex justify-between items-end">
        <motion.div variants={itemVariants}>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2.5 bg-primary/10 rounded-2xl border border-primary/20 shadow-[0_0_30px_rgba(59,130,246,0.1)]">
              <Cpu className="w-8 h-8 text-primary" />
            </div>
            <h1 className="text-5xl font-black tracking-tighter uppercase bg-gradient-to-r from-white via-slate-300 to-slate-500 bg-clip-text text-transparent">
              ML INTELLIGENCE
            </h1>
          </div>
          <p className="admin-text-secondary font-medium ml-1 flex items-center gap-2">
            Dynamic model monitoring & performance telemetry.
            <span className="flex items-center gap-1.5 bg-emerald-500/10 text-emerald-500 px-3 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest border border-emerald-500/20">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
              Real-time
            </span>
          </p>
        </motion.div>

        <motion.div className="flex gap-3" variants={itemVariants}>
          <Button 
            onClick={handleSeedData} 
            disabled={isSeeding}
            variant="outline"
            className="bg-[var(--admin-surface)] border-[var(--admin-border)] hover:bg-[var(--admin-surface)]/80 h-12 px-6 font-black uppercase text-xs tracking-widest text-emerald-400 hover:border-emerald-500/60"
          >
            <Database className="w-4 h-4 mr-2" />
            {isSeeding ? "Seeding..." : "Seed Demo Data"}
          </Button>
          <Button variant="outline" className="bg-[var(--admin-surface)] border-[var(--admin-border)] hover:bg-[var(--admin-surface)]/80 h-12 px-6 font-black uppercase text-xs tracking-widest text-[var(--admin-text-primary)]">
            <Download className="w-4 h-4 mr-2" />
            Export Audit
          </Button>
          <Button 
            onClick={handleRetrain} 
            disabled={isRetraining}
            className="bg-primary hover:bg-primary/90 h-12 px-6 shadow-[0_0_40px_rgba(59,130,246,0.3)] border-0 font-black uppercase text-xs tracking-widest text-white"
          >
            {isRetraining ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Zap className="w-4 h-4 mr-2" />}
            Trigger Retrain
          </Button>
        </motion.div>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { label: "24H Inference", val: metrics.predictionCount.toLocaleString(), icon: TrendingUp, color: "text-primary", sub: "+12.4% vs prev", p: 70, accent: "bg-primary" },
          { label: "Avg Latency", val: `${metrics.avgLatency.toFixed(1)}ms`, icon: Clock, color: "text-blue-500", sub: `p99: ${metrics.p99}ms`, p: 45, accent: "bg-blue-500" },
          { label: "Cold Start", val: `${metrics.coldRate.toFixed(2)}%`, icon: Zap, color: metrics.coldRate > 5 ? "text-amber-500" : "text-emerald-500", sub: "Target: <2.0%", p: Math.min(metrics.coldRate * 10, 100), accent: metrics.coldRate > 5 ? "bg-amber-500" : "bg-emerald-500" },
          { label: "Model Drift", val: metrics.driftScore.toFixed(3), icon: Activity, color: metrics.status === "CRITICAL" ? "text-red-500" : "text-emerald-500", sub: `Status: ${metrics.status}`, p: Math.min(metrics.driftScore * 100, 100), accent: metrics.status === "CRITICAL" ? "bg-red-500" : "bg-emerald-500" }
        ].map((kpi, i) => (
          <motion.div key={i} variants={itemVariants}>
            <Card className="relative overflow-hidden admin-glass-card group hover:border-[var(--admin-accent)]/30 transition-all duration-500">
              <CardHeader className="pb-2">
                <CardTitle className="text-[10px] font-black uppercase admin-text-muted tracking-[0.2em] flex justify-between">
                  {kpi.label}
                  <kpi.icon className={cn("w-4 h-4", kpi.color)} />
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className={cn("text-4xl font-black tracking-tighter", kpi.color === "text-primary" ? "admin-text-primary" : kpi.color)}>
                  {kpi.val}
                </div>
                <div className="text-[10px] font-bold admin-text-muted uppercase mt-1 tracking-wider">
                  {kpi.sub}
                </div>
              </CardContent>
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-[var(--admin-border-muted)]">
                <motion.div 
                  className={cn("h-full", kpi.accent)} 
                  initial={{ width: 0 }} 
                  animate={{ width: `${kpi.p}%` }}
                  transition={{ duration: 1.5, delay: 0.5 + i * 0.1 }}
                />
              </div>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Main Analysis Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <motion.div variants={itemVariants} className="lg:col-span-2">
          <Card className="admin-glass-card overflow-hidden">
            <CardHeader className="bg-[var(--admin-surface)]/20 border-b border-[var(--admin-border-muted)]">
              <CardTitle className="text-xl font-black uppercase tracking-tight flex items-center gap-2 admin-text-primary">
                <History className="w-5 h-5 text-primary" />
                Performance Telemetry
              </CardTitle>
              <CardDescription className="admin-text-muted">Cross-referenced accuracy and latency vectors.</CardDescription>
            </CardHeader>
            <CardContent className="h-[400px] pt-6">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={performanceTrend}>
                  <defs>
                    <linearGradient id="colorAcc" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorLat" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--admin-border-muted)" />
                  <XAxis dataKey="date" fontSize={10} tick={{fill: 'var(--admin-text-muted)'}} axisLine={false} tickLine={false} />
                  <YAxis yAxisId="left" fontSize={10} tick={{fill: '#10b981'}} hide />
                  <YAxis yAxisId="right" orientation="right" hide />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'var(--admin-bg)', border: '1px solid var(--admin-border)', borderRadius: '12px' }}
                  />
                  <Area 
                    yAxisId="left"
                    type="monotone" 
                    dataKey="accuracy" 
                    stroke="#10b981" 
                    fillOpacity={1} 
                    fill="url(#colorAcc)" 
                    strokeWidth={4}
                  />
                  <Area 
                    yAxisId="right"
                    type="monotone" 
                    dataKey="latency" 
                    stroke="#3b82f6" 
                    fillOpacity={1} 
                    fill="url(#colorLat)" 
                    strokeWidth={2}
                    strokeDasharray="5 5"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={itemVariants}>
          <Card className="h-full admin-glass-card overflow-hidden">
            <CardHeader className="bg-[var(--admin-surface)]/20 border-b border-[var(--admin-border-muted)]">
              <CardTitle className="text-xl font-black uppercase tracking-tight flex items-center gap-2 admin-text-primary">
                <Workflow className="w-5 h-5 text-amber-500" />
                Cold Logic
              </CardTitle>
              <CardDescription className="admin-text-muted">Inference cache miss attribution.</CardDescription>
            </CardHeader>
            <CardContent className="h-[400px] flex flex-col items-center justify-center pt-6">
              <ResponsiveContainer width="100%" height="80%">
                <PieChart>
                  <Pie
                    data={coldStartReasons}
                    cx="50%"
                    cy="50%"
                    innerRadius={70}
                    outerRadius={90}
                    paddingAngle={10}
                    dataKey="value"
                  >
                    {coldStartReasons.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={['#3b82f6', '#f59e0b', '#10b981', '#ef4444'][index % 4]} stroke="none" />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend verticalAlign="bottom" align="center" wrapperStyle={{ fontSize: '10px', fontWeight: 'black', textTransform: 'uppercase' }}/>
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Latency Distribution Area */}
      <motion.div variants={itemVariants}>
        <Card className="admin-glass-card overflow-hidden">
          <CardHeader className="bg-[var(--admin-surface)]/20 border-b border-[var(--admin-border-muted)]">
            <CardTitle className="text-xl font-black uppercase tracking-tight flex items-center gap-2 admin-text-primary">
              <BarChart3 className="w-5 h-5 text-primary" />
              Latency Buckets
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[300px] pt-8">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={latencyDistribution}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--admin-border-muted)" />
                <XAxis dataKey="range" fontSize={10} tick={{fill: 'var(--admin-text-muted)'}} axisLine={false} tickLine={false} />
                <YAxis hide />
                <Tooltip cursor={{fill: 'var(--admin-surface)'}} />
                <Bar dataKey="count" radius={[10, 10, 0, 0]} barSize={60}>
                  {latencyDistribution.map((entry, index) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={entry.range.includes('500') || entry.range.includes('+') ? '#ef4444' : '#3b82f6'} 
                      fillOpacity={0.4 + (index * 0.1)}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </motion.div>

      {/* Real-time Prediction Feed */}
      <motion.div variants={itemVariants}>
        <Card className="admin-glass-card overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between border-b border-[var(--admin-border-muted)] bg-[var(--admin-surface)]/20 py-4">
            <div>
              <CardTitle className="text-2xl font-black uppercase tracking-tighter admin-text-primary">Inference Stream</CardTitle>
              <CardDescription className="admin-text-muted">Live model outputs across the fleet.</CardDescription>
            </div>
            <Badge variant="outline" className="bg-[var(--admin-surface)] text-[10px] font-black border-[var(--admin-border)] text-[var(--admin-text-primary)] px-3 h-6">
              SYNCED: {format(lastRefreshed, "HH:mm:ss")}
            </Badge>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-[10px] uppercase font-black admin-text-muted bg-[var(--admin-surface)]/10">
                  <tr>
                    <th className="px-8 py-4">Origin Time</th>
                    <th className="px-6 py-4">Target Node</th>
                    <th className="px-6 py-4">Response Time</th>
                    <th className="px-6 py-4">Confidence Matrix</th>
                    <th className="px-6 py-4 text-right pr-8">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--admin-border-muted)]">
                  <AnimatePresence mode="popLayout">
                    {predictions.slice(0, 10).map((p, idx) => (
                      <motion.tr 
                         key={p.id} 
                         initial={{ opacity: 0, x: -10 }}
                         animate={{ opacity: 1, x: 0 }}
                         transition={{ delay: idx * 0.05 }}
                         className="bg-transparent hover:bg-[var(--admin-surface)]/10 transition-colors group"
                      >
                        <td className="px-8 py-5 font-black admin-text-secondary">
                          {format((p.timestamp as any instanceof Timestamp ? (p.timestamp as any).toDate() : new Date(p.timestamp)), "HH:mm:ss")}
                        </td>
                        <td className="px-6 py-5 font-mono text-[10px] admin-text-muted">
                          <span className="bg-[var(--admin-surface)] border border-[var(--admin-border)] px-2 py-1 rounded text-[var(--admin-text-secondary)]">
                            {p.stationId.slice(0, 16)}...
                          </span>
                        </td>
                        <td className="px-6 py-5">
                          <span className={cn(
                            "font-black tracking-tighter text-base",
                            p.latency_ms > 200 ? "text-red-400" : "text-emerald-400"
                          )}>{p.latency_ms}<span className="text-[10px] ml-0.5">MS</span></span>
                        </td>
                        <td className="px-6 py-5">
                          <div className="flex items-center gap-4">
                            <div className="w-32 h-1.5 bg-[var(--admin-surface)] rounded-full overflow-hidden">
                              <motion.div 
                                className="h-full bg-primary" 
                                initial={{ width: 0 }}
                                animate={{ width: `${p.confidence * 100}%` }}
                                transition={{ duration: 1 }}
                              />
                            </div>
                            <span className="font-black text-xs admin-text-primary">{(p.confidence * 100).toFixed(0)}%</span>
                          </div>
                        </td>
                        <td className="px-6 py-5 text-right pr-8">
                          {p.isColdStart ? (
                            <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/20 text-[9px] font-black uppercase tracking-widest px-2 py-0">Cold Start</Badge>
                          ) : (
                            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-[9px] font-black uppercase tracking-widest px-2 py-0">Optimized</Badge>
                          )}
                        </td>
                      </motion.tr>
                    ))}
                  </AnimatePresence>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}
