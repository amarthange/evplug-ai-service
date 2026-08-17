import { useState } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { 
  type AutopilotRecommendation, 
  buildSurgeRuleFromRecommendation,
  CONFIDENCE_THRESHOLD_FULL,
  MANUAL_MIN_CONFIDENCE
} from '@/lib/autopilot-engine';
import { type Firestore } from 'firebase/firestore';

interface AutopilotRecommendationRowProps {
  recommendation: AutopilotRecommendation;
  ownerId: string;
  db: Firestore;
  onApplied: (rec: AutopilotRecommendation) => void;
  onError: (message: string) => void;
  isAutopilotMode: boolean;
}

export default function AutopilotRecommendationRow({
  recommendation,
  ownerId,
  db,
  onApplied,
  onError,
  isAutopilotMode
}: AutopilotRecommendationRowProps) {
  const [isApplying, setIsApplying] = useState(false);
  const [wasJustApplied, setWasJustApplied] = useState(false);

  async function handleApply() {
    if (isApplying || wasJustApplied || recommendation.isAlreadyScheduled) return;
    setIsApplying(true);

    try {
      const { doc, updateDoc, arrayUnion } = await import('firebase/firestore');
      const fdb = db as any;

      const newRule = buildSurgeRuleFromRecommendation(recommendation);

      await updateDoc(doc(fdb, 'owners', ownerId), {
        surgeSchedule: arrayUnion(newRule)
      });

      setWasJustApplied(true);
      onApplied(recommendation);

      // Reset 'just applied' indicator after 3 seconds
      setTimeout(() => setWasJustApplied(false), 3000);

    } catch (err) {
      console.error('[SeniorDevOps Autopilot] Apply failed:', err);
      onError('Failed to apply recommendation. Please try again.');
    } finally {
      setIsApplying(false);
    }
  }

  const confidenceColor =
    recommendation.confidenceScore >= 80 ? 'bg-emerald-500' :
    recommendation.confidenceScore >= 60 ? 'bg-blue-500' :
    recommendation.confidenceScore >= 40 ? 'bg-amber-500' :
    'bg-muted-foreground';

  const demandBadge = recommendation.demandTier === 'high'
    ? { label: 'High demand', class: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300' }
    : { label: 'Moderate demand', class: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300' };

  return (
    <div className={cn(
      'rounded-lg border p-3 space-y-2.5 transition-all duration-200',
      wasJustApplied
        ? 'border-emerald-300 bg-emerald-50/50 dark:border-emerald-700 dark:bg-emerald-950/30'
        : recommendation.isAlreadyScheduled
        ? 'border-border/50 bg-muted/20 opacity-70'
        : 'border-border bg-background'
    )}>
      {/* ROW 1 — Day label + demand badge */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-medium text-foreground">
              {recommendation.displayLabel}
            </span>
            {recommendation.isAlreadyScheduled && (
              <span className="text-xs px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                Already scheduled
              </span>
            )}
          </div>
          <span className={cn(
            'text-xs px-1.5 py-0.5 rounded-full mt-0.5 inline-block',
            demandBadge.class
          )}>
            {demandBadge.label}
          </span>
        </div>
        {/* Multiplier pill */}
        <div className="flex-shrink-0 text-right">
          <span className="text-sm font-semibold tabular-nums">
            {recommendation.recommendedMultiplier}×
          </span>
          <p className="text-xs text-muted-foreground">surge</p>
        </div>
      </div>

      {/* ROW 2 — Confidence bar */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Confidence</span>
          <span className={cn(
            'font-medium',
            recommendation.confidenceScore >= 80 ? 'text-emerald-600 dark:text-emerald-400' :
            recommendation.confidenceScore >= 60 ? 'text-blue-600 dark:text-blue-400' :
            recommendation.confidenceScore >= 40 ? 'text-amber-600 dark:text-amber-400' :
            'text-muted-foreground'
          )}>
            {recommendation.confidenceLabel} · {recommendation.confidenceScore}%
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
          <motion.div
            className={cn('h-full rounded-full', confidenceColor)}
            initial={{ width: 0 }}
            animate={{ width: `${recommendation.confidenceScore}%` }}
            transition={{ duration: 0.6, ease: 'easeOut', delay: 0.1 }}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Based on {recommendation.sessionCount} session
          {recommendation.sessionCount !== 1 ? 's' : ''} in this slot
          {recommendation.sessionCount < CONFIDENCE_THRESHOLD_FULL && (
            <> · {CONFIDENCE_THRESHOLD_FULL - recommendation.sessionCount} more needed for 100%</>
          )}
        </p>
      </div>

      {/* ROW 3 — Projected lift */}
      {recommendation.confidenceScore >= MANUAL_MIN_CONFIDENCE && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M1 9L4.5 5.5L6.5 7.5L11 2"/>
            <path d="M8 2h3v3"/>
          </svg>
          <span>
            Projected lift: ~
            <span className="font-medium text-emerald-700 dark:text-emerald-400 tabular-nums">
              +₹{recommendation.projectedLift.toLocaleString('en-IN', {
                maximumFractionDigits: 0
              })}
            </span>
            {' '}if surge applied historically
          </span>
        </div>
      )}

      {/* ROW 4 — Action area */}
      <div className="pt-1 border-t border-border/50">
        {recommendation.isAlreadyScheduled ? (
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <span className="text-emerald-500">✓</span>
            Surge rule already active for this slot
          </p>
        ) : recommendation.confidenceScore < MANUAL_MIN_CONFIDENCE ? (
          <p className="text-xs text-muted-foreground italic">
            Not enough data yet — need {CONFIDENCE_THRESHOLD_FULL} sessions for full confidence
          </p>
        ) : wasJustApplied ? (
          <p className="text-xs text-emerald-700 dark:text-emerald-400 flex items-center gap-1 font-medium">
            <span>✓</span> Applied — surge rule added to schedule
          </p>
        ) : (
          <button
            onClick={handleApply}
            disabled={isApplying || isAutopilotMode}
            className={cn(
              'w-full py-1.5 px-3 rounded-md text-xs font-medium transition-all',
              isAutopilotMode
                ? 'bg-muted text-muted-foreground cursor-not-allowed'
                : 'bg-primary text-primary-foreground hover:opacity-90'
            )}
            title={isAutopilotMode ? 'Autopilot mode is active — rules applied automatically' : undefined}
          >
            {isApplying ? (
              <span className="flex items-center justify-center gap-2">
                <div className="h-3 w-3 rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground animate-spin" />
                Applying...
              </span>
            ) : (
              'Apply recommendation'
            )}
          </button>
        )}
      </div>
    </div>
  );
}
