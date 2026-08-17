import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { SurgeRule, HOUR_OPTIONS, MULTIPLIER_LABELS, detectOverlappingRules, formatDays, formatTimeRange } from '@/lib/surge-scheduler';

interface SurgeScheduleEditorProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (rule: SurgeRule) => Promise<void>;
  existingRule?: SurgeRule | null;
  existingRules: SurgeRule[];
  baseRatePerKwh?: number;
  isSaving: boolean;
}

export default function SurgeScheduleEditor({
  isOpen,
  onClose,
  onSave,
  existingRule,
  existingRules,
  baseRatePerKwh,
  isSaving
}: SurgeScheduleEditorProps) {
  const [label, setLabel] = useState(existingRule?.label ?? '');
  const [selectedDays, setSelectedDays] = useState<number[]>(existingRule?.days ?? [1, 2, 3, 4, 5]);
  const [startHour, setStartHour] = useState(existingRule?.startHour ?? 8);
  const [endHour, setEndHour] = useState(existingRule?.endHour ?? 10);
  const [multiplier, setMultiplier] = useState(existingRule?.multiplier ?? 1.5);
  const [isActive, setIsActive] = useState(existingRule?.isActive ?? true);

  const errors = useMemo(() => {
    const e: Record<string, string> = {};
    if (!label.trim()) e.label = 'Rule name is required';
    if (label.length > 40) e.label = 'Max 40 characters';
    if (selectedDays.length === 0) e.days = 'Select at least one day';
    if (endHour <= startHour) e.time = 'End time must be after start time';

    // Overlap detection
    const testRule: SurgeRule = {
      id: existingRule?.id ?? 'test',
      label, days: selectedDays, startHour, endHour, multiplier, isActive: true
    };
    const otherRules = existingRules.filter(r => r.id !== testRule.id);
    const overlaps = detectOverlappingRules([...otherRules, testRule])
      .filter(c => c.rule1Id === testRule.id || c.rule2Id === testRule.id);
    if (overlaps.length > 0) {
      e.overlap = `This rule overlaps with an existing rule. First match wins.`;
    }
    return e;
  }, [label, selectedDays, startHour, endHour, multiplier, existingRules, existingRule]);

  const isValid = Object.keys(errors).filter(k => k !== 'overlap').length === 0;

  const toggleDay = (day: number) => {
    if (selectedDays.includes(day)) {
      setSelectedDays(selectedDays.filter(d => d !== day));
    } else {
      setSelectedDays([...selectedDays, day].sort((a, b) => a - b));
    }
  };

  const baseRate = baseRatePerKwh ?? 8;
  const surgeRate = (baseRate * multiplier).toFixed(2);

  async function handleSave() {
    if (!isValid) return;
    const rule: SurgeRule = {
      id: existingRule?.id ?? Date.now().toString(),
      label: label.trim(),
      days: [...selectedDays].sort((a, b) => a - b),
      startHour,
      endHour,
      multiplier: Math.round(multiplier * 10) / 10,
      isActive
    };
    await onSave(rule);
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{existingRule ? 'Edit rule' : 'Add surge rule'}</DialogTitle>
          <DialogDescription>Define when surge pricing automatically activates</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* LABEL INPUT */}
          <div>
            <label className="text-sm font-medium">Rule name</label>
            <Input
              value={label}
              onChange={e => setLabel(e.target.value)}
              placeholder="e.g. Morning rush, Weekend peak"
              maxLength={40}
              className="mt-1"
            />
            {errors.label && <p className="text-xs text-destructive mt-1">{errors.label}</p>}
          </div>

          {/* DAY SELECTOR */}
          <div>
            <label className="text-sm font-medium">Active days</label>
            <div className="flex gap-1.5 mt-1">
              {['S','M','T','W','T','F','S'].map((dayChar, idx) => (
                <button
                  key={idx}
                  onClick={() => toggleDay(idx)}
                  className={cn(
                    "h-9 w-9 rounded-full text-sm font-medium transition-colors",
                    selectedDays.includes(idx)
                      ? "bg-primary text-primary-foreground"
                      : "border border-border bg-background text-muted-foreground hover:bg-muted"
                  )}
                >
                  {dayChar}
                </button>
              ))}
            </div>
            {errors.days && <p className="text-xs text-destructive mt-1">{errors.days}</p>}
            <div className="flex gap-2 mt-2">
              <button className="text-xs text-muted-foreground underline"
                onClick={() => setSelectedDays([1,2,3,4,5])}>
                Weekdays
              </button>
              <button className="text-xs text-muted-foreground underline"
                onClick={() => setSelectedDays([0,6])}>
                Weekends
              </button>
              <button className="text-xs text-muted-foreground underline"
                onClick={() => setSelectedDays([0,1,2,3,4,5,6])}>
                Every day
              </button>
            </div>
          </div>

          {/* TIME RANGE */}
          <div>
            <label className="text-sm font-medium">Time window</label>
            <div className="flex items-center gap-3 mt-1">
              <Select value={startHour.toString()} onValueChange={v => setStartHour(Number(v))}>
                <SelectTrigger className="flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HOUR_OPTIONS.slice(0, 24).map(opt => (
                    <SelectItem key={opt.value} value={opt.value.toString()}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-sm text-muted-foreground">to</span>
              <Select value={endHour.toString()} onValueChange={v => setEndHour(Number(v))}>
                <SelectTrigger className="flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HOUR_OPTIONS.slice(1).map(opt => (
                    <SelectItem key={opt.value} value={opt.value.toString()}
                      disabled={opt.value <= startHour}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Duration: {endHour - startHour} hour{endHour - startHour !== 1 ? 's' : ''}
            </p>
            {errors.time && <p className="text-xs text-destructive mt-1">{errors.time}</p>}
          </div>

          {/* MULTIPLIER SLIDER */}
          <div>
            <label className="text-sm font-medium">
              Surge multiplier
              <span className="ml-2 font-normal text-muted-foreground">
                {multiplier.toFixed(1)}× — {MULTIPLIER_LABELS[multiplier.toFixed(1)] ?? 'Custom'}
              </span>
            </label>
            <Slider
              value={[multiplier]}
              onValueChange={([v]) => setMultiplier(Math.round(v * 10) / 10)}
              min={1.1}
              max={3.0}
              step={0.1}
              className="mt-2"
            />
            <div className="flex justify-between mt-1">
              <span className="text-xs text-muted-foreground">1.1× gentle</span>
              <span className="text-xs text-muted-foreground">3.0× maximum</span>
            </div>
          </div>

          {/* LIVE PRICE PREVIEW */}
          <div className="rounded-lg border border-border bg-muted/40 p-3 mt-1">
            <p className="text-xs text-muted-foreground mb-1">Live price preview</p>
            <div className="flex items-center gap-3">
              <div className="text-center">
                <p className="text-sm font-medium">₹{baseRate}/kWh</p>
                <p className="text-xs text-muted-foreground">base rate</p>
              </div>
              <div className="text-muted-foreground text-sm">→</div>
              <div className="text-center">
                <p className="text-sm font-medium text-amber-600 dark:text-amber-400">
                  ₹{surgeRate}/kWh
                </p>
                <p className="text-xs text-muted-foreground">during surge</p>
              </div>
              <div className="ml-auto">
                <span className="text-xs px-2 py-1 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-200">
                  +{((multiplier - 1) * 100).toFixed(0)}% revenue
                </span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              During {formatDays(selectedDays)} {formatTimeRange(startHour, endHour)}
            </p>
          </div>

          {/* OVERLAP WARNING */}
          {errors.overlap && (
            <div className="flex items-start gap-2 p-3 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40">
              <span className="text-amber-600 text-xs mt-0.5">⚠</span>
              <p className="text-xs text-amber-700 dark:text-amber-300">
                {errors.overlap} The first matching rule in the list will apply.
              </p>
            </div>
          )}

          {/* ACTIVE TOGGLE */}
          {existingRule && (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Rule enabled</p>
                <p className="text-xs text-muted-foreground">
                  Disabled rules are saved but never applied
                </p>
              </div>
              <Switch checked={isActive} onCheckedChange={setIsActive} />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!isValid || isSaving}>
            {isSaving ? 'Saving...' : existingRule ? 'Save changes' : 'Add rule'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
