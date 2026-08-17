import { 
  getISOWeek, 
  getISOWeekYear, 
  differenceInCalendarISOWeeks, 
  endOfISOWeek, 
  differenceInDays,
  startOfISOWeek
} from "date-fns";

export interface StreakInfo {
  currentStreak: number;
  longestStreak: number;
  lastChargeWeek: number;
  lastChargeYear: number;
  streakBroken: boolean;
  daysUntilStreakExpires: number;
}

/**
 * Returns ISO week number (1–53) and year
 */
export function getISOWeekInfo(date: Date): { week: number; year: number } {
  return {
    week: getISOWeek(date),
    year: getISOWeekYear(date)
  };
}

/**
 * Computes the charging streak based on completed sessions.
 * A streak is maintained by having at least one completed session per ISO week.
 */
export function computeStreak(
  sessions: Array<{ startTime: Date; status: string }>,
  storedStreak: number,
  storedLastWeek: number,
  storedLastYear: number,
  storedLongestStreak: number
): StreakInfo {
  const now = new Date();
  const currentWeekStart = startOfISOWeek(now);
  
  // Filter and sort completed sessions by date descending
  const completedSessions = sessions
    .filter(s => s.status === "COMPLETED" || s.status === "completed")
    .sort((a, b) => b.startTime.getTime() - a.startTime.getTime());

  if (completedSessions.length === 0) {
    return {
      currentStreak: 0,
      longestStreak: storedLongestStreak,
      lastChargeWeek: 0,
      lastChargeYear: 0,
      streakBroken: storedStreak > 0,
      daysUntilStreakExpires: 0
    };
  }

  // Get unique ISO weeks represented in sessions
  const uniqueWeeks = new Map<string, Date>();
  completedSessions.forEach(s => {
    const key = `${getISOWeekYear(s.startTime)}-W${getISOWeek(s.startTime)}`;
    if (!uniqueWeeks.has(key)) {
      uniqueWeeks.set(key, startOfISOWeek(s.startTime));
    }
  });

  const sortedWeeks = Array.from(uniqueWeeks.values()).sort((a, b) => b.getTime() - a.getTime());

  const mostRecentWeek = sortedWeeks[0];
  const weeksSinceMostRecent = differenceInCalendarISOWeeks(currentWeekStart, mostRecentWeek);

  let currentStreak = 0;
  let streakBroken = false;

  if (weeksSinceMostRecent > 1) {
    // Gap is more than one week, streak is definitely broken
    streakBroken = true;
    currentStreak = 0;
  } else {
    // Current or previous week has a session, we have a streak
    currentStreak = 1;
    for (let i = 0; i < sortedWeeks.length - 1; i++) {
      const weeksBetween = differenceInCalendarISOWeeks(sortedWeeks[i], sortedWeeks[i + 1]);
      if (weeksBetween === 1) {
        currentStreak++;
      } else {
        break;
      }
    }
  }

  const lastSessionWeek = getISOWeekInfo(completedSessions[0].startTime);
  const endOfThisWeek = endOfISOWeek(now);
  const daysUntilStreakExpires = Math.max(0, differenceInDays(endOfThisWeek, now));

  return {
    currentStreak,
    longestStreak: Math.max(currentStreak, storedLongestStreak),
    lastChargeWeek: lastSessionWeek.week,
    lastChargeYear: lastSessionWeek.year,
    streakBroken,
    daysUntilStreakExpires
  };
}
