// ANNOUNCEMENTS — announcement-engine
/**
 * REQUIRED FIRESTORE INDEXES:
 * 1. announcements: ownerId ASC + status ASC
 * 2. bookings: stationId ASC + status ASC + startTime ASC (for all_recent segment)
 * 
 * Without these indexes, targeting queries will fail with a Firebase error URL.
 */

export type TargetSegment =
  | 'all_recent'         // completed sessions in last 30 days
  | 'upcoming_bookings'  // pending/confirmed sessions in future
  | 'loyalty_gold_plus'  // users with loyaltyTier 'gold' or 'platinum'
  | 'all_time';          // all completed sessions ever

export type AnnouncementStatus =
  | 'draft'
  | 'sent'
  | 'scheduled'
  | 'archived';

export interface Announcement {
  id: string;
  ownerId: string;
  stationIds: string[];
  title: string;
  body: string;
  targetSegment: TargetSegment;
  targetUserIds: string[];
  status: AnnouncementStatus;
  scheduledAt: Date | null;
  sentAt: Date | null;
  createdAt: Date;
  readBy: string[];
  audienceCount: number;
  segmentLabel: string;
}

export interface TargetingResult {
  userIds: string[];        // max 500
  rawCount: number;         // total found before cap
  wasCapped: boolean;       // true if rawCount > 500
  queryDescription: string; // human-readable description of what was queried
}

export interface AudiencePreviewResult {
  estimatedCount: number;
  wasCapped: boolean;
  rawCount: number;
  isLoading: boolean;
  error: string | null;
  queriedAt: Date | null;
}

export const SEGMENT_CONFIG: Record<TargetSegment, {
  label: string;
  description: string;
  icon: string;
  useCase: string;
}> = {
  all_recent: {
    label: 'Recent visitors',
    description: 'Drivers who completed a session at your stations in the last 30 days',
    icon: '🕐',
    useCase: 'Promotions, new features, general updates'
  },
  upcoming_bookings: {
    label: 'Upcoming bookings',
    description: 'Drivers with confirmed or pending bookings at your stations',
    icon: '📅',
    useCase: 'Maintenance alerts, schedule changes, urgent notices'
  },
  loyalty_gold_plus: {
    label: 'Gold & Platinum members',
    description: 'High-loyalty drivers who have charged at your stations',
    icon: '⭐',
    useCase: 'Exclusive offers, early access, loyalty rewards'
  },
  all_time: {
    label: 'All drivers (ever)',
    description: 'Every driver who has ever completed a session at your stations',
    icon: '📢',
    useCase: 'Major announcements, station reopening, new connector types'
  }
};

/**
 * Computes the target user IDs for a given segment and stations.
 * 
 * @param db Firestore instance (passed as unknown to avoid direct import dependency)
 * @param segment The driver segment to target
 * @param stationIds The list of station IDs to filter by
 * @param maxUsers Maximum number of users to return (default 500)
 * 
 * Implementation Notes:
 * - Handles the 30-item 'in' operator limit by batching stationIds.
 * - Uses a Set<string> to automatically deduplicate user IDs across bookings.
 * - For loyalty_gold_plus, performs a manual intersection (two-step join) since Firestore doesn't support joins.
 * - Enforces the 500-user cap before returning to stay within Spark plan constraints and notification limits.
 */
export async function computeTargetUserIds(
  db: unknown,
  segment: TargetSegment,
  stationIds: string[],
  maxUsers: number = 500
): Promise<TargetingResult> {
  const { collection, query, where, getDocs, Timestamp } = await import('firebase/firestore');
  const fdb = db as import('firebase/firestore').Firestore;

  if (stationIds.length === 0) {
    return {
      userIds: [],
      rawCount: 0,
      wasCapped: false,
      queryDescription: 'No stations selected'
    };
  }

  // Firestore 'in' operator supports max 30 values per query
  const FIRESTORE_IN_LIMIT = 30;
  const stationBatches: string[][] = [];
  for (let i = 0; i < stationIds.length; i += FIRESTORE_IN_LIMIT) {
    stationBatches.push(stationIds.slice(i, i + FIRESTORE_IN_LIMIT));
  }

  const allUserIds = new Set<string>();

  try {
    if (segment === 'all_recent') {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000);
      for (const batch of stationBatches) {
        const q = query(
          collection(fdb, 'bookings'),
          where('stationId', 'in', batch),
          where('status', '==', 'completed'),
          where('startTime', '>=', Timestamp.fromDate(thirtyDaysAgo))
        );
        const snap = await getDocs(q);
        snap.docs.forEach(d => {
          const uid = d.data().userId as string;
          if (uid) allUserIds.add(uid);
        });
      }

    } else if (segment === 'upcoming_bookings') {
      const now = Timestamp.fromDate(new Date());
      for (const batch of stationBatches) {
        const q = query(
          collection(fdb, 'bookings'),
          where('stationId', 'in', batch),
          where('status', 'in', ['pending', 'confirmed']),
          where('startTime', '>=', now)
        );
        const snap = await getDocs(q);
        snap.docs.forEach(d => {
          const uid = d.data().userId as string;
          if (uid) allUserIds.add(uid);
        });
      }

    } else if (segment === 'loyalty_gold_plus') {
      // Step 1: Get all gold/platinum users
      const usersSnap = await getDocs(query(
        collection(fdb, 'users'),
        where('loyaltyTier', 'in', ['gold', 'platinum'])
      ));
      const goldUserIds = new Set(
        usersSnap.docs.map(d => d.id).filter(Boolean)
      );

      // Step 2: Filter to those who have a completed booking at owner's stations
      for (const batch of stationBatches) {
        const q = query(
          collection(fdb, 'bookings'),
          where('stationId', 'in', batch),
          where('status', '==', 'completed')
        );
        const snap = await getDocs(q);
        snap.docs.forEach(d => {
          const uid = d.data().userId as string;
          if (uid && goldUserIds.has(uid)) allUserIds.add(uid);
        });
      }

    } else if (segment === 'all_time') {
      for (const batch of stationBatches) {
        const q = query(
          collection(fdb, 'bookings'),
          where('stationId', 'in', batch),
          where('status', '==', 'completed')
        );
        const snap = await getDocs(q);
        snap.docs.forEach(d => {
          const uid = d.data().userId as string;
          if (uid) allUserIds.add(uid);
        });
      }
    }

  } catch (err: unknown) {
    console.error('[SeniorDevOps Announcements] Targeting query failed:', err);
    throw err;
  }

  const rawCount = allUserIds.size;
  const allUserIdArray = Array.from(allUserIds);
  const wasCapped = rawCount > maxUsers;

  return {
    userIds: wasCapped ? allUserIdArray.slice(0, maxUsers) : allUserIdArray,
    rawCount,
    wasCapped,
    queryDescription: SEGMENT_CONFIG[segment].description
  };
}

export function parseAnnouncement(
  id: string,
  data: Record<string, unknown>
): Announcement {
  const toDate = (ts: unknown): Date | null => {
    if (!ts) return null;
    if (ts instanceof Date) return ts;
    if (typeof (ts as any).toDate === 'function') return (ts as any).toDate();
    return null;
  };

  return {
    id,
    ownerId: data.ownerId as string ?? '',
    stationIds: (data.stationIds as string[]) ?? [],
    title: data.title as string ?? '',
    body: data.body as string ?? '',
    targetSegment: data.targetSegment as TargetSegment ?? 'all_recent',
    targetUserIds: (data.targetUserIds as string[]) ?? [],
    status: data.status as AnnouncementStatus ?? 'draft',
    scheduledAt: toDate(data.scheduledAt),
    sentAt: toDate(data.sentAt),
    createdAt: toDate(data.createdAt) ?? new Date(),
    readBy: (data.readBy as string[]) ?? [],
    audienceCount: data.audienceCount as number ?? 0,
    segmentLabel: data.segmentLabel as string ?? ''
  };
}

export function formatReadRate(readBy: number, audienceCount: number): string {
  if (audienceCount === 0) return '—';
  const pct = Math.round((readBy / audienceCount) * 100);
  return `${readBy}/${audienceCount} (${pct}%)`;
}

export function formatSentTime(date: Date | null): string {
  if (!date) return 'Not sent';
  const diffMs = Date.now() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export interface AnnouncementValidation {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateAnnouncement(
  title: string,
  body: string,
  stationIds: string[],
  targetUserIds: string[],
  wasCapped: boolean
): AnnouncementValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!title.trim()) errors.push('Title is required');
  if (title.length > 60) errors.push('Title must be 60 characters or less');
  if (!body.trim()) errors.push('Body is required');
  if (body.length > 280) errors.push('Body must be 280 characters or less');
  if (stationIds.length === 0) errors.push('Select at least one station');
  if (targetUserIds.length === 0) errors.push('No drivers match the selected segment and stations');
  if (wasCapped) warnings.push(`Audience capped at 500. ${targetUserIds.length} drivers will receive this.`);

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}
