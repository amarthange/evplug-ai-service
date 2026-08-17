import { type SurgeRule } from './surge-scheduler';

/**
 * Autopilot - Peak Hour Revenue Optimizer
 * 
 * This engine identifies revenue-maximizing opportunities by analyzing historical
 * booking patterns. It specifically targets day/hour slots with high volume
 * and higher-than-average revenue per session.
 */

export interface PeakHour {
  bucket: string          // 'Monday-14:00', 'Friday-18:00', etc.
  sessionCount: number    // total sessions in this day-hour slot
  totalRevenue: number    // total revenue in this slot
  avgRevenue: number      // totalRevenue / sessionCount
}

export interface AutopilotRecommendation {
  id: string                      // deterministic: `autopilot-${bucket}`
  bucket: string                  // e.g. 'Monday-14:00'
  dayName: string                 // e.g. 'Monday'
  dayIndex: number                // 0–6 (0=Sunday)
  startHour: number               // 14
  endHour: number                 // 15 (always startHour + 1)
  displayTime: string             // '2–3pm'
  displayLabel: string            // 'Mondays 2–3pm'
  sessionCount: number
  totalRevenue: number
  avgRevenuePerSession: number
  confidenceScore: number         // 0–100
  confidenceLabel: string         // 'High' | 'Moderate' | 'Low' | 'Insufficient'
  recommendedMultiplier: number   // 1.25 or 1.5
  multiplierLabel: string         // '1.25× gentle surge' | '1.5× aggressive surge'
  demandTier: 'high' | 'moderate' // high if avgRev > overall * 1.3, else moderate
  projectedLift: number           // estimated additional revenue: avgRev * (multiplier-1) * sessionCount
  isAlreadyScheduled: boolean     // true if a surge rule already covers this slot
  isApplying: boolean             // UI state — true while Firestore write in progress
}

export interface AutopilotResult {
  recommendations: AutopilotRecommendation[]  // top 2 by confidenceScore desc
  allBuckets: AutopilotRecommendation[]        // all 5 (for debug/display)
  overallAvgPerSession: number
  canAutopilot: boolean            // true if at least 1 recommendation has confidence > 60
  dataQuality: 'good' | 'sparse' | 'none'
  // good: >=2 buckets with confidence >60
  // sparse: 1 bucket with confidence >60, or top bucket has 40-60
  // none: no bucket exceeds 40% confidence
}

export interface AutopilotConfig {
  enabled: boolean               // stored in Firestore owners/{ownerId}.autopilotEnabled
  lastAutoAppliedAt: Date | null // stored in Firestore owners/{ownerId}.autopilotLastRunAt
  autoAppliedCount: number       // stored in Firestore owners/{ownerId}.autopilotAppliedCount
}

export const CONFIDENCE_THRESHOLD_FULL = 20; // 20 sessions = 100% confidence
export const AUTOPILOT_MIN_CONFIDENCE = 60;  // autopilot mode only applies rules ≥ 60% confidence
export const MANUAL_MIN_CONFIDENCE = 40;     // below this: 'Not enough data', no apply button

const DAY_NAME_TO_INDEX: Record<string, number> = {
  'Sunday': 0, 'Monday': 1, 'Tuesday': 2, 'Wednesday': 3,
  'Thursday': 4, 'Friday': 5, 'Saturday': 6
};

/**
 * Formats a 24-hour range into a user-friendly string.
 * @example formatHourRange(14, 15) -> '2–3pm'
 */
export function formatHourRange(startHour: number, endHour: number): string {
  const formatHour = (h: number): string => {
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return h12.toString();
  };

  const startAmPm = startHour < 12 ? 'am' : 'pm';
  const endAmPm = endHour < 12 ? 'am' : endHour === 24 ? 'am' : endHour < 12 ? 'am' : 'pm';

  if (startAmPm === endAmPm) {
    return `${formatHour(startHour)}–${formatHour(endHour)}${endAmPm}`;
  }
  return `${formatHour(startHour)}${startAmPm}–${formatHour(endHour)}${endAmPm}`;
}

/**
 * Parses a peak hour bucket string into its components.
 * @param bucket Format: 'Monday-14:00'
 */
export function parseBucket(bucket: string) {
  const match = bucket.match(/^(\w+)-(\d{2}):(\d{2})$/);
  if (!match) return null;

  const dayName = match[1];
  const dayIndex = DAY_NAME_TO_INDEX[dayName] ?? -1;
  if (dayIndex === -1) return null;

  const startHour = parseInt(match[2], 10);
  const endHour = startHour + 1; // always a 1-hour window

  const displayTime = formatHourRange(startHour, endHour);
  const displayLabel = `${dayName}s ${displayTime}`;

  return { dayName, dayIndex, startHour, endHour, displayTime, displayLabel };
}

/**
 * Maps a confidence score (0-100) to a qualitative label.
 */
export function getConfidenceLabel(score: number): AutopilotRecommendation['confidenceLabel'] {
  if (score >= 80) return 'High';
  if (score >= 60) return 'Moderate';
  if (score >= 40) return 'Low';
  return 'Insufficient';
}

/**
 * Checks if a specific day/hour slot is already covered by an active surge rule.
 * Uses startHour <= current < endHour to handle multi-hour rules.
 */
export function isSlotAlreadyScheduled(
  dayIndex: number,
  startHour: number,
  existingSurgeRules: SurgeRule[]
): boolean {
  return existingSurgeRules.some(rule =>
    rule.isActive &&
    rule.days.includes(dayIndex) &&
    rule.startHour <= startHour &&
    rule.endHour > startHour
  );
}

/**
 * Converts an autopilot recommendation into a standard SurgeRule object
 * ready for Firestore storage.
 */
export function buildSurgeRuleFromRecommendation(
  rec: AutopilotRecommendation
): SurgeRule {
  return {
    id: rec.id, // deterministic id: 'autopilot-{bucket}'
    label: `Autopilot – ${rec.displayLabel}`,
    days: [rec.dayIndex],
    startHour: rec.startHour,
    endHour: rec.endHour,
    multiplier: rec.recommendedMultiplier,
    isActive: true
  };
}

/**
 * Main computation engine for peak hour autopilot.
 * 
 * CONFIDENCE FORMULA:
 * (sessionCount / 20) * 100, capped at 100%. 20 sessions in a single hour slot
 * is statistically significant enough to recommend a surge rule.
 * 
 * DEMAND TIER DECISION:
 * If the average revenue in a slot is >1.3x the overall average revenue per session,
 * it is classified as 'high' demand and receives a 1.5x recommendation. Otherwise,
 * it is 'moderate' and receives a 1.25x recommendation.
 * 
 * SORT ORDER:
 * Recommendations are sorted by confidenceScore descending. If confidence is equal,
 * the projected revenue lift acts as the tiebreaker.
 * 
 * DATA QUALITY:
 * - 'good': At least 2 slots have >=60% confidence.
 * - 'sparse': 1 slot has >=60% confidence, or top slot has 40-60%.
 * - 'none': No slots exceed 40% confidence (insufficient data).
 */
export function computeAutopilotRecommendations(
  peakHours: PeakHour[],
  overallAvgPerSession: number,
  existingSurgeRules: SurgeRule[]
): AutopilotResult {
  if (!peakHours || peakHours.length === 0) {
    return {
      recommendations: [],
      allBuckets: [],
      overallAvgPerSession,
      canAutopilot: false,
      dataQuality: 'none'
    };
  }

  const allBuckets: AutopilotRecommendation[] = [];

  for (const peak of peakHours) {
    const parsed = parseBucket(peak.bucket);
    if (!parsed) continue;

    const { dayName, dayIndex, startHour, endHour, displayTime, displayLabel } = parsed;

    // Confidence: sessions / threshold * 100, capped at 100
    const confidenceScore = Math.min(
      Math.round((peak.sessionCount / CONFIDENCE_THRESHOLD_FULL) * 100),
      100
    );

    // Demand tier: is this slot significantly above average?
    const demandTier: 'high' | 'moderate' =
      overallAvgPerSession > 0 &&
      peak.avgRevenue > overallAvgPerSession * 1.3
        ? 'high' : 'moderate';

    const recommendedMultiplier = demandTier === 'high' ? 1.5 : 1.25;

    const multiplierLabel = demandTier === 'high'
      ? '1.5× aggressive surge'
      : '1.25× gentle surge';

    // Projected lift: extra revenue if surge applied to future sessions at same rate
    const projectedLift = Math.round(
      peak.avgRevenue * (recommendedMultiplier - 1) * peak.sessionCount * 100
    ) / 100;

    const isAlreadyScheduled = isSlotAlreadyScheduled(
      dayIndex, startHour, existingSurgeRules
    );

    allBuckets.push({
      id: `autopilot-${peak.bucket}`,
      bucket: peak.bucket,
      dayName,
      dayIndex,
      startHour,
      endHour,
      displayTime,
      displayLabel,
      sessionCount: peak.sessionCount,
      totalRevenue: peak.totalRevenue,
      avgRevenuePerSession: Math.round(peak.avgRevenue * 100) / 100,
      confidenceScore,
      confidenceLabel: getConfidenceLabel(confidenceScore),
      recommendedMultiplier,
      multiplierLabel,
      demandTier,
      projectedLift,
      isAlreadyScheduled,
      isApplying: false
    });
  }

  // Sort by confidenceScore desc, then by projectedLift desc for ties
  allBuckets.sort((a, b) =>
    b.confidenceScore !== a.confidenceScore
      ? b.confidenceScore - a.confidenceScore
      : b.projectedLift - a.projectedLift
  );

  // Top 2 recommendations
  const recommendations = allBuckets.slice(0, 2);

  // Data quality assessment
  const highConfidenceCount = allBuckets.filter(
    b => b.confidenceScore >= AUTOPILOT_MIN_CONFIDENCE
  ).length;

  const dataQuality: AutopilotResult['dataQuality'] =
    highConfidenceCount >= 2 ? 'good' :
    highConfidenceCount >= 1 ? 'sparse' :
    allBuckets.some(b => b.confidenceScore >= MANUAL_MIN_CONFIDENCE) ? 'sparse' :
    'none';

  return {
    recommendations,
    allBuckets,
    overallAvgPerSession,
    canAutopilot: highConfidenceCount >= 1,
    dataQuality
  };
}

/**
 * Calculates a discounted price based on how close the slot is to starting.
 * 
 * TIME DECAY SCHEDULE:
 * - >30 mins: Base Price (No discount)
 * - 15-30 mins: 15% Discount
 * - 5-15 mins: 25% Discount
 * - <5 mins: 35% Discount
 * 
 * @param connector The connector object containing pricing data
 * @param slotStartTime The start time of the session
 * @param floorPrice Optional floor price to prevent excessive discounting
 */
export const calculateTimeDecayPrice = (
  connector: any,
  slotStartTime: Date,
  floorPrice: number = 5
): number => {
  const basePrice = Number(connector.pricing?.baseRate || connector.pricePerKwh || 8);
  const now = new Date();
  const minutesUntilSlot = (slotStartTime.getTime() - now.getTime()) / 60000;
  
  let discountedPrice = basePrice;

  if (minutesUntilSlot <= 0) return basePrice; // Past slots don't decay
  
  if (minutesUntilSlot <= 5) {
    discountedPrice = basePrice * 0.65;
  } else if (minutesUntilSlot <= 15) {
    discountedPrice = basePrice * 0.75;
  } else if (minutesUntilSlot <= 30) {
    discountedPrice = basePrice * 0.85;
  }

  // Apply floor price and format to 2 decimal places
  const finalPrice = Math.max(discountedPrice, floorPrice);
  return parseFloat(finalPrice.toFixed(2));
};

/**
 * Returns a human-readable label for the current time-decay discount level.
 */
export const getDecayLabel = (
  minutesUntilSlot: number
): string | null => {
  if (minutesUntilSlot <= 0 || minutesUntilSlot > 30) return null;
  if (minutesUntilSlot <= 5) return "35% OFF";
  if (minutesUntilSlot <= 15) return "25% OFF";
  return "15% OFF";
};
