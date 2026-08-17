import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { db } from '@/lib/firebase';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';

interface ExtendHoursModalProps {
  isOpen: boolean
  onClose: () => void
  stations: Array<{
    id: string
    name: string
    operatingHours?: { open: string; close: string }
  }>
  ownerId: string
}

const ExtendHoursModal = ({
  isOpen,
  onClose,
  stations,
}: ExtendHoursModalProps) => {
  const { toast } = useToast();
  const [selectedStationId, setSelectedStationId] = useState<string>(
    stations[0]?.id ?? ''
  );
  const [openTime, setOpenTime] = useState('06:00');
  const [closeTime, setCloseTime] = useState('22:00');
  const [isSaving, setIsSaving] = useState(false);
  const [savedStationIds, setSavedStationIds] = useState<string[]>([]);

  // Populate times from selected station's existing hours
  useEffect(() => {
    const station = stations.find(s => s.id === selectedStationId);
    if (station?.operatingHours) {
      setOpenTime(station.operatingHours.open || '06:00');
      setCloseTime(station.operatingHours.close || '22:00');
    } else {
      setOpenTime('06:00');
      setCloseTime('22:00');
    }
  }, [selectedStationId, stations]);

  const timeToMinutes = (t: string | undefined): number => {
    if (!t || typeof t !== 'string' || !t.includes(':')) return 0;
    const [h, m] = t.split(':').map(Number);
    return (isNaN(h) ? 0 : h) * 60 + (isNaN(m) ? 0 : m);
  };

  const currentOpen = stations.find(s => s.id === selectedStationId)
    ?.operatingHours?.open ?? '06:00';
  const currentClose = stations.find(s => s.id === selectedStationId)
    ?.operatingHours?.close ?? '22:00';

  const currentHours = (timeToMinutes(currentClose) - timeToMinutes(currentOpen)) / 60;
  const newHours = (timeToMinutes(closeTime) - timeToMinutes(openTime)) / 60;
  const additionalHours = Math.max(0, newHours - currentHours);
  const reducedHours = Math.max(0, currentHours - newHours);

  const isValid = timeToMinutes(closeTime) > timeToMinutes(openTime) + 60;

  const handleSave = async () => {
    if (!isValid || !selectedStationId) return;
    setIsSaving(true);
    try {
      await updateDoc(doc(db, 'stations', selectedStationId), {
        'operatingHours.open': openTime,
        'operatingHours.close': closeTime,
        'operatingHoursUpdatedAt': serverTimestamp()
      });
      
      setSavedStationIds(prev => [...prev, selectedStationId]);
      toast({
        title: "Hours Updated",
        description: `Operating hours for ${stations.find(s => s.id === selectedStationId)?.name} have been updated.`
      });

      if (stations.length === 1) {
        onClose();
      }
    } catch (err) {
      console.error('[SeniorDevOps] Extend hours save failed:', err);
      toast({
        variant: "destructive",
        title: "Update Failed",
        description: "Could not update station operating hours."
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-[420px] rounded-3xl p-6 border-none glass-card shadow-2xl">
        <DialogHeader className="space-y-2">
          <DialogTitle className="text-xl font-black uppercase tracking-tight flex items-center gap-2">
            <span className="text-sky-500">🕐</span> Extend hours
          </DialogTitle>
          <DialogDescription className="text-sm font-medium text-muted-foreground leading-relaxed">
            Increase your station's availability to capture more booking demand and reach your revenue goal.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Station Selector */}
          {stations.length > 1 && (
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Select Station</label>
              <Select value={selectedStationId} onValueChange={setSelectedStationId}>
                <SelectTrigger className="h-12 rounded-2xl bg-white/5 border-white/10 font-bold">
                  <SelectValue placeholder="Choose a station" />
                </SelectTrigger>
                <SelectContent className="rounded-2xl border-none glass-card shadow-xl">
                  {stations.map(s => (
                    <SelectItem key={s.id} value={s.id} className="rounded-xl font-medium">
                      {s.name} {savedStationIds.includes(s.id) && ' ✓'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Current Hours Info */}
          <div className="flex items-center gap-3 p-3 rounded-2xl bg-white/5 border border-white/5">
            <div className="h-8 w-8 rounded-xl bg-muted/50 flex items-center justify-center text-lg">ℹ️</div>
            <div className="space-y-0.5">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">Current Schedule</p>
              <p className="text-xs font-bold">{currentOpen} — {currentClose}</p>
            </div>
          </div>

          {/* Time Inputs */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Opens at</label>
              <input
                type="time"
                value={openTime}
                onChange={e => setOpenTime(e.target.value)}
                className="w-full h-12 rounded-2xl bg-white/5 border border-white/10 px-4 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Closes at</label>
              <input
                type="time"
                value={closeTime}
                onChange={e => setCloseTime(e.target.value)}
                className="w-full h-12 rounded-2xl bg-white/5 border border-white/10 px-4 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
              />
            </div>
          </div>

          {/* Impact Preview */}
          <div className="min-h-[48px]">
            {additionalHours > 0 && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="p-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/5"
              >
                <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
                  <span className="text-lg">📈</span>
                  <span>+{additionalHours.toFixed(1)} hours/day of extra capacity.</span>
                </p>
              </motion.div>
            )}

            {reducedHours > 0 && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="p-3 rounded-2xl border border-amber-500/20 bg-amber-500/5"
              >
                <p className="text-xs font-medium text-amber-600 dark:text-amber-400 flex items-center gap-2">
                  <span className="text-lg">⚠️</span>
                  <span>Reducing availability by {reducedHours.toFixed(1)} hours/day.</span>
                </p>
              </motion.div>
            )}

            {!isValid && (
              <p className="text-xs font-black text-destructive text-center uppercase tracking-tighter animate-bounce">
                Schedule must span at least 1 hour
              </p>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="ghost" onClick={onClose} disabled={isSaving} className="rounded-2xl font-black uppercase text-[10px] tracking-widest h-11">
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={!isValid || isSaving}
            className="rounded-2xl font-black uppercase text-[10px] tracking-widest h-11 px-8 shadow-xl shadow-primary/20"
          >
            {isSaving ? 'Updating...' : 'Apply Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ExtendHoursModal;
