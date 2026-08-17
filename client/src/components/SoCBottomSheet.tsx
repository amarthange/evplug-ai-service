import React, { useState } from 'react';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';
import { 
  formatSoCFreshness, 
  SOC_MIN, 
  SOC_MAX, 
  SOC_DEFAULT_FALLBACK 
} from '@/lib/soc-manager';

interface SoCBottomSheetProps {
  isOpen: boolean;
  onConfirm: (socValue: number) => void;
  onSkip: () => void;
  vehicleId: string;
  vehicleName: string;
  lastKnownSoC: number | null;
  lastKnownSoCUpdatedAt: Date | null;
  isSaving: boolean;
}

export default function SoCBottomSheet({
  isOpen,
  onConfirm,
  onSkip,
  vehicleName,
  lastKnownSoC,
  lastKnownSoCUpdatedAt,
  isSaving
}: SoCBottomSheetProps) {
  const [sliderValue, setSliderValue] = useState<number>(() => {
    if (lastKnownSoC !== null && lastKnownSoC >= SOC_MIN && lastKnownSoC <= SOC_MAX) {
      return lastKnownSoC;
    }
    return 50;
  });
  
  const [hasInteracted, setHasInteracted] = useState(false);

  // Simplified estimate for the UI preview
  const batteryCapacityKwh = 40;
  const estimatedKwh = batteryCapacityKwh * ((80 - sliderValue) / 100);
  const chargerPowerKw = 22;
  const estimatedMins = Math.max(0, Math.round((estimatedKwh / chargerPowerKw) * 60));

  const getBatteryColor = (val: number) => {
    if (val < 20) return '#ef4444'; // red-500
    if (val < 40) return '#f97316'; // orange-500
    if (val < 60) return '#eab308'; // yellow-500
    if (val < 80) return '#84cc16'; // lime-500
    return '#22c55e'; // green-500
  };

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onSkip()}>
      <SheetContent 
        side="bottom" 
        className="rounded-t-[20px] max-h-[85vh] overflow-y-auto"
        onInteractOutside={(e) => e.preventDefault()}
        aria-labelledby="soc-sheet-title"
      >
        {/* [1] DRAG HANDLE */}
        <div className="mx-auto mt-3 mb-4 h-1 w-10 rounded-full bg-muted" />

        {/* [2] SHEET HEADER */}
        <div className="px-6 pb-2">
          <div className="flex items-center gap-3 mb-1">
            <div className="h-9 w-9 rounded-full bg-emerald-100 dark:bg-emerald-950 flex items-center justify-center flex-shrink-0">
              <span className="text-lg">🔋</span>
            </div>
            <div>
              <h2 id="soc-sheet-title" className="text-base font-medium leading-tight">
                What's your current battery level?
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                For {vehicleName} · helps us estimate charging time accurately
              </p>
            </div>
          </div>
        </div>

        {/* [3] LAST KNOWN SOC DISPLAY */}
        {lastKnownSoC !== null && (
          <div className="mx-6 mb-4 flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/60 border border-border">
            <div className="h-1.5 w-1.5 rounded-full bg-amber-400 flex-shrink-0" />
            <p className="text-xs text-muted-foreground">
              Last recorded: <span className="text-foreground font-medium">{lastKnownSoC}%</span>
              {' · '}{formatSoCFreshness(lastKnownSoCUpdatedAt)}
            </p>
          </div>
        )}

        {/* [4] BATTERY VISUAL + SLIDER */}
        <div className="flex justify-center my-6">
          <svg 
            width="160" height="80" viewBox="0 0 160 80" 
            role="img" aria-label={`Battery at ${sliderValue}%`}
          >
            {/* Body */}
            <rect 
              x="4" y="10" width="140" height="60" rx="8" 
              fill="transparent" stroke="currentColor" strokeWidth="2"
              className="text-border"
            />
            {/* Terminal nub */}
            <rect 
              x="144" y="28" width="10" height="24" rx="3" 
              fill="currentColor"
              className="text-border"
            />
            {/* Fill bar */}
            <rect 
              x="8" y="14" height="52" rx="5" 
              width={Math.round((sliderValue / 100) * 132)}
              fill={getBatteryColor(sliderValue)}
              style={{ transition: 'width 0.1s ease-out, fill 0.3s ease' }}
            />
            {/* Percentage text */}
            <text 
              x="74" y="44" textAnchor="middle" dominantBaseline="central"
              fontSize="18" fontWeight="600"
              fill={sliderValue >= 50 ? '#fff' : 'currentColor'}
              className={cn(sliderValue < 50 && "text-foreground")}
            >
              {sliderValue}%
            </text>
          </svg>
        </div>

        <div className="mx-6">
          <Slider
            value={[sliderValue]}
            onValueChange={([val]) => {
              setSliderValue(val);
              if (!hasInteracted) setHasInteracted(true);
            }}
            min={SOC_MIN}
            max={SOC_MAX}
            step={1}
            aria-label="Battery level percentage"
          />
          <div className="flex justify-between mt-2">
            <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-tight">{SOC_MIN}% (Empty)</span>
            <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-tight">{SOC_MAX}% (Full)</span>
          </div>

          <p className={cn(
            "text-xs text-center mt-3 font-medium",
            sliderValue < 20 ? "text-red-500" : 
            sliderValue >= 80 ? "text-amber-600 dark:text-amber-400" : 
            "text-muted-foreground"
          )}>
            {sliderValue < 20 ? "⚠ Very low — session may be short" :
             sliderValue >= 80 ? "Already well-charged — tapering will begin quickly" :
             "Good range for a charging session"}
          </p>
        </div>

        {/* [5] ESTIMATED CHARGING TIME PREVIEW */}
        <div className="mx-6 mt-6 flex items-center justify-between py-3 px-4 rounded-xl bg-muted/40">
          <span className="text-xs text-muted-foreground font-medium">Est. time to 80%</span>
          <span className="text-sm font-bold tabular-nums">
            {sliderValue >= 80
              ? 'Already there!'
              : estimatedMins < 60
                ? `~${estimatedMins} min`
                : `~${Math.floor(estimatedMins/60)}h ${estimatedMins % 60}m`}
          </span>
        </div>
        <p className="text-[10px] text-muted-foreground text-center mt-2 px-6">
          Actual time depends on charger speed at the station
        </p>

        {/* [6] ACTION BUTTONS */}
        <div className="px-6 mt-8 mb-8 flex flex-col gap-3">
          <Button
            className="h-12 rounded-xl font-bold text-sm shadow-lg shadow-primary/20"
            onClick={() => onConfirm(sliderValue)}
            disabled={isSaving}
            aria-describedby="soc-context-label"
          >
            {isSaving ? (
              <span className="flex items-center gap-2">
                <div className="h-4 w-4 rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground animate-spin" />
                Saving...
              </span>
            ) : (
              `Set battery to ${sliderValue}% and continue`
            )}
          </Button>

          <Button
            variant="ghost"
            className="h-10 text-muted-foreground font-medium text-xs"
            onClick={onSkip}
            disabled={isSaving}
          >
            Skip — assume {SOC_DEFAULT_FALLBACK}% battery
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ACCEPTANCE TESTS:
// Test 1 — Fresh SoC (no sheet): Skip prompt if < 24h old.
// Test 2 — Stale SoC (sheet appears): Prompt if > 24h old.
// Test 3 — Missing SoC (sheet appears, slider at 50%): Prompt if never recorded.
// Test 4 — User sets 75%, confirms: Saves to Firestore + proceeds with 75%.
// Test 5 — User skips: Proceeds with 20% fallback.
// Test 6 — Battery SVG color changes: Red < 20, Orange < 40, Yellow < 60, Lime < 80, Green >= 80.
// Test 7 — Slider context label changes: Updates based on range (Low/Good/High).
// Test 8 — Estimated time preview: Calculate mins to 80%.
// Test 9 — Double-tap protection: Ensure single write per booking attempt.
// Test 10 — active-charge.tsx receives correct startSoC: Simulation uses Firestore value.
