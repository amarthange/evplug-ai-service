import React from "react";
import { Station } from "@/lib/owner-service";
import { cn } from "@/lib/utils";
import { MapPin, Zap, BatteryCharging, ChevronRight } from "lucide-react";
import { Link } from "wouter";

interface StationListRowProps {
  station: Station;
  distanceKm: number | null;
  id?: string;
}

export function StationListRow({ station, distanceKm, id }: StationListRowProps) {
  // Aggregate connector info
  const totalConnectors = station.connectors.reduce((acc, curr) => acc + curr.count, 0);
  const availableConnectors = station.connectors.reduce((acc, curr) => acc + (curr.available ? curr.count : 0), 0);
  
  // Get minimum price
  const prices = station.connectors.map(c => c.pricePerKwh).filter(p => typeof p === 'number' && !isNaN(p));
  const minPrice = prices.length > 0 ? Math.min(...prices) : 0;

  // Get distinct connector types
  const types = Array.from(new Set(station.connectors.map(c => c.type)));

  // Status dot color
  let statusColor = "bg-green-500";
  if (station.status === "maintenance") statusColor = "bg-amber-500";
  if (station.status === "offline") statusColor = "bg-red-500";
  if (station.status === "pending") statusColor = "bg-slate-400";

  return (
    <div id={id}>
      <Link href={`/station/${station.id}`}>
        <div className="group flex items-center justify-between p-4 mb-3 rounded-2xl bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.05)] hover:bg-[rgba(255,255,255,0.08)] hover:border-[rgba(255,255,255,0.15)] transition-all cursor-pointer">
        
        <div className="flex items-start gap-4">
          <div className="relative mt-1">
            <div className={cn("w-3 h-3 rounded-full shadow-[0_0_8px_rgba(0,0,0,0.5)] border border-[#0a0a0a]", statusColor)} />
            {station.status === "active" && (
              <div className="absolute inset-0 bg-green-500 rounded-full animate-ping opacity-50" />
            )}
          </div>
          
          <div className="flex flex-col">
            <h3 className="text-white font-medium text-base line-clamp-1">{station.name}</h3>
            
            <div className="flex items-center gap-3 mt-1 text-xs text-[rgba(255,255,255,0.60)]">
              <span className="flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                {distanceKm !== null ? `${distanceKm.toFixed(1)} km` : '---'}
              </span>
              <span className="flex items-center gap-1">
                <Zap className="w-3 h-3" />
                ₹{minPrice.toFixed(2)}/kWh
              </span>
            </div>

            <div className="flex flex-wrap gap-1 mt-2">
              {types.map(type => (
                <span key={type} className="px-2 py-0.5 rounded-full bg-[rgba(255,255,255,0.1)] text-[10px] text-white">
                  {type}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-col items-end gap-2">
          <div className="flex flex-col items-end">
            <span className="text-2xl font-black text-white leading-none">
              {availableConnectors}
            </span>
            <span className="text-[10px] uppercase tracking-wider text-[rgba(255,255,255,0.35)]">
              of {totalConnectors}
            </span>
          </div>
          <ChevronRight className="w-5 h-5 text-[rgba(255,255,255,0.3)] group-hover:text-white transition-colors mt-1" />
        </div>
      </div>
    </Link>
    </div>
  );
}
