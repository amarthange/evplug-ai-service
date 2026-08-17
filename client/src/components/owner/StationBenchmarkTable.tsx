import React, { useMemo, useState } from 'react';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  BarChart3, 
  ArrowUpDown, 
  Download, 
  Trophy, 
  AlertTriangle,
  Star,
  Zap,
  TrendingUp,
  Activity
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  StationBenchmark, 
  computeStationBenchmarks,
  Booking,
  Review,
  StationAlert 
} from '@/lib/benchmark-engine';
import { formatRsCompact } from '@/lib/revenue-forecast-engine';
import { Station } from '@/lib/owner-service';
import { cn } from '@/lib/utils';

interface StationBenchmarkTableProps {
  stations: Station[];
  bookings: Booking[];
  reviews: Review[];
  alerts: StationAlert[];
}

type SortField = 'revenue' | 'utilization' | 'faultCount' | 'avgRating' | 'totalBookings';
type SortOrder = 'asc' | 'desc';

export function StationBenchmarkTable({ stations, bookings, reviews, alerts }: StationBenchmarkTableProps) {
  const [sortField, setSortField] = useState<SortField>('revenue');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  const benchmarks = useMemo(() => {
    const data = computeStationBenchmarks(stations, bookings, reviews, alerts);
    return data.sort((a, b) => {
      const aValue = a[sortField];
      const bValue = b[sortField];
      return sortOrder === 'desc' ? (bValue as number) - (aValue as number) : (aValue as number) - (bValue as number);
    });
  }, [stations, bookings, reviews, alerts, sortField, sortOrder]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  const handleExportCSV = () => {
    const headers = ['Station Name', 'Revenue (30D)', 'Revenue Rank', 'Utilization (%)', 'Faults', 'Avg Rating', 'Bookings'];
    const rows = benchmarks.map(b => [
      b.name,
      b.revenue,
      b.revenueRank,
      b.utilization.toFixed(1),
      b.faultCount,
      b.avgRating.toFixed(1),
      b.totalBookings
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(r => r.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `station-benchmarking-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <Card className="glass-card border-none overflow-hidden mt-6">
      <CardHeader className="px-6 py-5 border-b border-white/10 flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-lg font-black uppercase tracking-tight flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-primary" /> Station Benchmarking
          </CardTitle>
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-tight">Relative performance across your portfolio (Last 30 Days)</p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            className="rounded-xl font-black uppercase h-9 text-[10px] tracking-widest border-white/10 hover:bg-white/5"
            onClick={handleExportCSV}
          >
            <Download className="w-3.5 h-3.5 mr-2" /> Export CSV
          </Button>
        </div>
      </CardHeader>
      
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-white/5 border-b border-white/10 hover:bg-white/5">
              <TableHead className="px-6 py-4 text-[10px] font-black text-muted-foreground uppercase tracking-widest">Station Profile</TableHead>
              <TableHead 
                className="px-6 py-4 text-[10px] font-black text-muted-foreground uppercase tracking-widest cursor-pointer hover:text-primary transition-colors"
                onClick={() => handleSort('revenue')}
              >
                <div className="flex items-center gap-1">
                  Revenue Rank <ArrowUpDown className="w-3 h-3" />
                </div>
              </TableHead>
              <TableHead 
                className="px-6 py-4 text-[10px] font-black text-muted-foreground uppercase tracking-widest cursor-pointer hover:text-primary transition-colors"
                onClick={() => handleSort('utilization')}
              >
                <div className="flex items-center gap-1">
                  Utilization <ArrowUpDown className="w-3 h-3" />
                </div>
              </TableHead>
              <TableHead 
                className="px-6 py-4 text-[10px] font-black text-muted-foreground uppercase tracking-widest cursor-pointer hover:text-primary transition-colors"
                onClick={() => handleSort('faultCount')}
              >
                <div className="flex items-center gap-1">
                  Health <ArrowUpDown className="w-3 h-3" />
                </div>
              </TableHead>
              <TableHead 
                className="px-6 py-4 text-[10px] font-black text-muted-foreground uppercase tracking-widest cursor-pointer hover:text-primary transition-colors"
                onClick={() => handleSort('avgRating')}
              >
                <div className="flex items-center gap-1">
                  Satisfaction <ArrowUpDown className="w-3 h-3" />
                </div>
              </TableHead>
              <TableHead className="px-6 py-4 text-[10px] font-black text-muted-foreground uppercase tracking-widest">Efficiency</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="divide-y divide-white/5">
            <AnimatePresence mode="popLayout">
              {benchmarks.map((b) => (
                <motion.tr 
                  layout
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  key={b.stationId} 
                  className={cn(
                    "hover:bg-white/5 transition-colors group interactive-card",
                    b.isTopPerformer && "bg-emerald-500/5 hover:bg-emerald-500/10",
                    b.isUnderperforming && "bg-rose-500/5 hover:bg-rose-500/10"
                  )}
                >
                  <TableCell className="px-6 py-5">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "p-2 rounded-xl border",
                        b.isTopPerformer ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-500" :
                        b.isUnderperforming ? "bg-rose-500/10 border-rose-500/20 text-rose-500" :
                        "bg-white/5 border-white/10 text-muted-foreground"
                      )}>
                        {b.isTopPerformer ? <Trophy className="w-4 h-4" /> : 
                         b.isUnderperforming ? <AlertTriangle className="w-4 h-4" /> : 
                         <Activity className="w-4 h-4" />}
                      </div>
                      <div>
                        <p className="font-black text-sm text-foreground/80 tracking-tight">{b.name}</p>
                        <div className="flex items-center gap-2 mt-1">
                          {b.isTopPerformer && <Badge className="bg-emerald-500/20 text-emerald-500 border-none text-[8px] font-black px-1.5 py-0">TOP PERFORMER</Badge>}
                          {b.isUnderperforming && <Badge className="bg-rose-500/20 text-rose-500 border-none text-[8px] font-black px-1.5 py-0">ACTION NEEDED</Badge>}
                          {!b.isTopPerformer && !b.isUnderperforming && <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest opacity-60">Stable</span>}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="px-6 py-5">
                    <div className="space-y-1">
                      <div className="flex items-end gap-1.5">
                        <span className="text-sm font-black text-primary tracking-tighter">{formatRsCompact(b.revenue)}</span>
                        <span className="text-[10px] font-bold text-muted-foreground/60 mb-0.5">#{b.revenueRank}</span>
                      </div>
                      <div className="w-24 h-1 bg-white/5 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-primary" 
                          style={{ width: `${Math.max(10, 100 - (b.revenueRank - 1) * 20)}%` }} 
                        />
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="px-6 py-5">
                    <div className="flex items-center gap-2">
                      <div className="relative w-10 h-10 flex items-center justify-center">
                         <svg className="w-full h-full -rotate-90">
                           <circle 
                             cx="20" cy="20" r="16" 
                             fill="transparent" 
                             stroke="currentColor" 
                             strokeWidth="3" 
                             className="text-white/5" 
                           />
                           <circle 
                             cx="20" cy="20" r="16" 
                             fill="transparent" 
                             stroke="currentColor" 
                             strokeWidth="3" 
                             strokeDasharray={100.5}
                             strokeDashoffset={100.5 - (b.utilization)}
                             className={cn(
                               "transition-all duration-1000",
                               b.utilization > 60 ? "text-emerald-500" : b.utilization > 30 ? "text-amber-500" : "text-rose-500"
                             )}
                           />
                         </svg>
                         <span className="absolute text-[9px] font-black">{Math.round(b.utilization)}%</span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="px-6 py-5">
                    <div className="flex flex-col gap-1">
                       <div className="flex items-center gap-1.5">
                          <Badge variant="outline" className={cn(
                            "font-mono text-[10px] font-black border-none px-2",
                            b.faultCount > 0 ? "bg-rose-500/10 text-rose-500" : "bg-emerald-500/10 text-emerald-500"
                          )}>
                            {b.faultCount} FAULTS
                          </Badge>
                       </div>
                       <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">
                         {b.faultCount === 0 ? 'Optimal uptime' : 'Maintenance due'}
                       </p>
                    </div>
                  </TableCell>
                  <TableCell className="px-6 py-5">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-0.5">
                        {[...Array(5)].map((_, i) => (
                          <Star 
                            key={i} 
                            className={cn(
                              "w-3 h-3", 
                              i < Math.round(b.avgRating) ? "fill-amber-500 text-amber-500" : "text-white/10"
                            )} 
                          />
                        ))}
                      </div>
                      <p className="text-[10px] font-black text-muted-foreground/60 uppercase tracking-tighter">
                        {b.reviewCount} reviews
                      </p>
                    </div>
                  </TableCell>
                  <TableCell className="px-6 py-5 text-right">
                    <div className="space-y-1">
                      <p className="text-xs font-black text-foreground/80">{b.totalBookings} BOOKINGS</p>
                      <p className="text-[10px] font-bold text-muted-foreground/50 uppercase tracking-widest">Efficiency: {((b.revenue / Math.max(1, b.totalBookings)) / 10).toFixed(1)}x</p>
                    </div>
                  </TableCell>
                </motion.tr>
              ))}
            </AnimatePresence>
          </TableBody>
        </Table>
      </div>
      
      <CardContent className="px-6 py-4 bg-black/10 border-t border-white/5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-emerald-500" />
              <span className="text-[9px] font-black uppercase text-muted-foreground/70">Top Performing</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-rose-500" />
              <span className="text-[9px] font-black uppercase text-muted-foreground/70">Requires Attention</span>
            </div>
          </div>
          <p className="text-[9px] font-black text-muted-foreground italic uppercase tracking-widest">
            * UTILIZATION = TOTAL CHARGE TIME / TOTAL CAPACITY (30D)
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
