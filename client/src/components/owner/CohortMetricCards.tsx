import { motion } from "framer-motion";
import { 
  Users, 
  Heart, 
  AlertCircle, 
  LogOut, 
  Zap, 
  PlusCircle,
  LucideIcon 
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { CohortMetrics, COHORT_CONFIG, CohortType } from "@/lib/cohort-engine";

interface MetricProps {
  metrics: CohortMetrics;
  type: CohortType;
  delay?: number;
}

const ICONS: Record<CohortType, LucideIcon> = {
  loyal: Heart,
  at_risk: AlertCircle,
  lost: LogOut,
  new: PlusCircle
};

const MetricCard = ({ metrics, type, delay = 0 }: MetricProps) => {
  const Icon = ICONS[type];
  const config = COHORT_CONFIG[type];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
    >
      <Card className={`rounded-[24px] border-none shadow-sm ${config.colorClass}`}>
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${config.badgeClass}`}>
              <Icon className="w-5 h-5" />
            </div>
            <div className="text-right">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-0.5">Drivers</p>
              <h4 className="text-2xl font-black">{metrics.count}</h4>
            </div>
          </div>
          
          <div className="space-y-1">
            <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
              {config.label}
            </p>
            <p className="text-[11px] text-slate-500 font-medium leading-tight">
              {config.description}
            </p>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-200/50 dark:border-slate-800/50 flex justify-between items-center">
            <div>
              <p className="text-[9px] font-black uppercase tracking-tight text-slate-400">Avg Sessions</p>
              <p className="text-xs font-black">{metrics.avgSessionsPerDriver}</p>
            </div>
            <div className="text-right">
              <p className="text-[9px] font-black uppercase tracking-tight text-slate-400">Lifetime Val</p>
              <p className="text-xs font-black">₹{Math.round(metrics.avgSpendPerDriver)}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
};

export const CohortMetricCards = ({ cohorts }: { cohorts: Record<CohortType, CohortMetrics> }) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <MetricCard metrics={cohorts.loyal} type="loyal" delay={0.1} />
      <MetricCard metrics={cohorts.at_risk} type="at_risk" delay={0.2} />
      <MetricCard metrics={cohorts.lost} type="lost" delay={0.3} />
      <MetricCard metrics={cohorts.new} type="new" delay={0.4} />
    </div>
  );
};
