import { type CachedSession } from './session-cache';

export interface DailyBucket {
  dayLabel: string; // 'Mon', 'Tue' etc.
  date: Date;
  sessionCount: number;
  totalKwh: number;
  totalCost: number;
}

export interface WeeklyReport {
  weekLabel: string; // 'Week of 28 Apr – 4 May'
  totalSessions: number;
  totalKwh: number;
  totalCost: number;
  totalCo2Kg: number; // totalKwh * 0.82
  avgCostPerSession: number;
  peakDay: string; // day with most kWh
  dailyBuckets: DailyBucket[]; // 7 items, Mon–Sun
  hasData: boolean;
}

/**
 * Returns 00:00:00 of the most recent Monday.
 * If today IS Monday: returns today at midnight.
 */
export function getLastMondayDate(): Date {
  const d = new Date();
  const day = d.getDay(); // 0=Sun, 1=Mon...
  // If day is 0 (Sun), we need to go back 6 days.
  // If day is 1 (Mon), we go back 0 days.
  // If day is 2 (Tue), we go back 1 day.
  const daysBack = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - daysBack);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Build weekly report from cached sessions.
 */
export function buildWeeklyReport(
  cachedSessions: CachedSession[]
): WeeklyReport {
  const weekStart = getLastMondayDate();
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);

  // Filter sessions: startTime >= weekStart AND startTime < weekEnd AND status === 'completed'
  const currentWeekSessions = cachedSessions.filter(s => {
    const start = new Date(s.startTime);
    return (
      start >= weekStart &&
      start < weekEnd &&
      s.status?.toLowerCase() === 'completed'
    );
  });

  const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const dailyBuckets: DailyBucket[] = dayLabels.map((label, index) => {
    const bucketDate = new Date(weekStart);
    bucketDate.setDate(weekStart.getDate() + index);
    
    // Filter sessions for this specific day
    const nextDay = new Date(bucketDate);
    nextDay.setDate(bucketDate.getDate() + 1);

    const daySessions = currentWeekSessions.filter(s => {
      const start = new Date(s.startTime);
      return start >= bucketDate && start < nextDay;
    });

    return {
      dayLabel: label,
      date: bucketDate,
      sessionCount: daySessions.length,
      totalKwh: daySessions.reduce((acc, s) => acc + (s.energyDelivered || 0), 0),
      totalCost: daySessions.reduce((acc, s) => acc + (s.totalCost || 0), 0),
    };
  });

  const totalSessions = currentWeekSessions.length;
  const totalKwh = currentWeekSessions.reduce((acc, s) => acc + (s.energyDelivered || 0), 0);
  const totalCost = currentWeekSessions.reduce((acc, s) => acc + (s.totalCost || 0), 0);
  const totalCo2Kg = totalKwh * 0.82;
  const avgCostPerSession = totalSessions > 0 ? totalCost / totalSessions : 0;

  // Find peak day
  let peakDay = 'None';
  if (totalSessions > 0) {
    const sorted = [...dailyBuckets].sort((a, b) => b.totalKwh - a.totalKwh);
    peakDay = sorted[0].dayLabel;
  }

  // Week label formatting
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const startDay = weekStart.getDate();
  const startMonth = monthNames[weekStart.getMonth()];
  
  const endOfWeek = new Date(weekStart);
  endOfWeek.setDate(weekStart.getDate() + 6);
  const endDay = endOfWeek.getDate();
  const endMonth = monthNames[endOfWeek.getMonth()];

  const weekLabel = `Week of ${startDay} ${startMonth} – ${endDay} ${endMonth}`;

  return {
    weekLabel,
    totalSessions,
    totalKwh,
    totalCost,
    totalCo2Kg,
    avgCostPerSession,
    peakDay,
    dailyBuckets,
    hasData: totalSessions > 0,
  };
}
