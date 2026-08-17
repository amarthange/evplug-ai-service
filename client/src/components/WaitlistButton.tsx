import React from "react";
import { Users, LogIn, LogOut, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { joinWaitlist, leaveWaitlist } from "@/lib/waitlist-engine";

interface WaitlistButtonProps {
  stationId: string;
  userId: string;
  displayName: string;
  vehicleType: string;
  isInWaitlist: boolean;
  waitingCount: number;
  isAvailable: boolean;
  hasActiveBooking: boolean;
}

export function WaitlistButton({
  stationId,
  userId,
  displayName,
  vehicleType,
  isInWaitlist,
  waitingCount,
  isAvailable,
  hasActiveBooking
}: WaitlistButtonProps) {
  const [loading, setLoading] = React.useState(false);

  // Don't show if station is available or user has a booking
  if (isAvailable || hasActiveBooking) return null;

  const handleAction = async () => {
    setLoading(true);
    try {
      if (isInWaitlist) {
        await leaveWaitlist(stationId, userId);
      } else {
        await joinWaitlist(stationId, userId, displayName, vehicleType);
      }
    } catch (error) {
      console.error("Waitlist action failed", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-2">
        <div className="flex items-center gap-2 text-slate-400">
          <Users className="w-4 h-4" />
          <span className="text-xs font-black uppercase tracking-widest">
            {waitingCount} drivers waiting
          </span>
        </div>
        {isInWaitlist && (
          <Badge className="bg-primary/20 text-primary border-none text-[10px] font-black uppercase animate-pulse">
            In Queue
          </Badge>
        )}
      </div>

      <Button
        onClick={handleAction}
        disabled={loading}
        className={cn(
          "w-full h-14 rounded-2xl font-black text-sm uppercase tracking-widest transition-all duration-300",
          isInWaitlist 
            ? "bg-slate-800 hover:bg-slate-700 text-white border border-white/5" 
            : "bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/20"
        )}
      >
        {loading ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : isInWaitlist ? (
          <span className="flex items-center gap-2">
            <LogOut className="w-4 h-4" /> Leave Waitlist
          </span>
        ) : (
          <span className="flex items-center gap-2">
            <LogIn className="w-4 h-4" /> Join Waitlist
          </span>
        )}
      </Button>
    </div>
  );
}

import { Badge } from "@/components/ui/badge";
