/**
 * Battery Planner Logic
 * Pure computation for EV battery simulation across route waypoints.
 */

export const CRITICAL_SOC_THRESHOLD = 15;      // Below 15% is critical
export const WARNING_SOC_THRESHOLD = 25;       // Below 25% is warning
export const CHARGING_EFFICIENCY = 0.92;       // 92% efficiency

export function getConsumptionKwhPerKm(
  efficiencyWhPerKm: number | null | undefined
): number {
  // efficiencyWhPerKm: from vehicle schema, e.g. 180 means 180 Wh/km
  // Convert: 180 Wh/km → 0.180 kWh/km
  // If null/undefined/0: fall back to 0.20 (safe default)
  // Cap: minimum 0.10, maximum 0.40 (sanity bounds — bad data protection)
  if (!efficiencyWhPerKm || efficiencyWhPerKm <= 0) return 0.20;
  const kwh = efficiencyWhPerKm / 1000;
  return Math.min(Math.max(kwh, 0.10), 0.40);
}

export interface WaypointBatteryState {
  waypointIndex: number;
  waypointName: string;
  distanceFromPreviousKm: number;
  arrivalSocPct: number;
  departureSocPct: number;
  energyConsumedKwh: number;
  energyAddedKwh: number;
  status: 'ok' | 'warning' | 'critical' | 'unreachable';
  statusMessage: string;
  canReach: boolean;
  isChargingStop: boolean;
}

export interface BatteryPlanResult {
  waypoints: WaypointBatteryState[];
  startSocPct: number;
  finalSocPct: number;
  totalDistanceKm: number;
  totalEnergyKwh: number;
  batteryCapacityKwh: number;
  isPlanFeasible: boolean;
  firstCriticalWaypoint: number | null;
}

/**
 * Simulates battery state across a series of waypoints.
 */
export function simulateBatteryPlan(
  startSocPct: number,
  batteryCapacityKwh: number,
  waypoints: Array<{
    name: string;
    distanceFromPreviousKm: number;
    isChargingStop: boolean;
    targetSocAfterCharge: number;
  }>,
  efficiencyWhPerKm?: number   // NEW optional param — from vehicle schema
): BatteryPlanResult {
  let currentSocPct = startSocPct;
  let totalDistanceKm = 0;
  let totalEnergyKwh = 0;
  let firstCriticalWaypoint: number | null = null;
  
  const results: WaypointBatteryState[] = waypoints.map((wp, index) => {
    const consumptionKwhPerKm = getConsumptionKwhPerKm(efficiencyWhPerKm);
    const energyConsumedKwh = wp.distanceFromPreviousKm * consumptionKwhPerKm;
    const socDropPct = (energyConsumedKwh / batteryCapacityKwh) * 100;
    
    const arrivalSocPct = Math.max(0, currentSocPct - socDropPct);
    const canReach = currentSocPct >= socDropPct; // Technically arrivalSocPct > 0 but with float precision check
    
    totalDistanceKm += wp.distanceFromPreviousKm;
    totalEnergyKwh += energyConsumedKwh;

    let energyAddedKwh = 0;
    let departureSocPct = arrivalSocPct;

    if (wp.isChargingStop && canReach) {
      const targetSoc = Math.min(wp.targetSocAfterCharge, 100);
      if (targetSoc > arrivalSocPct) {
        departureSocPct = targetSoc;
        const energyToAdds = ((targetSoc - arrivalSocPct) / 100) * batteryCapacityKwh;
        energyAddedKwh = energyToAdds / CHARGING_EFFICIENCY;
      }
    }

    const status: WaypointBatteryState['status'] = 
      !canReach ? 'unreachable' :
      arrivalSocPct < CRITICAL_SOC_THRESHOLD ? 'critical' :
      arrivalSocPct < WARNING_SOC_THRESHOLD ? 'warning' : 'ok';

    const statusMessage = 
      status === 'unreachable' ? 'Insufficient charge to reach stop' :
      status === 'critical' ? 'Critically low battery on arrival' :
      status === 'warning' ? 'Battery low on arrival' : 'Battery sufficient';

    if ((status === 'critical' || status === 'unreachable') && firstCriticalWaypoint === null) {
      firstCriticalWaypoint = index;
    }

    const state: WaypointBatteryState = {
      waypointIndex: index,
      waypointName: wp.name,
      distanceFromPreviousKm: wp.distanceFromPreviousKm,
      arrivalSocPct,
      departureSocPct,
      energyConsumedKwh,
      energyAddedKwh,
      status,
      statusMessage,
      canReach,
      isChargingStop: wp.isChargingStop
    };

    currentSocPct = departureSocPct;
    return state;
  });

  return {
    waypoints: results,
    startSocPct,
    finalSocPct: currentSocPct,
    totalDistanceKm,
    totalEnergyKwh,
    batteryCapacityKwh,
    isPlanFeasible: results.every(wp => wp.canReach),
    firstCriticalWaypoint
  };
}

/**
 * Formats SoC for display with flat warning.
 */
export function formatSocDisplay(socPct: number): string {
  const rounded = Math.max(0, Math.round(socPct));
  if (rounded <= 0) return '0% (flat)';
  return `${rounded}%`;
}

/**
 * Returns hex color for a given status.
 */
export function getSocStatusColor(status: WaypointBatteryState['status']): string {
  switch (status) {
    case 'ok': return '#22c55e';
    case 'warning': return '#f59e0b';
    case 'critical': return '#ef4444';
    case 'unreachable': return '#6b7280';
    default: return '#94a3b8';
  }
}
