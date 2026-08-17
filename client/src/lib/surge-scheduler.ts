export interface SurgeRule {
  id: string
  label: string
  days: number[]
  startHour: number
  endHour: number
  multiplier: number
  isActive: boolean
}

export interface SurgeOverride {
  enabled: boolean
  multiplier: number
  overrideUntil: number   // Unix ms timestamp
}

export interface SchedulerTickResult {
  action: 'applied_rule' | 'applied_override' | 'cleared' | 'no_change'
  ruleId?: string
  ruleLabel?: string
  multiplier?: number
  reason: string
}

export function findMatchingRule(
  rules: SurgeRule[],
  dayIndex: number,    // 0–6 from Date.getDay()
  hourIndex: number    // 0–23 from Date.getHours()
): SurgeRule | null {
  return rules.find(rule =>
    rule.isActive &&
    rule.days.includes(dayIndex) &&
    hourIndex >= rule.startHour &&
    hourIndex < rule.endHour
  ) ?? null
}

export function isOverrideActive(override: SurgeOverride | null): boolean {
  if (!override || !override.enabled) return false
  return Date.now() < override.overrideUntil
}

/**
 * Computes the desired peak pricing state based on an override -> schedule -> clear priority chain.
 *
 * 1. OVERRIDE PRIORITY: If a manual override is active, it completely bypasses the schedule.
 * 2. SCHEDULE RULE: If no override, checks if the current day/time matches any active schedule rule.
 * 3. CLEAR SURGE: If no rules match for the current time, but the scheduler previously enabled surge,
 *    it clears it back to 1.0x. (It only manages surge if there is at least 1 rule in the schedule).
 */
export function computeDesiredPeakPricing(
  rules: SurgeRule[],
  override: SurgeOverride | null,
  currentPeakPricing: { enabled: boolean; multiplier: number }
): {
  desired: { enabled: boolean; multiplier: number }
  result: SchedulerTickResult
} {
  const now = new Date()
  const dayIndex = now.getDay()
  const hourIndex = now.getHours()

  // Override takes priority over schedule
  if (isOverrideActive(override)) {
    const desired = { enabled: override!.enabled, multiplier: override!.multiplier }
    const isAlreadyCurrent =
      currentPeakPricing.enabled === desired.enabled &&
      Math.abs(currentPeakPricing.multiplier - desired.multiplier) < 0.01
    return {
      desired,
      result: {
        action: isAlreadyCurrent ? 'no_change' : 'applied_override',
        multiplier: desired.multiplier,
        reason: `Manual override active until ${new Date(override!.overrideUntil)
          .toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`
      }
    }
  }

  // Check schedule rules
  const matchingRule = findMatchingRule(rules, dayIndex, hourIndex)

  if (matchingRule) {
    const desired = { enabled: true, multiplier: matchingRule.multiplier }
    const isAlreadyCurrent =
      currentPeakPricing.enabled &&
      Math.abs(currentPeakPricing.multiplier - matchingRule.multiplier) < 0.01
    return {
      desired,
      result: {
        action: isAlreadyCurrent ? 'no_change' : 'applied_rule',
        ruleId: matchingRule.id,
        ruleLabel: matchingRule.label,
        multiplier: matchingRule.multiplier,
        reason: `Schedule rule: ${matchingRule.label} (${matchingRule.multiplier}×)`
      }
    }
  }

  // No rule matches — clear surge if currently enabled by scheduler
  if (rules.length > 0 && currentPeakPricing.enabled) {
    return {
      desired: { enabled: false, multiplier: 1.0 },
      result: {
        action: 'cleared',
        reason: 'No active schedule rule for current time — surge disabled'
      }
    }
  }

  return {
    desired: currentPeakPricing,  // unchanged
    result: { action: 'no_change', reason: 'No rules configured' }
  }
}

export function detectOverlappingRules(rules: SurgeRule[]): Array<{
  rule1Id: string
  rule2Id: string
  conflictDays: number[]
  conflictHours: string
}> {
  const conflicts = []
  for (let i = 0; i < rules.length; i++) {
    for (let j = i + 1; j < rules.length; j++) {
      const r1 = rules[i], r2 = rules[j]
      if (!r1.isActive || !r2.isActive) continue
      const sharedDays = r1.days.filter(d => r2.days.includes(d))
      const hoursOverlap = r1.startHour < r2.endHour && r2.startHour < r1.endHour
      if (sharedDays.length > 0 && hoursOverlap) {
        conflicts.push({
          rule1Id: r1.id,
          rule2Id: r2.id,
          conflictDays: sharedDays,
          conflictHours: `${Math.max(r1.startHour, r2.startHour)}:00–${Math.min(r1.endHour, r2.endHour)}:00`
        })
      }
    }
  }
  return conflicts
}

export function formatHour(hour: number): string {
  if (hour === 0 || hour === 24) return '12am'
  if (hour === 12) return '12pm'
  return hour < 12 ? `${hour}am` : `${hour - 12}pm`
}

export function formatDays(days: number[]): string {
  const DAY_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
  const sorted = [...days].sort((a,b) => a-b)
  if (sorted.length === 7) return 'Every day'
  if (sorted.length === 5 && sorted.join() === '1,2,3,4,5') return 'Mon–Fri'
  if (sorted.length === 2 && sorted.join() === '0,6') return 'Weekends'
  if (sorted.length <= 3) return sorted.map(d => DAY_SHORT[d]).join(', ')
  return `${sorted.length} days`
}

export function formatTimeRange(startHour: number, endHour: number): string {
  return `${formatHour(startHour)}–${formatHour(endHour)}`
}

export function isRuleActiveNow(rule: SurgeRule): boolean {
  const now = new Date()
  return findMatchingRule([rule], now.getDay(), now.getHours()) !== null
}

export const HOUR_OPTIONS = Array.from({ length: 25 }, (_, i) => ({
  value: i,
  label: formatHour(i)
}))

export const MULTIPLIER_LABELS: Record<string, string> = {
  '1.1': 'Gentle (+10%)',
  '1.2': 'Mild (+20%)',
  '1.3': 'Light (+30%)',
  '1.5': 'Moderate (+50%)',
  '1.75': 'Strong (+75%)',
  '2.0': 'Peak (2×)',
  '2.5': 'High demand (2.5×)',
  '3.0': 'Maximum (3×)'
}
