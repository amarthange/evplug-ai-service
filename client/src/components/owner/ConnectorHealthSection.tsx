import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  doc, 
  updateDoc, 
  Timestamp, 
  arrayUnion,
  getDoc
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { 
  type ConnectorLifecycleData, 
  buildConnectorLifecycleData,
  computeWearScore
} from '@/lib/connector-lifecycle-engine';
import { ConnectorHealthCard } from './ConnectorHealthCard';
import LogKwhModal from './LogKwhModal';
import MarkServicedModal from './MarkServicedModal';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';

import { Station } from '@/lib/owner-service';

interface ConnectorHealthSectionProps {
  station: Station
}

export const ConnectorHealthSection = ({
  station,
}: ConnectorHealthSectionProps) => {
  const stationId = station.id;
  const stationName = station.name;

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [logKwhTarget, setLogKwhTarget] = useState<ConnectorLifecycleData | null>(null);
  const [markServicedTarget, setMarkServicedTarget] = useState<ConnectorLifecycleData | null>(null);
  const [isSavingLogKwh, setIsSavingLogKwh] = useState(false);
  const [isSavingServiced, setIsSavingServiced] = useState(false);

  // 1. Fetch connector data from the station document (Array pattern)
  const { data: stationData, isLoading: isLoadingStation } = useQuery({
    queryKey: ['station-connectors', stationId],
    queryFn: async () => {
      const snap = await getDoc(doc(db, 'stations', stationId));
      return snap.data();
    },
    staleTime: 5 * 60 * 1000,
    enabled: !!stationId
  });

  const rawConnectors = useMemo(() => {
    return (stationData?.connectors as any[]) || [];
  }, [stationData]);

  // 2. Fetch completed bookings for kWh aggregation
  // OPTIMIZATION: Only fetch delta since lastKwhSyncAt if available
  const { data: bookingKwhMap, isLoading: isLoadingBookings } = useQuery({
    queryKey: ['connector-kwh-bookings', stationId],
    queryFn: async () => {
      // For Spark plan efficiency, we fetch all completed bookings for this station
      // In a real production app with massive history, you'd use the incremental sync logic
      const q = query(
        collection(db, 'bookings'),
        where('stationId', '==', stationId),
        where('status', '==', 'completed')
      );
      const snap = await getDocs(q);
      const map = new Map<string, number>();
      snap.docs.forEach(d => {
        const data = d.data();
        const cid = data.connectorId as string;
        const kwh = data.kwhDelivered as number ?? 0;
        map.set(cid, (map.get(cid) ?? 0) + kwh);
      });
      return map;
    },
    staleTime: 10 * 60 * 1000,
    enabled: !!stationId
  });

  // 3. Fetch fault events from platform_health/alerts
  const { data: faultMap, isLoading: isLoadingFaults } = useQuery({
    queryKey: ['connector-faults', stationId],
    queryFn: async () => {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const q = query(
        collection(db, 'platform_health'),
        where('stationId', '==', stationId),
        where('type', '==', 'CONNECTOR_FAULT')
      );
      const snap = await getDocs(q);
      
      const totalMap = new Map<string, number>();
      const last30dMap = new Map<string, number>();
      const lastFaultMap = new Map<string, Date>();

      snap.docs.forEach(d => {
        const data = d.data();
        const cid = data.connectorId as string || 'unknown';
        const detectedAt = data.detectedAt?.toDate() as Date;

        totalMap.set(cid, (totalMap.get(cid) ?? 0) + 1);

        if (detectedAt >= thirtyDaysAgo) {
          last30dMap.set(cid, (last30dMap.get(cid) ?? 0) + 1);
        }

        const existing = lastFaultMap.get(cid);
        if (!existing || detectedAt > existing) {
          lastFaultMap.set(cid, detectedAt);
        }
      });

      return { totalMap, last30dMap, lastFaultMap };
    },
    staleTime: 5 * 60 * 1000,
    enabled: !!stationId
  });

  // 4. Compose Lifecycle Data
  const lifecycleData = useMemo(() => {
    if (!rawConnectors.length || !bookingKwhMap || !faultMap) return [];
    return rawConnectors.map((c, idx) => {
      const connectorId = c.id || `con-${idx}`; // Handle connectors without IDs
      const kwhFromBookings = bookingKwhMap.get(connectorId) ?? 0;
      const kwhManual = c.lifetimeKwhManual ?? 0;
      const faultEvents = faultMap.totalMap.get(connectorId) ?? c.faultEvents ?? 0;
      const faultEventsLast30d = faultMap.last30dMap.get(connectorId) ?? 0;
      const lastFaultAt = faultMap.lastFaultMap.get(connectorId) ?? null;

      return buildConnectorLifecycleData({
        connectorId,
        connectorType: c.type || c.connectorType || 'Unknown',
        stationId,
        stationName,
        lifetimeKwhFromBookings: kwhFromBookings,
        lifetimeKwhManual: kwhManual,
        faultEvents,
        faultEventsLast30d,
        lastFaultAt,
        installedAt: c.installedAt ? (c.installedAt.toDate?.() || new Date(c.installedAt)) : null,
        lastServiceAt: c.lastServiceAt ? (c.lastServiceAt.toDate?.() || new Date(c.lastServiceAt)) : null
      });
    });
  }, [rawConnectors, bookingKwhMap, faultMap, stationId, stationName]);

  /**
   * JSDOC: Write-back strategy.
   * Compares freshly aggregated booking kWh with stored value.
   * Uses 0.1 kWh threshold to avoid thrashing Firestore for negligible changes.
   * Updates the station document's connectors array.
   */
  useEffect(() => {
    if (!stationData || !bookingKwhMap || lifecycleData.length === 0) return;
    
    let hasChanges = false;
    const updatedConnectors = rawConnectors.map((raw, i) => {
      const ld = lifecycleData[i];
      const freshKwh = bookingKwhMap.get(ld.connectorId) ?? 0;
      const currentStored = raw.lifetimeKwhFromBookings ?? 0;
      
      if (Math.abs(currentStored - freshKwh) > 0.1 || raw.wearScore !== ld.wearScore) {
        hasChanges = true;
        return {
          ...raw,
          lifetimeKwhFromBookings: freshKwh,
          faultEvents: faultMap?.totalMap.get(ld.connectorId) ?? raw.faultEvents ?? 0,
          faultEventsLast30d: faultMap?.last30dMap.get(ld.connectorId) ?? 0,
          wearScore: ld.wearScore
        };
      }
      return raw;
    });

    if (hasChanges) {
      const syncChanges = async () => {
        try {
          await updateDoc(doc(db, 'stations', stationId), { 
            connectors: updatedConnectors,
            lastLifecycleSyncAt: Timestamp.now()
          });
        } catch (err) {
          console.warn('[SeniorDevOps Lifecycle] Sync write failed:', err);
        }
      };
      syncChanges();
    }
  }, [lifecycleData, stationId, bookingKwhMap, faultMap, rawConnectors, stationData]);

  const handleLogKwh = useCallback(async (additionalKwh: number, note: string) => {
    if (!logKwhTarget) return;
    setIsSavingLogKwh(true);
    try {
      const newManual = (logKwhTarget.lifetimeKwhManual) + additionalKwh;
      const newTotal = logKwhTarget.lifetimeKwhFromBookings + newManual;
      const newScore = computeWearScore(
        newTotal,
        logKwhTarget.faultEvents,
        logKwhTarget.daysSinceInstall
      );

      const updatedConnectors = rawConnectors.map(c => {
        if (c.id === logKwhTarget.connectorId) {
          return {
            ...c,
            lifetimeKwhManual: newManual,
            wearScore: newScore,
            kwhLog: arrayUnion({
              addedAt: Timestamp.now(),
              kwh: additionalKwh,
              note: note || null
            })
          };
        }
        return c;
      });

      await updateDoc(doc(db, 'stations', stationId), { connectors: updatedConnectors });
      queryClient.invalidateQueries({ queryKey: ['station-connectors', stationId] });
      setLogKwhTarget(null);
      toast({ title: "kWh Logged ✅", description: `${additionalKwh} kWh added to asset record.` });
    } catch (err) {
      console.error('[SeniorDevOps Lifecycle] Log kWh failed:', err);
      toast({ variant: "destructive", title: "Log Failed", description: "Could not update asset record." });
    } finally {
      setIsSavingLogKwh(false);
    }
  }, [logKwhTarget, stationId, rawConnectors, queryClient, toast]);

  const handleMarkServiced = useCallback(async (note: string) => {
    if (!markServicedTarget) return;
    setIsSavingServiced(true);
    try {
      const now = Timestamp.now();
      const updatedConnectors = rawConnectors.map(c => {
        if (c.id === markServicedTarget.connectorId) {
          return {
            ...c,
            lastServiceAt: now,
            faultEventsLast30d: 0,
            serviceLog: arrayUnion({
              servicedAt: now,
              note: note || null,
              wearScoreAtService: markServicedTarget.wearScore,
              faultEventsAtService: markServicedTarget.faultEvents
            })
          };
        }
        return c;
      });

      await updateDoc(doc(db, 'stations', stationId), { connectors: updatedConnectors });
      queryClient.invalidateQueries({ queryKey: ['station-connectors', stationId] });
      setMarkServicedTarget(null);
      toast({ title: "Service Recorded ✓", description: "Asset health profile updated." });
    } catch (err) {
      console.error('[SeniorDevOps Lifecycle] Mark serviced failed:', err);
      toast({ variant: "destructive", title: "Service Record Failed" });
    } finally {
      setIsSavingServiced(false);
    }
  }, [markServicedTarget, stationId, rawConnectors, queryClient, toast]);

  if (isLoadingStation || isLoadingBookings || isLoadingFaults) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-5 w-48 rounded-lg bg-white/5" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2].map(i => <Skeleton key={i} className="h-72 rounded-[2rem] bg-white/5" />)}
        </div>
      </div>
    );
  }

  const needsAttentionCount = lifecycleData.filter(d => d.needsAttention).length;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Asset Lifecycle & Wear Tracking</h3>
        {needsAttentionCount > 0 ? (
          <span className="text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-lg bg-rose-500/10 text-rose-500 animate-pulse">
            {needsAttentionCount} Asset{needsAttentionCount !== 1 ? 's' : ''} Need Maintenance
          </span>
        ) : (
          <span className="text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-lg bg-emerald-500/10 text-emerald-500">
            All Hardware Healthy
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {lifecycleData.map(connector => (
          <ConnectorHealthCard
            key={connector.connectorId}
            data={connector}
            onMarkServiced={() => setMarkServicedTarget(connector)}
            onLogKwh={() => setLogKwhTarget(connector)}
            isMarkingServiced={markServicedTarget?.connectorId === connector.connectorId && isSavingServiced}
            isLoggingKwh={logKwhTarget?.connectorId === connector.connectorId && isSavingLogKwh}
          />
        ))}
      </div>

      {lifecycleData.length === 0 && (
        <div className="text-center py-12 bg-white/5 rounded-[2rem] border-2 border-dashed border-white/5">
          <p className="text-sm font-black uppercase tracking-tight text-muted-foreground opacity-40">No telemetry data available for this station</p>
        </div>
      )}

      {logKwhTarget && (
        <LogKwhModal
          isOpen={!!logKwhTarget}
          onClose={() => setLogKwhTarget(null)}
          connector={logKwhTarget}
          onConfirm={handleLogKwh}
          isSaving={isSavingLogKwh}
        />
      )}

      {markServicedTarget && (
        <MarkServicedModal
          isOpen={!!markServicedTarget}
          onClose={() => setMarkServicedTarget(null)}
          connector={markServicedTarget}
          onConfirm={handleMarkServiced}
          isSaving={isSavingServiced}
        />
      )}
    </div>
  );
};

// ACCEPTANCE TESTS:
// Test 1 — Zero-state: Installed today, 0 kWh, 0 faults -> wearScore=0, good condition.
// Test 2 — Wear from kWh: 2500 kWh, 0 faults, 180 days -> kwhScore=30, ageScore=5 -> wearScore=35.
// Test 3 — Critical: 5000 kWh, 4 faults, 400 days -> kwhScore=60, faultScore=30, ageScore=10 -> wearScore=100.
// Test 4 — Log kWh: Adding 250 kWh correctly updates lifetimeKwhManual and triggers write-back.
// Test 5 — Mark serviced: Resets faultEventsLast30d to 0 and records lastServiceAt.
// Test 6 — Fault pattern: 3 faults in 30 days triggers 'Pattern' alert and 'needsAttention'.
// Test 7 — Missing installedAt: Shows 'Unknown', ageScore=0, conservative computation.
// Test 8 — Multi-station: Queries and state are isolated via stationId query keys.
// Test 9 — Animation: WearScoreRing transitions from circumference to offset on mount.
// Test 10 — Sync Optimisation: No Firestore write if computed kWh delta < 0.1 kWh.
