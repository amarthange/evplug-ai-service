import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Zap, Info, Clock, IndianRupee, ChevronDown, ChevronUp } from "lucide-react";
import type { Connector } from "@shared/schema";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn, checkConnectorCompatibility } from "@/lib/utils";
import { calculateEstimatedCost } from "@/utils/pricingUtils";

interface ConnectorCardProps {
  connector: Connector;
  onSelect?: () => void;
  onJoinWaitlist?: () => void;
  isCompatible?: boolean;
  batteryCapacity?: number;
  isSelected?: boolean;
  vehicleType?: string;
  vehicle?: {
    batteryCapacity: number;
    chargeType: string;
  } | null;
}

export function ConnectorCard({ 
  connector, 
  onSelect, 
  onJoinWaitlist, 
  isCompatible: providedIsCompatible,
  batteryCapacity = 40,
  isSelected = false,
  vehicleType,
  vehicle
}: ConnectorCardProps) {
  const connectorId = connector.id || "unknown";

  // Use centralized compatibility check if vehicleType is provided, 
  // otherwise fallback to the prop value
  const isCompatible = vehicleType 
    ? checkConnectorCompatibility(connector.type, vehicleType)
    : providedIsCompatible;

  const currentHour = new Date().getHours() + ":" + String(new Date().getMinutes()).padStart(2, "0");
  const isWeekend = [0, 6].includes(new Date().getDay());
  
  let price = connector.pricePerKwh;
  let isPeak = false;
  let isCustomWeekend = false;

  if (connector.pricing) {
    isPeak = currentHour >= connector.pricing.peakStart && currentHour <= connector.pricing.peakEnd;
    isCustomWeekend = isWeekend;
    
    if (isPeak) {
      price = connector.pricing.peakRate;
    } else if (isCustomWeekend) {
      price = connector.pricing.weekendRate;
    } else {
      price = connector.pricing.baseRate;
    }
  }

  const estimate = calculateEstimatedCost(
    { ...connector, pricePerKwh: price },
    vehicle || (batteryCapacity ? { batteryCapacity, chargeType: vehicleType || "CCS" } : null),
    80
  );

  const formattedTime = estimate.estimatedMinutes > 60 
    ? `${Math.floor(estimate.estimatedMinutes/60)}h ${estimate.estimatedMinutes%60}m` 
    : `${estimate.estimatedMinutes}m`;
  const estimatedCost = estimate.estimatedCost;

  return (
    <TooltipProvider>
      <Tooltip delayDuration={0}>
        <TooltipTrigger asChild>
          <Card 
            className={cn(
              "p-5 hover:shadow-md transition-all border-2",
              connector.available ? "cursor-pointer" : "cursor-wait",
              !isCompatible && "opacity-50 grayscale cursor-not-allowed bg-slate-900/10 border-dashed",
              isSelected ? "border-[#22c55e] shadow-xl shadow-[#22c55e]/10 bg-[#22c55e]/5 scale-[1.02]" : "border-transparent bg-slate-900/40"
            )} 
            onClick={isCompatible ? (connector.available ? onSelect : onJoinWaitlist) : undefined}
            data-testid={`card-connector-${connectorId}`}
          >
            <div className="flex flex-col gap-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-4">
                  <div className={cn(
                    "w-12 h-12 rounded-xl flex items-center justify-center transition-colors",
                    isCompatible ? (isSelected ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary") : "bg-muted text-muted-foreground"
                  )}>
                    <Zap className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className={cn("font-bold text-lg leading-none tracking-tight", !isCompatible && "text-muted-foreground line-through decoration-1")}>
                        {connector.type}
                      </h3>
                      {!isCompatible && <Info className="w-3 h-3 text-muted-foreground" />}
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground font-mono text-sm">
                      <Badge variant="outline" className="px-1.5 py-0 h-5 font-mono bg-slate-950 text-slate-400 border-slate-800">
                        {connector.powerKw} kW
                      </Badge>
                      <span>•</span>
                      <span>{new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(price)}/kWh</span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col items-end gap-2">
                  <Badge variant={connector.available && isCompatible ? (isSelected ? "default" : "secondary") : "secondary"} data-testid={`badge-connector-status-${connectorId}`}>
                    {!isCompatible ? (
                      "Incompatible"
                    ) : connector.available ? (
                      <>
                        <span className={cn("inline-block w-2 h-2 rounded-full mr-2", isSelected ? "bg-primary-foreground" : "bg-primary animate-pulse")} />
                        Available
                      </>
                    ) : (
                      "In Use - Join Waitlist"
                    )}
                  </Badge>
                  {(isPeak || (isCustomWeekend && connector.pricing)) && isCompatible && (
                    <Badge variant="destructive" className="mt-1 text-[10px] px-1.5 py-0 h-4 leading-tight bg-orange-500 hover:bg-orange-600 border-none">
                      {isPeak ? "Peak Rate" : "Weekend Rate"}
                    </Badge>
                  )}
                </div>
              </div>

              {isCompatible && (
                <div className="flex items-center justify-between border-t pt-3 mt-1">
                  <div className="flex items-center gap-4 text-xs font-medium text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-blue-500" />
                      <span>Est. Full: <strong className="text-foreground">{formattedTime}</strong></span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <IndianRupee className="w-3.5 h-3.5 text-green-500" />
                      <span>Est. Cost: <strong className="text-foreground">{new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(estimatedCost)}</strong></span>
                    </div>
                  </div>
                  {connector.available && (
                    <Button 
                      size="sm" 
                      className="h-8 rounded-lg px-4 font-black uppercase text-[10px] tracking-widest bg-[#22c55e] hover:bg-[#16a34a] text-slate-950 shadow-lg shadow-[#22c55e]/20"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelect?.();
                      }}
                    >
                      Book Now
                    </Button>
                  )}
                </div>
              )}
            </div>
          </Card>
        </TooltipTrigger>
        {!isCompatible && (
          <TooltipContent side="top">
            <p>Not compatible with your vehicle</p>
          </TooltipContent>
        )}
      </Tooltip>
    </TooltipProvider>
  );
}
