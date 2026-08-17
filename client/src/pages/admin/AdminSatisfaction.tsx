import React, { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import { useTheme } from "@/lib/theme-provider";
import { db } from "@/lib/firebase";
import { collection, onSnapshot, query, orderBy, limit, where, Timestamp, addDoc } from "firebase/firestore";
import { 
  Heart, 
  MessageSquare, 
  TrendingUp, 
  TrendingDown, 
  Users, 
  ArrowRight, 
  Download,
  AlertCircle,
  ThumbsUp,
  ThumbsDown,
  Star,
  Activity,
  Zap,
  Filter,
  Smile,
  BarChart3,
  PieChart as PieIcon,
  Search,
  CheckCircle2,
  Clock
} from "lucide-react";
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, AreaChart, Area, PieChart, Pie, Cell
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import ReactWordcloud from 'react-wordcloud';
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

const BENCHMARKS = {
  nps: 50,
  csat: 80,
  ces: 5
};

const SEED_SURVEYS = [
  {
    surveyType: "nps",
    score: 10,
    comment: "Absolutely spectacular charging speed and premium lounge amenities! Highly recommended.",
    userId: "user_1",
    userEmail: "driver1@evplugfinder.com",
    userName: "Aditya Kumar",
    submittedAt: new Date(Date.now() - 1 * 3600000)
  },
  {
    surveyType: "nps",
    score: 9,
    comment: "The charger booked seamlessly through the app. Clean interface and accurate availability.",
    userId: "user_2",
    userEmail: "driver2@evplugfinder.com",
    userName: "Sarah Jenkins",
    submittedAt: new Date(Date.now() - 4 * 3600000)
  },
  {
    surveyType: "nps",
    score: 8,
    comment: "Good experience overall, but could use more rain protection over the charging bays.",
    userId: "user_3",
    userEmail: "driver3@evplugfinder.com",
    userName: "Rahul Sharma",
    submittedAt: new Date(Date.now() - 12 * 3600000)
  },
  {
    surveyType: "nps",
    score: 5,
    comment: "Charging was delayed because the previous car took too long to leave. Need better idle penalties.",
    userId: "user_4",
    userEmail: "driver4@evplugfinder.com",
    userName: "Michael Chen",
    submittedAt: new Date(Date.now() - 24 * 3600000)
  },
  {
    surveyType: "nps",
    score: 10,
    comment: "EVPlugFinder is the gold standard for charging. The auto-charge feature worked flawlessly.",
    userId: "user_5",
    userEmail: "driver5@evplugfinder.com",
    userName: "Elena Rostova",
    submittedAt: new Date(Date.now() - 36 * 3600000)
  },
  {
    surveyType: "csat",
    score: 5,
    comment: "Extremely satisfied. The booking queue cleared exactly on time.",
    userId: "user_6",
    userEmail: "driver6@evplugfinder.com",
    userName: "Amit Patel",
    submittedAt: new Date(Date.now() - 2 * 3600000)
  },
  {
    surveyType: "csat",
    score: 4,
    comment: "Very clean station, secure lighting at night.",
    userId: "user_7",
    userEmail: "driver7@evplugfinder.com",
    userName: "Priya Nair",
    submittedAt: new Date(Date.now() - 8 * 3600000)
  },
  {
    surveyType: "csat",
    score: 5,
    comment: "Excellent support staff on site who helped with the connector lock.",
    userId: "user_8",
    userEmail: "driver8@evplugfinder.com",
    userName: "Devendra Singh",
    submittedAt: new Date(Date.now() - 16 * 3600000)
  },
  {
    surveyType: "csat",
    score: 2,
    comment: "The fast charger power output peaked at only 40kW instead of 120kW. Disappointing.",
    userId: "user_9",
    userEmail: "driver9@evplugfinder.com",
    userName: "Robert Taylor",
    submittedAt: new Date(Date.now() - 30 * 3600000)
  },
  {
    surveyType: "csat",
    score: 4,
    comment: "Helpful app notifications when charging reached 80%.",
    userId: "user_10",
    userEmail: "driver10@evplugfinder.com",
    userName: "Sneha Reddy",
    submittedAt: new Date(Date.now() - 48 * 3600000)
  },
  {
    surveyType: "ces",
    score: 7,
    comment: "Incredibly easy to use. Plugged in, scanned QR, and payment was completed automatically.",
    userId: "user_11",
    userEmail: "driver11@evplugfinder.com",
    userName: "Vikram Malhotra",
    submittedAt: new Date(Date.now() - 3 * 3600000)
  },
  {
    surveyType: "ces",
    score: 6,
    comment: "Very straightforward. The map filter led me straight to the available CCS2 plug.",
    userId: "user_12",
    userEmail: "driver12@evplugfinder.com",
    userName: "Neha Gupta",
    submittedAt: new Date(Date.now() - 10 * 3600000)
  },
  {
    surveyType: "ces",
    score: 5,
    comment: "Adding money to the wallet was easy, but it should support direct card checkouts.",
    userId: "user_13",
    userEmail: "driver13@evplugfinder.com",
    userName: "John Doe",
    submittedAt: new Date(Date.now() - 20 * 3600000)
  },
  {
    surveyType: "ces",
    score: 2,
    comment: "Had to scan the QR code three times before the charger initialized. Frustrating process.",
    userId: "user_14",
    userEmail: "driver14@evplugfinder.com",
    userName: "Kunal Shah",
    submittedAt: new Date(Date.now() - 40 * 3600000)
  },
  {
    surveyType: "ces",
    score: 6,
    comment: "Seamless transition from reservation to active charge.",
    userId: "user_15",
    userEmail: "driver15@evplugfinder.com",
    userName: "Lisa Anderson",
    submittedAt: new Date(Date.now() - 50 * 3600000)
  }
];

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

export default function AdminSatisfaction() {
  const { user } = useAuth();
  const { theme } = useTheme();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [surveys, setSurveys] = useState<any[]>([]);
  const [metricFilter, setMetricFilter] = useState<"nps" | "csat" | "ces">("nps");

  useEffect(() => {
    if (!db || !user) return;

    const q = query(
      collection(db, "satisfaction_surveys"),
      orderBy("submittedAt", "desc")
    );

    const unsub = onSnapshot(q, async (snap) => {
      if (snap.empty) {
        console.log("🌱 satisfaction_surveys collection is empty! Seeding initial surveys...");
        const batch = [];
        for (const survey of SEED_SURVEYS) {
          batch.push(addDoc(collection(db, "satisfaction_surveys"), {
            ...survey,
            submittedAt: Timestamp.fromDate(survey.submittedAt)
          }));
        }
        try {
          await Promise.all(batch);
          console.log("✅ Seeding of satisfaction_surveys completed!");
        } catch (err) {
          console.error("Failed to seed satisfaction_surveys:", err);
        }
        return;
      }

      setSurveys(snap.docs.map(d => {
        const data = d.data();
        let dateStr = "Recent";
        if (data.submittedAt) {
          if (typeof data.submittedAt.toDate === 'function') {
            dateStr = data.submittedAt.toDate().toLocaleDateString();
          } else {
            dateStr = new Date(data.submittedAt).toLocaleDateString();
          }
        }
        return { 
          id: d.id, 
          ...data,
          date: dateStr
        };
      }));
      setLoading(false);
    });

    return () => unsub();
  }, [user]);

  // Calculations
  const stats = useMemo(() => {
    if (surveys.length === 0) {
      return { nps: 0, csat: 0, ces: 0, npsCount: 0, csatCount: 0, cesCount: 0 };
    }

    // NPS
    const npsResponses = surveys.filter(s => s.surveyType === 'nps');
    const promoters = npsResponses.filter(r => r.score >= 9).length;
    const detractors = npsResponses.filter(r => r.score <= 6).length;
    const nps = npsResponses.length > 0 ? ((promoters - detractors) / npsResponses.length) * 100 : 0;

    // CSAT
    const csatResponses = surveys.filter(s => s.surveyType === 'csat');
    const satisfied = csatResponses.filter(r => r.score >= 4).length;
    const csat = csatResponses.length > 0 ? (satisfied / csatResponses.length) * 100 : 0;

    // CES
    const cesResponses = surveys.filter(s => s.surveyType === 'ces');
    const ces = cesResponses.length > 0 ? cesResponses.reduce((sum, r) => sum + r.score, 0) / cesResponses.length : 0;

    return { nps, csat, ces, npsCount: npsResponses.length, csatCount: csatResponses.length, cesCount: cesResponses.length };
  }, [surveys]);

  const trendData = useMemo(() => {
    const daily: any = {};
    surveys.forEach(s => {
      if (!daily[s.date]) daily[s.date] = { date: s.date, nps: [], csat: [], ces: [] };
      daily[s.date][s.surveyType].push(s.score);
    });

    return Object.values(daily).map((d: any) => {
      const p = d.nps.filter((v: number) => v >= 9).length;
      const det = d.nps.filter((v: number) => v <= 6).length;
      return {
        date: d.date,
        nps: d.nps.length > 0 ? ((p - det) / d.nps.length) * 100 : null,
        csat: d.csat.length > 0 ? (d.csat.filter((v: number) => v >= 4).length / d.csat.length) * 100 : null,
        ces: d.ces.length > 0 ? d.ces.reduce((s: number, v: number) => s + v, 0) / d.ces.length : null
      };
    }).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [surveys]);

  const words = useMemo(() => {
    const counts: any = {};
    surveys.forEach(s => {
      if (s.comment) {
        s.comment.toLowerCase().split(/\W+/).forEach((w: string) => {
          if (w.length > 3) counts[w] = (counts[w] || 0) + 1;
        });
      }
    });
    return Object.entries(counts).map(([text, value]) => ({ text, value: value as number })).sort((a, b) => b.value - a.value).slice(0, 50);
  }, [surveys]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-[var(--admin-bg)]">
        <Heart className="w-16 h-16 text-rose-500 animate-pulse mb-4" />
        <p className="admin-text-muted font-bold uppercase tracking-widest">Gauging Sentiments...</p>
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
            <div className="p-2.5 bg-rose-500/10 rounded-2xl border border-rose-500/20 shadow-[0_0_30px_rgba(244,63,94,0.1)]">
              <Smile className="w-8 h-8 text-rose-500" />
            </div>
            <h1 className="text-5xl font-black tracking-tighter uppercase bg-gradient-to-r from-slate-900 via-slate-700 to-slate-500 dark:from-white dark:via-slate-300 dark:to-slate-500 bg-clip-text text-transparent">
              User Satisfaction
            </h1>
          </div>
          <p className="admin-text-muted font-medium ml-1 flex items-center gap-2">
            Multidimensional sentiment analysis and loyalty tracking.
            <span className="flex items-center gap-1.5 bg-rose-500/10 text-rose-500 px-3 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest border border-rose-500/20">
              <span className="w-1.5 h-1.5 bg-rose-500 rounded-full animate-pulse" />
              Live Feedback
            </span>
          </p>
        </motion.div>

        <motion.div className="flex gap-3" variants={itemVariants}>
          <Button variant="outline" className="admin-glass-card hover:bg-[var(--admin-border-muted)] text-[var(--admin-text-primary)] border-none h-12 px-6 font-black uppercase text-xs tracking-widest">
            <Download className="w-4 h-4 mr-2" />
            Export Feedback
          </Button>
          <Button className="bg-rose-500 hover:bg-rose-600 h-12 px-6 shadow-[0_0_40px_rgba(244,63,94,0.3)] border-0 font-black uppercase text-xs tracking-widest text-white">
            <Filter className="w-4 h-4 mr-2" />
            Configure Surveys
          </Button>
        </motion.div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          { 
            label: "Net Promoter Score", 
            val: stats?.nps.toFixed(0), 
            sub: `${stats?.npsCount} Responses`, 
            icon: Users, 
            color: "text-primary", 
            accent: "bg-primary", 
            target: BENCHMARKS.nps,
            p: Math.min(Math.max((stats?.nps || 0) + 100, 0) / 2, 100) 
          },
          { 
            label: "CSAT Score", 
            val: `${stats?.csat.toFixed(0)}%`, 
            sub: `${stats?.csatCount} Responses`, 
            icon: Heart, 
            color: "text-rose-500", 
            accent: "bg-rose-500", 
            target: BENCHMARKS.csat,
            p: stats?.csat || 0 
          },
          { 
            label: "Customer Effort", 
            val: stats?.ces.toFixed(1), 
            sub: `${stats?.cesCount} Responses`, 
            icon: Zap, 
            color: "text-amber-500", 
            accent: "bg-amber-500", 
            target: BENCHMARKS.ces,
            p: ((stats?.ces || 0) / 7) * 100 
          }
        ].map((kpi, i) => (
          <motion.div key={i} variants={itemVariants}>
            <Card className="relative overflow-hidden admin-glass-card group transition-all duration-500 border-none">
              <CardHeader className="pb-2">
                <CardTitle className="text-[10px] font-black uppercase admin-text-muted tracking-[0.2em] flex justify-between">
                  {kpi.label}
                  <kpi.icon className={cn("w-4 h-4", kpi.color)} />
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-baseline gap-2">
                  <div className={cn("text-5xl font-black tracking-tighter admin-text-primary")}>
                    {kpi.val}
                  </div>
                  <Badge variant="outline" className="text-[9px] font-black bg-[var(--admin-border-muted)] border-[var(--admin-border)] text-[var(--admin-text-secondary)]">
                    BM: {kpi.target}
                  </Badge>
                </div>
                <div className="text-[10px] font-bold admin-text-muted uppercase mt-1 tracking-wider">
                  {kpi.sub}
                </div>
              </CardContent>
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-[var(--admin-border)]">
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

      {/* Analysis Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <motion.div variants={itemVariants} className="lg:col-span-2">
          <Card className="admin-glass-card border-none overflow-hidden">
            <CardHeader className="bg-[var(--admin-border-muted)] border-b border-[var(--admin-border)] flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-xl font-black uppercase tracking-tight flex items-center gap-2 admin-text-primary">
                  <Activity className="w-5 h-5 text-rose-500" />
                  Sentiment Over Time
                </CardTitle>
                <CardDescription className="admin-text-muted">Longitudinal tracking of user loyalty vectors.</CardDescription>
              </div>
              <div className="flex gap-2">
                {["nps", "csat", "ces"].map((m) => (
                  <Button 
                    key={m}
                    size="sm"
                    variant={metricFilter === m ? "default" : "outline"}
                    onClick={() => setMetricFilter(m as any)}
                    className={cn(
                      "text-[10px] font-black uppercase h-7 px-3",
                      metricFilter === m ? "bg-rose-500 text-white" : "bg-[var(--admin-border-muted)] border-[var(--admin-border)] text-[var(--admin-text-secondary)]"
                    )}
                  >
                    {m}
                  </Button>
                ))}
              </div>
            </CardHeader>
            <CardContent className="h-[400px] pt-6">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendData}>
                  <defs>
                    <linearGradient id="colorMetric" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={metricFilter === 'nps' ? '#3b82f6' : metricFilter === 'csat' ? '#f43f5e' : '#f59e0b'} stopOpacity={0.3}/>
                      <stop offset="95%" stopColor={metricFilter === 'nps' ? '#3b82f6' : metricFilter === 'csat' ? '#f43f5e' : '#f59e0b'} stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--admin-border)" strokeOpacity={0.4} />
                  <XAxis dataKey="date" fontSize={10} tick={{fill: 'var(--admin-text-muted)'}} axisLine={false} tickLine={false} />
                  <YAxis fontSize={10} tick={{fill: 'var(--admin-text-muted)'}} axisLine={false} tickLine={false} hide />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'var(--admin-bg)', 
                      border: '1px solid var(--admin-border)', 
                      borderRadius: '12px',
                      color: 'var(--admin-text-primary)'
                    }}
                  />
                  <Area 
                    type="monotone" 
                    dataKey={metricFilter} 
                    stroke={metricFilter === 'nps' ? '#3b82f6' : metricFilter === 'csat' ? '#f43f5e' : '#f59e0b'} 
                    fillOpacity={1} 
                    fill="url(#colorMetric)" 
                    strokeWidth={4}
                    connectNulls
                  />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={itemVariants}>
          <Card className="admin-glass-card border-none overflow-hidden flex flex-col h-full">
            <CardHeader className="bg-[var(--admin-border-muted)] border-b border-[var(--admin-border)]">
              <CardTitle className="text-xl font-black uppercase tracking-tight flex items-center gap-2 admin-text-primary">
                <MessageSquare className="w-5 h-5 text-amber-500" />
                Keyword Context
              </CardTitle>
              <CardDescription className="admin-text-muted">Recurring themes in written feedback.</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 p-8">
              <div className="h-full w-full min-h-[300px]">
                <ReactWordcloud 
                  words={words} 
                  options={{
                    rotations: 2,
                    rotationAngles: [-90, 0],
                    fontFamily: 'inherit',
                    fontSizes: [12, 48],
                    padding: 5,
                    colors: ['#3b82f6', '#f43f5e', '#f59e0b', '#10b981', theme === 'dark' ? '#ffffff' : '#0f172a']
                  }}
                />
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Feedback Feed */}
      <motion.div variants={itemVariants}>
        <Card className="admin-glass-card border-none overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between border-b border-[var(--admin-border)] bg-[var(--admin-border-muted)] py-4">
            <div>
              <CardTitle className="text-2xl font-black uppercase tracking-tighter admin-text-primary">Raw Feedback Stream</CardTitle>
              <CardDescription className="admin-text-muted">Live feed of user submissions and ratings.</CardDescription>
            </div>
            <div className="flex items-center gap-4">
               <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 admin-text-muted" />
                  <input 
                    type="text" 
                    placeholder="Search comments..."
                    className="bg-[var(--admin-border-muted)] border border-[var(--admin-border)] rounded-full pl-9 pr-4 py-1.5 text-xs font-bold outline-none focus:border-rose-500/50 text-[var(--admin-text-primary)] transition-all w-64"
                  />
               </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-[10px] uppercase font-black admin-text-muted bg-[var(--admin-border-muted)]">
                  <tr>
                    <th className="px-8 py-4">Submission Date</th>
                    <th className="px-6 py-4">Category</th>
                    <th className="px-6 py-4">Score Metric</th>
                    <th className="px-6 py-4">Written Feedback</th>
                    <th className="px-6 py-4 text-right pr-8">Context</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--admin-border)]">
                  <AnimatePresence mode="popLayout">
                    {surveys.slice(0, 15).map((survey, idx) => (
                      <motion.tr 
                        key={survey.id} 
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.03 }}
                        className="bg-transparent hover:bg-[var(--admin-border-muted)] transition-colors group"
                      >
                        <td className="px-8 py-5 font-black admin-text-muted text-xs">
                          {survey.date}
                        </td>
                        <td className="px-6 py-5">
                          <Badge 
                            variant="outline" 
                            className={cn(
                              "text-[9px] font-black uppercase tracking-widest px-2 py-0",
                              survey.surveyType === 'nps' ? "bg-primary/10 text-primary border-primary/20" :
                              survey.surveyType === 'csat' ? "bg-rose-500/10 text-rose-500 border-rose-500/20" :
                              "bg-amber-500/10 text-amber-500 border-amber-500/20"
                            )}
                          >
                            {survey.surveyType}
                          </Badge>
                        </td>
                        <td className="px-6 py-5">
                          <div className="flex items-center gap-2">
                             <div className={cn(
                               "text-lg font-black tracking-tighter",
                               survey.score >= (survey.surveyType === 'nps' ? 9 : survey.surveyType === 'csat' ? 4 : 5) ? "text-emerald-500 dark:text-emerald-400" :
                               survey.score <= (survey.surveyType === 'nps' ? 6 : survey.surveyType === 'csat' ? 2 : 2) ? "text-rose-500 dark:text-rose-400" : "admin-text-secondary"
                             )}>
                               {survey.score}
                             </div>
                             <div className="flex gap-0.5">
                               {[...Array(survey.surveyType === 'nps' ? 10 : 5)].map((_, i) => (
                                 <div 
                                   key={i} 
                                   className={cn(
                                     "w-1.5 h-3 rounded-sm",
                                     i < survey.score ? (survey.score >= 9 || (survey.surveyType !== 'nps' && survey.score >= 4) ? "bg-emerald-500" : "bg-rose-500") : "bg-[var(--admin-border)]"
                                   )}
                                 />
                               ))}
                             </div>
                          </div>
                        </td>
                        <td className="px-6 py-5 max-w-md">
                          <p className="admin-text-secondary text-xs font-medium italic line-clamp-2">
                            "{survey.comment || "No commentary provided."}"
                          </p>
                        </td>
                        <td className="px-6 py-5 text-right pr-8">
                           <Button variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-full hover:bg-[var(--admin-border-muted)]">
                              <ArrowRight className="w-4 h-4 admin-text-muted" />
                           </Button>
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

