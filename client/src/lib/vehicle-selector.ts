/**
 * [EVPlugFinder] Vehicle Selector Utility
 * Logic for multi-vehicle management and compatibility filtering.
 */

export interface Vehicle {
  id: string;                // index or document id
  brand: string;
  model: string;
  batteryCapacity: number;   // kWh
  connectorType: string;     // 'CCS2', 'Type2', etc.
  displayName: string;       // 'Tata Nexon EV'
  isCompatible: boolean;     // station support check
}

import { checkConnectorCompatibility } from '@/lib/utils';

/**
 * Maps raw user vehicle data to the app's Vehicle interface.
 * Handles compatibility sorting.
 */
export function buildVehicleList(
  rawVehicles: Array<any>,
  stationConnectorTypes: string[]
): Vehicle[] {
  if (!Array.isArray(rawVehicles)) return [];

  return rawVehicles.map((v, index) => {
    const brand = v.brand || 'EV';
    const model = v.model || 'Vehicle';
    const connectorType = v.connectorType || 'CCS2';

    return {
      id: String(v.id || index),
      brand,
      model,
      batteryCapacity: Number(v.batteryCapacity) || 0,
      connectorType,
      displayName: `${brand} ${model}`.trim(),
      isCompatible: stationConnectorTypes.some(type => checkConnectorCompatibility(type, connectorType))
    };
  }).sort((a, b) => {
    // Compatible first
    if (a.isCompatible && !b.isCompatible) return -1;
    if (!a.isCompatible && b.isCompatible) return 1;
    // Then alphabetical
    return a.displayName.localeCompare(b.displayName);
  });
}

/**
 * Determines the best vehicle to select by default.
 */
export function getDefaultVehicle(
  vehicles: Vehicle[],
  lastUsedVehicleId: string | null
): Vehicle | null {
  if (vehicles.length === 0) return null;

  // 1. Try last used if compatible
  if (lastUsedVehicleId) {
    const lastUsed = vehicles.find(v => v.id === lastUsedVehicleId);
    if (lastUsed && lastUsed.isCompatible) return lastUsed;
  }

  // 2. Try first compatible
  const firstCompatible = vehicles.find(v => v.isCompatible);
  if (firstCompatible) return firstCompatible;

  // 3. Fallback to first available
  return vehicles[0];
}

/**
 * LocalStorage persistence for user's last selected vehicle.
 */
export function saveLastUsedVehicle(vehicleId: string): void {
  try {
    localStorage.setItem('evplugfinder_last_vehicle', vehicleId);
  } catch (err) {
    console.warn('[EVPlugFinder] LocalStorage access failed');
  }
}

export function getLastUsedVehicleId(): string | null {
  try {
    return localStorage.getItem('evplugfinder_last_vehicle') || localStorage.getItem('volthub_last_vehicle');
  } catch (err) {
    return null;
  }
}
