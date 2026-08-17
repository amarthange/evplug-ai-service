import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { useEffect, useRef } from 'react';
import { 
  type StationWithWindows, 
  type SchedulerTicket,
  isWindowOverdue,
  activateWindow,
  deactivateWindow
} from '@/lib/maintenance-scheduler';

interface SchedulerMountProps {
  stations: StationWithWindows[];
}

/**
 * Headless component that manages the lifecycle of maintenance windows.
 */
export default function SchedulerMount({ stations }: SchedulerMountProps) {
  const { user } = useAuth();
  const ticketsRef = useRef<SchedulerTicket[]>([]);

  // Simple console-based audit logger
  const auditLogger = (event: string, meta: Record<string, any>) => {
    console.info(`[SeniorDevOps Audit] ${event}`, meta);
  };

  useEffect(() => {
    // Clear all existing timeouts
    ticketsRef.current.forEach(t => clearTimeout(t.timeoutHandle));
    ticketsRef.current = [];

    const now = Date.now();
    const TWENTY_FOUR_HOURS = 24 * 3600 * 1000;

    stations.forEach(station => {
      station.maintenanceWindows.forEach(window => {
        
        // 1. Handle overdue windows
        if (isWindowOverdue(window)) {
          console.info('[SeniorDevOps Scheduler] Overdue window found, activating immediately:', window.id);
          activateWindow(window, station, db, auditLogger);
          return;
        }

        if (window.status !== 'scheduled') return;

        const msUntilStart = window.scheduledStart.getTime() - now;
        const msUntilEnd = window.scheduledEnd.getTime() - now;

        // 2. Schedule start (only if within 24h)
        if (msUntilStart > 0 && msUntilStart < TWENTY_FOUR_HOURS) {
          const handle = setTimeout(() => {
            activateWindow(window, station, db, auditLogger);
          }, msUntilStart);

          ticketsRef.current.push({
            windowId: window.id,
            stationId: station.stationId,
            type: 'start',
            scheduledAt: window.scheduledStart.getTime(),
            timeoutHandle: handle
          });

          console.info('[SeniorDevOps Scheduler] Start scheduled in', Math.round(msUntilStart / 60000), 'min for window', window.id);
        }

        // 3. Schedule end
        if (msUntilEnd > 0) {
          const handle = setTimeout(() => {
            deactivateWindow(window, station, db, auditLogger);
          }, msUntilEnd);

          ticketsRef.current.push({
            windowId: window.id,
            stationId: station.stationId,
            type: 'end',
            scheduledAt: window.scheduledEnd.getTime(),
            timeoutHandle: handle
          });
        }
      });
    });

    return () => {
      ticketsRef.current.forEach(t => clearTimeout(t.timeoutHandle));
      ticketsRef.current = [];
    };
  }, [stations, user]);

  return null;
}
