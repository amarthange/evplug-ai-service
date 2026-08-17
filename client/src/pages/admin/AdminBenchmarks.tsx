import React, { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import { db } from "@/lib/firebase";
import { collection, onSnapshot, query, orderBy, where, addDoc, deleteDoc, doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { 
  Target, 
  TrendingUp, 
  TrendingDown, 
  AlertTriangle, 
  CheckCircle2, 
  FileText,
  Zap,
  Clock,
  Activity,
  Users,
  CreditCard,
  ArrowRight,
  Info,
  ShieldCheck,
  Star,
  Trash2,
  CheckCheck,
  ListTodo
} from "lucide-react";
import { 
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer,
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { jsPDF } from "jspdf";
import { cn } from "@/lib/utils";

const INDUSTRY_BENCHMARKS = {
  stationUtilization: { excellent: 80, good: 60, average: 40 },
  avgSessionDuration: { excellent: 25, good: 35, average: 45 }, // minutes
  bookingConversion: { excellent: 85, good: 70, average: 55 }, // %
  customerRetention: { excellent: 70, good: 55, average: 40 }, // %
  avgRevenuePerStation: { excellent: 50000, good: 30000, average: 15000 }, // ₹/month
  nps: { excellent: 50, good: 30, average: 0 },
  churnRate: { excellent: 5, good: 10, average: 20 }, // % (lower is better)
  paymentSuccessRate: { excellent: 98, good: 95, average: 90 }, // %
};

const RECOMMENDATIONS = {
  stationUtilization: "Increase marketing in underutilized areas. Consider dynamic pricing.",
  avgSessionDuration: "Optimize charger power output. Reduce wait times with better scheduling.",
  bookingConversion: "Simplify booking flow. Add cost estimator to reduce uncertainty.",
  customerRetention: "Launch loyalty program. Improve app UX. Send re-engagement emails.",
  avgRevenuePerStation: "Optimize pricing strategy. Add premium fast chargers.",
  nps: "Focus on customer support response time. Address top complaint themes.",
  churnRate: "Implement win-back campaigns. Survey churned users for feedback.",
  paymentSuccessRate: "Add multiple payment gateways. Improve error messaging.",
};

export default function AdminBenchmarks() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [bookings, setBookings] = useState<any[]>([]);
  const [stations, setStations] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [createdTasks, setCreatedTasks] = useState<Record<string, boolean>>({});
  const [creatingTasks, setCreatingTasks] = useState<Record<string, boolean>>({});
  const [taskQueue, setTaskQueue] = useState<any[]>([]);

  // Listen to queued benchmark tasks from admin_notes
  useEffect(() => {
    if (!db) return;
    const q = query(
      collection(db, "admin_notes"),
      where("entityType", "==", "ticket"),
      orderBy("createdAt", "desc")
    );
    const unsub = onSnapshot(q, (snap) => {
      const benchmarkNotes = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter((n: any) => n.entityId?.startsWith("benchmark_"));
      setTaskQueue(benchmarkNotes);
    });
    return () => unsub();
  }, []);

  const handleResolveTask = async (taskId: string) => {
    try {
      await updateDoc(doc(db, "admin_notes", taskId), { resolved: true });
      toast({ title: "Task Resolved", description: "Task marked as completed." });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err.message });
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    try {
      await deleteDoc(doc(db, "admin_notes", taskId));
      toast({ title: "Task Removed", description: "Task deleted from queue." });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err.message });
    }
  };

  const handleCreateTask = async (key: string) => {
    if (!db || !user) return;
    setCreatingTasks(prev => ({ ...prev, [key]: true }));

    try {
      const metricLabel = key.replace(/([A-Z])/g, ' $1').toUpperCase().trim();
      const recommendation = RECOMMENDATIONS[key as keyof typeof RECOMMENDATIONS];

      // 1. Create a note in admin_notes
      await addDoc(collection(db, "admin_notes"), {
        entityType: "ticket",
        entityId: `benchmark_${key}`,
        noteText: `[BENCHMARK OPTIMIZATION TASK] Metric: ${metricLabel}. Recommendation: ${recommendation}`,
        author: user.displayName || user.email?.split("@")[0] || "System",
        authorId: user.uid,
        createdAt: serverTimestamp(),
      });

      // 2. Add an audit log entry
      await addDoc(collection(db, "audit_logs"), {
        action: "BENCHMARK_TASK_CREATED",
        severity: "INFO",
        performedBy: user.email || "admin",
        targetId: `benchmark_${key}`,
        targetType: "benchmark",
        metadata: {
          metric: key,
          recommendation
        },
        timestamp: new Date().toISOString()
      });

      toast({
        title: "Task Created",
        description: `Optimization task for "${metricLabel}" has been successfully queued.`,
      });

      setCreatedTasks(prev => ({ ...prev, [key]: true }));
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Task Creation Failed",
        description: err.message
      });
    } finally {
      setCreatingTasks(prev => ({ ...prev, [key]: false }));
    }
  };

  useEffect(() => {
    if (!db || !user) return;

    const unsubBookings = onSnapshot(collection(db, "bookings"), (snap) => {
      setBookings(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const unsubStations = onSnapshot(collection(db, "stations"), (snap) => {
      setStations(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const unsubUsers = onSnapshot(collection(db, "users"), (snap) => {
      setUsers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    setLoading(false);
    return () => {
      unsubBookings();
      unsubStations();
      unsubUsers();
    };
  }, [user]);

  // Compute Metrics
  const metrics = useMemo(() => {
    if (loading) return null;

    const stationCount = stations.length || 1;
    const userCount = users.length || 1;
    const totalBookings = bookings.length || 1;

    // 1. Station Utilization
    const totalPossibleHours = stationCount * 24 * 30; // 30 days
    const totalSessionHours = bookings.reduce((sum, b) => sum + (b.duration || 0), 0) / 60;
    const stationUtilization = (totalSessionHours / totalPossibleHours) * 100;

    // 2. Avg Session Duration
    const avgSessionDuration = bookings.reduce((sum, b) => sum + (b.duration || 0), 0) / totalBookings;

    // 3. Booking Conversion (Searches vs Bookings - Mocked if search_logs missing)
    const bookingConversion = 68.5; // Default for demo

    // 4. Customer Retention
    const repeatUsers = users.filter(u => (u.bookingCount || 0) > 1).length;
    const customerRetention = (repeatUsers / userCount) * 100;

    // 5. Avg Revenue Per Station
    const totalRevenue = bookings.filter(b => b.paymentStatus === 'paid').reduce((sum, b) => sum + (b.totalPrice || 0), 0);
    const avgRevenuePerStation = totalRevenue / stationCount;

    // 6. NPS
    const nps = 42; // Default for demo

    // 7. Churn Rate
    const churnRate = 12.4; // Default for demo

    // 8. Payment Success Rate
    const successfulPayments = bookings.filter(b => b.paymentStatus === 'paid').length;
    const paymentSuccessRate = (successfulPayments / totalBookings) * 100;

    return {
      stationUtilization,
      avgSessionDuration,
      bookingConversion,
      customerRetention,
      avgRevenuePerStation,
      nps,
      churnRate,
      paymentSuccessRate
    };
  }, [loading, bookings, stations, users]);

  const radarData = useMemo(() => {
    if (!metrics) return [];
    return Object.entries(metrics).map(([key, value]) => {
      // Normalize values for radar (0-100 scale)
      let normalizedValue = value;
      let normalizedBenchmark = INDUSTRY_BENCHMARKS[key as keyof typeof INDUSTRY_BENCHMARKS].average;

      if (key === 'avgRevenuePerStation') {
        normalizedValue = (value / 50000) * 100;
        normalizedBenchmark = (normalizedBenchmark / 50000) * 100;
      }
      if (key === 'churnRate') {
        // Lower is better for churn, so invert
        normalizedValue = 100 - value;
        normalizedBenchmark = 100 - normalizedBenchmark;
      }

      return {
        subject: key.replace(/([A-Z])/g, ' $1').trim(),
        EVPlugFinder: Math.min(100, normalizedValue),
        Industry: normalizedBenchmark,
        fullMark: 100,
      };
    });
  }, [metrics]);

  const getStatus = (key: string, val: number) => {
    const benchmarks = INDUSTRY_BENCHMARKS[key as keyof typeof INDUSTRY_BENCHMARKS];
    if (key === 'churnRate' || key === 'avgSessionDuration') {
      // Lower is better
      if (val <= benchmarks.excellent) return 'excellent';
      if (val <= benchmarks.good) return 'good';
      return 'average';
    }
    if (val >= benchmarks.excellent) return 'excellent';
    if (val >= benchmarks.good) return 'good';
    return 'average';
  };

  const exportPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(22);
    doc.text("EVPlugFinder Industry Benchmark Report", 20, 20);
    doc.setFontSize(12);
    doc.text(`Generated on: ${new Date().toLocaleString()}`, 20, 30);
    
    let y = 50;
    Object.entries(metrics || {}).forEach(([key, val]) => {
      const status = getStatus(key, val);
      doc.text(`${key}: ${val.toFixed(1)} (${status.toUpperCase()})`, 20, y);
      y += 10;
    });

    doc.save(`EVPlugFinder_Benchmarking_${new Date().toISOString().split('T')[0]}.pdf`);
    toast({ title: "Report exported successfully" });
  };

  if (!metrics) return <div className="p-8 text-center animate-pulse admin-text-primary">Aggregating industry data...</div>;

  return (
    <div className="container mx-auto p-6 space-y-8 bg-[var(--admin-bg)] text-[var(--admin-text-primary)] transition-colors duration-300 min-h-screen">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-4xl font-black flex items-center gap-3">
            <Target className="w-10 h-10 text-emerald-500 animate-bounce" />
            Industry Benchmarks
          </h1>
          <p className="admin-text-muted mt-2 font-medium italic">Compare EVPlugFinder performance against global EV charging standards.</p>
        </div>
        <Button onClick={exportPDF} variant="outline" className="gap-2 border-[var(--admin-border)] bg-[var(--admin-border-muted)] hover:bg-[var(--admin-border)] admin-text-primary">
          <FileText className="w-4 h-4" /> Export Report PDF
        </Button>
      </div>

      <div className="bg-blue-500/10 border border-blue-500/30 p-4 rounded-2xl flex items-center gap-3">
        <Info className="w-5 h-5 text-blue-400" />
        <p className="text-xs text-blue-400 font-medium">Industry benchmarks based on the fictional 2025 EV Charging Market Report for performance demonstration.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Section A: Performance Scorecard */}
        <Card className="lg:col-span-2 admin-glass-card border-none shadow-2xl overflow-hidden">
          <CardHeader className="border-b border-[var(--admin-border-muted)]">
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-primary" />
              Performance Scorecard
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="border-[var(--admin-border-muted)] hover:bg-transparent">
                  <TableHead className="text-xs font-bold uppercase admin-text-muted">Metric</TableHead>
                  <TableHead className="text-xs font-bold uppercase admin-text-muted">EVPlugFinder</TableHead>
                  <TableHead className="text-xs font-bold uppercase admin-text-muted">Industry (Avg)</TableHead>
                  <TableHead className="text-xs font-bold uppercase admin-text-muted text-right">Rating</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Object.entries(metrics).map(([key, val]) => {
                  const status = getStatus(key, val);
                  const benchmark = INDUSTRY_BENCHMARKS[key as keyof typeof INDUSTRY_BENCHMARKS].average;
                  return (
                    <TableRow key={key} className="border-[var(--admin-border-muted)] hover:bg-[var(--admin-border-muted)] transition-colors">
                      <TableCell className="font-bold admin-text-secondary capitalize">{key.replace(/([A-Z])/g, ' $1')}</TableCell>
                      <TableCell className="font-black admin-text-primary">
                        {key === 'avgRevenuePerStation' ? `₹${val.toLocaleString()}` : `${val.toFixed(1)}${key.includes('Rate') || key.includes('ion') || key.includes('Retent') ? '%' : ''}`}
                      </TableCell>
                      <TableCell className="admin-text-muted italic">
                        {key === 'avgRevenuePerStation' ? `₹${benchmark.toLocaleString()}` : `${benchmark.toFixed(1)}${key.includes('Rate') || key.includes('ion') || key.includes('Retent') ? '%' : ''}`}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge className={cn(
                          status === 'excellent' ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30 animate-pulse" :
                          status === 'good' ? "bg-amber-500/20 text-amber-400 border-amber-500/30" :
                          "bg-red-500/20 text-red-400 border-red-500/30"
                        )}>
                          {status.toUpperCase()}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Section B: Radar Chart Comparison */}
        <Card className="admin-glass-card border-none shadow-2xl overflow-hidden">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-pink-500" />
              Network Vitality
            </CardTitle>
            <CardDescription className="admin-text-muted italic">Normalized comparison across 8 axes.</CardDescription>
          </CardHeader>
          <CardContent className="h-[400px]">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart cx="50%" cy="50%" outerRadius="80%" data={radarData}>
                <PolarGrid stroke="var(--admin-border)" />
                <PolarAngleAxis dataKey="subject" stroke="var(--admin-text-muted)" fontSize={8} />
                <PolarRadiusAxis angle={30} domain={[0, 100]} hide />
                <Radar
                  name="EVPlugFinder"
                  dataKey="EVPlugFinder"
                  stroke="#3b82f6"
                  fill="#3b82f6"
                  fillOpacity={0.6}
                />
                <Radar
                  name="Industry"
                  dataKey="Industry"
                  stroke="var(--admin-text-muted)"
                  fill="var(--admin-text-muted)"
                  fillOpacity={0.3}
                />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'var(--admin-bg)', border: '1px solid var(--admin-border)', borderRadius: '12px', color: 'var(--admin-text-primary)' }}
                />
              </RadarChart>
            </ResponsiveContainer>
            <div className="flex justify-center gap-4 text-[10px] font-bold uppercase">
              <span className="flex items-center gap-1 text-primary"><div className="w-2 h-2 bg-primary rounded-full" /> EVPlugFinder</span>
              <span className="flex items-center gap-1 admin-text-muted"><div className="w-2 h-2 bg-[var(--admin-text-muted)] rounded-full" /> Industry</span>
            </div>
          </CardContent>
        </Card>

        {/* Section C: Gap Analysis & Improvement Roadmap */}
        <Card className="lg:col-span-3 admin-glass-card border-none shadow-2xl overflow-hidden border-t-4 border-t-amber-500">
          <CardHeader className="border-b border-[var(--admin-border-muted)]">
            <CardTitle className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-amber-500" />
              Improvement Roadmap & Gap Analysis
            </CardTitle>
            <CardDescription className="admin-text-muted italic">Priority actions to reach "Excellent" industry standing.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 divide-x divide-y md:divide-y-0 divide-[var(--admin-border-muted)]">
              {Object.entries(metrics).map(([key, val]) => {
                const status = getStatus(key, val);
                const benchmark = INDUSTRY_BENCHMARKS[key as keyof typeof INDUSTRY_BENCHMARKS].average;
                const excellent = INDUSTRY_BENCHMARKS[key as keyof typeof INDUSTRY_BENCHMARKS].excellent;
                
                let gap = 0;
                if (key === 'churnRate' || key === 'avgSessionDuration') {
                  gap = ((val - excellent) / excellent) * 100;
                } else {
                  gap = ((excellent - val) / excellent) * 100;
                }
 
                if (status === 'excellent') return null;

                return (
                  <div key={key} className="p-6 space-y-4 hover:bg-[var(--admin-border-muted)] transition-colors group">
                    <div className="flex justify-between items-start">
                      <div className="space-y-1">
                        <h4 className="text-xs font-black uppercase admin-text-muted tracking-widest">{key.replace(/([A-Z])/g, ' $1')}</h4>
                        <div className="text-2xl font-black admin-text-secondary">{val.toFixed(1)}</div>
                      </div>
                      <Badge className="bg-amber-500/20 text-amber-500 border-amber-500/30 font-bold">
                        {gap > 0 ? `+${gap.toFixed(0)}% Gap` : `On Track`}
                      </Badge>
                    </div>
                    
                    <p className="text-xs admin-text-muted italic leading-relaxed">
                      "{RECOMMENDATIONS[key as keyof typeof RECOMMENDATIONS]}"
                    </p>
                    
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      disabled={creatingTasks[key] || createdTasks[key]}
                      onClick={() => handleCreateTask(key)}
                      className={cn(
                        "w-full justify-between text-[10px] uppercase font-bold transition-all",
                        createdTasks[key] 
                          ? "text-emerald-500 hover:text-emerald-500 bg-emerald-500/10 hover:bg-emerald-500/10" 
                          : "text-primary group-hover:bg-primary/10"
                      )}
                    >
                      {creatingTasks[key] ? (
                        <>Creating... <Clock className="w-3 h-3 animate-spin" /></>
                      ) : createdTasks[key] ? (
                        <>Task Created <CheckCircle2 className="w-3 h-3 text-emerald-500" /></>
                      ) : (
                        <>Create Task <ArrowRight className="w-3 h-3" /></>
                      )}
                    </Button>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Section D: Task Queue */}
      <Card className="admin-glass-card border-none shadow-2xl overflow-hidden border-t-4 border-t-primary">
        <CardHeader className="border-b border-[var(--admin-border-muted)]">
          <CardTitle className="flex items-center gap-2">
            <ListTodo className="w-5 h-5 text-primary" />
            Improvement Task Queue
            {taskQueue.length > 0 && (
              <Badge className="ml-2 bg-primary/20 text-primary border-primary/30 font-bold">
                {taskQueue.filter((t: any) => !t.resolved).length} pending
              </Badge>
            )}
          </CardTitle>
          <CardDescription className="admin-text-muted italic">
            Tasks created from the Gap Analysis roadmap above.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {taskQueue.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3 admin-text-muted">
              <ListTodo className="w-10 h-10 opacity-20" />
              <p className="text-sm font-medium">No tasks in the queue yet.</p>
              <p className="text-xs opacity-60">Click "Create Task" on any gap above to queue an optimization task.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-[var(--admin-border-muted)] hover:bg-transparent">
                  <TableHead className="text-xs font-bold uppercase admin-text-muted">Metric</TableHead>
                  <TableHead className="text-xs font-bold uppercase admin-text-muted">Recommendation</TableHead>
                  <TableHead className="text-xs font-bold uppercase admin-text-muted">Created By</TableHead>
                  <TableHead className="text-xs font-bold uppercase admin-text-muted">Created At</TableHead>
                  <TableHead className="text-xs font-bold uppercase admin-text-muted text-right">Status</TableHead>
                  <TableHead className="text-xs font-bold uppercase admin-text-muted text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {taskQueue.map((task: any) => {
                  const rawText: string = task.noteText || "";
                  const metricMatch = rawText.match(/Metric: ([^.]+)\./);
                  const recMatch = rawText.match(/Recommendation: (.+)$/);
                  const metric = metricMatch ? metricMatch[1].trim() : task.entityId?.replace("benchmark_", "");
                  const recommendation = recMatch ? recMatch[1].trim() : rawText;
                  const createdAt = task.createdAt?.toDate ? task.createdAt.toDate() : task.createdAt ? new Date(task.createdAt) : null;
                  return (
                    <TableRow key={task.id} className={cn(
                      "border-[var(--admin-border-muted)] hover:bg-[var(--admin-border-muted)] transition-colors",
                      task.resolved && "opacity-50"
                    )}>
                      <TableCell className="font-black admin-text-secondary capitalize whitespace-nowrap">
                        {metric}
                      </TableCell>
                      <TableCell className="text-xs admin-text-muted italic max-w-xs">
                        {recommendation}
                      </TableCell>
                      <TableCell className="text-xs admin-text-muted">{task.author || "—"}</TableCell>
                      <TableCell className="text-xs admin-text-muted whitespace-nowrap">
                        {createdAt ? createdAt.toLocaleString() : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge className={cn(
                          task.resolved
                            ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                            : "bg-amber-500/20 text-amber-500 border-amber-500/30"
                        )}>
                          {task.resolved ? "Resolved" : "Pending"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {!task.resolved && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="w-7 h-7 text-emerald-500 hover:bg-emerald-500/10"
                              onClick={() => handleResolveTask(task.id)}
                              title="Mark as resolved"
                            >
                              <CheckCheck className="w-3.5 h-3.5" />
                            </Button>
                          )}
                          <Button
                            size="icon"
                            variant="ghost"
                            className="w-7 h-7 text-red-500 hover:bg-red-500/10"
                            onClick={() => handleDeleteTask(task.id)}
                            title="Delete task"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="text-center py-12">
        <div className="flex justify-center gap-12 admin-text-muted grayscale opacity-30">
          <Zap className="w-12 h-12" />
          <Users className="w-12 h-12" />
          <ShieldCheck className="w-12 h-12" />
          <Target className="w-12 h-12" />
        </div>
        <p className="text-[10px] uppercase font-bold admin-text-muted mt-8 tracking-[0.5em]">EVPlugFinder Enterprise Intelligence v4.0</p>
      </div>
    </div>
  );
}
