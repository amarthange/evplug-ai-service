import { motion } from "framer-motion";
import { AlertTriangle, TrendingDown, CheckCircle2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface InsightProps {
  lostToLoyalRatio: number;
  retentionRate: number;
  hasProblem: boolean;
  onLaunchCampaign?: () => void;
  onViewChurn?: () => void;
}

export const RetentionInsightCallout = ({ 
  lostToLoyalRatio, 
  retentionRate, 
  hasProblem,
  onLaunchCampaign,
  onViewChurn
}: InsightProps) => {
  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`relative overflow-hidden p-6 rounded-[24px] border shadow-sm ${
        hasProblem 
          ? 'bg-red-50/50 border-red-200 dark:bg-red-950/20 dark:border-red-900/30' 
          : 'bg-emerald-50/50 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-900/30'
      }`}
    >
      <div className="flex flex-col md:flex-row items-center gap-6">
        <div className={`w-16 h-16 rounded-2xl flex items-center justify-center shrink-0 ${
          hasProblem ? 'bg-red-100 text-red-600 dark:bg-red-900' : 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900'
        }`}>
          {hasProblem ? <AlertTriangle className="w-8 h-8" /> : <CheckCircle2 className="w-8 h-8" />}
        </div>

        <div className="flex-1 space-y-1 text-center md:text-left">
          <h3 className="text-lg font-black tracking-tight text-slate-900 dark:text-white">
            {hasProblem ? 'Retention Alert: Action Required' : 'Healthy Retention Profile'}
          </h3>
          <p className="text-sm font-medium text-slate-600 dark:text-slate-400 max-w-xl">
            {hasProblem 
              ? `Your "Lost" driver segment is ${lostToLoyalRatio}x larger than your "Loyal" segment. High churn detected.` 
              : `Your retention rate of ${retentionRate}% is strong. Your loyal driver base is growing steadily.`}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4 w-full md:w-auto">
          <div className="text-center p-3 rounded-xl bg-white/50 dark:bg-slate-900/50 border border-black/5">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Retention</p>
            <p className={`text-xl font-black ${hasProblem ? 'text-red-600' : 'text-emerald-600'}`}>
              {retentionRate}%
            </p>
          </div>
          <div className="text-center p-3 rounded-xl bg-white/50 dark:bg-slate-900/50 border border-black/5">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Churn Ratio</p>
            <p className="text-xl font-black text-slate-900 dark:text-white">
              {lostToLoyalRatio}
            </p>
          </div>
        </div>
      </div>

      {hasProblem && (
        <div className="mt-6 flex flex-wrap gap-3">
          <Button 
            variant="destructive" 
            size="sm" 
            className="rounded-full font-black text-xs px-5"
            onClick={onLaunchCampaign}
          >
            Launch Recovery Campaign
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            className="rounded-full font-black text-xs px-5"
            onClick={onViewChurn}
          >
            View Churn Analysis
          </Button>
        </div>
      )}
    </motion.div>
  );
};
