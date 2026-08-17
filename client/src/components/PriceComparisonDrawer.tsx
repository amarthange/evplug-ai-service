import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, MapPin, Zap, ArrowUpDown, CheckCircle2, AlertCircle, ChevronRight } from 'lucide-react';
import { type StationPriceSummary, type PriceSortMode } from '@/lib/price-sorter';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface PriceComparisonDrawerProps {
  stations: StationPriceSummary[];
  sortMode: PriceSortMode;
  onSortChange: (mode: PriceSortMode) => void;
  onStationSelect: (stationId: string) => void;
  onClose: () => void;
}

export default function PriceComparisonDrawer({
  stations,
  sortMode,
  onSortChange,
  onStationSelect,
  onClose
}: PriceComparisonDrawerProps) {
  const minPrice = stations.length > 0 ? Math.min(...stations.map(s => s.pricePerKwh)) : 0;
  const maxPrice = stations.length > 0 ? Math.max(...stations.map(s => s.pricePerKwh)) : 0;

  const sortOptions: { label: string; value: PriceSortMode }[] = [
    { label: 'Cheapest', value: 'price_asc' },
    { label: 'Nearest', value: 'distance' },
    { label: 'Available', value: 'availability' },
  ];

  return (
    <div className="fixed inset-0 z-50 pointer-events-none flex items-end justify-center">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/40 backdrop-blur-sm pointer-events-auto"
      />

      {/* Drawer */}
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        className="relative w-full max-w-2xl bg-[#0f172a]/90 backdrop-blur-2xl border-t border-white/10 rounded-t-[32px] shadow-[0_-20px_50px_rgba(0,0,0,0.5)] flex flex-col h-[65vh] pointer-events-auto"
      >
        {/* Header */}
        <div className="p-6 border-b border-white/5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-black text-white tracking-tight">Compare prices</h2>
              <p className="text-xs font-bold text-white/40 uppercase tracking-widest">
                Real-time rate analysis
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 bg-white/5 hover:bg-white/10 rounded-full border border-white/10 transition-colors"
            >
              <X className="w-5 h-5 text-white/60" />
            </button>
          </div>

          {/* Sort Controls */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
            <div className="flex items-center gap-1 bg-white/5 p-1 rounded-xl border border-white/10">
              {sortOptions.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => onSortChange(opt.value)}
                  className={cn(
                    "px-4 py-2 rounded-lg text-xs font-black transition-all whitespace-nowrap",
                    sortMode === opt.value
                      ? "bg-primary text-primary-foreground shadow-lg"
                      : "text-white/40 hover:text-white/70"
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* List Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
          {stations.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-white/20 space-y-2">
              <Zap className="w-12 h-12" />
              <p className="font-black italic">No stations found</p>
            </div>
          ) : (
            stations.map((s, idx) => {
              const isCheapestEver = s.pricePerKwh === minPrice && s.pricePerKwh > 0;
              
              return (
                <motion.div
                  key={s.stationId}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.03 }}
                  onClick={() => onStationSelect(s.stationId)}
                  className="group relative bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/20 rounded-2xl p-4 transition-all active:scale-[0.98] cursor-pointer overflow-hidden"
                >
                  {/* Top station badge (Cheapest) */}
                  {isCheapestEver && idx === 0 && sortMode === 'price_asc' && (
                    <div className="absolute top-0 right-0">
                      <div className="bg-emerald-500 text-white text-[10px] font-black px-3 py-1 rounded-bl-xl uppercase tracking-tighter shadow-lg">
                        Best Value
                      </div>
                    </div>
                  )}

                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2">
                        <div className={cn(
                          "w-2 h-2 rounded-full",
                          s.isAvailable ? "bg-emerald-500 animate-pulse" : "bg-red-500"
                        )} />
                        <h3 className="font-black text-white leading-tight truncate max-w-[180px]">
                          {s.stationName}
                        </h3>
                      </div>

                      <div className="flex flex-wrap gap-1.5">
                        {s.distanceKm !== null && (
                          <div className="flex items-center gap-1 px-2 py-0.5 bg-white/5 rounded-md text-[10px] font-bold text-white/60">
                            <MapPin className="w-3 h-3" />
                            {s.distanceKm.toFixed(1)} km
                          </div>
                        )}
                        <div className="flex items-center gap-1 px-2 py-0.5 bg-white/5 rounded-md text-[10px] font-bold text-white/60">
                          <CheckCircle2 className="w-3 h-3" />
                          {s.availableConnectors}/{s.totalConnectors} slots
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-1">
                        {s.connectorTypes.map(type => (
                          <span key={type} className="text-[9px] font-black uppercase tracking-widest text-white/30 bg-white/5 px-2 py-0.5 rounded border border-white/5">
                            {type}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="text-right flex flex-col items-end justify-between self-stretch">
                      <div className="space-y-0.5">
                        <div className={cn(
                          "text-2xl font-black tracking-tighter",
                          s.priceTier === 'cheapest' ? 'text-emerald-400' :
                          s.priceTier === 'mid' ? 'text-amber-400' : 'text-red-400'
                        )}>
                          ₹{s.pricePerKwh}
                          <span className="text-[10px] opacity-40 ml-1">/kWh</span>
                        </div>
                        {s.priceTier === 'cheapest' && (
                          <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-[9px] font-black uppercase py-0 px-2">
                            Cheapest
                          </Badge>
                        )}
                      </div>
                      <ChevronRight className="w-5 h-5 text-white/20 group-hover:text-white/60 transition-colors" />
                    </div>
                  </div>
                </motion.div>
              );
            })
          )}
        </div>

        {/* Footer Summary */}
        <div className="p-4 bg-white/5 border-t border-white/5">
          <p className="text-[10px] font-bold text-center text-white/40 uppercase tracking-[0.2em]">
            Showing {stations.length} stations · Cheapest: <span className="text-emerald-400">₹{minPrice}/kWh</span> · Max: <span className="text-red-400">₹{maxPrice}/kWh</span>
          </p>
        </div>
      </motion.div>
    </div>
  );
}
