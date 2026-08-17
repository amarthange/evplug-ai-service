import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BarChart3, X, Zap, Leaf, ArrowRight } from 'lucide-react';
import { type WeeklyReport, getLastMondayDate } from '@/lib/weekly-report-engine';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useLocation } from 'wouter';

interface WeeklyReportCardProps {
  report: WeeklyReport;
  onDismiss: () => void;
}

const STORAGE_KEY = 'evplugfinder_weekly_report_dismissed';

export default function WeeklyReportCard({
  report,
  onDismiss
}: WeeklyReportCardProps) {
  const [, setLocation] = useLocation();
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const weekStart = getLastMondayDate().toISOString();
    const dismissedWeek = sessionStorage.getItem(STORAGE_KEY) || sessionStorage.getItem('volthub_weekly_report_dismissed');
    
    if (dismissedWeek !== weekStart) {
      setIsVisible(true);
    }
  }, []);

  const handleDismiss = () => {
    const weekStart = getLastMondayDate().toISOString();
    sessionStorage.setItem(STORAGE_KEY, weekStart);
    setIsVisible(false);
    setTimeout(onDismiss, 300); // Wait for exit animation
  };

  if (!isVisible || !report.hasData) return null;

  const maxKwh = Math.max(...report.dailyBuckets.map(d => d.totalKwh), 1);
  const todayIndex = (new Date().getDay() + 6) % 7; // Mon=0, Tue=1... Sun=6

  return (
    <motion.div
      initial={{ opacity: 0, y: -20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -20, scale: 0.95 }}
      className="w-full bg-[#1e293b]/40 backdrop-blur-xl border border-white/10 rounded-[24px] overflow-hidden shadow-2xl relative"
    >
      {/* Background Gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 via-transparent to-blue-500/10 pointer-events-none" />

      {/* Header */}
      <div className="p-4 flex items-center justify-between border-b border-white/5 relative z-10">
        <div className="flex items-center gap-2">
          <div className="bg-emerald-500/20 p-1.5 rounded-lg">
            <BarChart3 className="w-4 h-4 text-emerald-400" />
          </div>
          <div>
            <h3 className="text-sm font-black text-white leading-none">Your week in charging</h3>
            <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest mt-1">
              {report.weekLabel}
            </p>
          </div>
        </div>
        <button
          onClick={handleDismiss}
          className="p-1.5 hover:bg-white/5 rounded-full transition-colors text-white/40 hover:text-white"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Content */}
      <div className="p-5 space-y-6 relative z-10">
        {/* Stat Chips */}
        <div className="flex gap-2">
          <div className="flex-1 bg-white/5 border border-white/5 rounded-xl p-2.5 text-center">
            <p className="text-lg font-black text-white leading-none">{report.totalSessions}</p>
            <p className="text-[10px] font-bold text-white/40 uppercase mt-1">Sessions</p>
          </div>
          <div className="flex-1 bg-white/5 border border-white/5 rounded-xl p-2.5 text-center">
            <p className="text-lg font-black text-white leading-none">{report.totalKwh.toFixed(1)}</p>
            <p className="text-[10px] font-bold text-white/40 uppercase mt-1">kWh</p>
          </div>
          <div className="flex-1 bg-white/5 border border-white/5 rounded-xl p-2.5 text-center">
            <p className="text-lg font-black text-white leading-none">₹{report.totalCost}</p>
            <p className="text-[10px] font-bold text-white/40 uppercase mt-1">Spent</p>
          </div>
        </div>

        {/* Bar Chart */}
        <div className="h-28 flex items-end justify-between px-2 pt-2">
          {report.dailyBuckets.map((bucket, idx) => {
            const barHeight = Math.max((bucket.totalKwh / maxKwh) * 80, 4);
            const isToday = idx === todayIndex;
            
            return (
              <div key={bucket.dayLabel} className="flex flex-col items-center gap-2 group">
                <motion.div
                  initial={{ height: 0 }}
                  animate={{ height: barHeight }}
                  transition={{ delay: idx * 0.05, type: 'spring', damping: 15 }}
                  className={cn(
                    "w-6 rounded-t-lg transition-all relative overflow-hidden",
                    isToday 
                      ? "bg-emerald-400 shadow-[0_0_15px_rgba(52,211,153,0.3)]" 
                      : "bg-white/10 group-hover:bg-white/20"
                  )}
                >
                  {/* Subtle shine effect */}
                  <div className="absolute inset-0 bg-gradient-to-t from-white/10 to-transparent" />
                </motion.div>
                <span className={cn(
                  "text-[9px] font-black uppercase tracking-tighter",
                  isToday ? "text-emerald-400" : "text-white/20 group-hover:text-white/40"
                )}>
                  {bucket.dayLabel}
                </span>
              </div>
            );
          })}
        </div>

        {/* Insights */}
        <div className="space-y-2 pt-2">
          <div className="flex items-center gap-2 text-xs font-bold text-white/60">
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            <span>Most active on <span className="text-white">{report.peakDay}</span> this week</span>
          </div>
          <div className="flex items-center gap-2 text-xs font-bold text-emerald-400/80">
            <Leaf className="w-3.5 h-3.5" />
            <span>{report.totalCo2Kg.toFixed(1)} kg CO₂ saved this week 🌱</span>
          </div>
        </div>

        {/* CTA */}
        <button 
          onClick={() => setLocation('/impact')}
          className="w-full py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 transition-all flex items-center justify-center gap-2 text-xs font-black uppercase tracking-widest text-white/60 hover:text-white"
        >
          View full impact <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </motion.div>
  );
}
