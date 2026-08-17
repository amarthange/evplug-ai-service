import React, { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import { db } from "@/lib/firebase";
import { 
  collection, 
  onSnapshot, 
  doc, 
  updateDoc, 
  addDoc, 
  serverTimestamp, 
  query, 
  where,
  getDocs,
  Timestamp
} from "firebase/firestore";
import { 
  FlaskConical, 
  Play, 
  Pause, 
  CheckCircle2, 
  Users, 
  Target, 
  BarChart4, 
  Plus,
  Trash2,
  AlertCircle,
  TrendingUp,
  Info
} from "lucide-react";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  LineChart, Line
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { calculateSignificance } from "@/lib/ab-testing";
import { cn } from "@/lib/utils";

export default function AdminABTests() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [tests, setTests] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedTest, setSelectedTest] = useState<any>(null);

  // Form State
  const [newTest, setNewTest] = useState({
    name: "",
    description: "",
    targetAudience: "all",
    metric: "booking_conversion",
    variants: [
      { id: "control", name: "Original (Control)", traffic: 50 },
      { id: "variant_a", name: "New Variant", traffic: 50 }
    ],
    durationDays: 14
  });

  useEffect(() => {
    if (!db || !user) return;

    const unsubTests = onSnapshot(collection(db, "ab_tests"), (snap) => {
      setTests(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const unsubEvents = onSnapshot(collection(db, "ab_events"), (snap) => {
      setEvents(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    setLoading(false);
    return () => {
      unsubTests();
      unsubEvents();
    };
  }, [user]);

  // Aggregated Analytics
  const testResults = useMemo(() => {
    if (!selectedTest) return null;

    const testEvents = events.filter(e => e.testId === selectedTest.id);
    const results = selectedTest.variants.map((v: any) => {
      const assignedUsers = new Set(testEvents.filter(e => e.variantId === v.id).map(e => e.userId)).size;
      const conversions = new Set(testEvents.filter(e => e.variantId === v.id && e.eventType === 'booking_created').map(e => e.userId)).size;
      
      return {
        ...v,
        assignedUsers,
        conversions,
        rate: assignedUsers > 0 ? (conversions / assignedUsers) * 100 : 0
      };
    });

    // Statistical Significance vs Control
    const control = results.find((r: any) => r.id === 'control');
    return results.map((r: any) => {
      if (r.id === 'control') return { ...r, significance: null };
      return {
        ...r,
        significance: calculateSignificance(
          control?.assignedUsers || 0,
          control?.conversions || 0,
          r.assignedUsers,
          r.conversions
        )
      };
    });
  }, [selectedTest, events]);

  const handleLaunch = async () => {
    if (!newTest.name || newTest.variants.reduce((a, b) => a + b.traffic, 0) !== 100) {
      toast({ variant: "destructive", title: "Invalid setup", description: "Traffic must sum to 100%" });
      return;
    }

    try {
      await addDoc(collection(db, "ab_tests"), {
        ...newTest,
        status: "running",
        startDate: serverTimestamp(),
        endDate: Timestamp.fromDate(new Date(Date.now() + newTest.durationDays * 86400000)),
        createdBy: user?.email,
        createdAt: serverTimestamp()
      });
      setShowCreate(false);
      toast({ title: "Experiment launched successfully!" });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Launch failed", description: err.message });
    }
  };

  const updateStatus = async (id: string, status: string) => {
    try {
      await updateDoc(doc(db, "ab_tests", id), { status });
      toast({ title: `Test ${status}` });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Update failed", description: err.message });
    }
  };

  if (loading) return <div className="p-8 text-center animate-pulse text-[var(--admin-text-primary)]">Initializing lab...</div>;

  return (
    <div className="container mx-auto p-6 space-y-8 bg-[var(--admin-bg)] text-[var(--admin-text-primary)] transition-colors duration-300 min-h-screen">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-4xl font-black flex items-center gap-3">
            <FlaskConical className="w-10 h-10 text-pink-500 animate-pulse" />
            Experimentation Lab
          </h1>
          <p className="admin-text-muted mt-2 font-medium italic">Data-driven decision making via controlled A/B testing.</p>
        </div>
        <Button onClick={() => setShowCreate(!showCreate)} className="gap-2 bg-pink-600 hover:bg-pink-700 font-bold text-white">
          <Plus className="w-4 h-4" /> New Experiment
        </Button>
      </div>

      {showCreate && (
        <Card className="admin-glass-card border-pink-500/30 border-2 shadow-2xl animate-in fade-in zoom-in duration-300">
          <CardHeader>
            <CardTitle className="admin-text-primary">Launch New A/B Test</CardTitle>
            <CardDescription className="admin-text-muted">Configure your variants and target metrics.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase admin-text-muted">Test Name</label>
                <Input 
                  value={newTest.name} 
                  onChange={e => setNewTest({...newTest, name: e.target.value})}
                  className="bg-[var(--admin-border-muted)] border-[var(--admin-border)] text-[var(--admin-text-primary)]"
                  placeholder="e.g. New Booking Flow v2"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase admin-text-muted">Success Metric</label>
                <select 
                  className="w-full bg-[var(--admin-border-muted)] border-[var(--admin-border)] text-[var(--admin-text-primary)] rounded-md h-10 px-3 text-sm"
                  value={newTest.metric}
                  onChange={e => setNewTest({...newTest, metric: e.target.value})}
                >
                  <option value="booking_conversion">Booking Conversion</option>
                  <option value="session_duration">Session Duration</option>
                  <option value="revenue_per_user">Revenue per User</option>
                </select>
              </div>
            </div>

            <div className="space-y-4">
              <label className="text-xs font-bold uppercase admin-text-muted">Variants & Traffic Split</label>
              {newTest.variants.map((v, i) => (
                <div key={i} className="flex gap-4 items-center">
                  <Input 
                    value={v.name} 
                    onChange={e => {
                      const next = [...newTest.variants];
                      next[i].name = e.target.value;
                      setNewTest({...newTest, variants: next});
                    }}
                    className="bg-[var(--admin-border-muted)] border-[var(--admin-border)] text-[var(--admin-text-primary)] flex-1"
                  />
                  <div className="w-24">
                    <Input 
                      type="number"
                      value={v.traffic} 
                      onChange={e => {
                        const next = [...newTest.variants];
                        next[i].traffic = parseInt(e.target.value) || 0;
                        setNewTest({...newTest, variants: next});
                      }}
                      className="bg-[var(--admin-border-muted)] border-[var(--admin-border)] text-[var(--admin-text-primary)]"
                    />
                  </div>
                  <span className="text-xs admin-text-muted font-bold">%</span>
                  {i > 1 && (
                    <Button variant="ghost" size="sm" onClick={() => {
                      setNewTest({...newTest, variants: newTest.variants.filter((_, idx) => idx !== i)});
                    }}>
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </Button>
                  )}
                </div>
              ))}
              <Button variant="outline" size="sm" className="w-full border-dashed border-[var(--admin-border)]" onClick={() => {
                setNewTest({...newTest, variants: [...newTest.variants, { id: `variant_${newTest.variants.length}`, name: `New Variant ${newTest.variants.length}`, traffic: 0 }]});
              }}>
                Add Variant
              </Button>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-[var(--admin-border)]">
              <Button variant="ghost" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button onClick={handleLaunch} className="bg-pink-600 hover:bg-pink-700 text-white">Launch Experiment</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Active Tests List */}
        <Card className="lg:col-span-2 admin-glass-card border-none shadow-xl overflow-hidden">
          <CardHeader className="bg-[var(--admin-border-muted)] border-b border-[var(--admin-border)]">
            <CardTitle className="flex items-center gap-2 admin-text-primary">
              <Users className="w-5 h-5 text-blue-400" />
              Active Experiments
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="border-[var(--admin-border)] hover:bg-transparent">
                  <TableHead className="text-xs font-bold uppercase admin-text-muted">Name</TableHead>
                  <TableHead className="text-xs font-bold uppercase admin-text-muted">Status</TableHead>
                  <TableHead className="text-xs font-bold uppercase admin-text-muted">Metric</TableHead>
                  <TableHead className="text-xs font-bold uppercase admin-text-muted text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tests.map(test => (
                  <TableRow 
                    key={test.id} 
                    className={cn(
                      "border-[var(--admin-border)] cursor-pointer transition-colors",
                      selectedTest?.id === test.id ? "bg-pink-500/5" : "hover:bg-[var(--admin-border-muted)]"
                    )}
                    onClick={() => setSelectedTest(test)}
                  >
                    <TableCell>
                      <div className="font-bold admin-text-secondary">{test.name}</div>
                      <div className="text-[10px] admin-text-muted">{test.description || "No description"}</div>
                    </TableCell>
                    <TableCell>
                      <Badge className={cn(
                        test.status === 'running' ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" :
                        test.status === 'paused' ? "bg-amber-500/20 text-amber-400 border-amber-500/30" :
                        "bg-[var(--admin-border-muted)] text-[var(--admin-text-secondary)] border-[var(--admin-border)]"
                      )}>
                        {test.status.toUpperCase()}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px] uppercase font-bold admin-text-muted border-[var(--admin-border)]">
                        {test.metric.replace(/_/g, ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right space-x-2">
                      {test.status === 'running' ? (
                        <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); updateStatus(test.id, 'paused'); }}>
                          <Pause className="w-4 h-4" />
                        </Button>
                      ) : (
                        <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); updateStatus(test.id, 'running'); }}>
                          <Play className="w-4 h-4" />
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" className="text-emerald-500" onClick={(e) => { e.stopPropagation(); updateStatus(test.id, 'completed'); }}>
                        <CheckCircle2 className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Selected Test Detail / Results */}
        <div className="space-y-6">
          {selectedTest ? (
            <Card className="admin-glass-card border-none shadow-2xl border-t-4 border-t-pink-500">
              <CardHeader>
                <CardTitle className="text-lg flex items-center justify-between admin-text-primary">
                  {selectedTest.name}
                  <Badge variant="outline" className="text-pink-500 border-pink-500/30">Analytics</Badge>
                </CardTitle>
                <CardDescription className="admin-text-muted">Real-time statistical validation.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="divide-y divide-[var(--admin-border)]">
                  {testResults?.map((r: any) => (
                    <div key={r.id} className="py-4 space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="font-bold admin-text-secondary">{r.name}</span>
                        {r.significance?.significant && r.significance.lift > 0 && (
                          <Badge className="bg-emerald-500 text-white animate-pulse">Winner</Badge>
                        )}
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <span className="text-[10px] uppercase font-bold admin-text-muted">Users</span>
                          <div className="text-xl font-black">{r.assignedUsers.toLocaleString()}</div>
                        </div>
                        <div className="space-y-1">
                          <span className="text-[10px] uppercase font-bold admin-text-muted">Conversion</span>
                          <div className="text-xl font-black text-primary">{r.rate.toFixed(2)}%</div>
                        </div>
                      </div>

                      {r.significance && (
                        <div className="p-3 rounded-lg bg-[var(--admin-border-muted)] border border-[var(--admin-border)] space-y-2">
                          <div className="flex justify-between items-center text-[10px] font-bold">
                            <span className="admin-text-muted uppercase">Lift vs Control</span>
                            <span className={r.significance.lift >= 0 ? "text-emerald-500" : "text-red-500"}>
                              {r.significance.lift >= 0 ? "+" : ""}{r.significance.lift.toFixed(1)}%
                            </span>
                          </div>
                          <div className="flex justify-between items-center text-[10px] font-bold">
                            <span className="admin-text-muted uppercase">P-Value</span>
                            <span className={r.significance.significant ? "text-emerald-500" : "text-amber-500"}>
                              {r.significance.pValue.toFixed(4)}
                            </span>
                          </div>
                          {r.significance.significant ? (
                            <div className="text-[9px] text-emerald-400 font-medium flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" /> Statistically Significant
                            </div>
                          ) : (
                            <div className="text-[9px] admin-text-muted font-medium flex items-center gap-1">
                              <Info className="w-3 h-3" /> Needs more data...
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <div className="pt-4">
                  <h5 className="text-xs font-bold uppercase admin-text-muted mb-4 flex items-center gap-2">
                    <TrendingUp className="w-4 h-4" /> Performance Trend
                  </h5>
                  <div className="h-[200px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={testResults || []}>
                        <XAxis dataKey="name" hide />
                        <Tooltip 
                          contentStyle={{ backgroundColor: 'var(--admin-bg)', border: '1px solid var(--admin-border)', borderRadius: '12px' }}
                        />
                        <Bar dataKey="rate" radius={[4, 4, 0, 0]}>
                          {(testResults || []).map((entry: any, index: number) => (
                            <Cell key={`cell-${index}`} fill={index === 0 ? '#64748b' : '#ec4899'} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="h-full flex flex-col items-center justify-center p-12 text-center admin-glass-card border-2 border-dashed border-[var(--admin-border)] rounded-3xl opacity-50">
              <Target className="w-16 h-16 text-[var(--admin-border)] mb-4" />
              <p className="text-sm admin-text-muted font-medium">Select an experiment to view real-time statistical performance.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

