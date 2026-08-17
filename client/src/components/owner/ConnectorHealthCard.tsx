import React from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { 
  type ConnectorLifecycleData, 
  formatKwh, 
  formatDate, 
  formatDaysAgo 
} from '@/lib/connector-lifecycle-engine';
import WearScoreRing from './WearScoreRing';

interface ConnectorHealthCardProps {
  data: ConnectorLifecycleData
  onMarkServiced: () => void
  onLogKwh: () => void
  isMarkingServiced: boolean
  isLoggingKwh: boolean
}

export function ConnectorHealthCard({
  data,
  onMarkServiced,
  onLogKwh,
  isMarkingServiced,
  isLoggingKwh
}: ConnectorHealthCardProps) {
  const borderClass =
    data.healthBadge.severity === 'critical'
      ? 'border-rose-500/30 bg-rose-500/[0.02]'
      : data.healthBadge.severity === 'warning'
      ? 'border-amber-500/30 bg-amber-500/[0.02]'
      : 'border-white/5 bg-white/[0.02]'

  return (
    <div className={cn(
      'rounded-3xl border p-5 space-y-5 transition-all duration-300 hover:shadow-xl hover:shadow-primary/5 group',
      borderClass
    )}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-black uppercase tracking-tight text-foreground/90">{data.connectorType}</span>
            <span className="text-[10px] text-muted-foreground font-black uppercase bg-white/5 px-2 py-0.5 rounded-lg border border-white/5">
              #{data.connectorId.slice(-6)}
            </span>
          </div>
          <span className={cn(
            'text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-lg mt-2 inline-block',
            data.healthBadge.severity === 'critical'
              ? 'bg-rose-500/10 text-rose-500'
              : data.healthBadge.severity === 'warning'
              ? 'bg-amber-500/10 text-amber-500'
              : 'bg-emerald-500/10 text-emerald-500'
          )}>
            {data.healthBadge.label}
          </span>
        </div>
        <WearScoreRing 
          score={data.wearScore} 
          size={64} 
          lifetimeKwh={data.lifetimeKwh}
          faultEvents={data.faultEvents}
          daysSinceInstall={data.daysSinceInstall}
        />
      </div>

      {/* Lifetime usage progress */}
      <div className="space-y-2">
        <div className="flex justify-between items-end">
          <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Lifetime usage</span>
          <span className="text-xs font-bold tabular-nums">
            {formatKwh(data.lifetimeKwh)}
            <span className="text-muted-foreground opacity-50 ml-1">/ 5,000 kWh</span>
          </span>
        </div>
        <div className="h-2 rounded-full bg-black/20 border border-white/5 overflow-hidden">
          <div
            className={cn(
              'h-full rounded-full transition-all duration-1000 ease-out shadow-[0_0_10px_rgba(var(--primary-rgb),0.3)]',
              data.kwhProgress >= 100
                ? 'bg-rose-500'
                : data.kwhProgress >= 70
                ? 'bg-amber-500'
                : 'bg-primary'
            )}
            style={{ width: `${data.kwhProgress}%` }}
          />
        </div>
        {data.lifetimeKwhManual > 0 && (
          <p className="text-[10px] text-muted-foreground font-medium italic">
            Includes {formatKwh(data.lifetimeKwhManual)} logged manually
          </p>
        )}
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Faults (30D)</p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-sm font-black tabular-nums">
              {data.faultEventsLast30d}
            </span>
            {data.faultEventsLast30d >= 3 && (
              <span className="text-[9px] font-black px-1.5 py-0.5 rounded-lg bg-rose-500/20 text-rose-500 animate-pulse uppercase">
                Pattern
              </span>
            )}
          </div>
          {data.lastFaultAt && (
            <p className="text-[10px] text-muted-foreground mt-1 font-medium">
              {formatDaysAgo(data.lastFaultAt)}
            </p>
          )}
        </div>

        <div>
          <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Total faults</p>
          <p className="text-sm font-black tabular-nums mt-1">{data.faultEvents}</p>
        </div>

        <div>
          <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Installed</p>
          <p className="text-sm font-black mt-1">
            {formatDate(data.installedAt, 'Unknown')}
          </p>
          {data.daysSinceInstall > 0 && (
            <p className="text-[10px] text-muted-foreground mt-1 font-medium">
              {data.daysSinceInstall} days ago
            </p>
          )}
        </div>

        <div>
          <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Last serviced</p>
          <p className={cn(
            'text-sm font-black mt-1',
            data.daysSinceService !== null && data.daysSinceService > 180
              ? 'text-amber-500'
              : ''
          )}>
            {formatDate(data.lastServiceAt)}
          </p>
          {data.daysSinceService !== null && (
            <p className="text-[10px] text-muted-foreground mt-1 font-medium">
              {data.daysSinceService} days ago
            </p>
          )}
        </div>
      </div>

      {/* Alerts */}
      {data.alerts.length > 0 && (
        <div className="space-y-2 pt-2">
          {data.alerts.map(alert => (
            <div key={alert.id} className={cn(
              'flex items-start gap-3 p-3 rounded-2xl text-[11px] font-medium leading-tight border',
              alert.severity === 'critical'
                ? 'bg-rose-500/5 border-rose-500/20 text-rose-500'
                : 'bg-amber-500/5 border-amber-500/20 text-amber-500'
            )}>
              <span className="flex-shrink-0 text-base">
                {alert.severity === 'critical' ? '⚠️' : 'ℹ️'}
              </span>
              <span>{alert.message}</span>
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3 pt-4 border-t border-white/5">
        <Button
          size="sm"
          variant="ghost"
          className="flex-1 rounded-xl h-10 font-black uppercase text-[10px] tracking-widest hover:bg-white/5"
          onClick={onLogKwh}
          disabled={isLoggingKwh}
        >
          + Log kWh
        </Button>
        <Button
          size="sm"
          variant={data.needsAttention ? 'default' : 'outline'}
          className={cn(
            "flex-1 rounded-xl h-10 font-black uppercase text-[10px] tracking-widest",
            data.needsAttention && "bg-amber-500 hover:bg-amber-600 text-black border-none shadow-lg shadow-amber-500/20"
          )}
          onClick={onMarkServiced}
          disabled={isMarkingServiced}
        >
          {isMarkingServiced ? 'Saving...' : '✓ Mark serviced'}
        </Button>
      </div>
    </div>
  )
}
