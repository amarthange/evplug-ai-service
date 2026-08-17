import React, { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { useLocation } from 'wouter';
import {
  computeAnalytics,
  formatRs,
  formatKwh,
  formatCo2,
  type BookingRecord
} from '@/lib/analytics-engine';
import MonthlyKwhBar from '@/components/charts/MonthlyKwhBar';
import ConnectorDonut from '@/components/charts/ConnectorDonut';
import CostTrendLine from '@/components/charts/CostTrendLine';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { BarChart2, Zap, Leaf, CreditCard, ChevronRight, AlertCircle, Info } from 'lucide-react';

const Analytics: React.FC = () => {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  // TANSTACK QUERY — data fetch
  const { data: bookings, isLoading, isError, error } = useQuery({
    queryKey: ['analytics', 'bookings', user?.uid],
    queryFn: async (): Promise<BookingRecord[]> => {
      if (!user) return [];

      const q = query(
        collection(db, 'bookings'),
        where('userId', '==', user.uid),
        orderBy('startTime', 'desc'),
        limit(500)
      );
      const snap = await getDocs(q);
      return snap.docs
        .map(doc => {
          const d = doc.data();
          return {
            id: doc.id,
            userId: d.userId,
            stationName: d.stationName ?? 'Unknown station',
            connectorType: d.connectorType ?? 'Unknown',
            kwhDelivered: d.kwhDelivered ?? 0,
            currentCost: d.currentCost ?? 0,
            startTime: d.startTime?.toDate() ?? new Date(),
            endTime: d.endTime?.toDate() ?? null,
            status: d.status
          } as BookingRecord;
        })
        .filter(b => b.status === 'completed');
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    enabled: !!user,
    retry: 2
  });

  const summary = useMemo(() => {
    if (!bookings || bookings.length === 0) return null;
    return computeAnalytics(bookings);
  }, [bookings]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background pb-24">
        <div className="sticky top-0 bg-background/95 backdrop-blur z-10 border-b px-4 py-3">
          <Skeleton className="h-6 w-32 mb-1" />
          <Skeleton className="h-4 w-48" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-4 py-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-[88px] rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-[72px] mx-4 rounded-lg mb-4" />
        <Skeleton className="h-[280px] mx-4 rounded-lg mb-4" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mx-4">
          <Skeleton className="h-[280px] rounded-lg" />
          <Skeleton className="h-[280px] rounded-lg" />
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="min-h-screen bg-background p-4 flex flex-col items-center justify-center text-center">
        <AlertCircle className="h-12 w-12 text-destructive mb-4" />
        <h2 className="text-xl font-medium mb-2">Could not load your analytics</h2>
        <p className="text-muted-foreground mb-6 max-w-xs">{(error as any)?.message || 'Something went wrong while fetching your data.'}</p>
        <Button onClick={() => queryClient.invalidateQueries({ queryKey: ['analytics', 'bookings', user?.uid] })}>
          Try again
        </Button>
      </div>
    );
  }

  if (!summary || summary.totalSessions === 0) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <div className="sticky top-0 bg-background/95 backdrop-blur z-10 border-b px-4 py-3">
          <h1 className="text-[18px] font-medium">Your analytics</h1>
          <p className="text-[12px] text-muted-foreground">No sessions yet</p>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 text-center">
          <svg width="60" height="80" viewBox="0 0 60 80" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="10" y="10" width="40" height="64" rx="4" stroke="#10b981" strokeWidth="1.5" />
            <path d="M25 6H35V10H25V6Z" fill="#10b981" />
            <rect x="14" y="60" width="32" height="10" rx="1" fill="#10b981" fillOpacity="0.2" />
          </svg>
          <h2 className="text-xl font-medium">No charging sessions yet</h2>
          <p className="text-sm text-muted-foreground max-w-xs">
            Your analytics will appear here after your first completed charge.
          </p>
          <Button variant="default" onClick={() => setLocation('/')} className="mt-2">
            Find a charging station <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* ANALYTICS — PAGE HEADER */}
      <div className="sticky top-0 bg-background/95 backdrop-blur z-10 border-b px-4 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-[18px] font-medium leading-tight">Your analytics</h1>
          <p className="text-[12px] text-muted-foreground">
            Based on {summary.totalSessions} sessions since {summary.firstSessionDate?.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}
          </p>
        </div>
        <Badge variant="secondary" className="text-[10px] uppercase tracking-wider h-6 px-2">
          Last 6 months
        </Badge>
      </div>

      {/* ANALYTICS — 500 DOC CAP WARNING */}
      {bookings?.length === 500 && (
        <div className="bg-amber-50 dark:bg-amber-950/30 border-b border-amber-100 dark:border-amber-900 px-4 py-2 flex items-center gap-2">
          <Info className="h-4 w-4 text-amber-600" />
          <p className="text-[12px] text-amber-600 font-medium">Showing your most recent 500 sessions</p>
        </div>
      )}

      {/* ANALYTICS — METRIC CARDS GRID */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-4 py-4">
        {[
          { label: 'Total spend', value: formatRs(summary.totalSpendRs), sub: `${summary.totalSessions} sessions`, icon: <CreditCard className="h-3 w-3 text-emerald-600" />, color: 'bg-emerald-100 dark:bg-emerald-900/40' },
          { label: 'Energy delivered', value: formatKwh(summary.totalKwh), sub: `avg ${formatKwh(summary.avgSessionKwh)}/session`, icon: <Zap className="h-3 w-3 text-amber-600" />, color: 'bg-amber-100 dark:bg-amber-900/40' },
          { label: 'CO₂ offset', value: formatCo2(summary.totalCo2OffsetKg), sub: 'vs petrol equivalent', icon: <Leaf className="h-3 w-3 text-green-600" />, color: 'bg-green-100 dark:bg-green-900/40' },
          { label: 'Sessions', value: summary.totalSessions.toString(), sub: 'completed charges', icon: <BarChart2 className="h-3 w-3 text-blue-600" />, color: 'bg-blue-100 dark:bg-blue-900/40' },
        ].map((card, index) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.08 }}
          >
            <Card className="relative overflow-hidden border-none shadow-sm bg-card/50 backdrop-blur-sm border border-border/50">
              <CardContent className="p-4">
                <div className={`absolute top-3 right-3 p-1 rounded-full ${card.color}`}>
                  {card.icon}
                </div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">{card.label}</p>
                <p className="text-xl font-medium tabular-nums leading-none mb-1.5">{card.value}</p>
                <p className="text-[10px] text-muted-foreground truncate">{card.sub}</p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* ANALYTICS — BEST MONTH CALLOUT */}
      {summary.bestMonth && (
        <div className="mx-4 mb-4 border-l-4 border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 rounded-r-lg overflow-hidden">
          <div className="px-4 py-3">
            <p className="text-[13px] text-emerald-700 dark:text-emerald-400 font-medium mb-1">⚡ Your best month</p>
            <div className="flex items-baseline gap-2 mb-1">
              <p className="text-lg font-medium">{summary.bestMonth.monthLabel}</p>
              <p className="text-[14px] text-muted-foreground leading-none">{formatKwh(summary.bestMonth.totalKwh)} charged</p>
            </div>
            <p className="text-[12px] text-muted-foreground">
              {summary.bestMonth.sessionCount} sessions · {formatRs(summary.bestMonth.totalCost)} spent · {formatCo2(summary.bestMonth.totalKwh * 0.82)} CO₂ offset
            </p>
          </div>
        </div>
      )}

      {/* ANALYTICS — MONTHLY KWH CHART */}
      <Card className="mx-4 shadow-sm border-none bg-card/50 backdrop-blur-sm border border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-[15px] font-medium">Monthly energy</CardTitle>
          <CardDescription className="text-[12px]">kWh charged per month</CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <MonthlyKwhBar
            data={summary.monthlyStats}
            bestMonthKey={summary.bestMonth?.monthKey ?? null}
          />
        </CardContent>
      </Card>

      {/* ANALYTICS — TWO-COLUMN ROW */}
      <div className="flex flex-col sm:grid sm:grid-cols-2 gap-4 mx-4 mt-4">
        <Card className="shadow-sm border-none bg-card/50 backdrop-blur-sm border border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-[15px] font-medium">Connector types</CardTitle>
            <CardDescription className="text-[12px]">By sessions</CardDescription>
          </CardHeader>
          <CardContent className="pt-0 pb-6">
            <ConnectorDonut data={summary.connectorBreakdown} />
          </CardContent>
        </Card>

        <Card className="shadow-sm border-none bg-card/50 backdrop-blur-sm border border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-[15px] font-medium">Cost trend</CardTitle>
            <CardDescription className="text-[12px]">Avg per session</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <CostTrendLine data={summary.monthlyStats} />
          </CardContent>
        </Card>
      </div>

      {/* ANALYTICS — RECENT SESSIONS LIST */}
      <Card className="mx-4 mt-4 mb-8 shadow-sm border-none bg-card/50 backdrop-blur-sm border border-border/50">
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-[15px] font-medium">Recent sessions</CardTitle>
            <CardDescription className="text-[12px]">Last 5 charges</CardDescription>
          </div>
          <Button variant="ghost" size="sm" className="text-[12px] h-8" onClick={() => setLocation('/bookings')}>
            View all <ChevronRight className="ml-1 h-3 w-3" />
          </Button>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="divide-y divide-border">
            {bookings?.slice(0, 5).map((session) => (
              <div key={session.id} className="py-3 flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-medium truncate pr-4">{session.stationName}</p>
                  <p className="text-[12px] text-muted-foreground">
                    {session.startTime.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <div className="flex flex-col items-end gap-1">
                    <p className="text-[14px] font-medium leading-none">{formatRs(session.currentCost)}</p>
                    <div className="flex items-center gap-2">
                      <p className="text-[11px] text-muted-foreground">{formatKwh(session.kwhDelivered)}</p>
                      <Badge variant="outline" className="text-[10px] font-normal h-4 px-1 leading-none border-muted-foreground/30 text-muted-foreground">
                        {session.connectorType}
                      </Badge>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Analytics;

// ACCEPTANCE TESTS:
// Test 1 — Empty state: Log in as new user -> battery SVG shown, CTA visible.
// Test 2 — Metric cards: 3 sessions (₹45/5kWh, ₹80/8kWh, ₹60/6kWh) -> Spend ₹185, Energy 19kWh, CO2 15.6kg.
// Test 3 — Best month: Jan=2, Feb=8, Mar=5 -> Feb callout visible, Feb bar emerald.
// Test 4 — Empty month gap: Oct, Nov, Jan (Dec empty) -> Line chart shows gap in Dec.
// Test 5 — Connector donut: 3 CCS2 + 1 Type2 -> CCS2 emerald (75%), Type2 blue (25%).
// Test 6 — 500-doc cap: Mock 500 completed sessions -> Amber warning banner visible.
// Test 7 — TanStack Query caching: Re-visit within 5m -> No new network request.
// Test 8 — Skeleton: Slow 3G -> Placeholders visible, no layout shift.
// Test 9 — Mobile (375px): 2x2 metric cards, stacked charts, readable labels.
