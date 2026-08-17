import { Zap } from "lucide-react";

export function ChargeProgress({ percentage, isCharging }: { percentage: number, isCharging: boolean }) {
  const radius = 120;
  const stroke = 20;
  const normalizedRadius = radius - stroke * 2;
  const circumference = normalizedRadius * 2 * Math.PI;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <div className="relative flex items-center justify-center">
      <svg height={radius * 2} width={radius * 2} className="transform -rotate-90 drop-shadow-md">
        <circle
          stroke="hsl(var(--muted))"
          fill="transparent"
          strokeWidth={stroke}
          r={normalizedRadius}
          cx={radius}
          cy={radius}
        />
        <circle
          stroke="hsl(var(--primary))"
          fill="transparent"
          strokeWidth={stroke}
          strokeDasharray={circumference + ' ' + circumference}
          style={{ strokeDashoffset, transition: "stroke-dashoffset 0.5s ease-in-out" }}
          r={normalizedRadius}
          cx={radius}
          cy={radius}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute flex flex-col items-center justify-center">
        <Zap className={`w-10 h-10 ${isCharging ? 'text-primary animate-pulse' : 'text-muted-foreground'}`} />
        <span className="text-4xl font-bold mt-2 font-mono drop-shadow-sm">{Math.round(percentage)}%</span>
        <span className="text-sm font-medium mt-1 text-muted-foreground tracking-wider uppercase">{isCharging ? "CHARGING" : "PAUSED"}</span>
      </div>
    </div>
  );
}
