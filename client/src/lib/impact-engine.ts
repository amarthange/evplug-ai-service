import { type CachedSession } from './session-cache';

const CO2_KG_PER_KWH = 0.82;
const PETROL_CO2_KG_PER_KM = 0.21;
const KWH_PER_KM_PETROL_EQUIVALENT = 0.20;
const KG_CO2_PER_TREE_PER_YEAR = 21;

export interface ImpactMetrics {
  lifetimeSessions: number;
  lifetimeKwh: number;
  lifetimeCo2Kg: number;
  lifetimeCostInr: number;
  petrolKmEquivalent: number;
  treesEquivalent: number;
  monthlyCo2: Array<{
    month: string;
    co2Kg: number;
    kWh: number;
  }>;
  bestMonth: string;
  firstSessionDate: Date | null;
  streak: number;
  hasData: boolean;
}

export function computeImpactMetrics(
  cachedSessions: CachedSession[]
): ImpactMetrics {
  const completedSessions = cachedSessions.filter(
    (s) => s.status?.toLowerCase() === 'completed'
  );

  const hasData = completedSessions.length > 0;
  
  if (!hasData) {
    return {
      lifetimeSessions: 0,
      lifetimeKwh: 0,
      lifetimeCo2Kg: 0,
      lifetimeCostInr: 0,
      petrolKmEquivalent: 0,
      treesEquivalent: 0,
      monthlyCo2: [],
      bestMonth: 'None',
      firstSessionDate: null,
      streak: 0,
      hasData: false,
    };
  }

  let lifetimeKwh = 0;
  let lifetimeCostInr = 0;
  let firstSessionDate: Date | null = null;
  
  // To group by month
  const monthlyMap = new Map<string, { co2Kg: number; kWh: number }>();

  // To compute streak, we need weeks where there was a session
  // Set of ISO week strings (e.g. '2026-W01')
  const weeksWithSessions = new Set<string>();

  completedSessions.forEach((session) => {
    const energy = session.energyDelivered || 0;
    const cost = session.totalCost || 0;
    const date = new Date(session.startTime);

    lifetimeKwh += energy;
    lifetimeCostInr += cost;

    // First session
    if (!firstSessionDate || date < firstSessionDate) {
      firstSessionDate = date;
    }

    // Monthly grouping
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthLabel = `${monthNames[date.getMonth()]} ${date.getFullYear()}`;
    
    const existing = monthlyMap.get(monthLabel) || { co2Kg: 0, kWh: 0 };
    existing.kWh += energy;
    existing.co2Kg += energy * CO2_KG_PER_KWH;
    monthlyMap.set(monthLabel, existing);

    // Week tracking for streak
    // A simple way is to use Monday as start of week and get the timestamp of that Monday
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
    const monday = new Date(date.setDate(diff));
    monday.setHours(0, 0, 0, 0);
    weeksWithSessions.add(monday.toISOString());
  });

  const lifetimeCo2Kg = lifetimeKwh * CO2_KG_PER_KWH;
  const petrolKmEquivalent = lifetimeKwh / KWH_PER_KM_PETROL_EQUIVALENT;
  const treesEquivalent = Math.round((lifetimeCo2Kg / KG_CO2_PER_TREE_PER_YEAR) * 10) / 10;

  // Process monthly data
  const monthlyCo2 = Array.from(monthlyMap.entries()).map(([month, data]) => ({
    month,
    co2Kg: data.co2Kg,
    kWh: data.kWh,
  }));

  // Find best month
  let bestMonth = 'None';
  let maxKwh = -1;
  monthlyCo2.forEach((m) => {
    if (m.kWh > maxKwh) {
      maxKwh = m.kWh;
      bestMonth = m.month;
    }
  });

  // Calculate current streak
  // Start from this week's Monday and go backwards
  let streak = 0;
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const currentMonday = new Date(d.setDate(diff));
  currentMonday.setHours(0, 0, 0, 0);

  // Check if there's a session this week or last week
  let checkDate = new Date(currentMonday);
  
  // If no session this week, check last week as current streak might still be active
  if (!weeksWithSessions.has(checkDate.toISOString())) {
    checkDate.setDate(checkDate.getDate() - 7);
  }

  while (weeksWithSessions.has(checkDate.toISOString())) {
    streak++;
    checkDate.setDate(checkDate.getDate() - 7);
  }

  return {
    lifetimeSessions: completedSessions.length,
    lifetimeKwh,
    lifetimeCo2Kg,
    lifetimeCostInr,
    petrolKmEquivalent,
    treesEquivalent,
    monthlyCo2,
    bestMonth,
    firstSessionDate,
    streak,
    hasData,
  };
}
