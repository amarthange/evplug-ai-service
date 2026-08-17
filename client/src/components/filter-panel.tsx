import { motion, AnimatePresence } from "framer-motion";
import { X, Zap, IndianRupee, MapPin, Check, SlidersHorizontal, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

interface FilterPanelProps {
  isOpen: boolean;
  onClose: () => void;
  filters: {
    connectors: string[];
    minPower: number;
    maxPrice: number;
    onlyOpen: boolean;
  };
  setFilters: (filters: any) => void;
  onReset: () => void;
}

const CONNECTOR_TYPES = ["CCS2", "Type 2", "CHAdeMO", "GB/T"];
const POWER_LEVELS = [
  { value: 0, label: "Any" },
  { value: 22, label: "Fast (22kW+)" },
  { value: 50, label: "Rapid (50kW+)" },
  { value: 120, label: "Ultra (120kW+)" }
];

export function FilterPanel({ isOpen, onClose, filters, setFilters, onReset }: FilterPanelProps) {
  const toggleConnector = (type: string) => {
    const next = filters.connectors.includes(type)
      ? filters.connectors.filter(c => c !== type)
      : [...filters.connectors, type];
    setFilters({ ...filters, connectors: next });
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100]"
          />

          {/* Panel */}
          <motion.div
            initial={{ y: "100%", opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: "100%", opacity: 0 }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed bottom-0 left-0 right-0 max-w-lg mx-auto bg-[#0f172a]/95 border-t border-white/10 rounded-t-[40px] shadow-2xl z-[101] overflow-hidden"
          >
            <div className="absolute top-3 left-1/2 -translate-x-1/2 w-12 h-1.5 bg-white/10 rounded-full" />
            
            <div className="p-8 pt-10 space-y-8 max-h-[85vh] overflow-y-auto">
              {/* Header */}
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-black tracking-tight flex items-center gap-3">
                    <SlidersHorizontal className="w-6 h-6 text-primary" />
                    Filters
                  </h2>
                  <p className="text-white/40 text-[10px] font-black uppercase tracking-widest mt-1">Refine your charging discovery</p>
                </div>
                <Button variant="ghost" size="icon" onClick={onClose} className="rounded-2xl bg-white/5 hover:bg-white/10">
                  <X className="w-5 h-5 text-white/50" />
                </Button>
              </div>

              {/* Connector Types */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-black uppercase tracking-widest text-white/50 flex items-center gap-2">
                    <Layers className="w-4 h-4" /> Connector Types
                  </label>
                  {filters.connectors.length > 0 && (
                    <button onClick={() => setFilters({...filters, connectors: []})} className="text-[10px] font-bold text-primary hover:underline">Clear</button>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {CONNECTOR_TYPES.map(type => {
                    const active = filters.connectors.includes(type);
                    return (
                      <button
                        key={type}
                        onClick={() => toggleConnector(type)}
                        className={cn(
                          "px-5 py-2.5 rounded-2xl text-xs font-black transition-all border",
                          active 
                            ? "bg-primary text-slate-950 border-primary shadow-lg shadow-primary/20" 
                            : "bg-white/5 text-white/40 border-white/5 hover:border-white/20 hover:text-white"
                        )}
                      >
                        {type}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Charging Speed */}
              <div className="space-y-6">
                <label className="text-xs font-black uppercase tracking-widest text-white/50 flex items-center gap-2">
                  <Zap className="w-4 h-4" /> Min Power Output
                </label>
                <div className="px-2">
                  <Slider 
                    value={[filters.minPower]} 
                    max={240} 
                    step={1} 
                    onValueChange={([v]) => setFilters({...filters, minPower: v})}
                    className="py-4"
                  />
                  <div className="flex justify-between mt-2">
                    <span className="text-[10px] font-black text-primary uppercase">{filters.minPower} kW+</span>
                    <span className="text-[10px] font-bold text-white/20 uppercase">Max 240kW</span>
                  </div>
                </div>
              </div>

              {/* Max Price */}
              <div className="space-y-6">
                <label className="text-xs font-black uppercase tracking-widest text-white/50 flex items-center gap-2">
                  <IndianRupee className="w-4 h-4" /> Max Price per kWh
                </label>
                <div className="px-2">
                  <Slider 
                    value={[filters.maxPrice]} 
                    max={50} 
                    step={1} 
                    onValueChange={([v]) => setFilters({...filters, maxPrice: v})}
                    className="py-4"
                  />
                  <div className="flex justify-between mt-2">
                    <span className="text-[10px] font-black text-primary uppercase">Under ₹{filters.maxPrice}</span>
                    <span className="text-[10px] font-bold text-white/20 uppercase">₹50 Cap</span>
                  </div>
                </div>
              </div>

              {/* Status Toggle */}
              <div 
                onClick={() => setFilters({...filters, onlyOpen: !filters.onlyOpen})}
                className={cn(
                  "p-5 rounded-[28px] border-2 transition-all flex items-center justify-between cursor-pointer",
                  filters.onlyOpen ? "bg-primary/5 border-primary/20" : "bg-white/5 border-transparent"
                )}
              >
                <div className="flex items-center gap-4">
                  <div className={cn(
                    "w-10 h-10 rounded-2xl flex items-center justify-center transition-colors",
                    filters.onlyOpen ? "bg-primary text-slate-950" : "bg-white/10 text-white/40"
                  )}>
                    <MapPin className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-sm font-black">Open Stations Only</p>
                    <p className="text-[10px] font-bold text-white/40 uppercase tracking-tight">Hide currently unavailable spots</p>
                  </div>
                </div>
                <div className={cn(
                  "w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all",
                  filters.onlyOpen ? "bg-primary border-primary" : "border-white/10"
                )}>
                  {filters.onlyOpen && <Check className="w-4 h-4 text-slate-950" />}
                </div>
              </div>

              {/* Footer Actions */}
              <div className="grid grid-cols-2 gap-4 pt-4">
                <Button 
                  onClick={onReset}
                  variant="ghost" 
                  className="h-16 rounded-[28px] font-black uppercase text-[10px] tracking-widest text-white/40 hover:text-white bg-white/5"
                >
                  Reset All
                </Button>
                <Button 
                  onClick={onClose}
                  className="h-16 rounded-[28px] font-black uppercase text-[10px] tracking-widest shadow-xl shadow-primary/20"
                >
                  Apply Filters
                </Button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
