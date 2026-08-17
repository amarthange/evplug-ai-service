import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { 
  type ConnectorLifecycleData, 
  computeWearScore 
} from '@/lib/connector-lifecycle-engine';
import WearScoreRing from './WearScoreRing';

interface MarkServicedModalProps {
  isOpen: boolean
  onClose: () => void
  connector: ConnectorLifecycleData
  onConfirm: (note: string) => Promise<void>
  isSaving: boolean
}

const MarkServicedModal = ({
  isOpen,
  onClose,
  connector,
  onConfirm,
  isSaving
}: MarkServicedModalProps) => {
  const [serviceNote, setServiceNote] = useState('');

  // Service resets faultEventsLast30d contribution conceptually in the UI
  // although wearScore still uses total historical faults.
  const scoreAfter = computeWearScore(
    connector.lifetimeKwh,
    connector.faultEvents,
    connector.daysSinceInstall
  );

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-[400px] rounded-[2rem] p-6 border-none glass-card shadow-2xl">
        <DialogHeader className="space-y-3">
          <DialogTitle className="text-xl font-black uppercase tracking-tight flex items-center gap-2">
            <span className="text-emerald-500">🛠️</span> Mark as serviced
          </DialogTitle>
          <DialogDescription className="text-xs font-bold uppercase tracking-widest text-muted-foreground/60 leading-relaxed">
            Record that {connector.connectorType} #{connector.connectorId.slice(-6)} has been inspected and cleared.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* What happens list */}
          <div className="space-y-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Update Summary</p>
            <div className="space-y-2.5">
              {[
                { text: 'Record today as the last service date', positive: true },
                { text: 'Reset recent fault count (30D) to zero', positive: true },
                { text: 'Audit trail entry for asset lifecycle', positive: true },
                { text: 'Lifetime kWh remains unchanged (historical)', positive: null }
              ].map((item, i) => (
                <div key={i} className="flex items-start gap-3 p-3 rounded-2xl bg-white/5 border border-white/5">
                  <span className={cn(
                    'text-xs mt-0.5',
                    item.positive === true ? 'text-emerald-500' : 'text-muted-foreground/40'
                  )}>
                    {item.positive === true ? '✓' : '○'}
                  </span>
                  <span className={cn(
                    "text-xs font-bold",
                    item.positive === null && "text-muted-foreground opacity-60"
                  )}>
                    {item.text}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Wear Score Info */}
          <div className="p-4 rounded-2xl bg-black/20 border border-white/10">
            <div className="flex items-center gap-4">
              <WearScoreRing score={connector.wearScore} size={44} animated={false} />
              <div className="flex-1">
                <p className="text-xs font-bold">Wear score stays at {connector.wearScore}</p>
                <p className="text-[10px] text-muted-foreground font-medium leading-tight mt-0.5">
                  Service is recorded, but cumulative usage and physical age still determine asset health.
                </p>
              </div>
            </div>
          </div>

          {/* Service Note */}
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Service Details <span className="opacity-50">(Optional)</span></label>
            <Input
              value={serviceNote}
              onChange={e => setServiceNote(e.target.value)}
              placeholder="e.g. Cleaned pins, cable stress test passed"
              className="h-12 rounded-2xl bg-white/5 border-white/10 font-medium"
              maxLength={200}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0 border-t border-white/5 pt-6 mt-2">
          <Button variant="ghost" onClick={onClose} disabled={isSaving} className="rounded-2xl font-black uppercase text-[10px] tracking-widest h-11">
            Cancel
          </Button>
          <Button
            onClick={() => onConfirm(serviceNote.trim())}
            disabled={isSaving}
            className="rounded-2xl font-black uppercase text-[10px] tracking-widest h-11 px-8 shadow-xl shadow-primary/20 bg-emerald-600 hover:bg-emerald-700 text-white border-none"
          >
            {isSaving ? 'Recording...' : 'Confirm Service'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default MarkServicedModal;
