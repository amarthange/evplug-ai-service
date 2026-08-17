import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  MapPin, Calendar, Clock, Zap, Radio, Receipt, 
  XCircle, CreditCard, Navigation, AlertCircle, Timer,
  Trash2, Share2
} from "lucide-react";
import type { Booking } from "@shared/schema";
import { safeFormat } from "@/lib/date-utils";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";
import { BOOKING_STATUS } from "@/constants/bookingStatus";
import { QRCodeDisplay } from "./QRCodeDisplay";
import {
  Dialog,
  DialogContent,
  DialogTrigger,
} from "@/components/ui/dialog";
import { QrCode } from "lucide-react";

interface BookingCardProps {
  booking: Booking;
  stationName?: string;
  connectorType?: string;
  onDelete?: (id: string) => void;
  onChat?: () => void;
  onShare?: () => void;
  unreadCount?: number;
}

export function BookingCard({ 
  booking, 
  stationName: propStationName, 
  connectorType: propConnectorType,
  onDelete,
  onChat,
  onShare,
  unreadCount = 0
}: BookingCardProps) {
  const [, setLocation] = useLocation();
  const currentStatus = booking.status || "pending";
  const [timeLeft, setTimeLeft] = useState<string>("");
  
  const stationName = (booking as any).stationName || propStationName || "Station";
  const connectorType = (booking as any).connectorType || propConnectorType || "Connector";

  const statusColors = {
    [BOOKING_STATUS.PENDING]: "outline",
    [BOOKING_STATUS.CONFIRMED]: "default",
    [BOOKING_STATUS.ACTIVE]: "secondary",
    [BOOKING_STATUS.COMPLETED]: "secondary",
    [BOOKING_STATUS.CANCELLED]: "destructive",
  } as const;

  useEffect(() => {
    if (currentStatus !== BOOKING_STATUS.PENDING || !booking.holdExpiresAt) return;

    const timer = setInterval(() => {
      const expiryValue = (booking as any).holdExpiresAt?.toDate?.() || 
                         (booking.holdExpiresAt ? new Date(booking.holdExpiresAt) : null);
      
      if (!expiryValue) {
        clearInterval(timer);
        return;
      }

      const diff = expiryValue.getTime() - Date.now();
      if (diff <= 0) {
        setTimeLeft("Expired");
        clearInterval(timer);
      } else {
        const mins = Math.floor(diff / 60000);
        const secs = Math.floor((diff % 60000) / 1000);
        setTimeLeft(`${mins}:${secs.toString().padStart(2, "0")}`);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [currentStatus, booking.holdExpiresAt]);

  const handleNavigate = () => {
    if ((booking as any).location) {
      const { lat, lng } = (booking as any).location;
      window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`, "_blank");
    } else {
      window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(stationName)}`, "_blank");
    }
  };

  return (
    <Card className={cn(
      "p-6 transition-all border-none shadow-lg ring-1 ring-border/50",
      currentStatus === BOOKING_STATUS.PENDING && "ring-2 ring-amber-500/50 bg-amber-50/10 shadow-amber-500/5",
      currentStatus === BOOKING_STATUS.ACTIVE && "ring-2 ring-primary/50 bg-primary/[0.02]"
    )}>
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-4">
          <div className={cn(
            "w-14 h-14 rounded-2xl flex items-center justify-center shadow-inner transition-transform group-hover:scale-105",
            currentStatus === "active" ? "bg-primary animate-pulse" : "bg-primary/10"
          )}>
            <Zap className={cn("w-7 h-7", currentStatus === "active" ? "text-white" : "text-primary")} />
          </div>
          <div>
            <h3 className="font-black text-xl tracking-tight leading-tight">{stationName}</h3>
            <p className="text-sm font-bold text-muted-foreground uppercase opacity-60 tracking-wider font-mono">{connectorType}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {onDelete && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-full transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(booking.id!);
              }}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          )}
          <Badge variant={(statusColors as any)[currentStatus] || "secondary"} className={cn(
            "px-3 py-1 font-black text-[10px] tracking-widest uppercase border-none",
            currentStatus === BOOKING_STATUS.PENDING && "bg-amber-500 text-white animate-pulse",
            currentStatus === BOOKING_STATUS.ACTIVE && "bg-emerald-500 text-white",
            currentStatus === BOOKING_STATUS.CONFIRMED && "bg-blue-600 text-white"
          )}>
            {currentStatus}
          </Badge>
        </div>
      </div>

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="flex items-center gap-3 text-sm font-bold text-muted-foreground">
            <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
              <Calendar className="w-4 h-4" />
            </div>
            {safeFormat(booking.startTime, "MMM dd, yyyy")}
          </div>
          <div className="flex items-center gap-3 text-sm font-black">
            <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center font-normal">
              <Clock className="w-4 h-4 text-muted-foreground" />
            </div>
            {(() => {
              const startMs = typeof booking.startTime === 'string' ? new Date(booking.startTime).getTime() : booking.startTime;
              return `${safeFormat(startMs, "HH:mm")} - ${safeFormat(startMs + (booking.duration || 60) * 60000, "HH:mm")}`;
            })()}
          </div>
        </div>

        {currentStatus === BOOKING_STATUS.PENDING && (
          <div className="bg-amber-500/10 border border-amber-500/20 p-4 rounded-2xl flex items-center justify-between animate-in zoom-in-95">
             <div className="flex items-center gap-3">
                <Timer className="w-5 h-5 text-amber-600 animate-spin" />
                <div>
                   <p className="text-[10px] font-black uppercase text-amber-800 tracking-tighter">Payment Timeout</p>
                   <p className="text-lg font-black text-amber-600 leading-none">{timeLeft}</p>
                </div>
             </div>
             <Button 
               size="sm" 
               className="bg-amber-600 hover:bg-amber-700 shadow-lg shadow-amber-500/20 font-black h-10 px-6 rounded-xl"
               onClick={() => setLocation(`/payment/${booking.id}`)}
             >
                <CreditCard className="w-4 h-4 mr-2" /> PAY NOW
             </Button>
          </div>
        )}

        <div className="flex items-center justify-between py-4 border-y border-dashed mt-4 bg-muted/20 -mx-6 px-6">
          <span className="text-xs font-black uppercase tracking-widest text-muted-foreground">Total Charge</span>
          <span className="font-black text-2xl tracking-tighter">
            {new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(booking.estimatedTotal || booking.totalPrice)}
          </span>
        </div>
        
        <div className="pt-2 space-y-3">
          {currentStatus === "completed" && (
            <div className="grid grid-cols-3 gap-2 py-4 rounded-2xl bg-emerald-500/[0.03] border border-emerald-500/10">
              <div className="text-center px-1">
                <p className="text-[9px] font-black uppercase text-muted-foreground mb-1">Duration</p>
                <p className="text-sm font-black">{booking.duration || 0} min</p>
              </div>
              <div className="text-center px-1 border-x border-emerald-500/10">
                <p className="text-[9px] font-black uppercase text-muted-foreground mb-1">Energy</p>
                <p className="text-sm font-black">{(booking.energyDeliveredKwh || 0).toFixed(1)} kWh</p>
              </div>
              <div className="text-center px-1">
                <p className="text-[9px] font-black uppercase text-muted-foreground mb-1 text-emerald-600">Saved</p>
                <p className="text-sm font-black text-emerald-600">🌱 {((booking.energyDeliveredKwh || 0) * 0.708).toFixed(1)} kg</p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            {currentStatus === "confirmed" && (
              <div className="flex flex-col gap-3 w-full">
                <div className="grid grid-cols-2 gap-3">
                  <Button 
                    className="bg-primary/10 hover:bg-primary/20 text-primary font-black shadow-none border-none h-11"
                    onClick={handleNavigate}
                  >
                    <Navigation className="w-4 h-4 mr-2" /> NAVIGATE
                  </Button>
                  <Button 
                    className="font-black h-11 shadow-lg shadow-primary/10" 
                    onClick={() => setLocation(`/charge/${booking.id}`)}
                  >
                    <Radio className="w-4 h-4 mr-2 animate-pulse" /> START 
                  </Button>
                </div>
                
                <Dialog>
                  <DialogTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full h-12 border-2 border-blue-500/20 text-blue-600 font-black hover:bg-blue-50 hover:border-blue-500/40 transition-all"
                    >
                      <QrCode className="w-5 h-5 mr-2" /> SHOW CHECK-IN QR
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="bg-transparent border-none p-0 max-w-sm">
                    <QRCodeDisplay 
                      booking={booking} 
                      stationName={stationName} 
                    />
                  </DialogContent>
                </Dialog>

                {onChat && (
                  <Button
                    variant="outline"
                    className="w-full h-11 border-primary/20 text-primary font-black relative"
                    onClick={(e) => {
                      e.stopPropagation();
                      onChat();
                    }}
                  >
                    {unreadCount > 0 && (
                      <span className="absolute -top-2 -right-2 bg-red-500 text-white text-[10px] w-5 h-5 rounded-full flex items-center justify-center border-2 border-background animate-bounce-slow">
                        {unreadCount}
                      </span>
                    )}
                    CHAT WITH OWNER
                  </Button>
                )}
                {onDelete && (
                  <Button 
                    variant="outline"
                    className="w-full h-11 text-destructive hover:bg-destructive/10 border-destructive/20 font-black tracking-widest text-[10px] uppercase"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(booking.id!);
                    }}
                  >
                    <Trash2 className="w-4 h-4 mr-2" /> CANCEL SCHEDULE
                  </Button>
                )}
              </div>
            )}

            {currentStatus === "active" && (
              <div className="flex flex-col gap-3 w-full col-span-2">
                <Button 
                  className="w-full h-12 font-black shadow-lg shadow-primary/20 animate-pulse" 
                  onClick={() => setLocation(`/charge/${booking.id}`)}
                >
                  <Radio className="w-5 h-5 mr-2" /> RESUME SESSION
                </Button>
                {onChat && (
                  <Button
                    variant="outline"
                    className="w-full h-11 border-primary/20 text-primary font-black relative"
                    onClick={(e) => {
                      e.stopPropagation();
                      onChat();
                    }}
                  >
                    {unreadCount > 0 && (
                      <span className="absolute -top-2 -right-2 bg-red-500 text-white text-[10px] w-5 h-5 rounded-full flex items-center justify-center border-2 border-background animate-bounce-slow">
                        {unreadCount}
                      </span>
                    )}
                    CHAT WITH OWNER
                  </Button>
                )}
              </div>
            )}
          </div>

          {currentStatus === "completed" && (
            <div className="flex flex-wrap gap-2">
              {onShare && (
                <Button 
                  className="flex-1 min-w-[100px] h-11 font-black bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-500/20 text-white rounded-xl"
                  onClick={(e) => {
                    e.stopPropagation();
                    onShare();
                  }}
                >
                  <Share2 className="w-4 h-4 mr-2" /> SHARE
                </Button>
              )}
              <Button 
                variant="outline"
                className="flex-1 min-w-[100px] h-11 font-black border-2 border-emerald-500/10 hover:bg-emerald-500/5 text-emerald-700 rounded-xl"
                onClick={() => setLocation(`/receipt/${booking.id}`)}
              >
                <Receipt className="w-4 h-4 mr-2" /> RECEIPT
              </Button>
              {onDelete && (
                <Button 
                  variant="outline"
                  className="h-11 px-4 font-black border-2 border-destructive/10 hover:bg-destructive/5 text-destructive rounded-xl"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(booking.id!);
                  }}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
            </div>
          )}

          {currentStatus === "cancelled" && (
            <div className="flex items-center justify-center gap-3 text-destructive/60 text-[10px] font-black bg-destructive/5 py-4 rounded-2xl border border-destructive/10 uppercase tracking-widest">
               <XCircle className="w-4 h-4" /> TRANSACTION STOPPED
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
