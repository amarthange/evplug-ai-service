import React from 'react';
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer
} from 'recharts';
import { type ConnectorBreakdown } from '@/lib/analytics-engine';

interface ConnectorDonutProps {
  data: ConnectorBreakdown[];
}

const CONNECTOR_COLORS: Record<string, string> = {
  'CCS2': '#10b981',
  'Type2': '#3b82f6',
  'CHAdeMO': '#f59e0b',
  'AC': '#8b5cf6',
  'Unknown': '#94a3b8',
};

const ConnectorDonut: React.FC<ConnectorDonutProps> = ({ data }) => {
  const totalSessions = data.reduce((sum, item) => sum + item.sessionCount, 0);

  if (data.length === 0) {
    return (
      <div className="h-[200px] flex flex-col items-center justify-center gap-2 text-muted-foreground">
        <span className="text-3xl">📊</span>
        <p className="text-sm">No charging data yet</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-full" style={{ height: 200 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="sessionCount"
              nameKey="connectorType"
              cx="50%"
              cy="50%"
              innerRadius={55}
              outerRadius={80}
              paddingAngle={3}
            >
              {data.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={CONNECTOR_COLORS[entry.connectorType] ?? '#64748b'}
                />
              ))}
            </Pie>
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const d = payload[0].payload as ConnectorBreakdown;
                  return (
                    <div className="bg-white dark:bg-slate-900 border border-border rounded-md shadow-sm p-3">
                      <p className="text-[13px] font-medium">{d.connectorType}: {d.sessionCount} sessions ({d.percentage}%)</p>
                      <p className="text-[11px] text-muted-foreground">{d.totalKwh.toFixed(1)} kWh total</p>
                    </div>
                  );
                }
                return null;
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
          <p className="text-xl font-medium leading-none">{totalSessions}</p>
          <p className="text-[12px] text-muted-foreground mt-1">sessions</p>
        </div>
      </div>

      <div className="flex flex-wrap justify-center gap-x-3 gap-y-2 mt-4 px-2">
        {data.map((item) => (
          <div key={item.connectorType} className="flex items-center gap-1.5">
            <div
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: CONNECTOR_COLORS[item.connectorType] ?? '#64748b' }}
            />
            <span className="text-[12px] whitespace-nowrap">
              {item.connectorType} {item.percentage}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default React.memo(ConnectorDonut);
