import React from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  ReferenceLine,
  Tooltip,
  YAxis,
  XAxis
} from 'recharts';
import { type DailyRevenue } from '@/lib/revenue-forecast-engine';

interface RevenueForecastSparklineProps {
  sparklineData: DailyRevenue[]
  monthlyTarget: number
  trailing7DayAvgRevenue: number
}

/**
 * Revenue Forecast Sparkline
 * 
 * Chart Architecture: 
 * Uses a ComposedChart with two Line components to represent actual (solid) 
 * and projected (dashed) revenue. The 'bridge point' logic ensures that today's 
 * actual value also serves as the starting point for the projection, connecting 
 * the two lines visually without a gap.
 */
const RevenueForecastSparkline = ({
  sparklineData,
  monthlyTarget,
  trailing7DayAvgRevenue
}: RevenueForecastSparklineProps) => {
  const daysInMonth = new Date(
    new Date().getFullYear(),
    new Date().getMonth() + 1,
    0
  ).getDate();

  const chartData = sparklineData.map(d => ({
    dateLabel: d.dateLabel,
    isToday: d.isToday,
    dateKey: d.dateKey,
    actualRevenue: d.isProjected ? null : d.revenue,
    projectedRevenue: d.isProjected ? d.revenue : null,
  }));

  // Bridge point: connect actual and projected lines at today
  const todayIdx = sparklineData.findIndex(d => d.isToday);
  if (todayIdx >= 0) {
    chartData[todayIdx].projectedRevenue = chartData[todayIdx].actualRevenue;
  }

  const todayDateKey = sparklineData.find(d => d.isToday)?.dateKey;
  const dailyTarget = monthlyTarget / daysInMonth;

  const hasData = chartData.some(d => (d.actualRevenue ?? 0) > 0);

  if (!hasData) {
    return (
      <div className="h-[80px] flex items-center justify-center rounded-lg border border-dashed border-border bg-muted/20">
        <p className="text-[10px] text-muted-foreground font-medium italic">
          No revenue data — chart appears after first completed session
        </p>
      </div>
    );
  }

  return (
    <div className="w-full">
      <ResponsiveContainer width="100%" height={80}>
        <ComposedChart
          margin={{ top: 4, right: 4, left: 4, bottom: 4 }}
          data={chartData}
        >
          <XAxis dataKey="dateKey" hide={true} />
          <YAxis hide={true} />
          
          <Tooltip
            content={({ active, payload }) => {
              if (active && payload && payload.length) {
                const data = payload[0].payload;
                const isProjected = data.actualRevenue === null;
                return (
                  <div className="bg-background/95 border border-border p-2 rounded-lg shadow-xl backdrop-blur-sm">
                    <p className="text-[10px] font-black uppercase tracking-tight text-muted-foreground">
                      {data.dateLabel}
                    </p>
                    <p className="text-sm font-black text-foreground">
                      ₹{Math.round(data.actualRevenue ?? data.projectedRevenue)}
                      <span className="text-[10px] ml-1 font-medium text-muted-foreground">
                        {isProjected ? '(projected)' : ''}
                      </span>
                    </p>
                  </div>
                );
              }
              return null;
            }}
          />

          {/* Today Marker */}
          {todayDateKey && (
            <ReferenceLine 
              x={todayDateKey} 
              stroke="var(--border)" 
              strokeWidth={1} 
              strokeDasharray="2 2" 
            />
          )}

          {/* Monthly Target (per day) */}
          <ReferenceLine 
            y={dailyTarget} 
            stroke="var(--muted-foreground)" 
            strokeDasharray="2 4" 
            strokeWidth={1} 
            opacity={0.3}
          />

          {/* Actual Line (Solid Emerald) */}
          <Line
            type="monotone"
            dataKey="actualRevenue"
            stroke="#10b981"
            strokeWidth={2}
            dot={false}
            connectNulls={false}
            isAnimationActive={false}
          />

          {/* Projected Line (Dashed Secondary) */}
          <Line
            type="monotone"
            dataKey="projectedRevenue"
            stroke="#94a3b8"
            strokeWidth={1.5}
            strokeDasharray="4 4"
            dot={false}
            connectNulls={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>

      <div className="flex justify-between mt-2">
        <div className="flex items-center gap-1.5">
          <div className="h-0.5 w-3 bg-emerald-500 rounded-full" />
          <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/70">Actual</span>
        </div>
        <div className="text-[10px] font-black text-muted-foreground/50 uppercase tracking-tighter">
          Avg ₹{Math.round(trailing7DayAvgRevenue)}/day
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-0.5 w-3 border-t border-dashed border-slate-400" />
          <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/70">Projected</span>
        </div>
      </div>
    </div>
  );
};

export default React.memo(RevenueForecastSparkline);
