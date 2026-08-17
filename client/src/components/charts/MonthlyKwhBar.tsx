import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell
} from 'recharts';
import { type MonthlyStats } from '@/lib/analytics-engine';

interface MonthlyKwhBarProps {
  data: MonthlyStats[];
  bestMonthKey: string | null;
}

const MonthlyKwhBar: React.FC<MonthlyKwhBarProps> = ({ data, bestMonthKey }) => {
  const isEmpty = data.every(m => m.totalKwh === 0);

  if (isEmpty) {
    return (
      <div className="h-[220px] flex flex-col items-center justify-center gap-2 text-muted-foreground">
        <span className="text-3xl">📊</span>
        <p className="text-sm">No charging data yet</p>
      </div>
    );
  }

  return (
    <div style={{ height: 220 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <XAxis
            dataKey="monthLabel"
            tick={{ fontSize: 11, fill: 'var(--color-text-secondary)' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tickFormatter={(v) => `${v}kWh`}
            tick={{ fontSize: 11, fill: 'var(--color-text-secondary)' }}
            axisLine={false}
            tickLine={false}
            width={52}
          />
          <Tooltip
            cursor={{ fill: 'transparent' }}
            content={({ active, payload }) => {
              if (active && payload && payload.length) {
                const d = payload[0].payload as MonthlyStats;
                return (
                  <div className="bg-white dark:bg-slate-900 border border-border rounded-md shadow-sm p-3">
                    <p className="text-[13px] font-medium mb-1">{d.monthLabel}</p>
                    <p className="text-emerald-600 dark:text-emerald-400 font-bold">
                      {d.totalKwh.toFixed(1)} kWh
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {d.sessionCount} sessions
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      ₹{d.totalCost.toFixed(0)} spent
                    </p>
                  </div>
                );
              }
              return null;
            }}
          />
          <Bar dataKey="totalKwh" radius={[4, 4, 0, 0]}>
            {data.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={entry.monthKey === bestMonthKey ? '#10b981' : 'var(--color-border-secondary, #e2e8f0)'}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

export default React.memo(MonthlyKwhBar);
