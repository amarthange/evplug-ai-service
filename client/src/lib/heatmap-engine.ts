export interface BookingSlot {
  startTime: Date;
  endTime: Date | null;
  status: string;
}

export type FrequencyMatrix = number[][];

export interface HeatmapCell {
  dayIndex: number;
  hourIndex: number;
  dayLabel: string;
  hourLabel: string;
  rawCount: number;
  weekCount: number;
  occupancyPct: number;
  intensityLevel: number;
}

export interface HeatmapData {
  cells: HeatmapCell[];
  peakCell: HeatmapCell | null;
  peakDay: string | null;
  peakHour: string | null;
  totalSessions: number;
  weeksOfData: number;
  dataQuality: 'good' | 'fair' | 'sparse';
}

export const DISPLAY_HOURS = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23];
export const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const DAY_LABELS_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const HOUR_LABELS: Record<number, string> = {
  6: '6am', 7: '7am', 8: '8am', 9: '9am', 10: '10am', 11: '11am',
  12: '12pm', 13: '1pm', 14: '2pm', 15: '3pm', 16: '4pm', 17: '5pm',
  18: '6pm', 19: '7pm', 20: '8pm', 21: '9pm', 22: '10pm', 23: '11pm'
};

export const INTENSITY_COLORS = {
  0: { bg: 'var(--heatmap-0)', label: 'No data' },
  1: { bg: 'var(--heatmap-1)', label: 'Quiet' },
  2: { bg: 'var(--heatmap-2)', label: 'Moderate' },
  3: { bg: 'var(--heatmap-3)', label: 'Busy' },
  4: { bg: 'var(--heatmap-4)', label: 'Peak' },
} as const;

/**
 * Generates a key for the ISO week (e.g., "2025-W42").
 * Used to track session consistency across different weeks.
 */
function getISOWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export function buildFrequencyMatrix(bookings: BookingSlot[]): FrequencyMatrix {
  const matrix: FrequencyMatrix = Array.from({ length: 7 }, () => new Array(24).fill(0));
  bookings.forEach(b => {
    const day = b.startTime.getDay();
    const hour = b.startTime.getHours();
    matrix[day][hour] += 1;
  });
  return matrix;
}

/**
 * Counts how many distinct weeks had at least one session in a specific slot.
 * This is used for "Typically X% occupied" logic.
 */
export function buildWeekPresenceMatrix(bookings: BookingSlot[]): FrequencyMatrix {
  const weekSets: Set<string>[][] = Array.from({ length: 7 }, 
    () => Array.from({ length: 24 }, () => new Set<string>())
  );

  bookings.forEach(b => {
    const day = b.startTime.getDay();
    const hour = b.startTime.getHours();
    weekSets[day][hour].add(getISOWeekKey(b.startTime));
  });

  return weekSets.map(row => row.map(set => set.size));
}

function occupancyToLevel(pct: number): number {
  if (pct === 0) return 0;
  if (pct <= 20) return 1;
  if (pct <= 45) return 2;
  if (pct <= 70) return 3;
  return 4;
}

/**
 * JSDoc: computeHeatmapData
 * 
 * 1. Logic: Uses "Week Presence" instead of raw count normalisation. Raw counts are 
 *    distorted by outliers (one extremely busy day). Week presence accurately reflects 
 *    "typical" behavior over the 90-day (approx. 13-week) window.
 * 2. Dark Mode: The emerald ramp inverts (light = busy) to maintain visibility 
 *    against dark backgrounds.
 * 3. Scaling: Capped at 1000 Firestore docs to ensure sub-100ms client-side processing 
 *    and stay within Spark Plan read limits.
 */
export function computeHeatmapData(bookings: BookingSlot[], totalConnectors: number): HeatmapData {
  const freqMatrix = buildFrequencyMatrix(bookings);
  const weekMatrix = buildWeekPresenceMatrix(bookings);
  
  const allWeekKeys = new Set(bookings.map(b => getISOWeekKey(b.startTime)));
  const weeksOfData = Math.max(allWeekKeys.size, 1);

  const cells: HeatmapCell[] = [];
  for (let dIndex = 0; dIndex < 7; dIndex++) {
    for (const hIndex of DISPLAY_HOURS) {
      const rawCount = freqMatrix[dIndex][hIndex];
      const weekCount = weekMatrix[dIndex][hIndex];
      const occupancyPct = Math.min(Math.round((weekCount / weeksOfData) * 100), 100);
      
      cells.push({
        dayIndex: dIndex,
        hourIndex: hIndex,
        dayLabel: DAY_LABELS[dIndex],
        hourLabel: HOUR_LABELS[hIndex],
        rawCount,
        weekCount,
        occupancyPct,
        intensityLevel: occupancyToLevel(occupancyPct)
      });
    }
  }

  const peakCell = cells.reduce<HeatmapCell | null>(
    (best, c) => (!best || c.occupancyPct > best.occupancyPct) ? c : best,
    null
  );
  const validPeak = (peakCell && peakCell.rawCount > 0) ? peakCell : null;

  return {
    cells,
    peakCell: validPeak,
    peakDay: validPeak ? DAY_LABELS_FULL[validPeak.dayIndex] : null,
    peakHour: validPeak ? validPeak.hourLabel : null,
    totalSessions: bookings.length,
    weeksOfData,
    dataQuality: bookings.length >= 50 ? 'good' : bookings.length >= 20 ? 'fair' : 'sparse'
  };
}
