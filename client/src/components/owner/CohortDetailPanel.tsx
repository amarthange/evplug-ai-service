import { CohortMetrics, anonymize, formatRs, formatDaysAgo } from "@/lib/cohort-engine";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Zap, TrendingUp, Calendar } from "lucide-react";

interface PanelProps {
  metrics: CohortMetrics;
}

export const CohortDetailPanel = ({ metrics }: PanelProps) => {
  const topDrivers = metrics.topDrivers;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-black uppercase tracking-tight text-slate-500">
          Top {metrics.cohortLabel} Drivers
        </h4>
        <Badge variant="outline" className="text-[10px] font-bold">
          By Lifetime Spend
        </Badge>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <Table>
          <TableHeader className="bg-slate-50 dark:bg-slate-900">
            <TableRow>
              <TableHead className="text-[10px] font-black uppercase h-8 px-4">Driver ID</TableHead>
              <TableHead className="text-[10px] font-black uppercase h-8 text-right">Sessions</TableHead>
              <TableHead className="text-[10px] font-black uppercase h-8 text-right">Total Spent</TableHead>
              <TableHead className="text-[10px] font-black uppercase h-8 text-right">Last Visit</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {topDrivers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="h-20 text-center text-xs text-muted-foreground font-medium">
                  No data available for this segment.
                </TableCell>
              </TableRow>
            ) : (
              topDrivers.map((driver) => (
                <TableRow key={driver.userId} className="group hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors">
                  <TableCell className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center text-[10px] font-black text-primary">
                        ID
                      </div>
                      <span className="text-xs font-black font-mono tracking-wider">
                        {anonymize(driver.userId)}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Zap className="w-3 h-3 text-slate-400" />
                      <span className="text-xs font-bold">{driver.totalSessions}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <span className="text-xs font-black text-emerald-600 dark:text-emerald-400">
                      {formatRs(driver.totalSpend)}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Calendar className="w-3 h-3 text-slate-400" />
                      <span className="text-[10px] font-bold text-slate-500">
                        {formatDaysAgo(driver.lastVisit)}
                      </span>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      
      <div className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200/50 dark:border-slate-800/50">
        <TrendingUp className="w-4 h-4 text-blue-500" />
        <p className="text-[10px] font-medium text-slate-600 dark:text-slate-400 leading-normal">
          This segment accounts for <span className="font-black text-slate-900 dark:text-white">{metrics.avgSessionsPerDriver} sessions</span> per driver on average.
        </p>
      </div>
    </div>
  );
};
