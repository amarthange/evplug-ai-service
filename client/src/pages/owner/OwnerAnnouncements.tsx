// ANNOUNCEMENTS — OwnerAnnouncements
import { useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { db } from '@/lib/firebase';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import AnnouncementComposer from '@/components/owner/AnnouncementComposer';
import AnnouncementHistory from '@/components/owner/AnnouncementHistory';

export default function OwnerAnnouncements() {
  const { user } = useAuth();
  const ownerId = user?.uid ?? '';
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const [activeTab, setActiveTab] = useState<'compose' | 'history'>('compose');

  const { data: ownerStations, isLoading: stationsLoading } = useQuery({
    queryKey: ['owner-stations', ownerId],
    queryFn: async () => {
      const { collection, query, where, getDocs } = await import('firebase/firestore');
      const q = query(
        collection(db, 'stations'),
        where('ownerId', '==', ownerId)
      );
      const snap = await getDocs(q);
      return snap.docs.map(d => ({
        id: d.id,
        name: d.data().name as string ?? 'Station'
      }));
    },
    staleTime: 5 * 60 * 1000,
    enabled: !!ownerId
  });

  return (
    <div className="flex flex-col h-full space-y-6">
      <div>
        <h2 className="text-2xl font-black tracking-tight">Announcements</h2>
        <p className="text-sm text-muted-foreground mt-1 font-medium">
          Send targeted messages to your driver segments
        </p>
      </div>

      {/* Mobile Tab Switcher */}
      <div className="flex bg-muted/30 p-1.5 rounded-2xl lg:hidden border border-border/40">
        <button
          onClick={() => setActiveTab('compose')}
          className={cn(
            'flex-1 py-2 text-sm font-bold rounded-xl transition-all duration-200 flex items-center justify-center gap-2',
            activeTab === 'compose'
              ? 'bg-white dark:bg-muted shadow-sm text-primary'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M2 7h10M7 2v10" strokeLinecap="round"/>
          </svg>
          Compose
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={cn(
            'flex-1 py-2 text-sm font-bold rounded-xl transition-all duration-200 flex items-center justify-center gap-2',
            activeTab === 'history'
              ? 'bg-white dark:bg-muted shadow-sm text-primary'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M2 4h10v6a1 1 0 01-1 1H3a1 1 0 01-1-1V4z" strokeLinecap="round"/>
            <path d="M2 4l5 4 5-4" strokeLinecap="round"/>
          </svg>
          History
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-6 flex-1 min-h-0">
        {/* Left: Compose panel */}
        <div className={cn(
          "rounded-2xl border border-border/60 bg-white/50 dark:bg-black/20 p-5 flex flex-col min-h-0 glass-card transition-all",
          activeTab !== 'compose' && "hidden lg:flex"
        )}>
          {stationsLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-8 w-1/3" />
              <Skeleton className="h-[200px] w-full" />
              <Skeleton className="h-[100px] w-full" />
              <Skeleton className="h-12 w-full mt-auto" />
            </div>
          ) : (
            <AnnouncementComposer
              ownerStations={ownerStations ?? []}
              db={db}
              ownerId={ownerId}
              onSent={() => {
                setHistoryRefreshKey(k => k + 1);
                // On mobile, switch to history tab after sending
                if (window.innerWidth < 1024) setActiveTab('history');
              }}
            />
          )}
        </div>

        {/* Right: History panel */}
        <div className={cn(
          "rounded-2xl border border-border/60 bg-white/50 dark:bg-black/20 p-5 flex flex-col min-h-0 glass-card transition-all",
          activeTab !== 'history' && "hidden lg:flex"
        )}>
          <AnnouncementHistory
            ownerId={ownerId}
            db={db}
            refreshKey={historyRefreshKey}
          />
        </div>
      </div>

      {/* ACCEPTANCE TESTS
      // Test 1 — Compose and send all_recent:
      // Fill title='Diwali offer!', body='20% off all sessions this week'
      // Select segment='all_recent', all stations
      // Expected: AudiencePreview shows driver count within 600ms of station/segment select
      // Click 'Send now': addDoc to announcements collection
      // Document has: status='sent', sentAt=now, targetUserIds=[...], audienceCount=count
      // Success message: 'Sent to X drivers'
      // Form resets after 2s. historyRefreshKey increments. History panel shows new entry.

      // Test 2 — Segment with 0 results:
      // Select 'upcoming_bookings' for a station with no future bookings
      // Expected: AudiencePreview shows 0, green callout changes to muted
      // 'No drivers match...' message visible
      // Send button disabled, validation error: 'No drivers match the selected segment'

      // Test 3 — Audience capping at 500:
      // Mock computeTargetUserIds to return rawCount=850, userIds=[500 items]
      // Expected: AudiencePreview shows amber box: '850 drivers match — sending to first 500 only'
      // Validation: warning (not error) — 'Audience capped at 500. 500 drivers will receive this.'
      // Send button enabled. Document written with targetUserIds.length=500.

      // Test 4 — Schedule announcement:
      // Fill valid form, click 'Schedule'
      // Expected: schedule dialog opens with datetime-local input
      // Select tomorrow at 10am, click 'Schedule' in dialog
      // Expected: addDoc with status='scheduled', scheduledAt=tomorrow 10am
      // History shows new entry with 'Scheduled' badge and 'Scheduled for: ...' in expanded view

      // Test 5 — Archive from history:
      // Click 'Delete' on a sent announcement in the history panel
      // Expected: updateDoc sets status='archived'
      // refetch() called: archived announcement disappears from list
      // AnimatePresence exit animation plays (height collapse)

      // Test 6 — Read rate display:
      // Announcement: audienceCount=50, readBy=['uid1','uid2','uid3'] (3 reads)
      // Expected: '👁 3/50 (6%) read' shown in history card metrics row
      // Clicking expand shows full body text

      // Test 7 — Mobile tab layout:
      // Viewport < 1024px (lg breakpoint)
      // Expected: two-column grid hidden, tab bar visible
      // 'Compose' tab active by default
      // Click 'History' tab: composer hidden, history panel shown
      // (verify with CSS media query or Tailwind responsive class)

      // Test 8 — Loyalty gold_plus two-step join:
      // users collection: user A has loyaltyTier='gold', user B has loyaltyTier='silver'
      // Only user A has a booking at owner's station
      // Expected: targetUserIds = ['userA'] only
      // user B excluded (silver tier)
      // A hypothetical user C (gold) who charged at a DIFFERENT owner's station also excluded

      // Test 9 — Firestore 'in' batch limit:
      // Owner has 35 stations
      // Expected: stationBatches = [[30 ids], [5 ids]]
      // Two separate Firestore queries executed sequentially
      // Results merged via Set (no duplicates)
      // Total audience count reflects all 35 stations

      // Test 10 — Driver app query compatibility:
      // After sending announcement with targetUserIds=['uid123','uid456']
      // Driver app query: where('targetUserIds','array-contains','uid123') + where('status','==','sent')
      // Expected: announcement appears in driver's notification list
      // Driver who is NOT in targetUserIds: announcement does NOT appear
      // Verify: no composite index required for this query combination
      */}
    </div>
  );
}
