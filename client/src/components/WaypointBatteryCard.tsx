import React from 'react';
import { Zap, ArrowRight, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import { type WaypointBatteryState, formatSocDisplay, getSocStatusColor } from '@/lib/battery-planner';
import { Badge } from '@/components/ui/badge';

interface WaypointBatteryCardProps {
  state: WaypointBatteryState;
  isLast: boolean;
}

export default function WaypointBatteryCard({ state, isLast }: WaypointBatteryCardProps) {
  const statusColor = getSocStatusColor(state.status);
  
  // SVG Ring constants
  const size = 48;
  const stroke = 4;
  const radius = (size - stroke) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (state.arrivalSocPct / 100) * circumference;

  const getStatusLabel = () => {
    switch (state.status) {
      case 'ok': return 'Sufficient';
      case 'warning': return 'Getting Low';
      case 'critical': return 'Charge Required';
      case 'unreachable': return 'Unreachable';
    }
  };

  const StatusIcon = () => {
    switch (state.status) {
      case 'ok': return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
      case 'warning': return <AlertTriangle className="w-4 h-4 text-amber-500" />;
      case 'critical': return <AlertTriangle className="w-4 h-4 text-red-500" />;
      case 'unreachable': return <XCircle className="w-4 h-4 text-slate-500" />;
    }
  };

  return (
    <div className="relative pl-8 pb-8 last:pb-0">
      {/* Connector Line */}
      {!isLast && (
        <div className="absolute left-[15px] top-10 bottom-0 w-[2px] bg-white/10" />
      )}

      {/* Point Indicator */}
      <div className="absolute left-0 top-0 w-8 h-8 rounded-full bg-slate-900 border-2 border-white/10 flex items-center justify-center z-10">
        <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
      </div>

      <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-4 flex items-center gap-4 transition-all hover:bg-white/10">
        {/* Left: SoC Ring */}
        <div className="relative w-12 h-12 flex items-center justify-center shrink-0">
          <svg width={size} height={size} className="transform -rotate-90">
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke="currentColor"
              strokeWidth={stroke}
              fill="transparent"
              className="text-white/5"
            />
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke={statusColor}
              strokeWidth={stroke}
              fill="transparent"
              strokeDasharray={circumference}
              style={{ strokeDashoffset: offset }}
              strokeLinecap="round"
              className="transition-all duration-1000 ease-out"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-[10px] font-black">{Math.round(state.arrivalSocPct)}%</span>
          </div>
        </div>

        {/* Center: Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-black truncate">{state.waypointName}</h4>
            {state.isChargingStop && <Zap className="w-3 h-3 text-orange-500" />}
          </div>
          <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest mt-1">
            {indexToLabel(state.waypointIndex)} · {state.distanceFromPreviousKm.toFixed(1)} km leg
          </p>
          
          {state.isChargingStop && state.canReach && (
            <div className="mt-2 flex items-center gap-2 text-[10px] font-bold text-emerald-400">
              <Zap className="w-3 h-3" />
              <span>+{state.energyAddedKwh.toFixed(1)} kWh charge ({Math.round(state.departureSocPct)}% departure)</span>
            </div>
          )}
        </div>

        {/* Right: Status */}
        <div className="text-right flex flex-col items-end gap-1">
          <Badge 
            variant="outline" 
            className="text-[9px] font-black uppercase border-white/10 gap-1.5"
            style={{ color: statusColor, borderColor: `${statusColor}40` }}
          >
            <StatusIcon />
            {getStatusLabel()}
          </Badge>
          <p className="text-[8px] text-white/30 font-medium max-w-[80px] leading-tight">
            {state.statusMessage}
          </p>
        </div>
      </div>
    </div>
  );
}

function indexToLabel(index: number) {
  if (index === 0) return 'Start';
  return `Stop ${index}`;
}
