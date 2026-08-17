import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { 
  type PeakHour, 
  type AutopilotConfig, 
  computeAutopilotRecommendations,
  AUTOPILOT_MIN_CONFIDENCE,
  buildSurgeRuleFromRecommendation
} from '@/lib/autopilot-engine';
import AutopilotRecommendationRow from './AutopilotRecommendationRow';
import { 
  AlertDialog, 
  AlertDialogAction, 
  AlertDialogCancel, 
  AlertDialogContent, 
  AlertDialogDescription, 
  AlertDialogFooter, 
  AlertDialogHeader, 
  AlertDialogTitle 
} from '@/components/ui/alert-dialog';
import { type SurgeRule } from '@/lib/surge-scheduler';
import { type Firestore } from 'firebase/firestore';

interface AutopilotCardProps {
  peakHours: PeakHour[];
  overallAvgPerSession: number;
  ownerId: string;
  db: Firestore;
  existingSurgeRules: SurgeRule[];
  className?: string;
}

export default function AutopilotCard({
  peakHours,
  overallAvgPerSession,
  ownerId,
  db,
  existingSurgeRules,
  className
}: AutopilotCardProps) {
  const queryClient = useQueryClient();
  const [isTogglingAutopilot, setIsTogglingAutopilot] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [appliedIds, setAppliedIds] = useState<Set<string>>(new Set());

  const { data: autopilotConfig, refetch: refetchConfig } = useQuery({
    queryKey: ['autopilot-config', ownerId],
    queryFn: async (): Promise<AutopilotConfig> => {
      const { doc, getDoc } = await import('firebase/firestore');
      const fdb = db as any;
      const snap = await getDoc(doc(fdb, 'owners', ownerId));
      if (!snap.exists()) return { enabled: false, lastAutoAppliedAt: null, autoAppliedCount: 0 };
      const data = snap.data();
      return {
        enabled: data.autopilotEnabled ?? false,
        lastAutoAppliedAt: data.autopilotLastRunAt?.toDate?.() ?? null,
        autoAppliedCount: data.autopilotAppliedCount ?? 0
      };
    },
    staleTime: 5 * 60 * 1000
  });

  const autopilotEnabled = autopilotConfig?.enabled ?? false;

  const result = useMemo(() =>
    computeAutopilotRecommendations(
      peakHours,
      overallAvgPerSession,
      existingSurgeRules
    ),
  [peakHours, overallAvgPerSession, existingSurgeRules]);

  /**
   * Toggles the Autopilot mode and optionally applies high-confidence recommendations.
   * 
   * @param enable - True to enable autopilot, false to disable.
   * 
   * CONTRACT:
   * - Confirmation dialog is required before enabling.
   * - Append-only write: Adds rules to surgeSchedule but never removes them.
   * - Spread safety: arrayUnion is only called if eligibleRecs.length > 0.
   * - Cache invalidation: surge-config is invalidated to refresh the parent view.
   */
  async function handleToggleAutopilot(enable: boolean) {
    if (enable && !showConfirmDialog) {
      setShowConfirmDialog(true);
      return;
    }

    setIsTogglingAutopilot(true);
    setShowConfirmDialog(false);

    try {
      const { doc, updateDoc, serverTimestamp, arrayUnion } = await import('firebase/firestore');
      const fdb = db as any;
      const ownerRef = doc(fdb, 'owners', ownerId);

      await updateDoc(ownerRef, {
        autopilotEnabled: enable
      });

      // If enabling AND there are eligible recommendations: auto-apply them now
      if (enable) {
        const eligibleRecs = result.recommendations.filter(rec =>
          rec.confidenceScore >= AUTOPILOT_MIN_CONFIDENCE &&
          !rec.isAlreadyScheduled
        );

        if (eligibleRecs.length > 0) {
          const newRules = eligibleRecs.map(buildSurgeRuleFromRecommendation);
          await updateDoc(ownerRef, {
            surgeSchedule: arrayUnion(...newRules),
            autopilotLastRunAt: serverTimestamp(),
            autopilotAppliedCount: (autopilotConfig?.autoAppliedCount ?? 0) + newRules.length
          });
          // Mark them as applied in local state for immediate UI feedback
          setAppliedIds(prev => {
            const next = new Set(prev);
            eligibleRecs.forEach(r => next.add(r.id));
            return next;
          });
        }
      }

      await refetchConfig();
      queryClient.invalidateQueries({ queryKey: ['surge-config', ownerId] });

    } catch (err) {
      console.error('[SeniorDevOps Autopilot] Toggle failed:', err);
      setErrorMessage('Failed to update autopilot setting. Please try again.');
    } finally {
      setIsTogglingAutopilot(false);
    }
  }

  const DATA_QUALITY_CONFIG = {
    none: {
      message: 'Not enough booking history yet. Recommendations appear after 20+ sessions per slot.',
      severity: 'muted' as const
    },
    sparse: {
      message: 'Limited data — recommendations will improve as more sessions complete.',
      severity: 'amber' as const
    },
    good: null
  };

  return (
    <div className={cn(
      'rounded-xl border border-border bg-background shadow-sm',
      className
    )}>
      {/* CARD HEADER */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className={cn(
              'h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0',
              autopilotEnabled
                ? 'bg-violet-100 dark:bg-violet-900/40'
                : 'bg-muted'
            )}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M9 2L3 9h5l-1 5 6-7H8l1-5z"
                      fill={autopilotEnabled ? '#8b5cf6' : 'currentColor'}
                      className={!autopilotEnabled ? 'text-muted-foreground' : ''}/>
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">
                Peak hour autopilot
              </h3>
              <p className="text-xs text-muted-foreground">
                AI-suggested surge rules
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {autopilotEnabled ? 'ON' : 'OFF'}
            </span>
            <button
              role="switch"
              aria-checked={autopilotEnabled}
              aria-label="Autopilot mode"
              onClick={() => autopilotEnabled
                ? handleToggleAutopilot(false)
                : setShowConfirmDialog(true)
              }
              disabled={isTogglingAutopilot}
              className={cn(
                'relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer',
                'rounded-full border-2 border-transparent transition-colors duration-200',
                'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                autopilotEnabled ? 'bg-violet-600' : 'bg-muted-foreground/30'
              )}
            >
              <span
                className={cn(
                  'pointer-events-none inline-block h-4 w-4 transform rounded-full',
                  'bg-white shadow ring-0 transition duration-200 ease-in-out',
                  autopilotEnabled ? 'translate-x-4' : 'translate-x-0'
                )}
              />
            </button>
          </div>
        </div>

        {/* Autopilot active notice */}
        <AnimatePresence>
          {autopilotEnabled && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-3 flex items-start gap-2 p-2 rounded-lg bg-violet-50 dark:bg-violet-950/40 border border-violet-200 dark:border-violet-800 text-xs overflow-hidden"
            >
              <div className="relative flex h-2 w-2 mt-0.5 flex-shrink-0">
                <span className="animate-ping absolute h-full w-full rounded-full bg-violet-400 opacity-75" />
                <span className="relative rounded-full h-2 w-2 bg-violet-500" />
              </div>
              <div>
                <p className="font-medium text-violet-800 dark:text-violet-200">
                  Autopilot active
                </p>
                <p className="text-violet-700 dark:text-violet-300 mt-0.5">
                  Surge rules with ≥60% confidence are applied automatically.
                  {autopilotConfig?.lastAutoAppliedAt && (
                    <> Last run: {autopilotConfig.lastAutoAppliedAt.toLocaleDateString('en-IN', {
                      day: 'numeric', month: 'short'
                    })}.</>
                  )}
                  {autopilotConfig?.autoAppliedCount
                    ? ` ${autopilotConfig.autoAppliedCount} rules applied total.`
                    : ''}
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* CARD BODY */}
      <div className="p-4 space-y-3">
        {/* Data quality callout */}
        {result.dataQuality !== 'good' && (
          <div className={cn(
            'p-2.5 rounded-lg text-xs border',
            result.dataQuality === 'none'
              ? 'bg-muted/50 border-border text-muted-foreground'
              : 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300'
          )}>
            {DATA_QUALITY_CONFIG[result.dataQuality]?.message}
          </div>
        )}

        {/* Error message */}
        {errorMessage && (
          <div className="p-2 rounded-lg bg-destructive/5 border border-destructive/30">
            <p className="text-xs text-destructive">{errorMessage}</p>
            <button
              className="text-xs underline text-destructive mt-0.5"
              onClick={() => setErrorMessage(null)}
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Recommendations */}
        {result.recommendations.length === 0 ? (
          <div className="text-center py-4">
            <p className="text-sm text-muted-foreground">
              No peak hours detected yet
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Recommendations appear after your first 8+ sessions
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {result.recommendations.map(rec => (
              <AutopilotRecommendationRow
                key={rec.id}
                recommendation={{
                  ...rec,
                  isAlreadyScheduled: rec.isAlreadyScheduled || appliedIds.has(rec.id)
                }}
                ownerId={ownerId}
                db={db}
                onApplied={(applied) => {
                  setAppliedIds(prev => {
                    const next = new Set(prev);
                    next.add(applied.id);
                    return next;
                  });
                  queryClient.invalidateQueries({ queryKey: ['surge-config', ownerId] });
                }}
                onError={setErrorMessage}
                isAutopilotMode={autopilotEnabled}
              />
            ))}
          </div>
        )}

        {/* Link to full surge settings */}
        {result.recommendations.length > 0 && (
          <div className="pt-2 border-t border-border/50">
            <p className="text-xs text-muted-foreground">
              Surge rules live in{' '}
              <a href="/owner/dashboard#surge-pricing" className="underline hover:no-underline">
                Surge Pricing settings
              </a>
              {' '}· Autopilot never removes existing rules
            </p>
          </div>
        )}
      </div>

      {/* Confirmation Dialog */}
      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Enable Autopilot mode?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                Autopilot will automatically apply surge pricing rules for peak
                hour slots with ≥60% confidence.
              </p>
              {result.recommendations.filter(r =>
                r.confidenceScore >= AUTOPILOT_MIN_CONFIDENCE && !r.isAlreadyScheduled
              ).length > 0 && (
                <p className="font-medium text-foreground">
                  {result.recommendations.filter(r =>
                    r.confidenceScore >= AUTOPILOT_MIN_CONFIDENCE && !r.isAlreadyScheduled
                  ).length} rule
                  {result.recommendations.filter(r =>
                    r.confidenceScore >= AUTOPILOT_MIN_CONFIDENCE && !r.isAlreadyScheduled
                  ).length !== 1 ? 's' : ''} will be applied immediately.
                </p>
              )}
              <p>
                You can review and remove any rules from the Surge Pricing settings.
                Autopilot never removes existing rules — only adds new ones.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => handleToggleAutopilot(true)}
              disabled={isTogglingAutopilot}
            >
              {isTogglingAutopilot ? 'Enabling...' : 'Enable Autopilot'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ACCEPTANCE TESTS:
// Test 1 — Recommendation computation:
// peakHours = [
//   { bucket: 'Monday-14:00', sessionCount: 25, totalRevenue: 5000, avgRevenue: 200 },
//   { bucket: 'Friday-18:00', sessionCount: 12, totalRevenue: 2400, avgRevenue: 200 }
// ]
// overallAvgPerSession = 140
// Expected:
//   Monday-14: confidenceScore=100 (25/20=125→capped 100), demandTier='high' (200>140*1.3=182), multiplier=1.5
//   Friday-18: confidenceScore=60 (12/20=60), demandTier='high' (200>182), multiplier=1.5
//   recommendations = [Monday-14 (100%), Friday-18 (60%)]
//   dataQuality = 'good' (2 buckets >=60)
//   canAutopilot = true

// Test 2 — Moderate demand tier:
// peak: avgRevenue=150, overallAvgPerSession=140
// 150 > 140*1.3=182? No → demandTier='moderate', multiplier=1.25
// Expected: '1.25× gentle surge' label shown

// Test 3 — Insufficient confidence gate:
// peak: sessionCount=5, CONFIDENCE_THRESHOLD_FULL=20
// confidenceScore = 5/20*100 = 25%
// Expected: confidenceLabel='Insufficient', Apply button NOT shown
// Shows: 'Not enough data yet — need 20 sessions for full confidence'

// Test 4 — Already scheduled detection:
// existingSurgeRules = [{ days: [1], startHour: 13, endHour: 16, isActive: true }]
// Recommendation: Monday-14:00 (dayIndex=1, startHour=14)
// isSlotAlreadyScheduled(1, 14, rules): rule.startHour(13) <= 14 < rule.endHour(16) → true
// Expected: row shows 'Already scheduled', no Apply button

// Test 5 — Apply recommendation:
// Click 'Apply recommendation' on Monday-14:00 recommendation
// Expected: arrayUnion call with SurgeRule:
//   { id: 'autopilot-Monday-14:00', label: 'Autopilot – Mondays 2–3pm',
//     days: [1], startHour: 14, endHour: 15, multiplier: 1.5, isActive: true }
// After apply: row shows '✓ Applied — surge rule added to schedule'
// appliedIds includes 'autopilot-Monday-14:00'
// queryClient.invalidateQueries called with surge-config key

// Test 6 — Autopilot toggle ON (with confirmation):
// Click toggle to enable autopilot
// Expected: AlertDialog shown first
// Click 'Enable Autopilot' in dialog
// Expected: owners/{ownerId}.autopilotEnabled=true written
// Eligible recs (confidence >=60, not already scheduled) auto-applied via arrayUnion
// Card shows violet pulsing dot + 'Autopilot active' notice
// '1 rule applied total' shown

// Test 7 — Autopilot toggle OFF:
// Autopilot is ON. Click toggle to disable.
// Expected: NO confirmation dialog (disable path skips dialog)
// owners/{ownerId}.autopilotEnabled=false written directly
// Violet notice disappears with AnimatePresence exit
// Manual 'Apply recommendation' buttons re-enable

// Test 8 — parseBucket edge cases:
// parseBucket('Monday-14:00') → { dayName:'Monday', dayIndex:1, startHour:14, endHour:15, displayTime:'2–3pm', displayLabel:'Mondays 2–3pm' }
// parseBucket('Sunday-00:00') → { dayName:'Sunday', dayIndex:0, startHour:0, endHour:1, displayTime:'12–1am', displayLabel:'Sundays 12–1am' }
// parseBucket('invalid') → null (no crash)
// parseBucket('Monday-25:00') → parsedHour=25, displayTime computed but nonsensical
//   → acceptable (invalid data from processAnalytics would be a separate bug)

// Test 9 — formatHourRange:
// formatHourRange(14, 15) → '2–3pm'
// formatHourRange(18, 19) → '6–7pm'
// formatHourRange(0, 1) → '12–1am'
// formatHourRange(11, 12) → '11am–12pm' (spans am/pm boundary)
// formatHourRange(12, 13) → '12–1pm'
// formatHourRange(23, 24) → '11pm–12am' (spans pm/am)

// Test 10 — arrayUnion spread safety:
// Autopilot enabled, all recommendations already scheduled (appliedIds covers all)
// Expected: eligibleRecs.length === 0 → arrayUnion NOT called
// No Firestore write for surge rules (only autopilotEnabled written)
// No error thrown
