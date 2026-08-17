import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Trophy, Flame, AlertCircle, TrendingUp, Zap } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface StreakCardProps {
  currentStreak: number;
  longestStreak: number;
  daysUntilStreakExpires: number;
  hasChargedThisWeek: boolean;
}

export function StreakCard({ 
  currentStreak, 
  longestStreak, 
  daysUntilStreakExpires,
  hasChargedThisWeek 
}: StreakCardProps) {
  const isNudgeActive = daysUntilStreakExpires <= 2 && !hasChargedThisWeek;
  
  // Celebration milestones
  const milestones = [4, 8, 12, 24, 52];
  const nextMilestone = milestones.find(m => m > currentStreak) || 100;
  const progressToMilestone = (currentStreak / nextMilestone) * 100;

  // Milestone hits
  const isMilestone = milestones.includes(currentStreak);

  return (
    <Card className="premium-glass p-6 rounded-[32px] border-none shadow-xl relative overflow-hidden group">
      {/* Background Decor */}
      <div className="absolute top-0 right-0 -mr-8 -mt-8 w-32 h-32 bg-orange-500/10 blur-3xl rounded-full transition-transform group-hover:scale-150 duration-700" />
      
      {/* Milestone Celebration Animation */}
      <AnimatePresence>
        {isMilestone && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-0 flex items-center justify-center bg-orange-500/5 backdrop-blur-[2px]"
          >
            <motion.div
              animate={{ 
                rotate: [0, 360],
                scale: [1, 1.2, 1]
              }}
              transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
              className="w-48 h-48 border-2 border-dashed border-orange-500/20 rounded-full"
            />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="relative z-10 space-y-6">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Charging Streak</p>
            <div className="flex items-center gap-2">
              <motion.div 
                animate={currentStreak > 0 ? {
                  scale: [1, 1.2, 1],
                  filter: ["brightness(1)", "brightness(1.5)", "brightness(1)"]
                } : {}}
                transition={{ repeat: Infinity, duration: 3 }}
                className="text-4xl"
              >
                🔥
              </motion.div>
              <h3 className="text-3xl font-black tracking-tight text-white">
                {currentStreak} <span className="text-lg text-slate-400">weeks</span>
              </h3>
            </div>
          </div>
          
          <Badge variant="outline" className="bg-amber-500/10 border-amber-500/20 text-amber-500 font-black rounded-full px-3 py-1 flex items-center gap-1.5 shadow-lg shadow-amber-500/5">
            <Trophy className="w-3 h-3" />
            Best: {longestStreak}
          </Badge>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between items-end">
            <div className="flex items-center gap-1.5">
              <TrendingUp className="w-3 h-3 text-slate-500" />
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                Milestone: {nextMilestone} Weeks
              </p>
            </div>
            <p className="text-[10px] font-black text-amber-500">
              {Math.round(progressToMilestone)}%
            </p>
          </div>
          <div className="h-2 w-full bg-slate-800/50 rounded-full overflow-hidden">
             <motion.div 
               className="h-full bg-gradient-to-r from-orange-500 to-amber-500"
               initial={{ width: 0 }}
               animate={{ width: `${progressToMilestone}%` }}
               transition={{ duration: 1, ease: "easeOut" }}
             />
          </div>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-white/5">
          <div className="flex items-center gap-3">
            <div className={cn(
              "p-2 rounded-xl transition-colors",
              hasChargedThisWeek ? 'bg-emerald-500/20 ring-1 ring-emerald-500/30' : 'bg-slate-800/50'
            )}>
              <Zap className={cn("w-4 h-4", hasChargedThisWeek ? 'text-emerald-500 fill-emerald-500' : 'text-slate-500')} />
            </div>
            <div>
              <p className="text-[11px] font-black text-white leading-tight">
                {hasChargedThisWeek ? 'Status: Week Secured' : 'Status: Needs Charge'}
              </p>
              <p className="text-[9px] text-slate-500 font-bold uppercase">
                {daysUntilStreakExpires} days until reset
              </p>
            </div>
          </div>

          <AnimatePresence mode="wait">
            {!hasChargedThisWeek && (
              <motion.div
                key="nudge"
                initial={{ opacity: 0, x: 20 }}
                animate={{ 
                  opacity: 1, 
                  x: isNudgeActive ? [0, -2, 2, -2, 2, 0] : 0 
                }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ x: { repeat: Infinity, duration: 2 } }}
              >
                <Badge className={cn(
                  "rounded-lg font-black text-[9px] uppercase h-7 px-3",
                  isNudgeActive ? "bg-red-500 hover:bg-red-600 shadow-lg shadow-red-500/20" : "bg-primary/20 text-primary border-none"
                )}>
                  {isNudgeActive ? "Don't break streak!" : "Charge Soon"}
                </Badge>
              </motion.div>
            )}
            {hasChargedThisWeek && (
               <motion.div
                 key="secured"
                 initial={{ opacity: 0, scale: 0.8 }}
                 animate={{ opacity: 1, scale: 1 }}
                 className="flex items-center gap-1 text-emerald-500 text-[9px] font-black uppercase"
               >
                 <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 hover:bg-emerald-500/20 px-3 py-1">
                   Secured ✨
                 </Badge>
               </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </Card>
  );
}
