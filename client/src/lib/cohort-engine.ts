/**
 * Cohort Engine
 * Pure computation module for driver retention analysis.
 * Handles grouping, classification, and metric computation.
 */

export type CohortType = 'loyal' | 'at_risk' | 'lost' | 'new';

export interface DriverProfile {
  userId: string;
  anonymizedId: string; // userId.slice(0, 6)
  firstVisit: Date;
  lastVisit: Date;
  totalSessions: number;
  totalSpend: number;
  stationsVisited: string[];
  daysSinceLastVisit: number;
}

export interface CohortedDriver extends DriverProfile {
  cohort: CohortType;
  cohortLabel: string;
}

export interface CohortMetrics {
  cohort: CohortType;
  cohortLabel: string;
  count: number;
  totalRevenue: number;
  avgSessionsPerDriver: number;
  avgSpendPerDriver: number;
  topDrivers: CohortedDriver[]; // top 5 by totalSpend, desc
}

export interface CohortAnalysisResult {
  profiles: CohortedDriver[];
  cohorts: Record<CohortType, CohortMetrics>;
  totalUniqueDrivers: number;
  totalRevenue: number;
  retentionRate: number; // loyal.count / totalUniqueDrivers * 100
  lostToLoyalRatio: number; // lost.count / Math.max(loyal.count, 1)
  hasRetentionProblem: boolean; // lostToLoyalRatio > 1
  computedAt: Date;
}

export interface RawBooking {
  id: string;
  userId: string;
  stationId: string;
  status: string;
  currentCost: number;
  startTime: Date;
}

export const COHORT_CONFIG: Record<CohortType, {
  label: string;
  description: string;
  colorClass: string;
  barColor: string;
  badgeClass: string;
  rule: string;
}> = {
  loyal: {
    label: 'Loyal',
    description: '3+ sessions, active in last 30 days',
    colorClass: 'bg-emerald-50 dark:bg-emerald-950/40',
    barColor: '#22c55e',
    badgeClass: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
    rule: '≥3 sessions AND last visit ≤30 days ago'
  },
  at_risk: {
    label: 'At Risk',
    description: '2+ sessions, inactive 31–90 days',
    colorClass: 'bg-amber-50 dark:bg-amber-950/40',
    barColor: '#f59e0b',
    badgeClass: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
    rule: '≥2 sessions AND last visit 31–90 days ago'
  },
  lost: {
    label: 'Lost',
    description: 'Inactive 90+ days or one-time visitor',
    colorClass: 'bg-red-50 dark:bg-red-950/40',
    barColor: '#ef4444',
    badgeClass: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
    rule: 'Last visit >90 days ago OR 1 session >14 days ago'
  },
  new: {
    label: 'New',
    description: 'First visit within last 14 days',
    colorClass: 'bg-blue-50 dark:bg-blue-950/40',
    barColor: '#3b82f6',
    badgeClass: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    rule: 'First visit within last 14 days'
  }
};

/**
 * Groups bookings by userId to build driver profiles.
 * Filters out bookings without a userId or non-completed status.
 */
export function buildDriverProfiles(bookings: RawBooking[]): DriverProfile[] {
  const driverMap = new Map<string, {
    sessions: RawBooking[];
    stations: Set<string>;
  }>();

  bookings
    .filter(b => b.status === 'completed' && b.userId)
    .forEach(b => {
      if (!driverMap.has(b.userId)) {
        driverMap.set(b.userId, { sessions: [], stations: new Set() });
      }
      const entry = driverMap.get(b.userId)!;
      entry.sessions.push(b);
      entry.stations.add(b.stationId);
    });

  const now = new Date();

  return Array.from(driverMap.entries()).map(([userId, { sessions, stations }]) => {
    const sortedDates = sessions
      .map(s => s.startTime)
      .sort((a, b) => a.getTime() - b.getTime());

    const firstVisit = sortedDates[0];
    const lastVisit = sortedDates[sortedDates.length - 1];
    const totalSpend = sessions.reduce((sum, s) => sum + (s.currentCost ?? 0), 0);
    const daysSinceLastVisit = Math.floor(
      (now.getTime() - lastVisit.getTime()) / 86400000
    );

    return {
      userId,
      anonymizedId: userId.slice(0, 6),
      firstVisit,
      lastVisit,
      totalSessions: sessions.length,
      totalSpend: Math.round(totalSpend * 100) / 100,
      stationsVisited: Array.from(stations),
      daysSinceLastVisit
    };
  });
}

/**
 * Assigns a cohort to a driver based on behavioral rules.
 * Priority order:
 * 1. New (First visit within 14 days)
 * 2. Loyal (3+ sessions, active last 30 days)
 * 3. At Risk (2+ sessions, inactive 31-90 days)
 * 4. Lost (Inactive >90 days OR 1 session >14 days ago)
 */
export function assignCohort(profile: DriverProfile): CohortType {
  const now = new Date();
  const daysSinceFirstVisit = Math.floor(
    (now.getTime() - profile.firstVisit.getTime()) / 86400000
  );

  // 1. NEW takes priority if within 14 days of first visit
  if (daysSinceFirstVisit <= 14) return 'new';

  // 2. LOYAL: High frequency and recent activity
  if (profile.totalSessions >= 3 && profile.daysSinceLastVisit <= 30)
    return 'loyal';

  // 3. AT_RISK: Proven frequency but starting to cold down
  if (profile.totalSessions >= 2
      && profile.daysSinceLastVisit > 30
      && profile.daysSinceLastVisit <= 90)
    return 'at_risk';

  // 4. LOST: Long-term inactivity or churned after one try
  if (profile.daysSinceLastVisit > 90) return 'lost';
  if (profile.totalSessions === 1 && profile.daysSinceLastVisit > 14) return 'lost';

  return 'lost'; // Safe default for edge cases
}

/**
 * Aggregates driver profiles into cohort metrics.
 */
export function computeCohortMetrics(
  drivers: CohortedDriver[]
): Record<CohortType, CohortMetrics> {
  const cohortTypes: CohortType[] = ['loyal', 'at_risk', 'lost', 'new'];

  return Object.fromEntries(
    cohortTypes.map(cohort => {
      const inCohort = drivers.filter(d => d.cohort === cohort);
      const count = inCohort.length;
      const totalRevenue = inCohort.reduce((s, d) => s + d.totalSpend, 0);
      const avgSessionsPerDriver = count > 0
        ? Math.round((inCohort.reduce((s, d) => s + d.totalSessions, 0) / count) * 10) / 10
        : 0;
      const avgSpendPerDriver = count > 0
        ? Math.round(totalRevenue / count * 100) / 100
        : 0;
      const topDrivers = [...inCohort]
        .sort((a, b) => b.totalSpend - a.totalSpend)
        .slice(0, 5);

      return [cohort, {
        cohort,
        cohortLabel: COHORT_CONFIG[cohort].label,
        count,
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        avgSessionsPerDriver,
        avgSpendPerDriver,
        topDrivers
      }];
    })
  ) as Record<CohortType, CohortMetrics>;
}

/**
 * Full analysis pipeline: Bookings -> Profiles -> Cohorts -> Metrics.
 * @param bookings Array of raw booking documents.
 */
export function runCohortAnalysis(bookings: RawBooking[]): CohortAnalysisResult {
  const profiles = buildDriverProfiles(bookings);

  const withCohorts: CohortedDriver[] = profiles.map(p => {
    const cohort = assignCohort(p);
    return { ...p, cohort, cohortLabel: COHORT_CONFIG[cohort].label };
  });

  const cohorts = computeCohortMetrics(withCohorts);
  const totalUniqueDrivers = withCohorts.length;
  const totalRevenue = withCohorts.reduce((s, d) => s + d.totalSpend, 0);
  const loyalCount = cohorts.loyal.count;
  const lostCount = cohorts.lost.count;
  
  const retentionRate = totalUniqueDrivers > 0
    ? Math.round((loyalCount / totalUniqueDrivers) * 100 * 10) / 10
    : 0;
    
  const lostToLoyalRatio = loyalCount > 0
    ? Math.round((lostCount / loyalCount) * 100) / 100
    : lostCount > 0 ? Infinity : 0;
    
  const hasRetentionProblem = lostCount > loyalCount;

  return {
    profiles: withCohorts,
    cohorts,
    totalUniqueDrivers,
    totalRevenue: Math.round(totalRevenue * 100) / 100,
    retentionRate,
    lostToLoyalRatio,
    hasRetentionProblem,
    computedAt: new Date()
  };
}

export function formatRs(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency', currency: 'INR', maximumFractionDigits: 0
  }).format(Math.round(amount));
}

export function formatDate(date: Date): string {
  return date.toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric'
  });
}

export function formatDaysAgo(date: Date): string {
  const days = Math.floor((Date.now() - date.getTime()) / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

/**
 * Anonymizes the userId for display. ONLY this should be used in UI components.
 */
export function anonymize(userId: string): string {
  return userId.slice(0, 6).toUpperCase();
}
