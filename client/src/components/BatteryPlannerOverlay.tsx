import React from 'react';
import { Battery, Zap, AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Navigation, Info } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { type BatteryPlanResult, formatSocDisplay } from '@/lib/battery-planner';
import WaypointBatteryCard from './WaypointBatteryCard';
import { motion, AnimatePresence } from 'framer-motion';

interface BatteryPlannerOverlayProps {
  planResult: BatteryPlanResult | null;
  startSocPct: number;
  onStartSocChange: (soc: number) => void;
  vehicleName: string;
  vehicleEfficiencyWhKm?: number;
  isLoading: boolean;
}

export default function BatteryPlannerOverlay({
  planResult,
  startSocPct,
  onStartSocChange,
  vehicleName,
  vehicleEfficiencyWhKm,
  isLoading
}: BatteryPlannerOverlayProps) {
  const [isExpanded, setIsExpanded] = React.useState(true);

  if (!planResult) return null;

  return (
    <div className="absolute bottom-6 left-6 right-6 z-20 pointer-events-none">
      <div className="max-w-4xl mx-auto w-full pointer-events-auto">
        <motion.div 
          layout
          className="bg-[#1e293b]/90 backdrop-blur-2xl border border-white/10 rounded-[32px] shadow-2xl overflow-hidden"
        >
          {/* Header */}
          <div className="p-6 flex items-center justify-between border-b border-white/5 bg-white/5">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 flex items-center justify-center">
                <Battery className="w-6 h-6 text-emerald-500" />
              </div>
              <div>
                <h3 className="text-sm font-black text-white/40 uppercase tracking-widest leading-none mb-1">Battery Plan</h3>
                <p className="text-xl font-black text-white">{vehicleName}</p>
                <p className="text-[10px] font-bold text-white/40 mt-1">
                  Efficiency: {vehicleEfficiencyWhKm ?? 200} Wh/km
                </p>
              </div>
            </div>

            <div className="flex items-center gap-6">
              {/* Start SoC Control */}
              <div className="flex flex-col items-end gap-2 min-w-[160px]">
                <div className="flex justify-between w-full">
                  <span className="text-[10px] font-black text-white/40 uppercase tracking-widest">Start SoC</span>
                  <span className="text-xs font-black text-emerald-400">{startSocPct}%</span>
                </div>
                <Slider 
                  value={[startSocPct]} 
                  onValueChange={(v) => onStartSocChange(v[0])} 
                  max={100} 
                  min={5}
                  step={5}
                  className="w-full"
                />
              </div>

              <button 
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-10 h-10 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors"
              >
                {isExpanded ? <ChevronDown className="w-5 h-5" /> : <ChevronUp className="w-5 h-5" />}
              </button>
            </div>
          </div>

          <AnimatePresence>
            {isExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3 }}
              >
                <div className="p-6">
                  {/* Feasibility Banner */}
                  <div className={`mb-8 p-4 rounded-2xl border flex items-center gap-4 ${
                    planResult.isPlanFeasible 
                      ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' 
                      : 'bg-red-500/10 border-red-500/20 text-red-400'
                  }`}>
                    {planResult.isPlanFeasible ? (
                      <CheckCircle2 className="w-6 h-6 shrink-0" />
                    ) : (
                      <AlertTriangle className="w-6 h-6 shrink-0" />
                    )}
                    <div className="flex-1">
                      <p className="font-black text-sm">
                        {planResult.isPlanFeasible 
                          ? 'Trip is feasible — battery sufficient for all stops' 
                          : `Warning: insufficient charge to reach Stop ${planResult.firstCriticalWaypoint! + 1}`}
                      </p>
                      <p className="text-xs font-bold opacity-70 mt-0.5">
                        {planResult.isPlanFeasible 
                          ? 'Plan accounts for current consumption and charging efficiency.'
                          : 'Consider adding a charging stop or increasing your starting SoC.'}
                      </p>
                    </div>
                  </div>

                  {/* Waypoint Scroll Area */}
                  <div className="max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                    {planResult.waypoints.map((wp, i) => (
                      <WaypointBatteryCard 
                        key={i} 
                        state={wp} 
                        isLast={i === planResult.waypoints.length - 1} 
                      />
                    ))}
                  </div>

                  {/* Footer Summary */}
                  <div className="mt-8 pt-6 border-t border-white/5 grid grid-cols-3 gap-6">
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] font-black text-white/40 uppercase tracking-widest flex items-center gap-2">
                        <Navigation className="w-3 h-3" /> Distance
                      </span>
                      <p className="text-xl font-black">{Math.round(planResult.totalDistanceKm)} km</p>
                    </div>
                    <div className="flex flex-col gap-1 text-center">
                      <span className="text-[10px] font-black text-white/40 uppercase tracking-widest flex items-center justify-center gap-2">
                        <Zap className="w-3 h-3" /> Total Energy
                      </span>
                      <p className="text-xl font-black">{planResult.totalEnergyKwh.toFixed(1)} kWh</p>
                    </div>
                    <div className="flex flex-col gap-1 text-right">
                      <span className="text-[10px] font-black text-white/40 uppercase tracking-widest flex items-center justify-end gap-2">
                        <Battery className="w-3 h-3" /> Final SoC
                      </span>
                      <p className={`text-xl font-black ${planResult.finalSocPct < 15 ? 'text-red-400' : 'text-emerald-400'}`}>
                        {formatSocDisplay(planResult.finalSocPct)}
                      </p>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 10px;
        }
      `}</style>
    </div>
  );
}
