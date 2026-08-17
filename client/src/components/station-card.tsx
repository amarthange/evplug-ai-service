import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MapPin, Star, Zap, Navigation } from "lucide-react";
import type { Station } from "@shared/schema";
import { safeFormatDistanceToNow } from "@/lib/date-utils";
import { cn, getEstimatedDriveTime, formatDriveTime } from "@/lib/utils";
import { FavoriteButton } from "./FavoriteButton";

interface StationCardProps {
  station: Station;
  onClick: () => void;
  distance?: number; // in km
  className?: string;
  id?: string;
}

export function StationCard({ station, onClick, distance, className, id }: StationCardProps) {
  const connectors = station?.connectors || [];

  const handleNavigate = (e: React.MouseEvent) => {
    e.stopPropagation();
    const url = `https://www.google.com/maps/dir/?api=1&destination=${station.lat},${station.lon}`;
    window.open(url, '_blank');
  };
  
  // Derived fields with safe defaults and fallback calculation using type casting for future-ready fields
  const s = station as any;
  const totalConnectors = s.totalConnectors ?? connectors.length;
  const availableConnectors = s.availableConnectors ?? connectors.filter((c: any) => c.available).length;
  const maxPowerKw = s.maxPowerKw ?? Math.max(0, ...connectors.map((c: any) => c.powerKw || 0));
  const avgPrice = s.averagePricePerKwh ?? (connectors.length > 0 ? connectors.reduce((acc: number, c: any) => acc + (c.pricePerKwh || 0), 0) / connectors.length : 0);

  return (
    <Card
      id={id}
      className={cn("p-4 cursor-pointer hover-elevate active-elevate-2 border-b last:border-0 rounded-none first:rounded-t-lg last:rounded-b-lg", className)}
      onClick={onClick}
      data-testid={`card-station-${station.id}`}
    >
      <div className="flex gap-4">
        {/* Station Image */}
        <div className="w-24 h-24 rounded-lg overflow-hidden flex-shrink-0 bg-muted relative">
          <FavoriteButton 
            stationId={station.id} 
            className="absolute top-1 right-1 z-10 scale-75 origin-top-right bg-black/20 hover:bg-black/40" 
          />
          {station.imageUrl ? (
            <img
              src={station.imageUrl}
              alt={station.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/20 to-primary/10">
              <Zap className="w-10 h-10 text-primary" />
            </div>
          )}
        </div>

        {/* Station Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-semibold text-base truncate" data-testid={`text-station-name-${station.id}`}>
                  {station.name}
                </h3>
                {(() => {
                  const rawStatus = (s.status || "").toLowerCase();
                  if (rawStatus === 'maintenance') return <Badge variant="outline" className="text-[9px] h-4 uppercase bg-orange-50 text-orange-700 border-orange-200">Maintenance</Badge>;
                  if (rawStatus === 'pending') return <Badge variant="outline" className="text-[9px] h-4 uppercase bg-indigo-50 text-indigo-700 border-indigo-200">Under Review</Badge>;
                  if (rawStatus === 'active') {
                    return s.isOpen 
                      ? <Badge variant="outline" className="text-[9px] h-4 uppercase bg-emerald-50 text-emerald-700 border-emerald-200">Open Now</Badge>
                      : <Badge variant="outline" className="text-[9px] h-4 uppercase bg-slate-50 text-slate-700 border-slate-200">Closed</Badge>;
                  }
                  return <Badge variant="outline" className="text-[9px] h-4 uppercase bg-amber-50 text-amber-700 border-amber-200">Under Review</Badge>;
                })()}
              </div>
              <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
                <MapPin className="w-3 h-3 flex-shrink-0" />
                <span className="truncate">{station.address}</span>
              </div>
              {distance !== undefined && (
                <div className="flex items-center gap-2 mt-1">
                  <p className="text-xs text-muted-foreground">
                    {distance.toFixed(1)} km
                  </p>
                  <div className="h-1 w-1 rounded-full bg-slate-300" />
                  <p className="text-xs font-black text-primary">
                    {formatDriveTime(getEstimatedDriveTime(distance))}
                  </p>
                </div>
              )}
            </div>

            {/* Availability Badge */}
            <Badge
              variant={availableConnectors > 0 ? "default" : "secondary"}
              className="flex-shrink-0 min-w-[3rem] justify-center"
              data-testid={`badge-availability-${station.id}`}
            >
              {availableConnectors}/{totalConnectors}
            </Badge>
          </div>

          {/* Rating, Date, and Navigation Navigation */}
          <div className="flex items-center justify-between gap-4 mt-2">
            <div className="flex items-center gap-4">
              {station.rating && (
                <div className="flex items-center gap-1 text-sm">
                  <Star className="w-4 h-4 fill-primary text-primary" />
                  <span className="font-medium">{station.rating.toFixed(1)}</span>
                </div>
              )}
              {station.lastUpdated && (
                <p className="text-xs text-muted-foreground hidden sm:block">
                  Updated {safeFormatDistanceToNow(station.lastUpdated, { addSuffix: true })}
                </p>
              )}
            </div>
            
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs flex-shrink-0"
              onClick={handleNavigate}
            >
              <Navigation className="w-3 h-3 mr-1" />
              Direction
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}
