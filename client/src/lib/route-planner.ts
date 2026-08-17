import type { Station } from "@shared/schema";

const EARTH_RADIUS_KM = 6371;

/**
 * Haversine formula to calculate distance between two points
 */
export function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

/**
 * Calculates the perpendicular distance from a point to a line segment
 */
function distanceToSegment(pLat: number, pLon: number, sLat: number, sLon: number, eLat: number, eLon: number): number {
  // Simplification for small distances (Cartesian approximation)
  // Converting to flat plane for local 5km checks is safe and much faster
  const x = pLon;
  const y = pLat;
  const x1 = sLon;
  const y1 = sLat;
  const x2 = eLon;
  const y2 = eLat;

  const A = x - x1;
  const B = y - y1;
  const C = x2 - x1;
  const D = y2 - y1;

  const dot = A * C + B * D;
  const lenSq = C * C + D * D;
  let param = -1;

  if (lenSq !== 0) param = dot / lenSq;

  let xx, yy;

  if (param < 0) {
    xx = x1;
    yy = y1;
  } else if (param > 1) {
    xx = x2;
    yy = y2;
  } else {
    xx = x1 + param * C;
    yy = y1 + param * D;
  }

  return haversineDistance(pLat, pLon, yy, xx);
}

export interface RoutePlan {
  optimalStation: Station | null;
  scoredStations: Array<{ station: Station; score: number; distanceToRoute: number }>;
  routePoints: [number, number][]; // [lon, lat]
  totalDistanceKm: number;
}

export function calculateRoutePlan(
  stations: Station[],
  routeGeoJSON: any,
  currentRangeKm: number
): RoutePlan {
  const points = routeGeoJSON.coordinates as [number, number][]; // [lon, lat]
  if (!points || points.length < 2) return { optimalStation: null, scoredStations: [], routePoints: [], totalDistanceKm: 0 };

  // Calculate total route distance
  let totalDist = 0;
  const segmentDistances: number[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const d = haversineDistance(points[i][1], points[i][0], points[i+1][1], points[i+1][0]);
    segmentDistances.push(d);
    totalDist += d;
  }

  // Find stations near route (max 5km)
  const nearbyStations: Array<{ station: Station; distanceToRoute: number; progress: number }> = [];
  
  stations.forEach(station => {
    const sLat = Number(station.lat || (station as any).location?.lat);
    const sLon = Number(station.lon || (station as any).location?.lon);
    
    // Lat-diff shortcut (0.05 deg ~ 5.5km)
    let isPotentiallyNear = false;
    for (const [pLon, pLat] of points) {
      if (Math.abs(pLat - sLat) < 0.05 && Math.abs(pLon - sLon) < 0.05) {
        isPotentiallyNear = true;
        break;
      }
    }
    if (!isPotentiallyNear) return;

    // Precise check
    let minTaskDist = Infinity;
    let stationProgress = 0;
    let accumulatedDist = 0;

    for (let i = 0; i < points.length - 1; i++) {
      const d = distanceToSegment(sLat, sLon, points[i][1], points[i][0], points[i+1][1], points[i+1][0]);
      if (d < minTaskDist) {
        minTaskDist = d;
        // Progress estimate
        stationProgress = (accumulatedDist + (segmentDistances[i] * 0.5)) / totalDist;
      }
      accumulatedDist += segmentDistances[i];
    }

    if (minTaskDist <= 5) {
      nearbyStations.push({ station, distanceToRoute: minTaskDist, progress: stationProgress });
    }
  });

  // Scoring
  const scored = nearbyStations.map(({ station, distanceToRoute, progress }) => {
    // 1. Connector Score (40%)
    const connectors = (station.connectors as any) || [];
    const maxPower = Math.max(...connectors.map((c: any) => c.powerKw || 0), 0);
    const connectorScore = maxPower >= 100 ? 1.0 : (maxPower >= 50 ? 0.7 : 0.2);

    // 2. Availability Score (25%)
    const anyAvailable = connectors.some((c: any) => c.available);
    const availabilityScore = anyAvailable ? 1.0 : 0.0;

    // 3. Position Score (25%)
    // Ideally want to stop when range is low (e.g. at 70-85% of total route)
    const targetProgress = Math.min(0.8, (currentRangeKm * 0.8) / totalDist);
    const positionScore = 1.0 - Math.min(Math.abs(progress - targetProgress) * 2, 1.0);

    // 4. Proximity Score (10%)
    const proximityScore = 1.0 - (distanceToRoute / 5);

    const score = (connectorScore * 0.40) + (availabilityScore * 0.25) + (positionScore * 0.25) + (proximityScore * 0.10);

    return { station, score, distanceToRoute };
  }).sort((a, b) => b.score - a.score);

  return {
    optimalStation: scored[0]?.station || null,
    scoredStations: scored,
    routePoints: points,
    totalDistanceKm: totalDist
  };
}
