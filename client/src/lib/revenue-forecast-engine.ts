/**
 * Revenue Forecast Engine
 * 
 * Why trailing 7-day average: Provides a more stable baseline for short-term projections 
 * than month-to-date, which can be skewed by early-month variance.
 * 
 * Why daysRemaining excludes today: Today's revenue is in-progress and already counted
 * in revenueThisMonth. Projection starts from tomorrow.
 * 
 * Bridge point pattern: Today's actual value is duplicated as the first projected 
 * value to ensure the two lines in the sparkline connect seamlessly.
 * 
 * Edge cases: shortfallRatio = Infinity if there's a required average but 0 historical 
 * daily average (e.g. new station).
 */

export interface DailyRevenue {
  dateKey: string      // 'YYYY-MM-DD'
  dateLabel: string    // 'Jan 15' for display
  revenue: number      // total completed session revenue for this day
  isProjected: boolean // false = actual, true = forecast
  isToday: boolean
}

export interface ForecastMetrics {
  // Core metrics
  revenueThisMonth: number
  trailing7DayAvgRevenue: number
  trailing7DayTotal: number
  requiredDailyAvg: number
  projectedMonthEnd: number
  shortfallRatio: number
  shortfallAmount: number          // monthlyTarget - projectedMonthEnd
  daysRemainingThisMonth: number
  daysElapsedThisMonth: number

  // Derived
  isShortfall: boolean             // shortfallRatio > 1.3 AND daysRemaining > 3
  severity: 'none' | 'moderate' | 'significant' | 'critical'
  isOnTrack: boolean               // projectedMonthEnd >= monthlyTarget
  surplusAmount: number            // > 0 if on track, 0 if shortfall

  // Sparkline data
  sparklineData: DailyRevenue[]    // 28 items: last 14 days + next 14 days

  // Diagnostics
  dataPointCount: number           // bookings used in computation
  computedAt: Date
}

function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${
    String(date.getMonth() + 1).padStart(2, '0')}-${
    String(date.getDate()).padStart(2, '0')}`
}

function toDateLabel(date: Date): string {
  return date.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })
}

/**
 * Aggregates completed bookings into daily revenue buckets.
 */
export function aggregateDailyRevenue(
  bookings: Array<{ startTime: Date; currentCost: number; status: string }>,
  fromDate: Date,
  toDate: Date
): Map<string, number> {
  const map = new Map<string, number>()

  // Initialise all days in range with 0
  const cursor = new Date(fromDate)
  cursor.setHours(0,0,0,0)
  const end = new Date(toDate)
  end.setHours(23,59,59,999)

  while (cursor <= end) {
    map.set(toDateKey(new Date(cursor)), 0)
    cursor.setDate(cursor.getDate() + 1)
  }

  // Aggregate completed bookings into days
  bookings.forEach(b => {
    // Note: status check should be flexible based on codebase
    const isCompleted = b.status === 'completed' || b.status === 'COMPLETED';
    if (!isCompleted) return
    
    const key = toDateKey(b.startTime)
    if (map.has(key)) {
      map.set(key, (map.get(key)! + (b.currentCost ?? 0)))
    }
  })

  return map
}

/**
 * Computes all forecasting metrics based on historical bookings and monthly target.
 */
export function computeForecastMetrics(
  bookings: Array<{ startTime: Date; currentCost: number; status: string }>,
  monthlyTarget: number
): ForecastMetrics {
  const now = new Date()
  const todayKey = toDateKey(now)

  // Month boundaries
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  const daysInMonth = monthEnd.getDate()
  const daysElapsedThisMonth = now.getDate()
  const daysRemainingThisMonth = daysInMonth - daysElapsedThisMonth

  // 7-day window (last 7 full days, NOT including today)
  const sevenDaysAgo = new Date(now)
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
  sevenDaysAgo.setHours(0,0,0,0)
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  yesterday.setHours(23,59,59,999)

  // Sparkline: 14 days ago → 14 days from now
  const sparkStart = new Date(now)
  sparkStart.setDate(sparkStart.getDate() - 14)
  sparkStart.setHours(0,0,0,0)
  const sparkEnd = new Date(now)
  sparkEnd.setDate(sparkEnd.getDate() + 13)
  sparkEnd.setHours(23,59,59,999)

  // Revenue aggregations
  const monthlyMap = aggregateDailyRevenue(bookings, monthStart, now)
  const revenueThisMonth = Array.from(monthlyMap.values()).reduce((s,v) => s+v, 0)

  const trailing7Map = aggregateDailyRevenue(bookings, sevenDaysAgo, yesterday)
  const trailing7DayTotal = Array.from(trailing7Map.values()).reduce((s,v) => s+v, 0)
  const trailing7DayAvgRevenue = trailing7DayTotal / 7

  const sparkActualMap = aggregateDailyRevenue(bookings, sparkStart, now)

  // Forecast metrics
  const requiredDailyAvg = daysRemainingThisMonth > 0
    ? Math.max(0, (monthlyTarget - revenueThisMonth) / daysRemainingThisMonth)
    : 0

  const projectedMonthEnd = (trailing7DayAvgRevenue * daysRemainingThisMonth) + revenueThisMonth

  const shortfallRatio = trailing7DayAvgRevenue > 0
    ? requiredDailyAvg / trailing7DayAvgRevenue
    : requiredDailyAvg > 0 ? Infinity : 1

  const shortfallAmount = monthlyTarget - projectedMonthEnd
  const surplusAmount = Math.max(0, -shortfallAmount)

  const isOnTrack = projectedMonthEnd >= monthlyTarget
  const isShortfall = !isOnTrack && shortfallRatio > 1.3 && daysRemainingThisMonth > 3

  const severity: ForecastMetrics['severity'] =
    !isShortfall ? 'none' :
    shortfallRatio <= 1.5 ? 'moderate' :
    shortfallRatio <= 2.0 ? 'significant' :
    'critical'

  // Sparkline data (28 data points)
  const sparklineData: DailyRevenue[] = []

  // Last 14 days: actual revenue
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    d.setHours(0,0,0,0)
    const key = toDateKey(d)
    sparklineData.push({
      dateKey: key,
      dateLabel: toDateLabel(d),
      revenue: sparkActualMap.get(key) ?? 0,
      isProjected: false,
      isToday: key === todayKey
    })
  }

  // Next 14 days: projected
  for (let i = 1; i <= 14; i++) {
    const d = new Date(now)
    d.setDate(d.getDate() + i)
    const key = toDateKey(d)
    sparklineData.push({
      dateKey: key,
      dateLabel: toDateLabel(d),
      revenue: Math.round(trailing7DayAvgRevenue),
      isProjected: true,
      isToday: false
    })
  }

  // Cap projected days at month end
  const cappedSparkline = sparklineData.map(d => {
    if (d.isProjected) {
      const dDate = new Date(d.dateKey)
      if (dDate > monthEnd) return { ...d, revenue: 0 }
    }
    return d
  })

  return {
    revenueThisMonth: Math.round(revenueThisMonth),
    trailing7DayAvgRevenue: Math.round(trailing7DayAvgRevenue * 100) / 100,
    trailing7DayTotal: Math.round(trailing7DayTotal),
    requiredDailyAvg: Math.round(requiredDailyAvg * 100) / 100,
    projectedMonthEnd: Math.round(projectedMonthEnd),
    shortfallRatio: Math.round(shortfallRatio * 100) / 100,
    shortfallAmount: Math.round(shortfallAmount),
    daysRemainingThisMonth,
    daysElapsedThisMonth,
    isShortfall,
    severity,
    isOnTrack,
    surplusAmount: Math.round(surplusAmount),
    sparklineData: cappedSparkline,
    dataPointCount: bookings.filter(b => b.status === 'completed' || b.status === 'COMPLETED').length,
    computedAt: new Date()
  }
}

const DISMISS_KEY = 'seniordevops_shortfall_dismissed_until'

export function getShortfallDismissedUntil(): number | null {
  const raw = localStorage.getItem(DISMISS_KEY)
  if (!raw) return null
  const ts = parseInt(raw, 10)
  return isNaN(ts) ? null : ts
}

export function dismissShortfallAlert(): void {
  const until = Date.now() + 24 * 60 * 60 * 1000   // 24 hours from now
  localStorage.setItem(DISMISS_KEY, until.toString())
}

export function clearShortfallDismiss(): void {
  localStorage.removeItem(DISMISS_KEY)
}

export function isShortfallAlertDismissed(): boolean {
  const until = getShortfallDismissedUntil()
  if (until === null) return false
  return Date.now() < until
}

export function formatRsCompact(amount: number): string {
  if (amount >= 100000) return `₹${(amount / 100000).toFixed(1)}L`
  if (amount >= 1000) return `₹${(amount / 1000).toFixed(1)}k`
  return `₹${Math.round(amount)}`
}

export function formatRsFull(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0
  }).format(Math.round(amount))
}
