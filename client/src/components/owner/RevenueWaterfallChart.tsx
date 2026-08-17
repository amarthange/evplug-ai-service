/**
 * WATERFALL — RevenueWaterfallChart.tsx
 * Recharts implementation using the stacked bar trick for waterfall visualization.
 */
import { useMemo } from 'react';
import { 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid,
  Tooltip, 
  ReferenceLine, 
  Cell, 
  LabelList 
} from 'recharts';
import { 
  type WaterfallBar, 
  formatYAxisTick, 
  formatRsCompact, 
  formatRsFull 
} from '@/lib/waterfall-engine';
import { Skeleton } from '@/components/ui/skeleton';

interface RevenueWaterfallChartProps {
  bars: WaterfallBar[];
  netPayout: number;
  grossRevenue: number;
  height?: number;
  isLoading?: boolean;
}

export default function RevenueWaterfallChart({
  bars,
  netPayout,
  grossRevenue,
  height = 280,
  isLoading = false
}: RevenueWaterfallChartProps) {
  const chartData = useMemo(() => 
    bars.map(bar => ({
      name: bar.label,
      base: bar.base,
      value: bar.value,
      total: bar.total,
      color: bar.color,
      isDeduction: bar.isDeduction,
      isResult: bar.isResult
    }))
  , [bars]);

  if (isLoading) {
    return (
      <div className="flex items-end gap-4 px-4 pb-8" style={{ height }}>
        {[0.9, 0.3, 0.12, 0.75].map((h, i) => (
          <div key={i} className="flex-1 flex flex-col justify-end gap-2">
            <Skeleton className="w-full rounded-t" style={{ height: `${h * (height - 60)}px` }} />
            <Skeleton className="h-3 w-16 mx-auto rounded" />
          </div>
        ))}
      </div>
    );
  }

  const chartContent = (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={chartData}
        margin={{ top: 25, right: 20, left: 10, bottom: 8 }}
        barCategoryGap="30%"
      >
        <CartesianGrid
          strokeDasharray="3 3"
          vertical={false}
          stroke="var(--color-border)"
          opacity={0.5}
        />

        <XAxis
          dataKey="name"
          tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
          tickLine={false}
          axisLine={false}
        />

        <YAxis
          tickFormatter={formatYAxisTick}
          tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
          tickLine={false}
          axisLine={false}
          width={56}
        />

        <Tooltip 
          content={<WaterfallTooltip />} 
          cursor={{ fill: 'var(--color-muted)', opacity: 0.1 }}
        />

        {/* Base bar — INVISIBLE stack offset */}
        <Bar
          dataKey="base"
          stackId="waterfall"
          fill="rgba(0,0,0,0)"
          stroke="none"
          isAnimationActive={false}
          legendType="none"
        />

        {/* Value bar — VISIBLE colored amount */}
        <Bar
          dataKey="value"
          stackId="waterfall"
          radius={[4, 4, 0, 0]}
          isAnimationActive={true}
          animationDuration={600}
          animationEasing="ease-out"
        >
          {chartData.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.color} />
          ))}
          {/* LabelList: Only show for result or top-level bars, not middle deductions */}
          <LabelList
            dataKey="total"
            position="top"
            formatter={(value: number, entry: any) => {
              // entry is surprisingly unreliable in LabelList, we'll check value relative to gross/net
              if (value === 0) return '';
              return formatRsCompact(value);
            }}
            style={{ fontSize: 11, fill: 'hsl(var(--foreground))', fontWeight: 600 }}
            offset={8}
          />
        </Bar>

        {/* ReferenceLine at net payout level */}
        {netPayout > 0 && grossRevenue > 0 && (
          <ReferenceLine
            y={netPayout}
            stroke="#10b981"
            strokeDasharray="4 4"
            strokeWidth={1.5}
            label={{
              value: 'Payout',
              position: 'insideTopRight',
              fontSize: 10,
              fill: '#10b981',
              fontWeight: 700,
              dx: -8,
              dy: -4
            }}
          />
        )}
      </BarChart>
    </ResponsiveContainer>
  );

  if (grossRevenue === 0) {
    return (
      <div className="relative" style={{ height }}>
        <div className="opacity-20 pointer-events-none">
          {chartContent}
        </div>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center space-y-1">
            <p className="text-sm font-bold text-muted-foreground">
              No revenue for this period
            </p>
            <p className="text-xs text-muted-foreground opacity-70">
              Try selecting a different date range
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div aria-hidden="true">
      {chartContent}
    </div>
  );
}

function WaterfallTooltip({ active, payload, label }: any) {
  if (!active || !payload?.[0]) return null;

  // The stacked bar sends both 'base' and 'value' in payload
  const valueEntry = payload.find((p: any) => p.dataKey === 'value');
  if (!valueEntry) return null;

  const data = valueEntry.payload;
  const amount = data.total;
  const isDeduction = data.isDeduction;
  const color = data.color;

  return (
    <div className="bg-background/95 backdrop-blur-sm border border-border rounded-xl
                    shadow-xl px-4 py-3 text-xs space-y-1.5 min-w-[160px] animate-in fade-in zoom-in-95 duration-200">
      <p className="font-bold text-muted-foreground uppercase tracking-widest text-[10px]">
        {label}
      </p>
      <p className="text-base font-black tabular-nums" style={{ color }}>
        {isDeduction ? '−' : ''}{formatRsFull(amount)}
      </p>
      {isDeduction && (
        <div className="flex items-center gap-1.5 text-red-500 font-medium">
          <span className="text-[10px]">▼</span>
          <span>Deducted from gross</span>
        </div>
      )}
      {!isDeduction && data.isResult && (
        <div className="flex items-center gap-1.5 text-emerald-500 font-medium">
          <span className="text-[10px]">★</span>
          <span>Final earnings</span>
        </div>
      )}
    </div>
  );
}
