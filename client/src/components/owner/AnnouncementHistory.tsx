// ANNOUNCEMENTS — AnnouncementHistory
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { 
  type Announcement, 
  type AnnouncementStatus,
  parseAnnouncement,
  formatReadRate,
  formatSentTime,
  SEGMENT_CONFIG
} from '@/lib/announcement-engine';
import { type Firestore } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

interface AnnouncementHistoryProps {
  ownerId: string;
  db: Firestore;
  refreshKey: number;
}

const STATUS_CONFIG: Record<AnnouncementStatus, {
  label: string;
  badgeClass: string;
}> = {
  sent: {
    label: 'Sent',
    badgeClass: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200'
  },
  scheduled: {
    label: 'Scheduled',
    badgeClass: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
  },
  draft: {
    label: 'Draft',
    badgeClass: 'bg-muted text-muted-foreground'
  },
  archived: {
    label: 'Archived',
    badgeClass: 'bg-muted text-muted-foreground opacity-50'
  }
};

/**
 * Displays the history of announcements sent or scheduled by the owner.
 * 
 * Implementation Notes:
 * - Uses TanStack Query for caching and automatic background refetching.
 * - Client-side sorting is performed to avoid complex composite index requirements on the Spark plan.
 * - Order: Sent (newest first) > Scheduled (soonest first) > Drafts.
 */
export default function AnnouncementHistory({
  ownerId,
  db,
  refreshKey
}: AnnouncementHistoryProps) {
  const { data: announcements, isLoading, isError, refetch } = useQuery({
    queryKey: ['announcements', ownerId, refreshKey],
    queryFn: async (): Promise<Announcement[]> => {
      const { collection, query, where, getDocs } = await import('firebase/firestore');
      
      const q = query(
        collection(db, 'announcements'),
        where('ownerId', '==', ownerId),
        where('status', 'in', ['sent', 'scheduled', 'draft'])
      );

      const snap = await getDocs(q);
      const parsed = snap.docs.map(d =>
        parseAnnouncement(d.id, d.data() as Record<string, unknown>)
      );

      return parsed.sort((a, b) => {
        const statusOrder = { sent: 0, scheduled: 1, draft: 2, archived: 3 };
        if (statusOrder[a.status] !== statusOrder[b.status])
          return statusOrder[a.status] - statusOrder[b.status];
        
        const dateA = a.sentAt ?? a.scheduledAt ?? a.createdAt;
        const dateB = b.sentAt ?? b.scheduledAt ?? b.createdAt;
        return dateB.getTime() - dateA.getTime();
      });
    },
    staleTime: 60 * 1000,
    enabled: !!ownerId
  });

  async function handleArchive(announcementId: string) {
    const { doc, updateDoc } = await import('firebase/firestore');
    await updateDoc(doc(db, 'announcements', announcementId), {
      status: 'archived'
    });
    refetch();
  }

  return (
    <div className="flex flex-col h-full">
      <div className="pb-4 border-b border-border mb-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-medium">Sent history</h3>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => refetch()}
            className="text-xs h-7"
          >
            Refresh
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          {announcements?.length ?? 0} announcement
          {announcements?.length !== 1 ? 's' : ''}
        </p>
      </div>

      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-[100px] rounded-xl" />)}
        </div>
      )}

      {isError && (
        <div className="text-center py-8">
          <p className="text-sm text-destructive font-medium">Could not load announcements</p>
          <button onClick={() => refetch()}
                  className="text-xs underline text-muted-foreground mt-2 hover:text-foreground">
            Retry connection
          </button>
        </div>
      )}

      {!isLoading && !isError && (!announcements || announcements.length === 0) && (
        <div className="text-center py-12 border border-dashed
                        border-border rounded-xl bg-muted/5">
          <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
             <span className="text-xl">📢</span>
          </div>
          <p className="text-sm text-muted-foreground font-medium">No announcements yet</p>
          <p className="text-xs text-muted-foreground mt-1 px-4">
            Compose and send your first announcement to reach your drivers
          </p>
        </div>
      )}

      {!isLoading && announcements && announcements.length > 0 && (
        <div className="flex-1 overflow-y-auto space-y-3 pr-1 custom-scrollbar">
          <AnimatePresence initial={false}>
            {announcements.map(announcement => (
              <AnnouncementHistoryCard
                key={announcement.id}
                announcement={announcement}
                onArchive={() => handleArchive(announcement.id)}
              />
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

function AnnouncementHistoryCard({
  announcement,
  onArchive
}: {
  announcement: Announcement;
  onArchive: () => void;
}) {
  const [isArchiving, setIsArchiving] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const readRate = formatReadRate(announcement.readBy.length, announcement.audienceCount);
  const sentTime = formatSentTime(announcement.sentAt);
  const config = STATUS_CONFIG[announcement.status];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      layout
      className="rounded-xl border border-border bg-card p-3 space-y-3 shadow-sm hover:shadow-md transition-all duration-200"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn(
              'text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full font-black',
              config.badgeClass
            )}>
              {config.label}
            </span>
            <span className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              {SEGMENT_CONFIG[announcement.targetSegment]?.icon}
              {announcement.segmentLabel}
            </span>
          </div>
          <p className="text-sm font-bold mt-1.5 truncate leading-none"
             title={announcement.title}>
            {announcement.title}
          </p>
        </div>
        <button
          className="w-7 h-7 rounded-full hover:bg-muted flex items-center justify-center
                     text-muted-foreground transition-colors"
          onClick={() => setExpanded(p => !p)}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none"
               stroke="currentColor" strokeWidth="2" strokeLinecap="round"
               className={cn('transition-transform duration-200', expanded && 'rotate-180')}>
            <path d="M2 4l4 4 4-4"/>
          </svg>
        </button>
      </div>

      <div className="flex items-center gap-4 text-[11px] font-medium text-muted-foreground/80">
        <span className="flex items-center gap-1">
          <span className="text-sm">👥</span> {announcement.audienceCount.toLocaleString('en-IN')}
        </span>
        {announcement.status === 'sent' && (
          <span className="flex items-center gap-1">
            <span className="text-sm">👁</span> {readRate}
          </span>
        )}
        <span className="ml-auto opacity-70">{sentTime}</span>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="pt-3 mt-1 border-t border-border/50 space-y-2.5">
              <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">
                {announcement.body}
              </p>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {announcement.stationIds.map((sid, idx) => (
                  <span key={sid} className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                    Station {idx + 1}
                  </span>
                ))}
              </div>
              {announcement.scheduledAt && announcement.status === 'scheduled' && (
                <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/50">
                   <p className="text-[11px] text-blue-700 dark:text-blue-400 font-bold flex items-center gap-1.5">
                     <span className="text-sm">📅</span>
                     Scheduled: {announcement.scheduledAt.toLocaleString('en-IN', {
                       day: 'numeric', month: 'short',
                       hour: '2-digit', minute: '2-digit'
                     })}
                   </p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex justify-end pt-1">
        <button
          onClick={async () => {
            if (confirm('Are you sure you want to delete this announcement?')) {
              setIsArchiving(true);
              await onArchive();
              setIsArchiving(false);
            }
          }}
          disabled={isArchiving}
          className="text-[11px] font-bold text-muted-foreground hover:text-destructive
                     transition-colors disabled:opacity-50 flex items-center gap-1"
        >
          {isArchiving ? 'Deleting...' : (
            <>
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none"
                   stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M1 1l8 8M9 1L1 9"/>
              </svg>
              Delete
            </>
          )}
        </button>
      </div>
    </motion.div>
  );
}
