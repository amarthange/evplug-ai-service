import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { SurgeRule, formatDays, formatTimeRange, isRuleActiveNow } from '@/lib/surge-scheduler';

interface SurgeRuleCardProps {
  rule: SurgeRule;
  onToggle: (ruleId: string, isActive: boolean) => Promise<void>;
  onEdit: (rule: SurgeRule) => void;
  onDelete: (ruleId: string) => Promise<void>;
  isDeleting: boolean;
  isToggling: boolean;
}

export default function SurgeRuleCard({
  rule,
  onToggle,
  onEdit,
  onDelete,
  isDeleting,
  isToggling
}: SurgeRuleCardProps) {
  const isNow = isRuleActiveNow(rule);

  return (
    <div className={cn(
      "rounded-lg border p-3 transition-colors",
      isNow
        ? "border-emerald-200 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-950/30"
        : rule.isActive
        ? "border-border bg-background"
        : "border-border/50 bg-muted/30 opacity-60"
    )}>
      {/* ROW 1 — Label + Active Now indicator */}
      <div className="flex items-center gap-2 mb-2">
        {isNow && (
          <div className="relative flex h-2 w-2">
            <span className="animate-ping absolute h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative rounded-full h-2 w-2 bg-emerald-500" />
          </div>
        )}
        <span className="text-sm font-medium flex-1 truncate">{rule.label}</span>
        {isNow && (
          <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300 flex-shrink-0">
            Active now
          </span>
        )}
      </div>

      {/* ROW 2 — Days + Time + Multiplier */}
      <div className="flex flex-wrap gap-1.5 mb-2">
        <span className="text-xs px-2 py-0.5 rounded-full border border-border bg-background text-muted-foreground">
          {formatDays(rule.days)}
        </span>
        <span className="text-xs px-2 py-0.5 rounded-full border border-border bg-background text-muted-foreground">
          {formatTimeRange(rule.startHour, rule.endHour)}
        </span>
        <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 font-medium">
          {rule.multiplier.toFixed(1)}×
        </span>
      </div>

      {/* ROW 3 — Controls */}
      <div className="flex items-center gap-2">
        <Switch
          checked={rule.isActive}
          onCheckedChange={(checked) => onToggle(rule.id, checked)}
          disabled={isToggling}
          className="scale-75 origin-left"
        />
        <span className="text-xs text-muted-foreground flex-1">
          {rule.isActive ? 'Enabled' : 'Disabled'}
        </span>
        <button
          onClick={() => onEdit(rule)}
          className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-muted transition-colors"
        >
          Edit
        </button>
        <button
          onClick={() => onDelete(rule.id)}
          disabled={isDeleting}
          className="text-xs text-destructive hover:text-destructive px-2 py-1 rounded hover:bg-destructive/10 transition-colors"
        >
          {isDeleting ? '...' : 'Delete'}
        </button>
      </div>
    </div>
  );
}

// ACCEPTANCE TESTS:
// Test 1 — Rule activates on schedule:
// Create rule: days=[3] (Wed), startHour=14, endHour=16, multiplier=1.5
// Set system clock to Wednesday 2:30pm (or mock Date)
// Expected: scheduler tick writes peakPricing: { enabled: true, multiplier: 1.5 }
// SurgeRuleCard shows green pulsing dot, 'Active now' badge

// Test 2 — Rule deactivates after window ends:
// Same rule as Test 1, advance clock to Wednesday 4:01pm
// Expected: next tick writes peakPricing: { enabled: false, multiplier: 1.0 }
// 'Active now' badge gone from card

// Test 3 — Override takes priority over schedule:
// Rule: Mon–Fri 8–10am, multiplier=1.4
// Activate override: multiplier=2.0, overrideUntil=30min from now
// Set clock to Monday 9am (rule would normally apply)
// Expected: peakPricing.multiplier = 2.0 (override wins)
// Override panel shows 'Expires in ~30 min'

// Test 4 — Override expires, schedule resumes:
// Continue from Test 3. Advance clock by 31 minutes.
// Expected: isOverrideActive() returns false
// Next tick: finds Mon 9am matches the 8–10am rule → writes multiplier=1.4

// Test 5 — Overlap detection in editor:
// Existing rule: Mon–Fri 8–12pm, multiplier=1.3
// Open editor, set: Mon–Wed 9–11am, multiplier=1.5
// Expected: amber overlap warning shown in editor
// 'Add rule' button still enabled (overlap is warning, not error)
// Rule saves successfully

// Test 6 — Delete rule while active:
// Active rule for current time slot. Delete it.
// Expected: rule removed from Firestore immediately,
// within 60 seconds peakPricing.enabled becomes false,
// 'Surge active' banner disappears from dashboard

// Test 7 — Force off override:
// Schedule rule active: multiplier=1.5
// Click 'Force off' in override panel
// Expected: override written with enabled=false, multiplier=1.0
// peakPricing: { enabled: false, multiplier: 1.0 } — schedule suppressed for 30 min

// Test 8 — Stale closure prevention:
// Add a rule while the scheduler interval is already running
// Expected: within 60s the new rule is evaluated (not the old empty surgeRules)
// Verify via console.info log: '[SeniorDevOps Surge] Rule applied: ...'
// This confirms the ref pattern works and the closure isn't stale
