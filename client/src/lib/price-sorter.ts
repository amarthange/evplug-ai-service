export interface StationPriceSummary {
  stationId: string;
  stationName: string;
  distanceKm: number | null; // null if user location unavailable
  pricePerKwh: number;
  availableConnectors: number;
  totalConnectors: number;
  connectorTypes: string[];
  isAvailable: boolean;
  priceTier: 'cheapest' | 'mid' | 'expensive';
}

export type PriceSortMode = 'price_asc' | 'price_desc' | 'distance' | 'availability';

export function haversineKm(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function buildPriceSummaries(
  stations: Array<any>,
  userLat: number | null,
  userLng: number | null
): StationPriceSummary[] {
  // 1. Build initial list with prices and distances
  const summaries: StationPriceSummary[] = stations.map((station) => {
    const connectors = station.connectors || [];
    
    // Find min price across all connectors
    const prices = connectors
      .map((c: any) => c.pricePerKwh)
      .filter((p: any) => p !== undefined && p !== null);
    const minPrice = prices.length > 0 ? Math.min(...prices) : 0;

    // Aggregate connector info
    const connectorTypes = Array.from(new Set(connectors.map((c: any) => c.type))) as string[];
    const totalConnectors = connectors.reduce((acc: number, c: any) => acc + (Number(c.count) || 1), 0);
    
    // For availability, we'd ideally need the bookings data, 
    // but here we'll use what's in the station object if provided
    // In home.tsx, this is calculated dynamically. 
    // If the station already has availableConnectors (from home.tsx map), use it.
    const availableConnectors = station.availableConnectors ?? totalConnectors;

    const stationLat = Number(station.lat || station.location?.lat);
    const stationLng = Number(station.lon || station.location?.lon);

    const dist = (userLat !== null && userLng !== null && !isNaN(stationLat) && !isNaN(stationLng))
      ? haversineKm(userLat, userLng, stationLat, stationLng)
      : null;

    return {
      stationId: station.id,
      stationName: station.name || 'Unknown Station',
      distanceKm: dist,
      pricePerKwh: minPrice,
      availableConnectors,
      totalConnectors,
      connectorTypes,
      isAvailable: availableConnectors > 0,
      priceTier: 'mid', // default, will be updated
    };
  });

  // 2. Assign price tiers
  if (summaries.length === 0) return [];

  const sortedByPrice = [...summaries].sort((a, b) => a.pricePerKwh - b.pricePerKwh);
  const count = sortedByPrice.length;
  const third = Math.floor(count / 3);

  // We use the sorted list to find threshold indices
  // Bottom 33% -> cheapest, Middle 33% -> mid, Top 33% -> expensive
  sortedByPrice.forEach((s, idx) => {
    let tier: 'cheapest' | 'mid' | 'expensive' = 'mid';
    if (idx < third) {
      tier = 'cheapest';
    } else if (idx >= count - third && third > 0) {
      tier = 'expensive';
    }
    
    // Find original summary and update
    const original = summaries.find(orig => orig.stationId === s.stationId);
    if (original) original.priceTier = tier;
  });

  return summaries;
}

export function sortStations(
  stations: StationPriceSummary[],
  mode: PriceSortMode
): StationPriceSummary[] {
  return [...stations].sort((a, b) => {
    switch (mode) {
      case 'price_asc':
        return a.pricePerKwh - b.pricePerKwh;
      case 'price_desc':
        return b.pricePerKwh - a.pricePerKwh;
      case 'distance':
        if (a.distanceKm === null) return 1;
        if (b.distanceKm === null) return -1;
        return a.distanceKm - b.distanceKm;
      case 'availability':
        if (a.isAvailable === b.isAvailable) {
          return b.availableConnectors - a.availableConnectors;
        }
        return a.isAvailable ? -1 : 1;
      default:
        return 0;
    }
  });
}
