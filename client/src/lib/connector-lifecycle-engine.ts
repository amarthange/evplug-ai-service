import { Timestamp } from 'firebase/firestore';

export interface ConnectorLifecycleData {
  connectorId: string
  connectorType: string         // 'CCS2' | 'Type2' | 'CHAdeMO' | 'AC' etc.
  stationId: string
  stationName: string

  // Wear metrics
  lifetimeKwh: number           // total = fromBookings + manual
  lifetimeKwhFromBookings: number
  lifetimeKwhManual: number
  faultEvents: number           // total all-time
  faultEventsLast30d: number    // last 30 days only
  lastFaultAt: Date | null
  installedAt: Date | null
  lastServiceAt: Date | null
  wearScore: number             // 0–100

  // Derived
  daysSinceInstall: number
  daysSinceService: number | null    // null if never serviced
  kwhToServiceThreshold: number      // 5000 - lifetimeKwh (can be negative)
  kwhProgress: number                // 0–100, lifetimeKwh / 5000 * 100, capped at 100
  needsAttention: boolean            // wearScore >= 50 OR faultEventsLast30d >= 3
                                     // OR lifetimeKwh >= 5000
  healthBadge: HealthBadge
  alerts: ConnectorAlert[]
}

export interface HealthBadge {
  label: string
  severity: 'good' | 'warning' | 'critical'
}

export interface ConnectorAlert {
  id: string
  message: string
  severity: 'warning' | 'critical'
}

export interface WearScoreBreakdown {
  kwhScore: number       // 0–60
  faultScore: number     // 0–30
  ageScore: number       // 0–10
  total: number          // 0–100
  dominantFactor: 'kwh' | 'faults' | 'age' | 'balanced'
}

/**
 * Core wear score formula.
 * kwhScore (60): Contribution from cumulative usage (threshold 5,000 kWh).
 * faultScore (30): Contribution from all-time fault events (weighted 8 pts each).
 * ageScore (10): Contribution from physical age (threshold 365 days).
 */
export function computeWearScore(
  lifetimeKwh: number,
  faultEvents: number,
  daysSinceInstall: number
): number {
  const kwhScore = Math.min((lifetimeKwh / 5000) * 60, 60)
  const faultScore = Math.min(faultEvents * 8, 30)
  const ageScore = Math.min((daysSinceInstall / 365) * 10, 10)
  return Math.round(kwhScore + faultScore + ageScore)
}

/**
 * Detailed wear score breakdown for visualization.
 */
export function computeWearScoreBreakdown(
  lifetimeKwh: number,
  faultEvents: number,
  daysSinceInstall: number
): WearScoreBreakdown {
  const kwhScore = Math.min((lifetimeKwh / 5000) * 60, 60)
  const faultScore = Math.min(faultEvents * 8, 30)
  const ageScore = Math.min((daysSinceInstall / 365) * 10, 10)
  const total = Math.round(kwhScore + faultScore + ageScore)

  const dominantFactor =
    kwhScore >= faultScore && kwhScore >= ageScore ? 'kwh' :
    faultScore >= kwhScore && faultScore >= ageScore ? 'faults' :
    ageScore >= kwhScore && ageScore >= faultScore ? 'age' : 'balanced'

  return { 
    kwhScore: Math.round(kwhScore), 
    faultScore: Math.round(faultScore),
    ageScore: Math.round(ageScore), 
    total, 
    dominantFactor 
  }
}

/**
 * Derives actionable alerts based on connector telemetry patterns.
 */
export function deriveConnectorAlerts(data: {
  lifetimeKwh: number
  faultEventsLast30d: number
  wearScore: number
  daysSinceService: number | null
}): ConnectorAlert[] {
  const alerts: ConnectorAlert[] = []

  if (data.wearScore >= 75) {
    alerts.push({
      id: 'wear-critical',
      message: 'Replacement recommended — wear score critical',
      severity: 'critical'
    })
  } else if (data.wearScore >= 50) {
    alerts.push({
      id: 'wear-warning',
      message: 'Monitor closely — elevated wear detected',
      severity: 'warning'
    })
  }

  if (data.lifetimeKwh >= 5000) {
    alerts.push({
      id: 'kwh-threshold',
      message: 'High usage — service recommended (5,000 kWh threshold reached)',
      severity: 'warning'
    })
  }

  if (data.faultEventsLast30d >= 3) {
    alerts.push({
      id: 'fault-pattern',
      message: `Fault pattern detected — ${data.faultEventsLast30d} faults in last 30 days`,
      severity: 'critical'
    })
  }

  if (data.daysSinceService !== null && data.daysSinceService > 180) {
    alerts.push({
      id: 'overdue-service',
      message: `Overdue for service — last serviced ${data.daysSinceService} days ago`,
      severity: 'warning'
    })
  }

  return alerts
}

/**
 * Maps wear score to health badge severity.
 */
export function deriveHealthBadge(wearScore: number): HealthBadge {
  if (wearScore >= 75) return { label: 'Replacement recommended', severity: 'critical' }
  if (wearScore >= 50) return { label: 'Monitor closely', severity: 'warning' }
  return { label: 'Good condition', severity: 'good' }
}

/**
 * Composes the full lifecycle profile from raw telemetry and manual inputs.
 * Handles missing installation/service dates gracefully.
 */
export function buildConnectorLifecycleData(raw: {
  connectorId: string
  connectorType: string
  stationId: string
  stationName: string
  lifetimeKwhFromBookings: number
  lifetimeKwhManual: number
  faultEvents: number
  faultEventsLast30d: number
  lastFaultAt: Date | null
  installedAt: Date | null
  lastServiceAt: Date | null
}): ConnectorLifecycleData {
  const lifetimeKwh = (raw.lifetimeKwhFromBookings || 0) + (raw.lifetimeKwhManual || 0)
  const now = new Date()

  const daysSinceInstall = raw.installedAt
    ? Math.floor((now.getTime() - raw.installedAt.getTime()) / 86400000)
    : 0

  const daysSinceService = raw.lastServiceAt
    ? Math.floor((now.getTime() - raw.lastServiceAt.getTime()) / 86400000)
    : null

  const wearScore = Math.min(computeWearScore(lifetimeKwh, raw.faultEvents, daysSinceInstall), 100)
  const kwhProgress = Math.min(Math.round((lifetimeKwh / 5000) * 100), 100)
  const kwhToServiceThreshold = Math.max(0, 5000 - lifetimeKwh)
  const healthBadge = deriveHealthBadge(wearScore)
  const alerts = deriveConnectorAlerts({
    lifetimeKwh,
    faultEventsLast30d: raw.faultEventsLast30d,
    wearScore,
    daysSinceService
  })
  const needsAttention = wearScore >= 50
    || (raw.faultEventsLast30d || 0) >= 3
    || lifetimeKwh >= 5000

  return {
    ...raw,
    lifetimeKwh,
    daysSinceInstall,
    daysSinceService,
    kwhProgress,
    kwhToServiceThreshold,
    wearScore,
    healthBadge,
    alerts,
    needsAttention
  }
}

export function formatDate(date: Date | null, fallback = 'Never'): string {
  if (!date) return fallback
  return date.toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric'
  })
}

export function formatKwh(kwh: number): string {
  if (kwh >= 1000) return `${(kwh / 1000).toFixed(2)} MWh`
  return `${Math.round(kwh)} kWh`
}

export function formatDaysAgo(date: Date | null): string {
  if (!date) return 'Never'
  const days = Math.floor((Date.now() - date.getTime()) / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 30) return `${days} days ago`
  if (days < 365) return `${Math.floor(days / 30)} months ago`
  return `${Math.floor(days / 365)}y ${Math.floor((days % 365) / 30)}m ago`
}

export const WEAR_SCORE_COLOR = (score: number): string =>
  score >= 75 ? '#ef4444' :    // red-500
  score >= 50 ? '#f59e0b' :    // amber-500
  '#22c55e'                    // green-500

export const WEAR_SCORE_TRACK_COLOR = (score: number): string =>
  score >= 75 ? '#fee2e2' :    // red-100
  score >= 50 ? '#fef3c7' :    // amber-100
  '#dcfce7'                    // green-100
