import { useState, useMemo, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Zap, CreditCard, Clock, Leaf, AlertCircle, Info } from "lucide-react";
import type { Station, EvCar } from "@shared/schema";
import { cn } from "@/lib/utils";

interface CostEstimatorProps {
  station: Station;
  vehicles: EvCar[];
  selectedVehicleId: string;
  onEstimateReady: (cost: number, duration: number) => void;
}

export function CostEstimator({ station, vehicles, selectedVehicleId, onEstimateReady }: CostEstimatorProps) {
  const [currentSoC, setCurrentSoC] = useState(20);
  const [targetSoC, setTargetSoC] = useState(80);

  const selectedVehicle = useMemo(() => {
    return vehicles.find(v => v.id === selectedVehicleId) || vehicles[0];
  }, [vehicles, selectedVehicleId]);

  const stats = useMemo(() => {
    if (!selectedVehicle) return null;

    const capacity = selectedVehicle.batteryCapacity || 60;
    const rate = station.connectors[0]?.pricePerKwh || 15;
    const power = station.connectors[0]?.powerKw || 50;

    const kwhNeeded = Math.max(0, (targetSoC - currentSoC) / 100 * capacity);
    const estimatedCost = kwhNeeded * rate;
    const estimatedTime = (kwhNeeded / power) * 60; // minutes
    const co2Offset = kwhNeeded * 0.82; // kg

    return {
      kwhNeeded: kwhNeeded.toFixed(1),
      estimatedCost: Math.round(estimatedCost),
      estimatedTime: Math.round(estimatedTime),
      co2Offset: co2Offset.toFixed(1),
      isWarning: targetSoC <= currentSoC
    };
  }, [selectedVehicle, station, currentSoC, targetSoC]);

  if (!selectedVehicle && vehicles.length === 0) {
    return (
      <Card className="bg-slate-900/50 border-white/5 rounded-[32px] overflow-hidden mb-6">
        <CardContent className="p-8 text-center space-y-4">
          <div className="w-16 h-16 bg-amber-500/10 rounded-full flex items-center justify-center mx-auto">
            <AlertCircle className="w-8 h-8 text-amber-500" />
          </div>
          <div>
            <h3 className="text-xl font-black text-white">Add vehicle first</h3>
            <p className="text-slate-400 text-sm mt-1">We need your battery capacity to estimate costs.</p>
          </div>
          <Button variant="outline" className="rounded-2xl border-white/10" onClick={() => window.location.href = "/settings"}>
            Go to Garage
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6 mb-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between px-2">
        <h2 className="text-2xl font-black tracking-tight text-white flex items-center gap-2">
          <CreditCard className="w-6 h-6 text-primary" /> Cost Estimator
        </h2>
        <Badge variant="secondary" className="bg-primary/10 text-primary border-none font-black text-[10px] uppercase tracking-widest px-3 py-1">
          Estimate
        </Badge>
      </div>

      <Card className="premium-glass p-6 rounded-[32px] border-none shadow-2xl">
        <div className="space-y-8">
          {/* Sliders */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Current Battery</label>
                <span className="text-lg font-black text-white">{currentSoC}%</span>
              </div>
              <Slider 
                value={[currentSoC]} 
                onValueChange={(v) => setCurrentSoC(v[0])} 
                max={100} 
                step={1} 
                className="py-2"
              />
            </div>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Target Battery</label>
                <span className="text-lg font-black text-primary">{targetSoC}%</span>
              </div>
              <Slider 
                value={[targetSoC]} 
                onValueChange={(v) => setTargetSoC(v[0])} 
                max={100} 
                step={1}
                className="py-2"
              />
            </div>
          </div>

          {stats?.isWarning && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 flex items-center gap-3 text-amber-500 text-sm font-bold">
              <AlertCircle className="w-5 h-5 shrink-0" />
              Target must be higher than current battery level
            </div>
          )}

          {/* Result Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: "Energy", value: `${stats?.kwhNeeded} kWh`, icon: Zap, color: "text-amber-500", bg: "bg-amber-500/10" },
              { label: "Est. Cost", value: `₹${stats?.estimatedCost}`, icon: CreditCard, color: "text-blue-500", bg: "bg-blue-500/10" },
              { label: "Est. Time", value: `${stats?.estimatedTime} min`, icon: Clock, color: "text-purple-500", bg: "bg-purple-500/10" },
              { label: "CO₂ Saved", value: `${stats?.co2Offset} kg`, icon: Leaf, color: "text-emerald-500", bg: "bg-emerald-500/10" },
            ].map((s, i) => (
              <div key={i} className="stat-card-dark p-4 rounded-3xl">
                <div className={cn("w-8 h-8 rounded-xl flex items-center justify-center mb-3", s.bg)}>
                  <s.icon className={cn("w-4 h-4", s.color)} />
                </div>
                <p className="text-[9px] font-black uppercase text-slate-500 mb-0.5">{s.label}</p>
                <p className="text-lg font-black text-white">{s.value}</p>
              </div>
            ))}
          </div>

          <Button 
            className="w-full h-14 rounded-2xl text-lg font-black shadow-xl shadow-primary/20 bg-primary hover:bg-primary/90"
            disabled={stats?.isWarning || !selectedVehicle}
            onClick={() => onEstimateReady(stats?.estimatedCost || 0, stats?.estimatedTime || 45)}
          >
            Book with this estimate →
          </Button>
        </div>
      </Card>
      
      <div className="flex items-center gap-2 px-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
        <Info className="w-3 h-3" />
        Calculated for {selectedVehicle?.model} ({selectedVehicle?.batteryCapacity}kWh)
      </div>
    </div>
  );
}
