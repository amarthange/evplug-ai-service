import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Zap, ChevronRight, X, BellRing } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";

interface WaitlistNotificationBannerProps {
  stationName: string;
  stationId: string;
  onDismiss: () => void;
}

export function WaitlistNotificationBanner({
  stationName,
  stationId,
  onDismiss
}: WaitlistNotificationBannerProps) {
  const [, setLocation] = useLocation();

  return (
    <motion.div
      initial={{ opacity: 0, y: -100 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -100 }}
      className="fixed top-6 inset-x-4 z-[100] md:left-auto md:right-6 md:w-[400px]"
    >
      <div className="bg-emerald-500 rounded-[24px] p-4 shadow-2xl shadow-emerald-900/40 relative overflow-hidden group">
        {/* Decorative background icon */}
        <Zap className="absolute -right-4 -bottom-4 w-24 h-24 text-white/10 rotate-12 group-hover:scale-110 transition-transform duration-500" />
        
        <div className="relative z-10 flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0 animate-bounce">
            <BellRing className="w-5 h-5 text-white" />
          </div>
          
          <div className="flex-1 space-y-1">
            <p className="text-white text-[10px] font-black uppercase tracking-widest opacity-80">Connector Available!</p>
            <h4 className="text-white text-sm font-black leading-tight">
              A spot is now ready at {stationName}
            </h4>
            <p className="text-white/70 text-[10px] font-bold">Your turn in line has arrived. Book within 5 mins.</p>
          </div>

          <button 
            onClick={onDismiss}
            className="p-1 hover:bg-white/10 rounded-full transition-colors self-start"
          >
            <X className="w-4 h-4 text-white/60" />
          </button>
        </div>

        <div className="mt-4 flex gap-2 relative z-10">
          <Button 
            onClick={() => setLocation(`/booking/${stationId}`)}
            className="flex-1 h-10 bg-white text-emerald-600 hover:bg-emerald-50 font-black text-[11px] uppercase tracking-wider rounded-xl"
          >
            Book Now <ChevronRight className="w-3.5 h-3.5 ml-1" />
          </Button>
          <Button 
            onClick={onDismiss}
            variant="ghost"
            className="h-10 text-white hover:bg-white/10 font-black text-[11px] uppercase tracking-wider rounded-xl border border-white/20"
          >
            Dismiss
          </Button>
        </div>
      </div>
    </motion.div>
  );
}
