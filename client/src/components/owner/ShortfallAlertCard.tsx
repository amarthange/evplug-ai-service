import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { type ForecastMetrics, formatRsFull } from '@/lib/revenue-forecast-engine';

interface ShortfallAlertCardProps {
  metrics: ForecastMetrics
  monthlyTarget: number
  onEnableSurge: () => void
  onCreatePromotion: () => void
  onExtendHours: () => void
  onDismiss: () => void
}

const SEVERITY_STYLES = {
  moderate: {
    border: 'border-amber-200 dark:border-amber-800',
    bg: 'bg-amber-50 dark:bg-amber-950/40',
    iconBg: 'bg-amber-100 dark:bg-amber-900',
    iconColor: 'text-amber-600 dark:text-amber-400',
    titleColor: 'text-amber-900 dark:text-amber-100',
    bodyColor: 'text-amber-700 dark:text-amber-300',
    badgeColor: 'bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-200',
    label: 'Moderate gap'
  },
  significant: {
    border: 'border-orange-200 dark:border-orange-800',
    bg: 'bg-orange-50 dark:bg-orange-950/40',
    iconBg: 'bg-orange-100 dark:bg-orange-900',
    iconColor: 'text-orange-600 dark:text-orange-400',
    titleColor: 'text-orange-900 dark:text-orange-100',
    bodyColor: 'text-orange-700 dark:text-orange-300',
    badgeColor: 'bg-orange-100 dark:bg-orange-900 text-orange-800 dark:text-orange-200',
    label: 'Significant gap'
  },
  critical: {
    border: 'border-red-200 dark:border-red-800',
    bg: 'bg-red-50 dark:bg-red-950/40',
    iconBg: 'bg-red-100 dark:bg-red-900',
    iconColor: 'text-red-600 dark:text-red-400',
    titleColor: 'text-red-900 dark:text-red-100',
    bodyColor: 'text-red-700 dark:text-red-300',
    badgeColor: 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200',
    label: 'Critical — unlikely to hit target'
  }
} as const;

const ShortfallAlertCard = ({
  metrics,
  onEnableSurge,
  onCreatePromotion,
  onExtendHours,
  onDismiss
}: ShortfallAlertCardProps) => {
  const [showCalc, setShowCalc] = useState(false);
  const styles = SEVERITY_STYLES[metrics.severity as keyof typeof SEVERITY_STYLES] ?? SEVERITY_STYLES.moderate;
  const hasHistory = metrics.trailing7DayTotal > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: -8, height: 0 }}
      animate={{ opacity: 1, y: 0, height: 'auto' }}
      exit={{ opacity: 0, y: -8, height: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className={cn(
        'rounded-xl border overflow-hidden shadow-sm',
        styles.border, styles.bg
      )}
    >
      <div className="p-4">
        {/* Header */}
        <div className="flex items-start gap-3 mb-3">
          <div className={cn(
            'h-9 w-9 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-inner',
            styles.iconBg
          )}>
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
              <path d="M8 2L14 13H2L8 2Z"
                stroke="currentColor" strokeWidth="1.5"
                strokeLinejoin="round" fill="none"
                className={styles.iconColor}/>
              <path d="M8 7V9M8 11V11.5"
                stroke="currentColor" strokeWidth="1.5"
                strokeLinecap="round"
                className={styles.iconColor}/>
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className={cn('text-sm font-black uppercase tracking-tight', styles.titleColor)}>
                Revenue shortfall detected
              </h4>
              <span className={cn(
                'text-[10px] px-2 py-0.5 rounded-full font-black uppercase tracking-widest',
                styles.badgeColor
              )}>
                {styles.label}
              </span>
            </div>
          </div>
          <button
            onClick={onDismiss}
            className="text-muted-foreground hover:text-foreground
                       ml-2 flex-shrink-0 text-xl leading-none transition-colors"
            aria-label="Dismiss alert for 24 hours"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className={cn('text-sm mb-4 leading-relaxed', styles.bodyColor)}>
          {!hasHistory ? (
            <p className="font-medium italic">
              "No revenue in the past 7 days — target unreachable at current pace."
            </p>
          ) : (
            <p>
              At current pace you'll reach{' '}
              <span className="font-black">
                {formatRsFull(metrics.projectedMonthEnd)}
              </span>
              {' '}—{' '}
              <span className="font-black underline decoration-2 underline-offset-2">
                {formatRsFull(metrics.shortfallAmount)} below target
              </span>
              .{' '}
              You need{' '}
              <span className="font-black">
                {formatRsFull(metrics.requiredDailyAvg)}/day
              </span>
              {' '}but averaging{' '}
              <span className="font-medium opacity-80">
                {formatRsFull(metrics.trailing7DayAvgRevenue)}/day
              </span>
              {' '}over the last 7 days.
              {' '}
              <span className="text-[11px] font-black uppercase tracking-widest opacity-60 block mt-1">
                {metrics.daysRemainingThisMonth} days left this month
              </span>
            </p>
          )}
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <button
            onClick={onEnableSurge}
            className="flex flex-col items-start p-3 rounded-xl border
                       border-border bg-background hover:bg-muted
                       transition-all hover:scale-[1.02] active:scale-[0.98] text-left group"
          >
            <span className="text-xs font-black uppercase tracking-widest text-foreground mb-1 flex items-center gap-1.5">
              <span className="text-amber-500 group-hover:animate-pulse">⚡</span> Surge pricing
            </span>
            <span className="text-[10px] text-muted-foreground leading-tight font-medium">
              Charge more per kWh during peak hours
            </span>
          </button>

          <button
            onClick={onCreatePromotion}
            className="flex flex-col items-start p-3 rounded-xl border
                       border-border bg-background hover:bg-muted
                       transition-all hover:scale-[1.02] active:scale-[0.98] text-left group"
          >
            <span className="text-xs font-black uppercase tracking-widest text-foreground mb-1 flex items-center gap-1.5">
              <span className="text-rose-500 group-hover:scale-110 transition-transform">🎁</span> Promotion
            </span>
            <span className="text-[10px] text-muted-foreground leading-tight font-medium">
              Run a discount to drive more bookings
            </span>
          </button>

          <button
            onClick={onExtendHours}
            className="flex flex-col items-start p-3 rounded-xl border
                       border-border bg-background hover:bg-muted
                       transition-all hover:scale-[1.02] active:scale-[0.98] text-left group"
          >
            <span className="text-xs font-black uppercase tracking-widest text-foreground mb-1 flex items-center gap-1.5">
              <span className="text-sky-500 group-hover:rotate-12 transition-transform">🕐</span> Extend hours
            </span>
            <span className="text-[10px] text-muted-foreground leading-tight font-medium">
              Open earlier or close later to add sessions
            </span>
          </button>
        </div>

        {/* Calculation Toggle */}
        <button
          onClick={() => setShowCalc(s => !s)}
          className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 mt-4 hover:text-muted-foreground transition-colors flex items-center gap-1"
        >
          {showCalc ? 'Hide' : 'See'} internal calculation →
        </button>

        {showCalc && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className={cn(
              'mt-3 p-3 rounded-xl text-[11px] space-y-1.5 font-mono border border-white/10',
              'bg-black/5 dark:bg-white/5 shadow-inner'
            )}
          >
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground uppercase tracking-tighter">Revenue this month</span>
              <span className="font-bold">{formatRsFull(metrics.revenueThisMonth)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground uppercase tracking-tighter">Days elapsed / remaining</span>
              <span className="font-bold">{metrics.daysElapsedThisMonth} / {metrics.daysRemainingThisMonth}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground uppercase tracking-tighter">7-day avg/day</span>
              <span className="font-bold">{formatRsFull(metrics.trailing7DayAvgRevenue)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground uppercase tracking-tighter">Projected month-end</span>
              <span className="font-bold">{formatRsFull(metrics.projectedMonthEnd)}</span>
            </div>
            <div className="flex justify-between items-center font-black border-t border-white/5 pt-1.5 mt-1.5 uppercase">
              <span className="text-muted-foreground tracking-tighter">Shortfall ratio</span>
              <span className={metrics.shortfallRatio > 2 ? 'text-destructive' : 'text-amber-500'}>
                {metrics.shortfallRatio.toFixed(2)}×
              </span>
            </div>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
};

export default ShortfallAlertCard;

// ACCEPTANCE TESTS:
// Test 1 — No alert when on track:
// monthlyTarget = ₹10,000, revenueThisMonth = ₹8,000, 5 days remaining
// trailing7DayAvg = ₹500/day, projectedMonthEnd = ₹8,000 + (500×5) = ₹10,500
// Expected: isOnTrack = true, isShortfall = false, NO alert card rendered

// Test 2 — Moderate alert:
// monthlyTarget = ₹10,000, revenueThisMonth = ₹4,000, 15 days remaining
// trailing7DayAvg = ₹200/day, requiredDailyAvg = (10000-4000)/15 = ₹400/day
// shortfallRatio = 400/200 = 2.0 → severity = 'significant'
// Expected: orange alert card shown, body shows '₹7,000 projected vs ₹10,000 target'

// Test 3 — Dismiss for 24h:
// Alert is showing. Click × dismiss button.
// Expected: alert animates out, localStorage has 'seniordevops_shortfall_dismissed_until' key

// Test 4 — Surge pricing action button:
// Click 'Surge pricing' action button in alert
// Expected: surge override panel opens

// Test 5 — Create promotion action:
// Click 'Promotion' action button
// Expected: Wouter navigate('/owner/promotions') called

// Test 6 — Extend hours modal:
// Click 'Extend hours' button, ExtendHoursModal opens

// Test 7 — Sparkline bridge point:
// Verify today's data point appears in BOTH solid actual line and dashed projected line

// Test 8 — Zero revenue history:
// trailing7DayAvg = 0, shortfallRatio = Infinity → severity = 'critical'

// Test 9 — Month-end suppression:
// daysRemainingThisMonth = 2 → isShortfall = false

// Test 10 — useMemo recomputation:
// processAnalytics() runs → forecastMetrics recomputes
