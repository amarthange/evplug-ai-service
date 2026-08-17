import { 
  doc, 
  getDoc, 
  updateDoc, 
  Timestamp, 
  type Firestore 
} from 'firebase/firestore';

export interface VehicleSoCState {
  vehicleId: string;
  lastKnownSoC: number | null;
  lastKnownSoCUpdatedAt: Date | null;
  isFresh: boolean;
  shouldPrompt: boolean;
}

export interface SoCWriteResult {
  success: boolean;
  vehicleId: string;
  socValue: number;
  updatedAt: Date;
  error?: string;
}

export const SOC_FRESHNESS_MS = 24 * 60 * 60 * 1000; // 24 hours
export const SOC_DEFAULT_FALLBACK = 20;
export const SOC_MIN = 1;
export const SOC_MAX = 99;

/**
 * JSDoc: getVehicleSoCState
 * 
 * Fetches the last recorded SoC for a specific vehicle.
 * Freshness Logic: Data is considered 'fresh' if updated within the last 24 hours.
 * If stale or missing, the UI should prompt the user to update it.
 */
export async function getVehicleSoCState(
  db: Firestore,
  userId: string,
  vehicleId: string
): Promise<VehicleSoCState> {
  try {
    const vehicleRef = doc(db, 'users', userId, 'ev_vehicles', vehicleId);
    const snap = await getDoc(vehicleRef);

    if (!snap.exists()) {
      return {
        vehicleId,
        lastKnownSoC: null,
        lastKnownSoCUpdatedAt: null,
        isFresh: false,
        shouldPrompt: true
      };
    }

    const data = snap.data();
    const rawSoC = data.lastKnownSoC;
    const rawUpdatedAt = data.lastKnownSoCUpdatedAt;

    // Check if SoC is valid (>= 1%)
    const lastKnownSoC = (typeof rawSoC === 'number' && rawSoC >= SOC_MIN) ? rawSoC : null;
    const lastKnownSoCUpdatedAt = rawUpdatedAt?.toDate() ?? null;

    const isFresh = lastKnownSoCUpdatedAt !== null
      && (Date.now() - lastKnownSoCUpdatedAt.getTime()) < SOC_FRESHNESS_MS
      && lastKnownSoC !== null;

    return {
      vehicleId,
      lastKnownSoC,
      lastKnownSoCUpdatedAt,
      isFresh,
      shouldPrompt: !isFresh
    };
  } catch (err) {
    console.warn('[SeniorDevOps SoC] Failed to read vehicle SoC:', err);
    return {
      vehicleId,
      lastKnownSoC: null,
      lastKnownSoCUpdatedAt: null,
      isFresh: false,
      shouldPrompt: false // Do not block if read fails
    };
  }
}

/**
 * Persists the user-entered SoC to the vehicle document.
 */
export async function saveVehicleSoC(
  db: Firestore,
  userId: string,
  vehicleId: string,
  socValue: number
): Promise<SoCWriteResult> {
  try {
    if (socValue < SOC_MIN || socValue > SOC_MAX || !Number.isFinite(socValue)) {
      return {
        success: false,
        vehicleId,
        socValue,
        updatedAt: new Date(),
        error: `Invalid SoC value: ${socValue}. Must be ${SOC_MIN}–${SOC_MAX}.`
      };
    }

    const updatedAt = new Date();
    const roundedSoC = Math.round(socValue);
    
    await updateDoc(
      doc(db, 'users', userId, 'ev_vehicles', vehicleId),
      {
        lastKnownSoC: roundedSoC,
        lastKnownSoCUpdatedAt: Timestamp.fromDate(updatedAt)
      }
    );

    return { success: true, vehicleId, socValue: roundedSoC, updatedAt };
  } catch (err: any) {
    console.warn('[SeniorDevOps SoC] Failed to save vehicle SoC:', err);
    return { 
      success: false, 
      vehicleId, 
      socValue, 
      updatedAt: new Date(), 
      error: err.message 
    };
  }
}

/**
 * JSDoc: resolveStartSoC
 * 
 * Priority Order:
 * 1. User-entered value from the current booking flow.
 * 2. Fresh cached value from the vehicle profile (< 24h old).
 * 3. Default fallback (20%) if both above are missing/stale or skipped.
 */
export function resolveStartSoC(
  vehicleSoCState: VehicleSoCState,
  userEnteredSoC: number | null,
  wasSkipped: boolean
): { startSoC: number; source: 'user_entered' | 'fresh_cached' | 'skipped_default' } {
  if (!wasSkipped && userEnteredSoC !== null) {
    return { startSoC: Math.round(userEnteredSoC), source: 'user_entered' };
  }
  if (vehicleSoCState.isFresh && vehicleSoCState.lastKnownSoC !== null) {
    return { startSoC: vehicleSoCState.lastKnownSoC, source: 'fresh_cached' };
  }
  return { startSoC: SOC_DEFAULT_FALLBACK, source: 'skipped_default' };
}

export function formatSoCFreshness(updatedAt: Date | null): string {
  if (!updatedAt) return 'Never recorded';
  const diffMs = Date.now() - updatedAt.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 2) return 'Just updated';
  if (diffMins < 60) return `Updated ${diffMins} minutes ago`;
  if (diffHours < 24) return `Updated ${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  if (diffDays === 1) return 'Updated yesterday';
  return `Updated ${diffDays} days ago`;
}
