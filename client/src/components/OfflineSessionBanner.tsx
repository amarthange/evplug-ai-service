import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';

interface OfflineSessionBannerProps {
  lastSyncTime: Date | null;
  sessionCount: number;
  isOnline: boolean;
}

export default function OfflineSessionBanner({ 
  lastSyncTime, 
  sessionCount, 
  isOnline 
}: OfflineSessionBannerProps) {
  const [now, setNow] = useState(new Date());

  // Update "time ago" every minute
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  return (
    <motion.div 
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      className="mb-6 overflow-hidden"
    >
      <div className="premium-glass bg-amber-500/10 border-amber-500/20 p-4 rounded-3xl flex items-center gap-4 shadow-lg shadow-amber-500/5">
        <div className="w-12 h-12 rounded-2xl bg-amber-500/20 flex items-center justify-center shrink-0">
          {!isOnline ? (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M16.72 11.06L15.31 12.47C14.49 13.29 13.84 14.28 13.43 15.35L13.14 16.14C13.01 16.48 12.69 16.71 12.33 16.71H11.67C11.31 16.71 10.99 16.48 10.86 16.14L10.57 15.35C10.16 14.28 9.51 13.29 8.69 12.47L7.28 11.06C6.11 9.89 5.42 8.3 5.42 6.58C5.42 3.01 8.36 0.120003 12 0.120003C15.64 0.120003 18.58 3.01 18.58 6.58C18.58 8.3 17.89 9.89 16.72 11.06ZM12 4.12001C10.62 4.12001 9.5 5.24001 9.5 6.62001C9.5 8.00001 10.62 9.12001 12 9.12001C13.38 9.12001 14.5 8.00001 14.5 6.62001C14.5 5.24001 13.38 4.12001 12 4.12001Z" fill="#f59e0b" className="opacity-40" />
              <path d="M1 1L23 23M23 1L1 23" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
          ) : (
            <div className="w-5 h-5 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
          )}
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <h4 className="text-sm font-black text-amber-900 uppercase tracking-tight">
              {!isOnline ? 'Offline Mode' : 'Restoring Connection'}
            </h4>
            <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-[9px] font-black text-amber-600 uppercase">
              {sessionCount} Sessions
            </span>
          </div>
          
          <p className="text-xs font-bold text-amber-700/70 leading-tight">
            {lastSyncTime ? (
              <>Showing cached data • Updated {formatDistanceToNow(lastSyncTime)} ago</>
            ) : (
              <>No cached data available</>
            )}
            {isOnline && ' • Syncing new activity...'}
          </p>
        </div>
      </div>
    </motion.div>
  );
}
