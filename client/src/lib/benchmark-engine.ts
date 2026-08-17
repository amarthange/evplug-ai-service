import { Station } from './owner-service';
import { subDays, isAfter, startOfDay } from 'date-fns';
import { toJSDate, toTimestamp } from './date-utils';

export interface Booking {
  id: string;
  stationId: string;
  status: string;
  totalPrice?: number;
  startTime?: any;
  endTime?: any;
  connectorId?: string;
  connectorType?: string;
}

export interface Review {
  id: string;
  stationId: string;
  rating: number;
}

export interface StationAlert {
  id: string;
  stationId: string;
  type: string;
}

export interface StationBenchmark {
  stationId: string;
  name: string;
  revenue: number;
  revenueRank: number;
  utilization: number;
  utilizationRank: number;
  faultCount: number;
  avgRating: number;
  reviewCount: number;
  totalBookings: number;
  isTopPerformer: boolean;
  isUnderperforming: boolean;
}

export function computeStationBenchmarks(
  stations: Station[],
  bookings: Booking[],
  reviews: Review[],
  alerts: StationAlert[]
): StationBenchmark[] {
  const thirtyDaysAgo = startOfDay(subDays(new Date(), 30));

  // 1. Aggregation
  const benchmarks: StationBenchmark[] = stations.map(station => {
    const stationBookings = bookings.filter(b => 
      b.stationId === station.id && 
      (b.status === 'completed' || b.status === 'confirmed') &&
      isAfter(toJSDate(b.startTime), thirtyDaysAgo)
    );

    const stationReviews = reviews.filter(r => r.stationId === station.id);
    const stationAlerts = alerts.filter(a => a.stationId === station.id && a.type === 'CONNECTOR_FAULT');

    const revenue = stationBookings.reduce((sum, b) => sum + (b.totalPrice || 0), 0);
    
    // Utilization calculation: (Total charging minutes / Total possible minutes in 30 days)
    // 30 days * 24 hours * 60 minutes = 43,200 minutes
    // Each connector has 43,200 capacity.
    const connectorCount = station.connectors?.length || 1;
    const totalCapacityMinutes = 30 * 24 * 60 * connectorCount;
    const totalChargingMinutes = stationBookings.reduce((sum, b) => {
      const start = toTimestamp(b.startTime);
      const end = toTimestamp(b.endTime || b.startTime);
      const duration = end - start;
      return sum + Math.max(0, duration / 60000); // ms to minutes
    }, 0);
    
    let utilization = totalCapacityMinutes > 0 
      ? Math.min((totalChargingMinutes / totalCapacityMinutes) * 100, 100) 
      : 0;
    
    if (isNaN(utilization)) utilization = 0;

    const avgRating = stationReviews.length > 0
      ? stationReviews.reduce((sum, r) => sum + r.rating, 0) / stationReviews.length
      : 0;

    return {
      stationId: station.id,
      name: station.name,
      revenue,
      revenueRank: 0, // Fill later
      utilization,
      utilizationRank: 0, // Fill later
      faultCount: stationAlerts.length,
      avgRating,
      reviewCount: stationReviews.length,
      totalBookings: stationBookings.length,
      isTopPerformer: false,
      isUnderperforming: false
    };
  });

  // 2. Ranking logic
  const sortedByRevenue = [...benchmarks].sort((a, b) => b.revenue - a.revenue);
  const sortedByUtilization = [...benchmarks].sort((a, b) => b.utilization - a.utilization);

  benchmarks.forEach(b => {
    b.revenueRank = sortedByRevenue.findIndex(s => s.stationId === b.stationId) + 1;
    b.utilizationRank = sortedByUtilization.findIndex(s => s.stationId === b.stationId) + 1;
    
    // Top Performer: Top 25% revenue OR Top 25% utilization
    const topThreshold = Math.ceil(stations.length * 0.25);
    if (b.revenueRank <= topThreshold || b.utilizationRank <= topThreshold) {
      b.isTopPerformer = true;
    }

    // Underperforming: Bottom 25% revenue AND Bottom 25% utilization (if more than 3 stations)
    if (stations.length >= 3) {
      const bottomThreshold = Math.floor(stations.length * 0.75);
      if (b.revenueRank > bottomThreshold && b.utilizationRank > bottomThreshold) {
        b.isUnderperforming = true;
      }
    }
  });

  return benchmarks;
}
