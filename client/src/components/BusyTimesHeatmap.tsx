import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { 
  computeHeatmapData, 
  type HeatmapData, 
  type HeatmapCell, 
  type BookingSlot,
  DISPLAY_HOURS,
  DAY_LABELS,
  DAY_LABELS_FULL,
  HOUR_LABELS,
  INTENSITY_COLORS
} from '@/lib/heatmap-engine';

interface BusyTimesHeatmapProps {
  stationId: string;
  totalConnectors: number;
}

// HEATMAP — Grid Row Memoization for performance
const HeatmapGrid = React.memo(({ 
  cells, 
  currentTime, 
  onCellHover 
}: { 
  cells: HeatmapCell[], 
  currentTime: { dayIndex: number, hourIndex: number },
  onCellHover: (e: any, cell: HeatmapCell) => void 
}) => {
  return (
    <>
      <div className="h-6" /> {/* Corner spacer */}
      {DISPLAY_HOURS.map((h) => (
        <div key={`h-${h}`} className="text-[10px] text-muted-foreground text-center">
          {h % 2 === 0 ? HOUR_LABELS[h] : ''}
        </div>
      ))}

      {[0, 1, 2, 3, 4, 5, 6].map(dIndex => (
        <React.Fragment key={`day-${dIndex}`}>
          <div className="text-[11px] text-muted-foreground flex items-center justify-end pr-2 h-7 font-medium">
            {DAY_LABELS[dIndex]}
          </div>
          {cells.filter(c => c.dayIndex === dIndex).map(cell => {
            const isCurrent = cell.dayIndex === currentTime.dayIndex && cell.hourIndex === currentTime.hourIndex;
            return (
              <div
                key={`${cell.dayIndex}-${cell.hourIndex}`}
                role="gridcell"
                tabIndex={0}
                aria-label={`${cell.dayLabel} ${cell.hourLabel}: ${cell.occupancyPct}% busy`}
                onMouseEnter={(e) => onCellHover(e, cell)}
                onTouchStart={(e) => onCellHover(e.touches[0], cell)}
                style={{
                  height: '28px',
                  borderRadius: '3px',
                  backgroundColor: INTENSITY_COLORS[cell.intensityLevel as keyof typeof INTENSITY_COLORS].bg,
                  border: isCurrent ? '2px solid var(--color-text-primary, #000)' : '2px solid transparent',
                  cursor: cell.rawCount > 0 ? 'pointer' : 'default',
                  transition: 'transform 0.1s ease-in-out',
                }}
                className="hover:scale-110 active:scale-95"
              />
            );
          })}
        </React.Fragment>
      ))}
    </>
  );
});

export default function BusyTimesHeatmap({ stationId, totalConnectors }: BusyTimesHeatmapProps) {
  const queryClient = useQueryClient();
  const heatmapRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<{ cell: HeatmapCell, x: number, y: number, clampedX: number } | null>(null);
  
  const [currentTime, setCurrentTime] = useState(() => ({
    dayIndex: new Date().getDay(),
    hourIndex: new Date().getHours()
  }));

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime({ dayIndex: new Date().getDay(), hourIndex: new Date().getHours() });
    }, 60_000);
    return () => clearInterval(timer);
  }, []);

  const { data: rawBookings, isLoading, isError } = useQuery({
    queryKey: ['heatmap', stationId],
    queryFn: async (): Promise<BookingSlot[]> => {
      const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
      const q = query(
        collection(db, 'bookings'),
        where('stationId', '==', stationId),
        orderBy('startTime', 'desc'),
        limit(1000)
      );
      
      const snap = await getDocs(q);
      const isFromCache = snap.metadata.fromCache;
      if (isFromCache) console.info('[SeniorDevOps Heatmap] Serving from cache:', stationId);

      return snap.docs
        .map(doc => {
          const d = doc.data();
          return {
            startTime: d.startTime?.toDate() as Date,
            endTime: d.endTime?.toDate() as Date ?? null,
            status: d.status as string
          };
        })
        .filter(b => b.status === 'completed' && b.endTime !== null && b.startTime >= ninetyDaysAgo);
    },
    staleTime: 60 * 60 * 1000,
  });

  const heatmapData = useMemo(() => 
    rawBookings ? computeHeatmapData(rawBookings, totalConnectors) : null,
    [rawBookings, totalConnectors]
  );

  const handleCellHover = (e: any, cell: HeatmapCell) => {
    if (!heatmapRef.current) return;
    const rect = heatmapRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const tooltipWidth = 170;
    const clampedX = Math.max(tooltipWidth / 2, Math.min(x, heatmapRef.current.offsetWidth - tooltipWidth / 2));
    
    setTooltip({ cell, x, y, clampedX });
  };

  if (isLoading) return (
    <div className="space-y-2">
      <Skeleton className="h-4 w-1/3 mb-4" />
      {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-7 w-full" />)}
    </div>
  );

  if (isError) return (
    <div className="p-4 border border-destructive/20 bg-destructive/5 rounded-lg flex items-center justify-between">
      <p className="text-xs font-medium">Couldn't load busy times</p>
      <button onClick={() => queryClient.invalidateQueries({ queryKey: ['heatmap', stationId] })} className="text-[10px] underline">Retry</button>
    </div>
  );

  if (!heatmapData || heatmapData.totalSessions === 0) return (
    <div className="flex flex-col items-center py-6 text-muted-foreground">
      <span className="text-2xl mb-1">📊</span>
      <p className="text-xs font-medium">No booking history yet</p>
    </div>
  );

  return (
    <div className="relative group" ref={heatmapRef} onMouseLeave={() => setTooltip(null)}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold">Busy times</h3>
          <p className="text-[10px] text-muted-foreground">Based on last {heatmapData.weeksOfData} weeks</p>
        </div>
        <div className={cn(
          "text-[10px] px-2 py-0.5 rounded-full border font-medium",
          heatmapData.dataQuality === 'good' ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-50 text-slate-600"
        )}>
          {heatmapData.dataQuality === 'good' ? 'High Confidence' : 'Limited Data'}
        </div>
      </div>

      {heatmapData.peakCell && (
        <div className="bg-muted/40 p-2 rounded-lg border mb-4 flex items-center gap-2">
          <span className="text-sm">🔥</span>
          <p className="text-[11px] text-muted-foreground">
            <span className="font-semibold text-foreground">{heatmapData.peakDay}s at {heatmapData.peakHour}</span>
            {' '}are typically busiest ({heatmapData.peakCell.occupancyPct}% occupied).
          </p>
        </div>
      )}

      <div className="heatmap-scroll overflow-x-auto pb-2" role="grid">
        <div 
          className="grid gap-[2px] min-w-[530px]"
          style={{ gridTemplateColumns: '40px repeat(18, 1fr)' }}
        >
          <HeatmapGrid 
            cells={heatmapData.cells} 
            currentTime={currentTime} 
            onCellHover={handleCellHover}
          />
        </div>
      </div>

      <div className="flex items-center gap-2 mt-3" aria-label="Heatmap color legend">
        <span className="text-[10px] text-muted-foreground">Quiet</span>
        {[1, 2, 3, 4].map(l => (
          <div key={l} className="w-3.5 h-3.5 rounded-[2px]" style={{ backgroundColor: INTENSITY_COLORS[l as keyof typeof INTENSITY_COLORS].bg }} />
        ))}
        <span className="text-[10px] text-muted-foreground">Peak</span>
      </div>

      {tooltip && (
        <div 
          className="absolute z-50 pointer-events-none bg-popover border shadow-xl rounded-md p-2.5 min-w-[160px] animate-in fade-in zoom-in-95 duration-100"
          style={{ left: tooltip.clampedX, top: tooltip.y - 10, transform: 'translate(-50%, -100%)' }}
        >
          <p className="text-[12px] font-bold">{DAY_LABELS_FULL[tooltip.cell.dayIndex]} {tooltip.cell.hourLabel}</p>
          <p className="text-[11px] text-muted-foreground">Typically {tooltip.cell.occupancyPct}% occupied</p>
          <div 
            className="mt-1.5 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase inline-block"
            style={{ backgroundColor: INTENSITY_COLORS[tooltip.cell.intensityLevel as keyof typeof INTENSITY_COLORS].bg, color: tooltip.cell.intensityLevel >= 3 ? '#fff' : 'inherit' }}
          >
            {INTENSITY_COLORS[tooltip.cell.intensityLevel as keyof typeof INTENSITY_COLORS].label}
          </div>
          <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-popover border-b border-r rotate-45" />
        </div>
      )}
    </div>
  );
}

// ACCEPTANCE TESTS:
// 1. Zero data: Shows "No booking history yet" illustration.
// 2. High traffic: Peak cell (Sat/Sun) should be Emerald-900 in Light Mode.
// 3. Dark Mode: Busiest cells must be Emerald-200 (light green) for contrast.
// 4. Highlight: current time (e.g. Wed 6pm) has a thick border.
// 5. Tooltip Clamping: Hovering on leftmost column (6am) doesn't cut off tooltip.
