import { Station, Booking } from "@shared/schema";
import { subDays, differenceInDays, differenceInYears } from "date-fns";

export interface MaintenanceRisk {
  score: number;
  factors: {
    usageIntensity: number;
    faultFrequency: number;
    timeSinceMaintenance: number;
    age: number;
    rating: number;
  };
  recommendation: {
    action: string;
    timelineDays: number;
    urgency: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  };
}

/**
 * Calculates the maintenance risk score for a station based on historical data and heuristics.
 */
export function calculateMaintenanceRisk(
  station: Station,
  bookings: Booking[],
  days: number = 30
): MaintenanceRisk {
  const now = new Date();
  const last30Days = subDays(now, days);
  
  // Factor 1: Usage Intensity
  // (avgDailyBookings / connectorCount) * 10
  const stationBookings = bookings.filter(b => b.stationId === station.id && b.createdAt >= last30Days.getTime());
  const connectorCount = station.connectors.reduce((acc, c) => acc + (c.count || 1), 0);
  const avgDailyBookings = stationBookings.length / days;
  const usageIntensity = Math.min(10, (avgDailyBookings / (connectorCount || 1)) * 10);

  // Factor 2: Fault Frequency (from faultHistory)
  // faultCount * 15 (last 30 days)
  const recentFaults = (station.faultHistory || []).filter(f => f.date >= last30Days.getTime());
  const faultFrequency = Math.min(30, recentFaults.length * 15);

  // Factor 3: Time Since Last Maintenance
  // daysSinceLastMaintenance / 30 * 20
  const lastMaint = station.lastMaintenanceDate ? new Date(station.lastMaintenanceDate) : new Date(station.lastUpdated || Date.now());
  const daysSinceMaint = differenceInDays(now, lastMaint);
  const timeSinceMaintenance = Math.min(20, (daysSinceMaint / 30) * 20);

  // Factor 4: Connector Age
  // ageInYears * 10
  const createdAt = new Date(station.lastUpdated || Date.now()); // Fallback to lastUpdated if no createdAt
  const ageInYears = differenceInYears(now, createdAt);
  const age = Math.min(20, ageInYears * 10);

  // Factor 5: Low Rating Pattern
  // (4.0 - avgRating) * 20 (if avgRating < 3.5)
  let ratingFactor = 0;
  if (station.rating && station.rating < 3.5) {
    ratingFactor = Math.min(20, (4.0 - station.rating) * 20);
  }

  const totalScore = Math.min(100, usageIntensity + faultFrequency + timeSinceMaintenance + age + ratingFactor);

  // Auto-schedule recommendations
  let urgency: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" = "LOW";
  let timelineDays = 90;
  let action = "Continue routine monitoring";

  if (totalScore >= 85) {
    urgency = "CRITICAL";
    timelineDays = 7;
    action = "Immediate maintenance required";
  } else if (totalScore >= 70) {
    urgency = "HIGH";
    timelineDays = 14;
    action = "Schedule maintenance soon";
  } else if (totalScore >= 60) {
    urgency = "MEDIUM";
    timelineDays = 30;
    action = "Maintenance recommended within 30 days";
  }

  return {
    score: totalScore,
    factors: {
      usageIntensity,
      faultFrequency,
      timeSinceMaintenance,
      age,
      rating: ratingFactor
    },
    recommendation: {
      action,
      timelineDays,
      urgency
    }
  };
}

/**
 * Groups nearby high-risk stations for same-day service optimization.
 */
export function optimizeMaintenanceSchedule(stations: Station[], riskScores: Record<string, number>) {
  const highRisk = stations.filter(s => (riskScores[s.id] || 0) > 60)
    .sort((a, b) => (riskScores[b.id] || 0) - (riskScores[a.id] || 0));
  
  // Simple clustering by distance (lat/lon)
  const groups: Station[][] = [];
  const visited = new Set<string>();

  for (const station of highRisk) {
    if (visited.has(station.id)) continue;
    
    const group = [station];
    visited.add(station.id);

    for (const other of highRisk) {
      if (visited.has(other.id)) continue;
      
      // Roughly 10km radius (0.1 degree)
      const dist = Math.sqrt(Math.pow(station.lat - other.lat, 2) + Math.pow(station.lon - other.lon, 2));
      if (dist < 0.1) {
        group.push(other);
        visited.add(other.id);
      }
    }
    groups.push(group);
  }

  return groups;
}
