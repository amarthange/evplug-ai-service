import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { type Firestore } from 'firebase/firestore';
import { Clock, AlertCircle, ArrowRight } from 'lucide-react';
import { computeLockStatus, formatCountdown } from '@/lib/booking-lock';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface BookingCountdownTimerProps {
  bookingId: string;
  stationId: string;
  db: Firestore;
  onExpired: () => void;
}

export default function BookingCountdownTimer({
  bookingId,
  stationId,
  db,
  onExpired
}: BookingCountdownTimerProps) {
  const { data: expiresAt, isLoading } = useQuery({
    queryKey: ['booking-lock', bookingId],
    queryFn: async (): Promise<Date | null> => {
      const { doc, getDoc } = await import('firebase/firestore');
      const snap = await getDoc(doc(db, 'locks', bookingId));
      if (!snap.exists()) return null;
      const data = snap.data();
      return data.expiresAt?.toDate?.() ?? null;
    },
    staleTime: Infinity,
    retry: 2
  });

  const [secondsLeft, setSecondsLeft] = useState<number>(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onExpiredRef = useRef(onExpired);
  
  // Keep ref current without re-running effect
  useEffect(() => {
    onExpiredRef.current = onExpired;
  }, [onExpired]);

  useEffect(() => {
    if (!expiresAt) return;

    // Initialize immediately
    const initialStatus = computeLockStatus(expiresAt);
    setSecondsLeft(initialStatus.secondsRemaining);

    if (initialStatus.isExpired) {
      onExpiredRef.current();
      return;
    }

    intervalRef.current = setInterval(() => {
      const status = computeLockStatus(expiresAt);
      setSecondsLeft(status.secondsRemaining);
      
      if (status.isExpired) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        onExpiredRef.current();
      }
    }, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [expiresAt]);

  if (isLoading) {
    return (
      <div className="w-full flex justify-center py-2">
        <div className="h-8 w-48 bg-white/5 animate-pulse rounded-full border border-white/10" />
      </div>
    );
  }

  if (!expiresAt) return null;

  const status = computeLockStatus(expiresAt);
  const isExpiringSoon = secondsLeft < 60 && secondsLeft > 0;

  if (status.isExpired || secondsLeft <= 0) {
    return (
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full bg-red-500/20 border-b border-red-500/30 p-6 flex flex-col items-center text-center space-y-4 backdrop-blur-xl"
      >
        <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center">
          <AlertCircle className="w-6 h-6 text-red-500" />
        </div>
        <div className="space-y-1">
          <h3 className="text-lg font-black text-white">Your slot has expired</h3>
          <p className="text-sm font-bold text-white/60">This slot has been released. Please rebook.</p>
        </div>
        <Button 
          onClick={onExpired}
          className="bg-white text-black hover:bg-white/90 rounded-xl px-8"
        >
          Go back to station <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </motion.div>
    );
  }

  return (
    <div className="w-full flex justify-center py-2">
      <motion.div
        animate={isExpiringSoon ? {
          scale: [1, 1.02, 1],
          transition: { repeat: Infinity, duration: 1 }
        } : {}}
        className={cn(
          "flex items-center gap-3 px-4 py-2 rounded-full border backdrop-blur-md shadow-lg transition-colors",
          isExpiringSoon 
            ? "bg-red-500/20 text-red-400 border-red-500/30" 
            : "bg-white/5 text-amber-400 border-white/10"
        )}
      >
        <Clock className={cn("w-4 h-4", isExpiringSoon ? "animate-pulse" : "")} />
        <span className="text-xs font-black uppercase tracking-widest">
          {isExpiringSoon ? 'Hurry!' : 'Slot reserved'} · {formatCountdown(secondsLeft)} remaining
        </span>
      </motion.div>
    </div>
  );
}
