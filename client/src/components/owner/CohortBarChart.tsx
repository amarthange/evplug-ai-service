import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Cell 
} from "recharts";
import { CohortMetrics, COHORT_CONFIG, CohortType } from "@/lib/cohort-engine";

interface ChartProps {
  cohorts: Record<CohortType, CohortMetrics>;
}

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    const config = COHORT_CONFIG[data.id as CohortType];
    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3 rounded-xl shadow-xl">
        <p className="text-xs font-black uppercase tracking-widest mb-1" style={{ color: config.barColor }}>
          {config.label}
        </p>
        <p className="text-sm font-black">{data.value} Drivers</p>
        <p className="text-[10px] text-muted-foreground font-medium mt-1">
          {config.rule}
        </p>
      </div>
    );
  }
  return null;
};

export const CohortBarChart = ({ cohorts }: ChartProps) => {
  const data = [
    { id: 'loyal', name: 'Loyal', value: cohorts.loyal.count },
    { id: 'new', name: 'New', value: cohorts.new.count },
    { id: 'at_risk', name: 'At Risk', value: cohorts.at_risk.count },
    { id: 'lost', name: 'Lost', value: cohorts.lost.count },
  ];

  return (
    <div className="h-[250px] w-full mt-4">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
          barSize={32}
        >
          <CartesianGrid strokeDasharray="3 3" horizontal={false} strokeOpacity={0.1} />
          <XAxis 
            type="number" 
            hide 
          />
          <YAxis 
            dataKey="name" 
            type="category" 
            width={70}
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 12, fontWeight: 700, fill: 'currentColor' }}
          />
          <Tooltip 
            content={<CustomTooltip />}
            cursor={{ fill: 'currentColor', opacity: 0.05 }}
          />
          <Bar dataKey="value" radius={[0, 8, 8, 0]}>
            {data.map((entry, index) => (
              <Cell 
                key={`cell-${index}`} 
                fill={COHORT_CONFIG[entry.id as CohortType].barColor} 
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};
