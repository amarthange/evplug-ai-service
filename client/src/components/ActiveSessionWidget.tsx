import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useLocation } from 'wouter';
import { collection, query, where, onSnapshot, type Firestore } from 'firebase/firestore';
import { ChevronRight } from 'lucide-react';
import { formatElapsed, estimateCurrentCost } from '@/lib/active-session-detector';

interface ActiveSessionWidgetProps {
  userId: string;
  db: Firestore;
}

export default function ActiveSessionWidget({ userId, db }: ActiveSessionWidgetProps) {
  const [, setLocation] = useLocation();
  const [activeBooking, setActiveBooking] = useState<any>(null);
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!userId) return;

    const q = query(
      collection(db, 'bookings'),
      where('userId', '==', userId),
      where('status', '==', 'active')
    );
    const unsub = onSnapshot(q, snap => {
      const active = snap.docs[0]?.data() ?? null;
      setActiveBooking(active ? { id: snap.docs[0].id, ...active } : null);
    });
    return unsub;
  }, [userId, db]);

  useEffect(() => {
    if (!activeBooking) return;
    const interval = setInterval(() => setTick(t => t + 1), 30000);
    return () => clearInterval(interval);
  }, [activeBooking]);

  if (!activeBooking) return null;

  const startTime = activeBooking.startTime?.toDate 
    ? activeBooking.startTime.toDate() 
    : new Date(activeBooking.startTime || Date.now());
    
  const elapsed = formatElapsed(startTime);
  
  const currentCost = activeBooking.currentCost || estimateCurrentCost(
    startTime,
    activeBooking.pricePerKwh || 15, // Default price fallback
    activeBooking.connector?.powerKw || 50 // Default power fallback
  );

  const rawStationName = activeBooking.stationName || 'Charging Station';
  const stationName = rawStationName.length > 20 ? rawStationName.substring(0, 20) + '...' : rawStationName;

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="absolute top-16 md:top-6 left-0 right-0 z-40 px-4 pointer-events-none"
    >
      <div 
        className="max-w-md mx-auto pointer-events-auto cursor-pointer"
        onClick={() => setLocation(`/charge/${activeBooking.id}`)}
      >
        <div className="bg-[rgba(255,255,255,0.05)] backdrop-blur-[20px] border border-[rgba(255,255,255,0.1)] shadow-lg shadow-black/40 rounded-2xl p-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#22c55e] opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-[#22c55e]"></span>
            </div>
            <div>
              <p className="text-sm font-black text-[#ffffff]">{stationName}</p>
              <div className="flex items-center gap-2 text-xs font-bold text-[#22c55e]">
                <span>Active</span>
                <span className="text-[rgba(255,255,255,0.35)]">·</span>
                <span className="text-[rgba(255,255,255,0.60)]">{elapsed}</span>
                <span className="text-[rgba(255,255,255,0.35)]">·</span>
                <span className="text-[rgba(255,255,255,0.60)]">₹{currentCost.toFixed(1)}</span>
              </div>
            </div>
          </div>
          <div className="w-8 h-8 rounded-full bg-[rgba(34,197,94,0.15)] flex items-center justify-center text-[#22c55e]">
            <ChevronRight className="w-4 h-4" />
          </div>
        </div>
      </div>
    </motion.div>
  );
}
