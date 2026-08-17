import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';
import { SurgeOverride, isOverrideActive } from '@/lib/surge-scheduler';

interface SurgeOverridePanelProps {
  override: SurgeOverride | null;
  currentPeakPricing: { enabled: boolean; multiplier: number };
  onActivateOverride: (multiplier: number) => Promise<void>;
  onClearOverride: () => Promise<void>;
  isSaving: boolean;
}

export default function SurgeOverridePanel({
  override,
  currentPeakPricing,
  onActivateOverride,
  onClearOverride,
  isSaving
}: SurgeOverridePanelProps) {
  const [overrideMultiplier, setOverrideMultiplier] = useState(1.5);
  const overrideIsActive = isOverrideActive(override);
  const minutesRemaining = override
    ? Math.max(0, Math.round((override.overrideUntil - Date.now()) / 60000))
    : 0;

  const [, forceUpdate] = useState(0);

  useEffect(() => {
    if (!overrideIsActive) return;
    const timer = setInterval(() => forceUpdate(n => n + 1), 60_000);
    return () => clearInterval(timer);
  }, [overrideIsActive]);

  return (
    <div className={cn(
      "rounded-lg border p-4",
      overrideIsActive
        ? "border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/40"
        : "border-border bg-background"
    )}>
      {/* HEADER */}
      <div className="flex items-center gap-2 mb-3">
        <div className={cn(
          "h-2 w-2 rounded-full",
          overrideIsActive ? "bg-amber-500 animate-pulse" : "bg-muted-foreground"
        )} />
        <h3 className="text-sm font-medium">Manual override</h3>
        {overrideIsActive && (
          <span className="ml-auto text-xs text-amber-700 dark:text-amber-300">
            Expires in {minutesRemaining} min
          </span>
        )}
      </div>

      {/* ACTIVE STATE — show when override is active */}
      {overrideIsActive && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm">
                Surge at {override!.multiplier.toFixed(1)}× is active
              </p>
              <p className="text-xs text-muted-foreground">
                Overrides all schedule rules until{' '}
                {new Date(override!.overrideUntil).toLocaleTimeString('en-IN', {
                  hour: '2-digit', minute: '2-digit'
                })}
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={onClearOverride}
            disabled={isSaving}
          >
            Clear override — return to schedule
          </Button>
        </div>
      )}

      {/* INACTIVE STATE — show when no override */}
      {!overrideIsActive && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Activates surge immediately for 30 minutes, ignoring the schedule.
            Use for unexpected demand spikes.
          </p>
          <div className="flex items-center gap-3">
            <Slider
              value={[overrideMultiplier]}
              onValueChange={([v]) => setOverrideMultiplier(Math.round(v * 10) / 10)}
              min={1.1}
              max={3.0}
              step={0.1}
              className="flex-1"
            />
            <span className="text-sm font-medium w-12 text-right">
              {overrideMultiplier.toFixed(1)}×
            </span>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              className="flex-1"
              onClick={() => onActivateOverride(overrideMultiplier)}
              disabled={isSaving}
            >
              {isSaving ? 'Activating...' : `Surge now at ${overrideMultiplier.toFixed(1)}×`}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onActivateOverride(1.0)}
              disabled={isSaving}
              title="Force surge OFF for 30 minutes even if a schedule rule would activate it"
            >
              Force off
            </Button>
          </div>
          <p className="text-xs text-muted-foreground text-center">
            Override lasts 30 minutes then returns to schedule
          </p>
        </div>
      )}
    </div>
  );
}
