/**
 * WATERFALL — RevenueBreakdownTable.tsx
 * Accessible table showing the exact math behind the revenue waterfall.
 */
import { cn } from '@/lib/utils';
import { 
  type WaterfallAmounts, 
  type WaterfallPeriod, 
  formatRsFull 
} from '@/lib/waterfall-engine';

interface RevenueBreakdownTableProps {
  amounts: WaterfallAmounts;
  period: WaterfallPeriod;
  periodLabel: string;
}

interface BreakdownRow {
  key: string;
  label: string;
  sublabel?: string;
  amount: number;
  isDeduction: boolean;
  isResult: boolean;
  pctOfGross: number;
}

export default function RevenueBreakdownTable({
  amounts,
  periodLabel
}: RevenueBreakdownTableProps) {
  const rows: BreakdownRow[] = [
    {
      key: 'gross',
      label: 'Gross revenue',
      sublabel: `Completed sessions in ${periodLabel}`,
      amount: amounts.grossRevenue,
      isDeduction: false,
      isResult: false,
      pctOfGross: 100
    },
    {
      key: 'platform_fee',
      label: 'Platform fee',
      sublabel: `${amounts.platformFeePercent}% of gross (owner agreement)`,
      amount: amounts.platformFee,
      isDeduction: true,
      isResult: false,
      pctOfGross: amounts.platformFeePercent
    },
    {
      key: 'gst',
      label: 'GST on platform fee',
      sublabel: `${amounts.gstPercent}% of fee (${amounts.effectiveGstPercent}% of gross)`,
      amount: amounts.gstOnFee,
      isDeduction: true,
      isResult: false,
      pctOfGross: amounts.effectiveGstPercent
    },
    {
      key: 'payout',
      label: 'Your net payout',
      sublabel: 'Final earnings after all platform deductions',
      amount: amounts.netPayout,
      isDeduction: false,
      isResult: true,
      pctOfGross: amounts.netPayoutPercent
    }
  ];

  const isNegativePayout = amounts.netPayout < 0;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th scope="col" className="text-left py-3 px-4 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                Item
              </th>
              <th scope="col" className="text-right py-3 px-4 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                Amount
              </th>
              <th scope="col" className="text-right py-3 px-4 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                % of Gross
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.key}
                className={cn(
                  'border-b border-border/50 last:border-0 transition-colors duration-150',
                  row.isResult && [
                    'font-bold',
                    'border-l-[4px] border-l-emerald-500',
                    'bg-emerald-50/30 dark:bg-emerald-950/10'
                  ],
                  !row.isResult && !row.isDeduction && 'bg-background hover:bg-muted/5',
                  row.isDeduction && 'bg-muted/10 hover:bg-muted/20'
                )}
              >
                <td className="py-4 px-4">
                  <div className="flex flex-col gap-0.5">
                    <p className={cn(
                      'text-sm font-bold flex items-center gap-1.5',
                      row.isResult ? 'text-foreground' :
                      row.isDeduction ? 'text-muted-foreground' : 'text-foreground'
                    )}>
                      {row.isDeduction && (
                        <span className="text-red-500 font-black" aria-label="deduction">−</span>
                      )}
                      {row.label}
                    </p>
                    {row.sublabel && (
                      <p className="text-[11px] text-muted-foreground font-medium opacity-80 leading-tight">
                        {row.sublabel}
                      </p>
                    )}
                  </div>
                </td>

                <td className={cn(
                  'py-4 px-4 text-right tabular-nums font-black',
                  row.isResult ? 'text-emerald-600 dark:text-emerald-400 text-lg' :
                  row.isDeduction ? 'text-red-600 dark:text-red-400' :
                  'text-foreground'
                )}>
                  {row.isDeduction ? '−' : ''}
                  {formatRsFull(row.amount)}
                </td>

                <td className="py-4 px-4 text-right tabular-nums">
                  <div className="flex items-center justify-end gap-3">
                    <div className="hidden sm:flex h-2 w-16 rounded-full bg-muted overflow-hidden">
                      <div
                        className={cn(
                          'h-full rounded-full transition-all duration-500 ease-out',
                          row.isResult ? 'bg-emerald-500' :
                          row.isDeduction ? 'bg-red-400' : 'bg-muted-foreground'
                        )}
                        style={{ width: `${Math.min(row.pctOfGross, 100)}%` }}
                      />
                    </div>
                    <span className={cn(
                      'text-xs font-bold min-w-[45px]',
                      row.isResult ? 'text-emerald-600 dark:text-emerald-400' :
                      row.isDeduction ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'
                    )}>
                      {row.pctOfGross.toFixed(1)}%
                    </span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Math Verification Line */}
        <div className="px-4 py-3 bg-muted/40 border-t border-border flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
            <span className="w-1.5 h-1.5 rounded-full bg-primary/40" />
            Payout Calculation
          </div>
          <p className="text-[11px] font-mono font-bold text-muted-foreground leading-none">
            {formatRsFull(amounts.grossRevenue)} −{' '}
            {formatRsFull(amounts.platformFee)} −{' '}
            {formatRsFull(amounts.gstOnFee)}{' '}
            <span className="text-foreground border-l border-border pl-2 ml-1">
               = {formatRsFull(amounts.netPayout)}
            </span>
          </p>
        </div>
      </div>

      {isNegativePayout && (
        <div className="p-4 rounded-xl border border-destructive/30 bg-destructive/5 flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-destructive/10 flex items-center justify-center text-destructive flex-shrink-0">
            ⚠️
          </div>
          <div>
            <p className="text-sm font-bold text-destructive">Net payout is negative</p>
            <p className="text-xs text-destructive/80 mt-0.5">
              Platform deductions exceed gross revenue for this period. 
              Please contact SeniorDevOps support for reconciliation.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
