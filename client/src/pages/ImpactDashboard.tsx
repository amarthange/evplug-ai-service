import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Leaf, Car, Zap, Calendar, Share2, ArrowRight, Sparkles, TrendingUp, Flame } from 'lucide-react';
import { useLocation } from 'wouter';
import { AreaChart, Area, XAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { type CachedSession, loadCachedSessions, cacheSessions } from '@/lib/session-cache';
import { computeImpactMetrics, type ImpactMetrics } from '@/lib/impact-engine';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

// ─── Helper: format currency without floating-point artifacts ────────────────
function formatInr(value: number): string {
  return '₹' + Math.round(value).toLocaleString('en-IN');
}

// ─── New-User Empty State ────────────────────────────────────────────────────
function NewUserState({ onExplore }: { onExplore: () => void }) {
  const cards = [
    { icon: '🌱', label: 'CO₂ Saved', desc: 'Track kg of CO₂ you offset vs petrol cars' },
    { icon: '🌳', label: 'Trees Equivalent', desc: 'See how many trees your sessions equal' },
    { icon: '⚡', label: 'Energy Charged', desc: 'Total kWh delivered across all your sessions' },
    { icon: '🏆', label: 'Charging Streak', desc: 'Weekly consistency badge & milestones' },
  ];

  return (
    <div className="min-h-full bg-[#0f172a] flex flex-col pt-[var(--safe-top)] pb-[calc(var(--safe-bottom)+80px)] overflow-x-hidden">
      {/* Ambient glows */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-[-15%] left-[-15%] w-[60%] h-[60%] bg-emerald-500/15 blur-[140px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-blue-500/15 blur-[120px] rounded-full" />
      </div>

      <div className="relative z-10 max-w-md mx-auto w-full p-6 flex flex-col items-center space-y-8">
        {/* Hero */}
        <motion.div
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', stiffness: 200, damping: 20 }}
          className="flex flex-col items-center text-center space-y-4 pt-8"
        >
          <div className="relative">
            <div className="w-28 h-28 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
              <Leaf className="w-14 h-14 text-emerald-400" />
            </div>
            <motion.div
              animate={{ rotate: [0, 15, -15, 0], scale: [1, 1.2, 1] }}
              transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
              className="absolute -top-1 -right-1 text-2xl"
            >
              ✨
            </motion.div>
          </div>

          <div className="space-y-2">
            <h1 className="text-3xl font-black text-white tracking-tighter">Your Impact Awaits</h1>
            <p className="text-white/50 text-sm max-w-xs leading-relaxed">
              Every EV charging session you complete will be tracked here — showing your real environmental contribution.
            </p>
          </div>
        </motion.div>

        {/* Preview cards */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="w-full grid grid-cols-2 gap-3"
        >
          {cards.map((card, i) => (
            <motion.div
              key={card.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + i * 0.08 }}
              className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-2"
            >
              <div className="text-2xl">{card.icon}</div>
              <p className="text-xs font-black text-white/80 uppercase tracking-widest leading-tight">{card.label}</p>
              <p className="text-[10px] text-white/40 leading-snug">{card.desc}</p>
            </motion.div>
          ))}
        </motion.div>

        {/* Steps */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="w-full bg-white/5 border border-white/10 rounded-3xl p-5 space-y-4"
        >
          <h3 className="text-xs font-black uppercase tracking-widest text-white/40 flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-emerald-400" /> How to start
          </h3>
          {[
            { step: '01', text: 'Find a charging station on the Map' },
            { step: '02', text: 'Book a slot and complete a session' },
            { step: '03', text: 'Come back here to see your impact' },
          ].map(({ step, text }) => (
            <div key={step} className="flex items-center gap-3">
              <span className="text-[10px] font-black text-emerald-400/60 font-mono w-6">{step}</span>
              <span className="text-sm text-white/70 font-semibold">{text}</span>
            </div>
          ))}
        </motion.div>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.55 }}
          className="w-full"
        >
          <Button
            onClick={onExplore}
            className="w-full h-14 rounded-2xl font-black uppercase tracking-widest text-sm gap-2 bg-emerald-500 hover:bg-emerald-400 text-white shadow-[0_8px_32px_rgba(52,211,153,0.3)]"
          >
            <Leaf className="w-4 h-4" />
            Find a Charger Now
            <ArrowRight className="w-4 h-4" />
          </Button>
        </motion.div>
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────
export default function ImpactDashboard() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const [metrics, setMetrics] = useState<ImpactMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const fetchAndCompute = async () => {
      setIsLoading(true);
      try {
        // 1. Load IndexedDB cache (fast, offline-first)
        const cachedSessions = await loadCachedSessions();

        // 2. If user is logged in, also fetch from Firestore for accuracy
        let firestoreSessions: CachedSession[] = [];
        if (user?.uid) {
          try {
            const q = query(
              collection(db, 'bookings'),
              where('userId', '==', user.uid),
              where('status', 'in', ['completed', 'COMPLETED'])
            );
            const snap = await getDocs(q);
            firestoreSessions = snap.docs.map(d => {
              const b = d.data();
              const startTime = b.startTime?.toDate
                ? b.startTime.toDate()
                : new Date(b.startTime || Date.now());
              const endTime = b.endTime?.toDate
                ? b.endTime.toDate()
                : b.endTime
                ? new Date(b.endTime)
                : null;
              return {
                id: d.id,
                userId: b.userId || user.uid,
                stationId: b.stationId || '',
                stationName: b.stationName || 'Station',
                connectorId: b.connectorId || '',
                status: 'completed',
                energyDelivered: Number(b.energyDeliveredKwh || b.energyConsumedContent || 0),
                totalCost: Number(b.totalPrice || b.amount || 0),
                startTime,
                endTime,
                cachedAt: new Date(),
              } as CachedSession;
            });

            // Sync back to cache for offline use
            if (firestoreSessions.length > 0) {
              await cacheSessions(firestoreSessions);
            }
          } catch (err) {
            console.warn('[ImpactDashboard] Firestore fetch failed, using cache only:', err);
          }
        }

        // 3. Merge: prefer Firestore, deduplicate by ID
        const idSet = new Set(firestoreSessions.map(s => s.id));
        const merged = [
          ...firestoreSessions,
          ...cachedSessions.filter(s => !idSet.has(s.id)),
        ];

        if (!cancelled) {
          setMetrics(computeImpactMetrics(merged));
        }
      } catch (err) {
        console.error('[ImpactDashboard] Error computing metrics:', err);
        if (!cancelled) setMetrics(computeImpactMetrics([]));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    fetchAndCompute();
    return () => { cancelled = true; };
  }, [user?.uid]);

  const handleShare = async () => {
    if (!metrics) return;
    const text = `I've saved ${metrics.lifetimeCo2Kg.toFixed(1)}kg of CO₂ with EVPlugFinder! 🌳 That's like planting ${metrics.treesEquivalent} trees. Join the EV revolution!`;
    if (navigator.share) {
      try { await navigator.share({ title: 'My EVPlugFinder Impact', text }); }
      catch { /* cancelled */ }
    } else {
      navigator.clipboard.writeText(text);
      toast({ title: 'Copied!', description: 'Impact stats copied to clipboard.' });
    }
  };

  // ── Loading ────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="min-h-full bg-[#0f172a] flex items-center justify-center pt-[var(--safe-top)] pb-[calc(var(--safe-bottom)+80px)]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 rounded-full border-4 border-emerald-500/20 border-t-emerald-500 animate-spin" />
          <p className="text-white/30 text-xs font-black uppercase tracking-widest animate-pulse">
            Loading your impact...
          </p>
        </div>
      </div>
    );
  }

  // ── New user / no sessions ─────────────────────────────────────────────────
  if (!metrics || !metrics.hasData) {
    return <NewUserState onExplore={() => setLocation('/')} />;
  }

  // ── Full Impact Dashboard ──────────────────────────────────────────────────
  return (
    <div className="min-h-full bg-[#0f172a] text-white overflow-x-hidden pt-[var(--safe-top)] pb-[calc(var(--safe-bottom)+80px)]">
      {/* Ambient Background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-emerald-500/20 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-blue-500/20 blur-[120px] rounded-full" />
      </div>

      <div className="relative z-10 max-w-md mx-auto p-6 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-black tracking-tighter">Your Impact</h1>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleShare}
            className="rounded-full bg-white/5 hover:bg-white/10"
          >
            <Share2 className="w-4 h-4" />
          </Button>
        </div>

        {/* Hero CO₂ Stat */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center py-6 space-y-2"
        >
          <div className="inline-flex items-center justify-center p-3 bg-emerald-500/10 rounded-2xl mb-3">
            <Leaf className="w-8 h-8 text-emerald-400" />
          </div>
          <h2 className="text-6xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-br from-emerald-300 to-emerald-600">
            {metrics.lifetimeCo2Kg.toFixed(1)}{' '}
            <span className="text-2xl text-emerald-500/50">kg</span>
          </h2>
          <p className="text-sm font-bold text-white/50 uppercase tracking-widest">
            of CO₂ offset in your EV journey
          </p>
        </motion.div>

        {/* 3-Column Stat Grid */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-3 gap-3"
        >
          {[
            { emoji: '🌳', value: String(metrics.treesEquivalent), label: 'Trees' },
            { icon: <Car className="w-6 h-6 text-blue-400" />, value: Math.round(metrics.petrolKmEquivalent).toLocaleString('en-IN'), label: 'Petrol km' },
            { icon: <Zap className="w-6 h-6 text-amber-400" />, value: metrics.lifetimeKwh.toFixed(1), label: 'kWh' },
          ].map((stat) => (
            <div key={stat.label} className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-4 flex flex-col items-center text-center space-y-2">
              {stat.emoji
                ? <div className="text-2xl">{stat.emoji}</div>
                : stat.icon}
              <div>
                <p className="text-lg font-black leading-none">{stat.value}</p>
                <p className="text-[9px] font-bold text-white/40 uppercase tracking-widest mt-1">{stat.label}</p>
              </div>
            </div>
          ))}
        </motion.div>

        {/* Streak Banner */}
        {metrics.streak > 0 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.15 }}
            className="bg-gradient-to-r from-orange-500/20 to-amber-500/10 border border-orange-500/20 rounded-2xl p-4 flex items-center gap-3"
          >
            <Flame className="w-5 h-5 text-orange-400 shrink-0" />
            <div>
              <p className="text-sm font-black text-white">
                {metrics.streak}-week charging streak! 🔥
              </p>
              <p className="text-[10px] text-white/40 font-semibold uppercase tracking-widest">
                Keep it going!
              </p>
            </div>
          </motion.div>
        )}

        {/* Monthly CO₂ Trend */}
        {metrics.monthlyCo2.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-5 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black uppercase tracking-widest text-white/60">CO₂ Offset Trend</h3>
              {metrics.bestMonth !== 'None' && (
                <span className="text-[10px] font-black text-emerald-400/80 uppercase bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                  Best: {metrics.bestMonth}
                </span>
              )}
            </div>
            <div className="h-44 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={metrics.monthlyCo2} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorCo2" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#34d399" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#34d399" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="month"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 9, fontWeight: 800 }}
                    dy={10}
                  />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '12px', fontSize: '11px', fontWeight: 900 }}
                    itemStyle={{ color: '#34d399' }}
                    formatter={(v: any) => [`${Number(v).toFixed(2)} kg`, 'CO₂']}
                  />
                  <Area
                    type="monotone"
                    dataKey="co2Kg"
                    stroke="#34d399"
                    strokeWidth={3}
                    fillOpacity={1}
                    fill="url(#colorCo2)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </motion.div>
        )}

        {/* Journey Stats */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-5 space-y-4"
        >
          <h3 className="text-sm font-black uppercase tracking-widest text-white/60 flex items-center gap-2">
            <TrendingUp className="w-4 h-4" /> Journey Stats
          </h3>
          <div className="space-y-3">
            {[
              {
                icon: <Calendar className="w-4 h-4 text-white/60" />,
                label: 'Started charging',
                value: metrics.firstSessionDate
                  ? metrics.firstSessionDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                  : '—',
              },
              {
                icon: <Zap className="w-4 h-4 text-white/60" />,
                label: 'Total sessions',
                value: metrics.lifetimeSessions.toString(),
              },
              {
                icon: <span className="text-xs font-black text-white/60">₹</span>,
                label: 'Total spent',
                value: formatInr(metrics.lifetimeCostInr),
              },
              {
                icon: <Leaf className="w-4 h-4 text-emerald-500/60" />,
                label: 'Avg CO₂ per session',
                value: metrics.lifetimeSessions > 0
                  ? `${(metrics.lifetimeCo2Kg / metrics.lifetimeSessions).toFixed(2)} kg`
                  : '—',
              },
            ].map(({ icon, label, value }, i, arr) => (
              <div
                key={label}
                className={`flex items-center justify-between ${i < arr.length - 1 ? 'pb-3 border-b border-white/5' : ''}`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center">
                    {icon}
                  </div>
                  <span className="text-sm font-bold text-white/80">{label}</span>
                </div>
                <span className="text-sm font-black">{value}</span>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Share CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <Button
            onClick={handleShare}
            className="w-full h-12 rounded-2xl font-black uppercase tracking-widest text-sm gap-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20"
          >
            <Share2 className="w-4 h-4" />
            Share My Impact
          </Button>
        </motion.div>

      </div>
    </div>
  );
}
