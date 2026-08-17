import React from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine
} from 'recharts';
import { type MonthlyStats } from '@/lib/analytics-engine';

interface CostTrendLineProps {
  data: MonthlyStats[];
}

const CostTrendLine: React.FC<CostTrendLineProps> = ({ data }) => {
  const chartData = data.map(m => ({
    ...m,
    avgCostPerSession: m.sessionCount === 0 ? null : m.avgCostPerSession
  }));

  const validMonths = chartData.filter(m => m.avgCostPerSession !== null);
  const overallAvg = validMonths.length > 0
    ? validMonths.reduce((sum, m) => sum + (m.avgCostPerSession || 0), 0) / validMonths.length
    : 0;

  if (validMonths.length === 0) {
    return (
      <div className="h-[180px] flex flex-col items-center justify-center gap-2 text-muted-foreground">
        <span className="text-3xl">📊</span>
        <p className="text-sm">No charging data yet</p>
      </div>
    );
  }

  return (
    <div style={{ height: 180 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <XAxis
            dataKey="monthLabel"
            tick={{ fontSize: 11, fill: 'var(--color-text-secondary)' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tickFormatter={(v) => `₹${v}`}
            tick={{ fontSize: 11, fill: 'var(--color-text-secondary)' }}
            axisLine={false}
            tickLine={false}
            width={48}
            domain={['auto', 'auto']}
          />
          <Tooltip
            content={({ active, payload }) => {
              if (active && payload && payload.length) {
                const d = payload[0].payload as MonthlyStats;
                if (d.sessionCount === 0) {
                  return (
                    <div className="bg-white dark:bg-slate-900 border border-border rounded-md shadow-sm p-3">
                      <p className="text-[13px] font-medium">{d.monthLabel}</p>
                      <p className="text-[11px] text-muted-foreground">No sessions this month</p>
                    </div>
                  );
                }
                return (
                  <div className="bg-white dark:bg-slate-900 border border-border rounded-md shadow-sm p-3">
                    <p className="text-[13px] font-medium mb-1">{d.monthLabel}</p>
                    <p className="text-emerald-600 dark:text-emerald-400 font-bold">
                      Avg ₹{d.avgCostPerSession.toFixed(0)} / session
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {d.sessionCount} sessions
                    </p>
                  </div>
                );
              }
              return null;
            }}
          />
          {validMonths.length >= 2 && (
            <ReferenceLine
              y={overallAvg}
              stroke="#94a3b8"
              strokeDasharray="4 4"
              strokeWidth={1}
              label={{ value: 'avg', position: 'right', fontSize: 11, fill: '#94a3b8' }}
            />
          )}
          <Line
            dataKey="avgCostPerSession"
            type="monotone"
            stroke="#10b981"
            strokeWidth={2}
            dot={{ fill: '#10b981', r: 4, strokeWidth: 0 }}
            activeDot={{ r: 6, strokeWidth: 0 }}
            connectNulls={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default React.memo(CostTrendLine);
