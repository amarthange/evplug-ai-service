import { useState, useMemo, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Zap, CreditCard, Clock, Info, AlertCircle, ChevronRight, User } from "lucide-react";
import type { Station, EvCar } from "@shared/schema";
import { cn } from "@/lib/utils";
import { computeChargeEstimate } from "@/lib/cost-estimator";
import { Link } from "wouter";

interface ChargeEstimatorCardProps {
  station: Station;
  activeVehicle: EvCar | null;
  onBookSession: (targetSoC: number, estimatedCost: number, estimatedMinutes: number) => void;
  currentSoC?: number | null; // From vehicle profile
}

export function ChargeEstimatorCard({ 
  station, 
  activeVehicle, 
  onBookSession,
  currentSoC: profileSoC 
}: ChargeEstimatorCardProps) {
  // Use profile SoC if available, otherwise default to 20%
  const initialSoC = profileSoC ?? 20;
  const [targetSoC, setTargetSoC] = useState(80);

  // Compute estimates using the physics engine
  const estimate = useMemo(() => {
    if (!activeVehicle) return null;

    // Get station power and price (using the first connector as representative)
    const connector = station.connectors[0];
    if (!connector) return null;

    return computeChargeEstimate(
      initialSoC,
      targetSoC,
      activeVehicle.batteryCapacity,
      connector.pricePerKwh,
      connector.powerKw
    );
  }, [activeVehicle, station, initialSoC, targetSoC]);

  if (!activeVehicle) {
    return (
      <Card className="premium-glass overflow-hidden mb-6 border-white/10">
        <CardContent className="p-8 text-center space-y-4">
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
            <Zap className="w-8 h-8 text-primary animate-pulse" />
          </div>
          <div>
            <h3 className="text-xl font-black text-white">No active vehicle</h3>
            <p className="text-slate-400 text-sm mt-1">Add a vehicle to your garage to estimate charging costs.</p>
          </div>
          <Link href="/user-profile">
            <Button className="rounded-2xl bg-primary hover:bg-primary/90 font-black px-8">
              Go to Garage
            </Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  const isInvalid = targetSoC <= initialSoC;

  return (
    <div className="space-y-6 mb-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between px-2">
        <div className="space-y-1">
          <h2 className="text-2xl font-black tracking-tight text-white flex items-center gap-2">
            <Zap className="w-6 h-6 text-primary" /> Charge Estimator
          </h2>
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
            {activeVehicle.brand} {activeVehicle.model} • {activeVehicle.batteryCapacity}kWh
          </p>
        </div>
        <Badge variant="secondary" className="bg-primary/10 text-primary border-none font-black text-[10px] uppercase tracking-widest px-3 py-1">
          Smart Estimate
        </Badge>
      </div>

      <Card className="premium-glass p-6 rounded-[32px] border-white/10 shadow-2xl relative overflow-hidden">
        {/* Background glow */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 blur-3xl -z-10" />
        
        <div className="space-y-8">
          {/* Slider Section */}
          <div className="space-y-6">
            <div className="flex justify-between items-end">
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block">Target Battery Level</label>
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl font-black text-white">{targetSoC}</span>
                  <span className="text-lg font-black text-primary">%</span>
                </div>
              </div>
              <div className="text-right space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block">Starting From</label>
                <span className="text-lg font-black text-slate-300">{initialSoC}%</span>
              </div>
            </div>

            <div className="relative pt-2">
              <Slider 
                value={[targetSoC]} 
                onValueChange={(v) => setTargetSoC(v[0])} 
                min={50}
                max={100} 
                step={5}
                className="py-2"
              />
              <div className="flex justify-between mt-2 text-[10px] font-bold text-slate-600 uppercase tracking-tighter">
                <span>50%</span>
                <span>75%</span>
                <span>100%</span>
              </div>
            </div>

            {profileSoC === null && (
              <Link href="/user-profile" className="flex items-center gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-2xl text-amber-500 text-[10px] font-black uppercase tracking-wider hover:bg-amber-500/20 transition-colors">
                <User className="w-3 h-3" />
                Set your vehicle SoC in your profile for better accuracy
                <ChevronRight className="w-3 h-3 ml-auto" />
              </Link>
            )}
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white/5 backdrop-blur-md p-4 rounded-3xl border border-white/5 text-center">
              <div className="w-8 h-8 rounded-xl bg-amber-500/10 flex items-center justify-center mx-auto mb-2">
                <Zap className="w-4 h-4 text-amber-500" />
              </div>
              <p className="text-[9px] font-black uppercase text-slate-500 mb-0.5">Energy</p>
              <p className="text-sm font-black text-white">{estimate?.kwhNeeded || 0} kWh</p>
            </div>
            
            <div className="bg-white/5 backdrop-blur-md p-4 rounded-3xl border border-white/5 text-center">
              <div className="w-8 h-8 rounded-xl bg-blue-500/10 flex items-center justify-center mx-auto mb-2">
                <CreditCard className="w-4 h-4 text-blue-500" />
              </div>
              <p className="text-[9px] font-black uppercase text-slate-500 mb-0.5">Cost</p>
              <p className="text-sm font-black text-white">₹{estimate?.estimatedCost || 0}</p>
            </div>

            <div className="bg-white/5 backdrop-blur-md p-4 rounded-3xl border border-white/5 text-center relative overflow-hidden">
              {targetSoC > 80 && (
                <div className="absolute top-0 right-0 p-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse" />
                </div>
              )}
              <div className="w-8 h-8 rounded-xl bg-purple-500/10 flex items-center justify-center mx-auto mb-2">
                <Clock className="w-4 h-4 text-purple-500" />
              </div>
              <p className="text-[9px] font-black uppercase text-slate-500 mb-0.5">Time</p>
              <p className="text-sm font-black text-white">{estimate?.estimatedMinutes || 0} min</p>
            </div>
          </div>

          {/* Tapering Warning */}
          {targetSoC > 80 && (
            <div className="flex items-start gap-3 p-4 bg-purple-500/5 border border-purple-500/10 rounded-2xl">
              <Info className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
              <p className="text-[10px] leading-relaxed text-slate-400 font-medium">
                <strong className="text-purple-400">Smart Tapering Active:</strong> Charging speed automatically slows down above 80% to protect battery health. Estimates adjusted for non-linear power delivery.
              </p>
            </div>
          )}

          {isInvalid && (
            <div className="bg-rose-500/10 border border-rose-500/20 rounded-2xl p-4 flex items-center gap-3 text-rose-500 text-xs font-bold">
              <AlertCircle className="w-5 h-5 shrink-0" />
              Target battery must be higher than current level ({initialSoC}%)
            </div>
          )}

          <Button 
            className="w-full h-14 rounded-[20px] text-lg font-black shadow-xl shadow-primary/20 bg-primary hover:bg-primary/90 text-white transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:hover:scale-100"
            disabled={isInvalid || !estimate}
            onClick={() => estimate && onBookSession(targetSoC, estimate.estimatedCost, estimate.estimatedMinutes)}
          >
            Book with this estimate <ChevronRight className="w-5 h-5 ml-2" />
          </Button>
        </div>
      </Card>
      
      <div className="flex items-center justify-center gap-4 px-4 text-[9px] font-bold text-slate-500 uppercase tracking-widest opacity-60">
        <span>Precision: ±5%</span>
        <span>•</span>
        <span>Update: Real-time</span>
        <span>•</span>
        <span>BMS: Taper-aware</span>
      </div>
    </div>
  );
}
