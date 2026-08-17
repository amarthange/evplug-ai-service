// ANNOUNCEMENTS — AnnouncementComposer
import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { 
  type TargetSegment, 
  type TargetingResult, 
  SEGMENT_CONFIG,
  validateAnnouncement
} from '@/lib/announcement-engine';
import { type Firestore } from 'firebase/firestore';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import AudiencePreview from './AudiencePreview';

interface AnnouncementComposerProps {
  ownerStations: Array<{ id: string; name: string }>;
  db: Firestore;
  ownerId: string;
  onSent: () => void;
}

export default function AnnouncementComposer({
  ownerStations,
  db,
  ownerId,
  onSent
}: AnnouncementComposerProps) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [selectedStationIds, setSelectedStationIds] = useState<string[]>(
    ownerStations.map(s => s.id)
  );
  const [segment, setSegment] = useState<TargetSegment>('all_recent');
  const [targetingResult, setTargetingResult] = useState<TargetingResult | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [isScheduling, setIsScheduling] = useState(false);
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendSuccess, setSendSuccess] = useState<string | null>(null);

  const validation = useMemo(() =>
    validateAnnouncement(
      title, body, selectedStationIds,
      targetingResult?.userIds ?? [],
      targetingResult?.wasCapped ?? false
    ),
    [title, body, selectedStationIds, targetingResult]
  );

  async function handleSend(scheduledAt?: Date) {
    if (!validation.isValid || !targetingResult) return;

    const isScheduled = !!scheduledAt;
    isScheduled ? setIsScheduling(true) : setIsSending(true);
    setSendError(null);
    setSendSuccess(null);

    try {
      const { collection, addDoc, Timestamp, serverTimestamp } =
        await import('firebase/firestore');

      const now = new Date();
      const announcementDoc = {
        ownerId,
        stationIds: selectedStationIds,
        title: title.trim(),
        body: body.trim(),
        targetSegment: segment,
        targetUserIds: targetingResult.userIds,
        status: isScheduled ? 'scheduled' : 'sent',
        scheduledAt: isScheduled ? Timestamp.fromDate(scheduledAt!) : null,
        sentAt: isScheduled ? null : Timestamp.fromDate(now),
        createdAt: serverTimestamp(),
        readBy: [],
        audienceCount: targetingResult.userIds.length,
        segmentLabel: SEGMENT_CONFIG[segment].label
      };

      await addDoc(collection(db, 'announcements'), announcementDoc);

      const sentCount = targetingResult.userIds.length;
      setSendSuccess(
        isScheduled
          ? `Scheduled to ${sentCount.toLocaleString('en-IN')} drivers`
          : `Sent to ${sentCount.toLocaleString('en-IN')} drivers`
      );

      // Reset form after success
      setTimeout(() => {
        setTitle('');
        setBody('');
        setSelectedStationIds(ownerStations.map(s => s.id));
        setSegment('all_recent');
        setTargetingResult(null);
        setSendSuccess(null);
        onSent();
      }, 2000);

    } catch (err) {
      console.error('[SeniorDevOps Announcements] Send failed:', err);
      setSendError('Failed to send announcement. Please try again.');
    } finally {
      setIsSending(false);
      setIsScheduling(false);
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="pb-4 border-b border-border mb-4">
        <h3 className="text-base font-medium">Compose announcement</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Write and target a message to your driver segments
        </p>
      </div>

      <div className="flex-1 overflow-y-auto space-y-5 pr-1">
        {/* Title Input */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">Title</label>
            <span className={cn(
              'text-xs tabular-nums',
              title.length > 50 ? 'text-amber-600 dark:text-amber-400' :
              title.length > 58 ? 'text-destructive' : 'text-muted-foreground'
            )}>
              {title.length}/60
            </span>
          </div>
          <Input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="e.g. MG Road station maintenance"
            className="text-sm"
            maxLength={60}
          />
          <p className="text-xs text-muted-foreground">
            Shown as notification title on driver's phone
          </p>
        </div>

        {/* Body Textarea */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">Message</label>
            <span className={cn(
              'text-xs tabular-nums',
              body.length > 240 ? 'text-amber-600 dark:text-amber-400' :
              body.length > 270 ? 'text-destructive' : 'text-muted-foreground'
            )}>
              {body.length}/280
            </span>
          </div>
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            placeholder="Write your message here..."
            rows={4}
            maxLength={280}
            className="w-full resize-none rounded-md border border-input
                       bg-background px-3 py-2 text-sm placeholder:text-muted-foreground
                       focus:outline-none focus:ring-2 focus:ring-ring transition-all"
          />
        </div>

        {/* Station Selection */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">Stations</label>
            <div className="flex gap-2">
              <button
                className="text-xs underline text-muted-foreground hover:text-foreground"
                onClick={() => setSelectedStationIds(ownerStations.map(s => s.id))}
              >
                All
              </button>
              <span className="text-xs text-muted-foreground">·</span>
              <button
                className="text-xs underline text-muted-foreground hover:text-foreground"
                onClick={() => setSelectedStationIds([])}
              >
                None
              </button>
            </div>
          </div>

          <div className="space-y-1.5 rounded-lg border border-border p-3
                          bg-muted/20 max-h-[160px] overflow-y-auto custom-scrollbar">
            {ownerStations.map(station => (
              <label key={station.id}
                     className="flex items-center gap-2 cursor-pointer
                                hover:text-foreground transition-colors group">
                <input
                  type="checkbox"
                  checked={selectedStationIds.includes(station.id)}
                  onChange={e => {
                    setSelectedStationIds(prev =>
                      e.target.checked
                        ? [...prev, station.id]
                        : prev.filter(id => id !== station.id)
                    )
                  }}
                  className="rounded border-border text-primary focus:ring-primary h-3.5 w-3.5"
                />
                <span className="text-sm truncate group-hover:pl-1 transition-all">{station.name}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Segment Selector */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Target segment</label>
          <div className="space-y-2">
            {(Object.keys(SEGMENT_CONFIG) as TargetSegment[]).map(seg => {
              const config = SEGMENT_CONFIG[seg];
              const isSelected = segment === seg;
              return (
                <label
                  key={seg}
                  className={cn(
                    'flex items-start gap-3 p-3 rounded-lg border cursor-pointer',
                    'transition-all duration-150',
                    isSelected
                      ? 'border-primary bg-primary/5 ring-1 ring-primary'
                      : 'border-border hover:border-border-secondary hover:bg-muted/30'
                  )}
                >
                  <input
                    type="radio"
                    name="segment"
                    value={seg}
                    checked={isSelected}
                    onChange={() => setSegment(seg)}
                    className="mt-0.5 flex-shrink-0 text-primary focus:ring-primary"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm">{config.icon}</span>
                      <span className="text-sm font-medium">{config.label}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {config.description}
                    </p>
                    <p className="text-xs text-muted-foreground/70 mt-0.5 italic">
                      Use for: {config.useCase}
                    </p>
                  </div>
                </label>
              );
            })}
          </div>
        </div>

        <AudiencePreview
          segment={segment}
          stationIds={selectedStationIds}
          db={db}
          onTargetingComputed={setTargetingResult}
        />

        {/* Validation Feedback */}
        <div className="space-y-1 pt-1">
          {validation.errors.map((err, i) => (
            <p key={i} className="text-xs text-destructive flex items-center gap-1.5">
              <span className="w-1 h-1 rounded-full bg-destructive" /> {err}
            </p>
          ))}
          {validation.warnings.map((warn, i) => (
            <p key={i} className="text-xs text-amber-600 dark:text-amber-400
                                  flex items-center gap-1.5">
              <span className="w-1 h-1 rounded-full bg-amber-500" /> {warn}
            </p>
          ))}
        </div>

        <AnimatePresence>
          {sendError && (
            <motion.p
              initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="text-sm text-destructive bg-destructive/5 border
                         border-destructive/30 rounded-lg p-3"
            >
              {sendError}
            </motion.p>
          )}
          {sendSuccess && (
            <motion.p
              initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="text-sm text-emerald-700 dark:text-emerald-300
                         bg-emerald-50 dark:bg-emerald-950/40 border
                         border-emerald-200 dark:border-emerald-800 rounded-lg p-3"
            >
              {sendSuccess}
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      <div className="pt-4 mt-4 border-t border-border flex items-center gap-3">
        <Button
          onClick={() => handleSend()}
          disabled={!validation.isValid || isSending || isScheduling || !targetingResult}
          className="flex-1 h-11"
        >
          {isSending ? (
            <span className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full border-2 border-primary-foreground/30
                              border-t-primary-foreground animate-spin" />
              Sending...
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"
                   stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M12 2L2 6l4 2 2 4 4-10z"/>
              </svg>
              Send now
            </span>
          )}
        </Button>

        <Button
          variant="outline"
          onClick={() => setScheduleDialogOpen(true)}
          disabled={!validation.isValid || isSending || isScheduling || !targetingResult}
          className="h-11"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"
               stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <rect x="1" y="2" width="12" height="11" rx="1.5"/>
            <path d="M1 6h12M5 1v2M9 1v2"/>
          </svg>
          <span className="ml-2">Schedule</span>
        </Button>
      </div>

      <Dialog open={scheduleDialogOpen} onOpenChange={setScheduleDialogOpen}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle>Schedule announcement</DialogTitle>
            <DialogDescription>
              Choose when to send this announcement
            </DialogDescription>
          </DialogHeader>

          <ScheduleDateTimePicker
            onConfirm={(scheduledAt) => {
              setScheduleDialogOpen(false);
              handleSend(scheduledAt);
            }}
            onCancel={() => setScheduleDialogOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ScheduleDateTimePicker({
  onConfirm, onCancel
}: { onConfirm: (date: Date) => void, onCancel: () => void }) {
  const minDateTime = new Date(Date.now() + 5 * 60 * 1000)
    .toISOString().slice(0, 16);
  const [value, setValue] = useState('');
  const parsedDate = value ? new Date(value) : null;
  const isValid = parsedDate && parsedDate > new Date();

  return (
    <div className="space-y-4">
      <div>
        <label className="text-sm font-medium">Send at</label>
        <input
          type="datetime-local"
          value={value}
          onChange={e => setValue(e.target.value)}
          min={minDateTime}
          className="w-full mt-1 px-3 py-2 rounded-md border border-input
                     bg-background text-sm focus:outline-none focus:ring-2
                     focus:ring-ring"
        />
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">
        The announcement status will be 'scheduled'. Note: scheduled announcements
        require the dashboard to be open at the scheduled time to auto-send,
        or send manually from the history panel.
      </p>
      <DialogFooter className="gap-2 sm:gap-0">
        <Button variant="outline" onClick={onCancel} className="flex-1 sm:flex-none">Cancel</Button>
        <Button
          onClick={() => parsedDate && onConfirm(parsedDate)}
          disabled={!isValid}
          className="flex-1 sm:flex-none"
        >
          Confirm Schedule
        </Button>
      </DialogFooter>
    </div>
  );
}
