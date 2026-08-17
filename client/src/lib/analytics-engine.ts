import { format } from 'date-fns';

export interface BookingRecord {
  id: string;
  userId: string;
  stationName: string;
  connectorType: string;
  kwhDelivered: number;
  currentCost: number;
  startTime: Date;
  endTime: Date | null;
  status: string;
}

export interface MonthlyStats {
  monthKey: string; // 'YYYY-MM' format
  monthLabel: string; // 'Oct 2025'
  totalKwh: number;
  totalCost: number;
  sessionCount: number;
  avgCostPerSession: number;
  avgKwhPerSession: number;
}

export interface ConnectorBreakdown {
  connectorType: string;
  sessionCount: number;
  totalKwh: number;
  percentage: number;
}

export interface AnalyticsSummary {
  totalSpendRs: number;
  totalKwh: number;
  totalCo2OffsetKg: number;
  totalSessions: number;
  monthlyStats: MonthlyStats[];
  connectorBreakdown: ConnectorBreakdown[];
  bestMonth: MonthlyStats | null;
  avgSessionCostRs: number;
  avgSessionKwh: number;
  firstSessionDate: Date | null;
}

/**
 * Returns the last 6 calendar months including the current month, oldest first.
 */
export function buildLastSixMonthKeys(): { key: string; label: string }[] {
  const now = new Date();
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleString('en-IN', { month: 'short', year: 'numeric' });
    return { key, label };
  });
}

/**
 * Computes the full analytics summary from a list of booking records.
 * 
 * 1. Basic Totals: Sum energy, cost, and sessions.
 * 2. CO2: Recompute based on 0.82kg/kWh factor.
 * 3. Monthly Aggregation: Map bookings to a 6-month window.
 * 4. Connector Breakdown: Calculate share of session types.
 * 5. Best Month: Find the month with peak energy delivery.
 */
export function computeAnalytics(bookings: BookingRecord[]): AnalyticsSummary {
  // STEP A — Basic totals
  const totalSessions = bookings.length;
  const totalKwh = bookings.reduce((sum, b) => sum + (b.kwhDelivered || 0), 0);
  const totalSpendRs = bookings.reduce((sum, b) => sum + (b.currentCost || 0), 0);
  const totalCo2OffsetKg = totalKwh * 0.82;
  const avgSessionCostRs = totalSessions > 0 ? totalSpendRs / totalSessions : 0;
  const avgSessionKwh = totalSessions > 0 ? totalKwh / totalSessions : 0;
  const firstSessionDate = bookings.length > 0
    ? bookings[bookings.length - 1].startTime
    : null;

  // STEP B — Monthly aggregation
  const months = buildLastSixMonthKeys();
  const monthMap = new Map<string, MonthlyStats>();

  months.forEach(({ key, label }) => {
    monthMap.set(key, {
      monthKey: key,
      monthLabel: label,
      totalKwh: 0,
      totalCost: 0,
      sessionCount: 0,
      avgCostPerSession: 0,
      avgKwhPerSession: 0,
    });
  });

  bookings.forEach(b => {
    const d = b.startTime;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (!monthMap.has(key)) return;
    const m = monthMap.get(key)!;
    m.totalKwh += b.kwhDelivered ?? 0;
    m.totalCost += b.currentCost ?? 0;
    m.sessionCount += 1;
  });

  monthMap.forEach(m => {
    m.avgCostPerSession = m.sessionCount > 0 ? m.totalCost / m.sessionCount : 0;
    m.avgKwhPerSession = m.sessionCount > 0 ? m.totalKwh / m.sessionCount : 0;
  });

  const monthlyStats = months.map(({ key }) => monthMap.get(key)!);

  // STEP C — Connector breakdown
  const connMap = new Map<string, { count: number; kwh: number }>();
  bookings.forEach(b => {
    const type = b.connectorType || 'Unknown';
    const existing = connMap.get(type) ?? { count: 0, kwh: 0 };
    connMap.set(type, {
      count: existing.count + 1,
      kwh: existing.kwh + (b.kwhDelivered ?? 0)
    });
  });

  const connectorBreakdown: ConnectorBreakdown[] = Array.from(connMap.entries())
    .map(([type, { count, kwh }]) => ({
      connectorType: type,
      sessionCount: count,
      totalKwh: kwh,
      percentage: totalSessions > 0 ? Math.round((count / totalSessions) * 100) : 0
    }))
    .sort((a, b) => b.sessionCount - a.sessionCount);

  // STEP D — Best month
  const bestMonth = monthlyStats.reduce<MonthlyStats | null>(
    (best, m) => (!best || m.totalKwh > best.totalKwh) ? m : best,
    null
  );

  return {
    totalSpendRs,
    totalKwh,
    totalCo2OffsetKg,
    totalSessions,
    monthlyStats,
    connectorBreakdown,
    bestMonth: (bestMonth && bestMonth.totalKwh > 0) ? bestMonth : null,
    avgSessionCostRs,
    avgSessionKwh,
    firstSessionDate
  };
}

// FORMAT HELPERS

export function formatRs(amount: number): string {
  const formatter = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  });
  let formatted = formatter.format(amount);
  if (amount % 1 === 0) {
    formatted = formatted.replace(/\.00$/, '');
  }
  return formatted;
}

export function formatKwh(kwh: number): string {
  return `${kwh.toFixed(1)} kWh`;
}

export function formatCo2(kg: number): string {
  if (kg >= 1000) {
    return `${(kg / 1000).toFixed(1)} tonnes`;
  }
  return `${kg.toFixed(1)} kg`;
}

export function formatMonthLabel(key: string): string {
  const [year, month] = key.split('-');
  const d = new Date(parseInt(year), parseInt(month) - 1);
  return d.toLocaleString('en-IN', { month: 'short', year: '2-digit' }).replace(' ', " '");
}
