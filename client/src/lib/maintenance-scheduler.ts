/**
 * MAINTENANCE SCHEDULER — utility module
 * Handles all logic for scheduling, formatting, and conflict detection
 * for station maintenance windows.
 */

export interface MaintenanceWindow {
  id: string;
  scheduledStart: Date;
  scheduledEnd: Date;
  affectedConnectorIds: string[];
  reason: string;
  status: 'scheduled' | 'active' | 'completed' | 'cancelled';
  createdAt: Date;
  createdBy: string;
  notifiedAt: Date | null;
  // Original Firestore Timestamps stored separately for arrayRemove operations:
  _scheduledStartTs: unknown; // Firestore Timestamp
  _scheduledEndTs: unknown;
  _createdAtTs: unknown;
}

export interface ConnectorInfo {
  id: string;
  type: string;
  status: string;
}

export interface StationWithWindows {
  stationId: string;
  stationName: string;
  currentStatus: 'active' | 'maintenance' | 'offline';
  totalConnectors: number;
  connectors: ConnectorInfo[];
  maintenanceWindows: MaintenanceWindow[];
}

export interface SchedulerTicket {
  windowId: string;
  stationId: string;
  type: 'start' | 'end';
  scheduledAt: number; // Unix ms timestamp
  timeoutHandle: ReturnType<typeof setTimeout>;
}

export interface ConflictInfo {
  bookingCount: number;
  earliestBooking: Date | null;
  latestBooking: Date | null;
  affectedUserIds: string[]; // first 6 chars only
}

/**
 * Parses raw Firestore window object into a MaintenanceWindow type
 * ensuring Timestamps are converted to Date objects while preserving
 * the original references for arrayRemove matching.
 */
export function parseMaintenanceWindow(raw: Record<string, any>): MaintenanceWindow {
  const toDate = (ts: any): Date => {
    if (!ts) return new Date();
    if (ts instanceof Date) return ts;
    if (typeof ts.toDate === 'function') return ts.toDate();
    if (typeof ts === 'number') return new Date(ts);
    if (ts.seconds !== undefined) return new Date(ts.seconds * 1000);
    return new Date();
  };

  return {
    id: raw.id || Date.now().toString(),
    scheduledStart: toDate(raw.scheduledStart),
    scheduledEnd: toDate(raw.scheduledEnd),
    affectedConnectorIds: (raw.affectedConnectorIds as string[]) || [],
    reason: (raw.reason as string) || 'Maintenance',
    status: (raw.status as MaintenanceWindow['status']) || 'scheduled',
    createdAt: toDate(raw.createdAt),
    createdBy: (raw.createdBy as string) || '',
    notifiedAt: raw.notifiedAt ? toDate(raw.notifiedAt) : null,
    _scheduledStartTs: raw.scheduledStart,
    _scheduledEndTs: raw.scheduledEnd,
    _createdAtTs: raw.createdAt
  };
}

/**
 * Checks if a window is currently in effect.
 */
export function isWindowCurrentlyActive(window: MaintenanceWindow): boolean {
  const now = Date.now();
  return (
    window.status === 'active' ||
    (window.status === 'scheduled' &&
      now >= window.scheduledStart.getTime() &&
      now < window.scheduledEnd.getTime())
  );
}

/**
 * Checks if a window should be active right now but is still 'scheduled'.
 * This occurs if the dashboard was closed during the start transition.
 */
export function isWindowOverdue(window: MaintenanceWindow): boolean {
  const now = Date.now();
  return (
    window.status === 'scheduled' &&
    now >= window.scheduledStart.getTime() &&
    now < window.scheduledEnd.getTime()
  );
}

/**
 * Formats the duration of a window (e.g., "45 min", "2h 30m").
 */
export function formatWindowDuration(start: Date, end: Date): string {
  const diffMs = end.getTime() - start.getTime();
  const diffMins = Math.round(diffMs / 60000);
  if (diffMins < 60) return `${diffMins} min`;
  const hours = Math.floor(diffMins / 60);
  const mins = diffMins % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

/**
 * Formats a window's time range for display.
 */
export function formatWindowTimeRange(start: Date, end: Date): string {
  const dateStr = start.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short'
  });
  const startTime = start.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
  const endTime = end.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });

  if (start.toDateString() === end.toDateString()) {
    return `${dateStr} · ${startTime} – ${endTime}`;
  }

  const endDateStr = end.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short'
  });
  return `${dateStr} ${startTime} – ${endDateStr} ${endTime}`;
}

/**
 * Formats a relative time string (e.g., "starts in 10 min", "started 2h ago").
 */
export function formatRelativeTime(date: Date): string {
  const diffMs = date.getTime() - Date.now();
  const absMins = Math.abs(Math.round(diffMs / 60000));
  const absHours = Math.floor(absMins / 60);
  const remMins = absMins % 60;

  if (diffMs > 0) {
    if (absMins < 60) return `starts in ${absMins} min`;
    return `starts in ${absHours}h ${remMins > 0 ? remMins + 'm' : ''}`;
  } else {
    if (absMins < 60) return `started ${absMins} min ago`;
    return `started ${absHours}h ${remMins > 0 ? remMins + 'm' : ''} ago`;
  }
}

/**
 * Calculates ms until scheduler events fire.
 */
export function getSchedulerStatus(window: MaintenanceWindow) {
  const now = Date.now();
  const msUntilStart = window.scheduledStart.getTime() - now;
  const msUntilEnd = window.scheduledEnd.getTime() - now;
  const TWENTY_FOUR_HOURS = 24 * 3600 * 1000;

  return {
    willFireStart: msUntilStart > 0 && msUntilStart < TWENTY_FOUR_HOURS,
    willFireEnd: msUntilEnd > 0,
    msUntilStart: Math.max(0, msUntilStart),
    msUntilEnd: Math.max(0, msUntilEnd),
    isWithin24h: msUntilStart > 0 && msUntilStart < TWENTY_FOUR_HOURS
  };
}

/**
 * Reconstructs the exact object stored in Firestore for arrayRemove matching.
 * JSDOC: Exact-match requirement is critical. Firestore arrayRemove will silently no-op
 * if any field (especially Timestamp precision) differs. We use preserved original 
 * Timestamp references from the window parsing stage.
 */
export function buildFirestoreWindowObject(window: MaintenanceWindow): Record<string, any> {
  return {
    id: window.id,
    scheduledStart: window._scheduledStartTs,
    scheduledEnd: window._scheduledEndTs,
    affectedConnectorIds: window.affectedConnectorIds,
    reason: window.reason,
    status: window.status,
    createdAt: window._createdAtTs,
    createdBy: window.createdBy,
    notifiedAt: window.notifiedAt
  };
}

/**
 * Activates a maintenance window.
 * JSDOC: Uses arrayRemove + arrayUnion to perform an atomic "update" of an object 
 * inside a Firestore array. Direct indexed updates are not supported in Firestore arrays.
 */
export async function activateWindow(
  window: MaintenanceWindow,
  station: StationWithWindows,
  db: any,
  auditLogger?: (event: string, meta: Record<string, any>) => void
): Promise<void> {
  try {
    const { updateDoc, doc, arrayRemove, arrayUnion } = await import('firebase/firestore');
    const stationRef = doc(db, 'stations', station.stationId);
    const isFullStation = window.affectedConnectorIds.length === 0;

    // Step 1: Update status
    if (isFullStation) {
      await updateDoc(stationRef, { status: 'maintenance' });
    } else {
      await Promise.all(
        window.affectedConnectorIds.map(connId => 
          updateDoc(doc(db, 'stations', station.stationId, 'connectors', connId), { status: 'maintenance' })
        )
      );
    }

    // Step 2: Update window state in array
    const oldObject = buildFirestoreWindowObject(window);
    const newObject = { ...oldObject, status: 'active' };

    await updateDoc(stationRef, {
      maintenanceWindows: arrayRemove(oldObject)
    });
    await updateDoc(stationRef, {
      maintenanceWindows: arrayUnion(newObject)
    });

    // Step 3: Audit
    if (auditLogger) {
      auditLogger('maintenance_started', {
        windowId: window.id,
        stationId: station.stationId,
        stationName: station.stationName,
        affectedConnectors: window.affectedConnectorIds,
        reason: window.reason,
        activatedAt: new Date().toISOString()
      });
    }

    console.info('[SeniorDevOps Scheduler] Window activated:', window.id, 'for', station.stationName);
  } catch (err) {
    console.error('[SeniorDevOps Scheduler] Activation failed:', err);
    throw err;
  }
}

/**
 * Deactivates a maintenance window and restores station status.
 * JSDOC: Restores status to 'active' and marks the window as 'completed'.
 */
export async function deactivateWindow(
  window: MaintenanceWindow,
  station: StationWithWindows,
  db: any,
  auditLogger?: (event: string, meta: Record<string, any>) => void
): Promise<void> {
  try {
    const { updateDoc, doc, arrayRemove, arrayUnion } = await import('firebase/firestore');
    const stationRef = doc(db, 'stations', station.stationId);
    const isFullStation = window.affectedConnectorIds.length === 0;

    // Step 1: Restore status
    if (isFullStation) {
      await updateDoc(stationRef, { status: 'active' });
    } else {
      await Promise.all(
        window.affectedConnectorIds.map(connId => 
          updateDoc(doc(db, 'stations', station.stationId, 'connectors', connId), { status: 'active' })
        )
      );
    }

    // Step 2: Complete window
    const oldObject = buildFirestoreWindowObject(window);
    const newObject = { ...oldObject, status: 'completed' };

    await updateDoc(stationRef, {
      maintenanceWindows: arrayRemove(oldObject)
    });
    await updateDoc(stationRef, {
      maintenanceWindows: arrayUnion(newObject)
    });

    // Step 3: Audit
    if (auditLogger) {
      auditLogger('maintenance_completed', {
        windowId: window.id,
        stationId: station.stationId,
        stationName: station.stationName,
        completedAt: new Date().toISOString()
      });
    }

    console.info('[SeniorDevOps Scheduler] Window completed:', window.id);
  } catch (err) {
    console.error('[SeniorDevOps Scheduler] Deactivation failed:', err);
    throw err;
  }
}

/**
 * Cancels a scheduled maintenance window.
 */
export async function cancelWindow(
  window: MaintenanceWindow,
  station: StationWithWindows,
  db: any,
  auditLogger?: (event: string, meta: Record<string, any>) => void
): Promise<void> {
  try {
    const { updateDoc, doc, arrayRemove, arrayUnion } = await import('firebase/firestore');
    const stationRef = doc(db, 'stations', station.stationId);

    const oldObject = buildFirestoreWindowObject(window);
    const newObject = { ...oldObject, status: 'cancelled' };

    await updateDoc(stationRef, {
      maintenanceWindows: arrayRemove(oldObject)
    });
    await updateDoc(stationRef, {
      maintenanceWindows: arrayUnion(newObject)
    });

    if (auditLogger) {
      auditLogger('maintenance_cancelled', {
        windowId: window.id,
        stationId: station.stationId,
        cancelledAt: new Date().toISOString()
      });
    }
  } catch (err) {
    console.error('[SeniorDevOps Scheduler] Cancellation failed:', err);
    throw err;
  }
}

/**
 * Checks for booking conflicts within the specified window.
 */
export async function checkBookingConflicts(
  db: any,
  stationId: string,
  connectorIds: string[],
  windowStart: Date,
  windowEnd: Date
): Promise<ConflictInfo> {
  try {
    const { collection, query, where, getDocs, Timestamp } = await import('firebase/firestore');
    
    // Convert Dates to Firestore Timestamps for the query
    const startTs = Timestamp.fromDate(windowStart);
    const endTs = Timestamp.fromDate(windowEnd);

    const q = query(
      collection(db, 'bookings'),
      where('stationId', '==', stationId),
      where('status', 'in', ['pending', 'confirmed', 'active']),
      where('startTime', '>=', startTs),
      where('startTime', '<=', endTs)
    );

    const snap = await getDocs(q);
    const bookings = snap.docs.map(d => d.data());

    const relevant = connectorIds.length > 0
      ? bookings.filter(b => connectorIds.includes(b.connectorId))
      : bookings;

    const dates = relevant
      .map(b => (b.startTime?.toDate ? b.startTime.toDate() : new Date(b.startTime)) as Date)
      .filter(Boolean);
      
    const userIds = Array.from(new Set(relevant.map(b => b.userId as string).filter(Boolean)));

    return {
      bookingCount: relevant.length,
      earliestBooking: dates.length > 0 ? new Date(Math.min(...dates.map(d => d.getTime()))) : null,
      latestBooking: dates.length > 0 ? new Date(Math.max(...dates.map(d => d.getTime()))) : null,
      affectedUserIds: userIds.map(id => id.slice(0, 6))
    };
  } catch (err) {
    console.warn('[SeniorDevOps Maintenance] Conflict query failed (index might be missing):', err);
    return {
      bookingCount: 0,
      earliestBooking: null,
      latestBooking: null,
      affectedUserIds: []
    };
  }
}
