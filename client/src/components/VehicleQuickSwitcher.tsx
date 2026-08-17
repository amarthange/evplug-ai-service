import React from 'react';
import { motion } from 'framer-motion';
import { Check, Info, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Vehicle } from '@/lib/vehicle-selector';
import { Link } from 'wouter';

interface VehicleQuickSwitcherProps {
  vehicles: Vehicle[];
  selectedVehicleId: string | null;
  onSelect: (vehicle: Vehicle) => void;
}

export default function VehicleQuickSwitcher({
  vehicles,
  selectedVehicleId,
  onSelect
}: VehicleQuickSwitcherProps) {
  if (vehicles.length === 0) {
    return (
      <div className="premium-glass p-8 rounded-[32px] text-center border-dashed border-2 border-white/5 bg-white/2 mt-2">
        <div className="w-12 h-12 rounded-2xl bg-slate-800/50 flex items-center justify-center mx-auto mb-4">
          <Plus className="w-6 h-6 text-slate-500" />
        </div>
        <h4 className="text-slate-400 text-sm font-black mb-1 uppercase tracking-widest">Garage Empty</h4>
        <p className="text-xs text-slate-600 font-bold mb-4">Add your EV to start charging</p>
        <Link href="/user-profile#garage">
          <a className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-primary/10 text-primary font-black text-[10px] uppercase tracking-widest hover:bg-primary/20 transition-all">
            Add Vehicle <Plus className="w-3 h-3" />
          </a>
        </Link>
      </div>
    );
  }

  // Single vehicle state — simplified view
  if (vehicles.length === 1) {
    const v = vehicles[0];
    return (
      <div className="mt-2">
        <div className={cn(
          "premium-glass p-4 rounded-[28px] flex items-center justify-between border-white/10",
          !v.isCompatible && "border-amber-500/30"
        )}>
          <div className="flex items-center gap-4">
            <div className={cn(
              "w-12 h-12 rounded-2xl flex items-center justify-center",
              v.isCompatible ? "bg-emerald-500/10 text-emerald-500" : "bg-amber-500/10 text-amber-500"
            )}>
              <Check className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-black text-white leading-tight mb-0.5">{v.displayName}</p>
              <div className="flex items-center gap-2">
                 <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter">{v.batteryCapacity} kWh</span>
                 <span className="w-1 h-1 rounded-full bg-slate-800" />
                 <span className="text-[10px] font-black text-primary uppercase tracking-tighter">{v.connectorType}</span>
              </div>
            </div>
          </div>
          {!v.isCompatible && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-500/10 text-amber-500">
               <Info className="w-3.5 h-3.5" />
               <span className="text-[9px] font-black uppercase tracking-widest">Incompatible</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Multi-vehicle horizontal switcher
  return (
    <div className="mt-2 relative">
      <div className="flex gap-4 overflow-x-auto pb-6 scrollbar-hide -mx-4 px-4">
        {vehicles.map((v, i) => {
          const isSelected = selectedVehicleId === v.id;
          return (
            <motion.div
              key={v.id}
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05, type: 'spring', stiffness: 260, damping: 20 }}
              whileTap={{ scale: 0.96 }}
              onClick={() => onSelect(v)}
              className={cn(
                "relative shrink-0 w-[180px] premium-glass p-5 rounded-[32px] cursor-pointer transition-all duration-500",
                isSelected 
                  ? "border-primary ring-1 ring-primary/40 bg-primary/10 shadow-2xl shadow-primary/20" 
                  : "border-white/5 hover:border-white/20 bg-white/2 hover:bg-white/5",
                !v.isCompatible && !isSelected && "opacity-40 grayscale-[0.5]"
              )}
            >
              <div className="flex justify-between items-start mb-4">
                <div className={cn(
                  "w-8 h-8 rounded-xl flex items-center justify-center transition-colors",
                  isSelected ? "bg-primary text-white" : "bg-slate-800/50 text-slate-500"
                )}>
                  {isSelected ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                </div>
                {!v.isCompatible && (
                  <div className="p-1.5 rounded-full bg-amber-500/10 text-amber-500">
                    <Info className="w-3 h-3" />
                  </div>
                )}
              </div>

              <h4 className="text-sm font-black text-white leading-tight mb-1.5 truncate pr-2">
                {v.displayName}
              </h4>
              
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter">
                  {v.batteryCapacity} kWh
                </span>
                <span className={cn(
                  "text-[10px] font-black uppercase tracking-tighter",
                  isSelected ? "text-primary" : "text-slate-600"
                )}>
                  {v.connectorType}
                </span>
              </div>

              {isSelected && (
                <motion.div 
                  layoutId="active-highlight"
                  className="absolute inset-0 rounded-[32px] border-2 border-primary pointer-events-none"
                  transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
                />
              )}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
