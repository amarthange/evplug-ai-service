// ANNOUNCEMENTS — AudiencePreview
import { useState, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { 
  computeTargetUserIds, 
  type TargetSegment, 
  type TargetingResult, 
  type AudiencePreviewResult 
} from '@/lib/announcement-engine';
import { type Firestore } from 'firebase/firestore';

interface AudiencePreviewProps {
  segment: TargetSegment;
  stationIds: string[];
  db: Firestore;
  onTargetingComputed: (result: TargetingResult) => void;
}

/**
 * Displays live audience reach estimation as segment and station selection changes.
 * 
 * Implementation Notes:
 * - Uses AbortController to cancel stale Firestore queries when selection changes rapidly.
 * - Implements 600ms debounce to avoid overwhelming Spark plan read limits.
 * - stationIds.join() is used in the dependency array for stable reference comparison.
 */
export default function AudiencePreview({
  segment,
  stationIds,
  db,
  onTargetingComputed
}: AudiencePreviewProps) {
  const [preview, setPreview] = useState<AudiencePreviewResult>({
    estimatedCount: 0,
    wasCapped: false,
    rawCount: 0,
    isLoading: false,
    error: null,
    queriedAt: null
  });

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (stationIds.length === 0) {
      setPreview(p => ({
        ...p, estimatedCount: 0, isLoading: false, error: null, queriedAt: null
      }));
      return;
    }

    // Cancel any in-flight computation
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;

    const timer = setTimeout(async () => {
      setPreview(p => ({ ...p, isLoading: true, error: null }));

      try {
        const result = await computeTargetUserIds(db, segment, stationIds, 500);

        if (signal.aborted) return;

        setPreview({
          estimatedCount: result.userIds.length,
          wasCapped: result.wasCapped,
          rawCount: result.rawCount,
          isLoading: false,
          error: null,
          queriedAt: new Date()
        });
        onTargetingComputed(result);

      } catch (err: unknown) {
        if (signal.aborted) return;
        setPreview(p => ({
          ...p,
          isLoading: false,
          error: 'Could not estimate audience. Check your connection.',
          queriedAt: null
        }));
        console.error('[SeniorDevOps AudiencePreview] Compute failed:', err);
      }
    }, 600);

    return () => {
      clearTimeout(timer);
      abortRef.current?.abort();
    };
  }, [segment, stationIds.join(','), db]);

  // Final cleanup on unmount
  useEffect(() => () => abortRef.current?.abort(), []);

  return (
    <div className={cn(
      'rounded-lg border p-3 space-y-2 transition-all duration-200',
      preview.isLoading ? 'border-border bg-muted/30' :
      preview.error ? 'border-destructive/30 bg-destructive/5' :
      preview.wasCapped ? 'border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40' :
      preview.estimatedCount > 0 ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/20' :
      'border-border bg-muted/20'
    )}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"
               stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <circle cx="7" cy="8" r="1.5"/>
            <path d="M4.5 10.5a3.5 3.5 0 010-5M9.5 10.5a3.5 3.5 0 000-5"/>
            <path d="M2.5 12.5A6.5 6.5 0 012.5 1M11.5 12.5A6.5 6.5 0 0111.5 1"/>
          </svg>
          <span className="text-sm font-medium">Estimated reach</span>
        </div>

        {preview.isLoading ? (
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-full border-2 border-border
                            border-t-foreground animate-spin" />
            <span className="text-xs text-muted-foreground">Computing...</span>
          </div>
        ) : preview.error ? (
          <span className="text-xs text-destructive">{preview.error}</span>
        ) : (
          <span className={cn(
            'text-lg font-medium tabular-nums',
            preview.estimatedCount === 0 ? 'text-muted-foreground' :
            preview.wasCapped ? 'text-amber-700 dark:text-amber-300' :
            'text-emerald-700 dark:text-emerald-300'
          )}>
            {preview.estimatedCount.toLocaleString('en-IN')} drivers
          </span>
        )}
      </div>

      {preview.wasCapped && !preview.isLoading && (
        <p className="text-xs text-amber-700 dark:text-amber-300">
          ⚠ {preview.rawCount.toLocaleString('en-IN')} drivers match —
          sending to first 500 only
        </p>
      )}

      {!preview.isLoading && !preview.error && preview.estimatedCount === 0
        && stationIds.length > 0 && (
        <p className="text-xs text-muted-foreground">
          No drivers match this segment for the selected stations.
          Try a broader segment or include more stations.
        </p>
      )}

      {!preview.isLoading && preview.queriedAt && (
        <p className="text-xs text-muted-foreground">
          Computed {preview.queriedAt.toLocaleTimeString('en-IN', {
            hour: '2-digit', minute: '2-digit'
          })}
          {' '}·{' '}
          <button
            className="underline hover:no-underline"
            onClick={() => {
              setPreview(p => ({ ...p, queriedAt: null, isLoading: false }));
              onTargetingComputed({ userIds: [], rawCount: 0, wasCapped: false, queryDescription: '' });
            }}
          >
            Refresh
          </button>
        </p>
      )}
    </div>
  );
}
