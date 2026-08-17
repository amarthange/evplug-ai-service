import React, { useState, useEffect } from 'react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { 
  WEAR_SCORE_COLOR, 
  WEAR_SCORE_TRACK_COLOR,
  computeWearScoreBreakdown 
} from '@/lib/connector-lifecycle-engine';

interface WearScoreRingProps {
  score: number          // 0–100
  size?: number          // diameter in px, default 60
  strokeWidth?: number   // default 5
  showLabel?: boolean    // show score number in center, default true
  animated?: boolean     // animate on mount, default true
  lifetimeKwh?: number
  faultEvents?: number
  daysSinceInstall?: number
}

const WearScoreRing = React.memo(({
  score,
  size = 60,
  strokeWidth = 5,
  showLabel = true,
  animated = true,
  lifetimeKwh = 0,
  faultEvents = 0,
  daysSinceInstall = 0
}: WearScoreRingProps) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(score, 100) / 100;
  const strokeDashoffset = circumference * (1 - progress);

  const [animatedOffset, setAnimatedOffset] = useState(circumference);

  useEffect(() => {
    if (!animated) {
      setAnimatedOffset(strokeDashoffset);
      return;
    }
    const timer = setTimeout(() => setAnimatedOffset(strokeDashoffset), 50);
    return () => clearTimeout(timer);
  }, [strokeDashoffset, animated]);

  const scoreColor = WEAR_SCORE_COLOR(score);
  const trackColor = WEAR_SCORE_TRACK_COLOR(score);
  const breakdown = computeWearScoreBreakdown(lifetimeKwh, faultEvents, daysSinceInstall);

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="cursor-help inline-block">
            <svg
              width={size}
              height={size}
              viewBox={`0 0 ${size} ${size}`}
              role="img"
              aria-label={`Wear score: ${score} out of 100`}
            >
              {/* Track */}
              <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={trackColor}
                strokeWidth={strokeWidth}
              />
              {/* Progress */}
              <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={scoreColor}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={animated ? animatedOffset : strokeDashoffset}
                style={{
                  transition: animated ? 'stroke-dashoffset 0.8s ease-out' : 'none',
                  transformOrigin: 'center',
                  transform: 'rotate(-90deg)'
                }}
              />
              {/* Label */}
              {showLabel && (
                <text
                  x={size / 2}
                  y={size / 2}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={size * 0.26}
                  fontWeight="600"
                  fill={scoreColor}
                  fontFamily="system-ui, -apple-system, sans-serif"
                >
                  {score}
                </text>
              )}
            </svg>
          </div>
        </TooltipTrigger>
        <TooltipContent side="right" className="max-w-[200px] rounded-xl border-none glass-card shadow-2xl p-3">
          <p className="text-xs font-bold uppercase tracking-tight mb-2">Wear score breakdown</p>
          <div className="space-y-2">
            <BreakdownRow label="Usage" value={breakdown.kwhScore} max={60} />
            <BreakdownRow label="Faults" value={breakdown.faultScore} max={30} />
            <BreakdownRow label="Age" value={breakdown.ageScore} max={10} />
          </div>
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mt-3 pt-2 border-t border-white/10">
            Dominant factor: <span className="text-foreground">{breakdown.dominantFactor}</span>
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
});

function BreakdownRow({ label, value, max }: { label: string; value: number; max: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground w-12">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden border border-white/5">
        <div
          className="h-full rounded-full bg-primary shadow-[0_0_8px_rgba(var(--primary-rgb),0.4)]"
          style={{ width: `${(value / max) * 100}%` }}
        />
      </div>
      <span className="text-[10px] font-mono font-bold w-10 text-right">{value}/{max}</span>
    </div>
  );
}

export default WearScoreRing;
