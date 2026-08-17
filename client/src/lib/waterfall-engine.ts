/**
 * WATERFALL — waterfall-engine.ts
 * Pure computation logic for the Revenue Waterfall chart and breakdown.
 */

export type WaterfallPeriod = 'this_month' | 'last_month' | 'last_3_months';

export interface WaterfallConfig {
  platformFeePercent: number; // from Firestore, e.g. 15
  gstPercent: number;        // from Firestore, e.g. 18
}

export interface WaterfallAmounts {
  grossRevenue: number;
  platformFee: number;
  gstOnFee: number;
  netPayout: number;
  platformFeePercent: number;  // stored for display, e.g. 15
  gstPercent: number;          // stored for display, e.g. 18
  effectiveGstPercent: number; // gstOnFee / grossRevenue * 100
  netPayoutPercent: number;    // netPayout / grossRevenue * 100
}

export interface WaterfallBar {
  label: string;        // x-axis label
  base: number;         // invisible stack base
  value: number;        // visible bar height
  total: number;        // base + value (for tooltip)
  color: string;        // hex color
  isDeduction: boolean; // true for platform fee and GST bars
  isResult: boolean;    // true for the 'Your payout' bar
}

export interface PeriodBounds {
  start: Date;
  end: Date;
  label: string;        // e.g. 'April 2026'
}

export interface RawBookingForWaterfall {
  id: string;
  status: string;
  currentCost: number;
  startTime: Date;
  stationId: string;
}

/**
 * Computes the date bounds for the selected period.
 * Handles negative months for cross-year transitions via JavaScript's Date constructor.
 */
export function getPeriodBounds(period: WaterfallPeriod): PeriodBounds {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  if (period === 'this_month') {
    const start = new Date(currentYear, currentMonth, 1);
    const end = new Date(currentYear, currentMonth + 1, 0, 23, 59, 59, 999);
    const label = now.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
    return { start, end, label };
  }

  if (period === 'last_month') {
    const start = new Date(currentYear, currentMonth - 1, 1);
    const end = new Date(currentYear, currentMonth, 0, 23, 59, 59, 999);
    const label = start.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
    return { start, end, label };
  }

  if (period === 'last_3_months') {
    const start = new Date(currentYear, currentMonth - 2, 1);
    const end = new Date(currentYear, currentMonth + 1, 0, 23, 59, 59, 999);
    const startLabel = start.toLocaleDateString('en-IN', { month: 'short' });
    const endLabel = now.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
    return { start, end, label: `${startLabel}–${endLabel}` };
  }

  return getPeriodBounds('this_month');
}

export function computeGrossRevenue(
  bookings: RawBookingForWaterfall[],
  period: WaterfallPeriod
): number {
  const bounds = getPeriodBounds(period);

  const sum = bookings
    .filter(b =>
      b.status === 'completed' &&
      b.startTime >= bounds.start &&
      b.startTime <= bounds.end
    )
    .reduce((sum, b) => sum + (b.currentCost ?? 0), 0);

  return Math.round(sum * 100) / 100;
}

/**
 * Computes detailed waterfall amounts with rounding at each step to prevent drift.
 * Fee rates are read from Firestore config, not hardcoded.
 */
export function computeWaterfallAmounts(
  bookings: RawBookingForWaterfall[],
  config: WaterfallConfig,
  period: WaterfallPeriod
): WaterfallAmounts {
  const grossRevenue = computeGrossRevenue(bookings, period);

  const platformFeePercent = config.platformFeePercent;
  const gstPercent = config.gstPercent;

  // Rounding contract: 2 decimal places at each step
  const platformFee = Math.round(grossRevenue * (platformFeePercent / 100) * 100) / 100;
  const gstOnFee = Math.round(platformFee * (gstPercent / 100) * 100) / 100;
  const netPayout = Math.round((grossRevenue - platformFee - gstOnFee) * 100) / 100;

  const effectiveGstPercent = grossRevenue > 0
    ? Math.round((gstOnFee / grossRevenue) * 100 * 100) / 100
    : 0;

  const netPayoutPercent = grossRevenue > 0
    ? Math.round((netPayout / grossRevenue) * 100 * 10) / 10
    : 0;

  return {
    grossRevenue,
    platformFee,
    gstOnFee,
    netPayout,
    platformFeePercent,
    gstPercent,
    effectiveGstPercent,
    netPayoutPercent
  };
}

/**
 * Builds the bar data for Recharts using the "stacked bar trick":
 * - 'base' bar is transparent/invisible offset
 * - 'value' bar is the visible coloured part
 * - Deduction bars (Fee, GST) hang down from the previous total
 * - Result bar (Payout) starts from zero
 */
export function buildWaterfallBars(amounts: WaterfallAmounts): WaterfallBar[] {
  const { grossRevenue, platformFee, gstOnFee, netPayout } = amounts;

  return [
    {
      label: 'Gross',
      base: 0,
      value: grossRevenue,
      total: grossRevenue,
      color: '#22c55e',      // green-500
      isDeduction: false,
      isResult: false
    },
    {
      label: 'Platform fee',
      base: Math.max(0, grossRevenue - platformFee),
      value: platformFee,
      total: platformFee,
      color: '#ef4444',      // red-500
      isDeduction: true,
      isResult: false
    },
    {
      label: 'GST on fee',
      base: Math.max(0, grossRevenue - platformFee - gstOnFee),
      value: gstOnFee,
      total: gstOnFee,
      color: '#f97316',      // orange-500
      isDeduction: true,
      isResult: false
    },
    {
      label: 'Net payout',
      base: 0,
      value: Math.max(0, netPayout),
      total: netPayout,
      color: '#10b981',      // emerald-500
      isDeduction: false,
      isResult: true
    }
  ];
}

export function formatYAxisTick(value: number): string {
  if (value === 0) return '₹0';
  if (value >= 100000) return `₹${(value / 100000).toFixed(1)}L`;
  if (value >= 1000) return `₹${(value / 1000).toFixed(1)}k`;
  return `₹${Math.round(value)}`;
}

export function formatRsFull(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2
  }).format(amount);
}

export function formatRsCompact(amount: number): string {
  const abs = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';
  if (abs >= 100000) return `${sign}₹${(abs / 100000).toFixed(2)}L`;
  if (abs >= 1000) return `${sign}₹${(abs / 1000).toFixed(2)}k`;
  return `${sign}₹${abs.toFixed(2)}`;
}

export const PERIOD_CONFIG: Record<WaterfallPeriod, {
  label: string;
  shortLabel: string;
}> = {
  this_month: {
    label: 'This month',
    shortLabel: 'Month'
  },
  last_month: {
    label: 'Last month',
    shortLabel: 'Last mo.'
  },
  last_3_months: {
    label: 'Last 3 months',
    shortLabel: '3 months'
  }
};
