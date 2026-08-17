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
import { 
  type ConnectorLifecycleData, 
  formatKwh, 
  computeWearScore 
} from '@/lib/connector-lifecycle-engine';
import WearScoreRing from './WearScoreRing';

interface LogKwhModalProps {
  isOpen: boolean
  onClose: () => void
  connector: ConnectorLifecycleData
  onConfirm: (additionalKwh: number, note: string) => Promise<void>
  isSaving: boolean
}

const LogKwhModal = ({
  isOpen,
  onClose,
  connector,
  onConfirm,
  isSaving
}: LogKwhModalProps) => {
  const [kwhInput, setKwhInput] = useState('');
  const [note, setNote] = useState('');
  const [inputError, setInputError] = useState<string | null>(null);

  const parsedKwh = parseFloat(kwhInput);
  const isValid = !isNaN(parsedKwh) && parsedKwh > 0 && parsedKwh <= 500;

  const validate = () => {
    if (kwhInput.trim() === '') {
      setInputError(null);
      return;
    }
    if (isNaN(parsedKwh)) {
      setInputError('Enter a valid number');
    } else if (parsedKwh <= 0) {
      setInputError('Must be greater than 0');
    } else if (parsedKwh > 500) {
      setInputError('Max 500 kWh per entry');
    } else {
      setInputError(null);
    }
  };

  const previewScore = isValid
    ? computeWearScore(
        connector.lifetimeKwh + parsedKwh,
        connector.faultEvents,
        connector.daysSinceInstall
      )
    : null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-[400px] rounded-[2rem] p-6 border-none glass-card shadow-2xl">
        <DialogHeader className="space-y-3">
          <DialogTitle className="text-xl font-black uppercase tracking-tight flex items-center gap-2">
            <span className="text-sky-500">⚡</span> Log kWh manually
          </DialogTitle>
          <DialogDescription className="text-xs font-bold uppercase tracking-widest text-muted-foreground/60">
            {connector.connectorType} • #{connector.connectorId.slice(-6)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Current Context */}
          <div className="flex items-center justify-between p-4 rounded-2xl bg-white/5 border border-white/5">
            <div>
              <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Current lifetime</p>
              <p className="text-sm font-black mt-0.5">{formatKwh(connector.lifetimeKwh)}</p>
            </div>
            <div className="text-right">
              <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Projected</p>
              <p className="text-sm font-black mt-0.5 text-emerald-500">
                {isValid ? formatKwh(connector.lifetimeKwh + parsedKwh) : '—'}
              </p>
            </div>
          </div>

          {/* Input */}
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Energy delivered (kWh)</label>
            <div className="flex items-center gap-3">
              <Input
                type="number"
                value={kwhInput}
                onChange={e => { setKwhInput(e.target.value); setInputError(null); }}
                onBlur={validate}
                placeholder="0.0"
                className="h-12 rounded-2xl bg-white/5 border-white/10 font-bold text-lg"
              />
              <span className="text-sm font-black uppercase tracking-widest opacity-50">kWh</span>
            </div>
            {inputError && (
              <p className="text-xs font-bold text-rose-500 ml-1 italic">{inputError}</p>
            )}
          </div>

          {/* Quick Add */}
          <div className="space-y-2">
            <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground ml-1">Quick Select</p>
            <div className="flex gap-2 flex-wrap">
              {[10, 22, 50, 100].map(val => (
                <button
                  key={val}
                  onClick={() => { setKwhInput(val.toString()); setInputError(null); }}
                  className="px-4 py-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-xs font-black transition-all"
                >
                  {val}
                </button>
              ))}
            </div>
          </div>

          {/* Note */}
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Note <span className="opacity-50">(Optional)</span></label>
            <Input
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="e.g. Offline manual session"
              className="h-12 rounded-2xl bg-white/5 border-white/10 font-medium"
              maxLength={120}
            />
          </div>

          {/* Wear Preview */}
          {previewScore !== null && previewScore !== connector.wearScore && (
            <div className="flex items-center gap-4 p-4 rounded-2xl border border-white/10 bg-black/20">
              <div className="text-center space-y-1">
                <WearScoreRing score={connector.wearScore} size={40} animated={false} />
                <p className="text-[8px] font-black uppercase tracking-tighter opacity-40">Now</p>
              </div>
              <span className="text-muted-foreground opacity-30">→</span>
              <div className="text-center space-y-1">
                <WearScoreRing score={previewScore} size={40} animated={false} />
                <p className="text-[8px] font-black uppercase tracking-tighter opacity-40">Post</p>
              </div>
              <div className="ml-2">
                <p className="text-xs font-black uppercase tracking-tight text-amber-500">
                  +{previewScore - connector.wearScore} pts wear
                </p>
                <p className="text-[9px] font-medium text-muted-foreground opacity-60">Usage affects asset health</p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0 border-t border-white/5 pt-6 mt-2">
          <Button variant="ghost" onClick={onClose} disabled={isSaving} className="rounded-2xl font-black uppercase text-[10px] tracking-widest h-11">
            Cancel
          </Button>
          <Button
            onClick={() => isValid && onConfirm(parsedKwh, note.trim())}
            disabled={!isValid || isSaving}
            className="rounded-2xl font-black uppercase text-[10px] tracking-widest h-11 px-8 shadow-xl shadow-primary/20"
          >
            {isSaving ? 'Logging...' : `Log ${isValid ? parsedKwh.toFixed(1) : ''} kWh`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default LogKwhModal;
