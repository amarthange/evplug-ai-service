import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { formatDistanceToNow } from "date-fns"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Calculates the relative luminance of a color and returns black or white for optimal contrast.
 * Supports HEX strings.
 */
export function getContrastColor(hexColor?: string): "text-white" | "text-slate-900" {
  if (!hexColor) return "text-white";
  
  // Remove hash if present
  const hex = hexColor.replace("#", "");
  
  // Parse RGB
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  
  // Calculate relative luminance (Y)
  // Standard formula for contrast calculation
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  
  return yiq >= 128 ? "text-slate-900" : "text-white";
}

/**
 * Maps a station/booking status to its corresponding brand color (HEX).
 */
export function getStatusColor(status?: string): string {
  const s = (status || "").toLowerCase();
  switch (s) {
    case "active":
    case "approved":
    case "completed":
    case "available":
      return "#22c55e"; // Emerald-500
    case "maintenance":
    case "pending":
    case "in_progress":
      return "#f59e0b"; // Amber-500
    case "cancelled":
    case "rejected":
    case "offline":
    case "occupied":
      return "#ef4444"; // Red-500
    default:
      return "#94a3b8"; // Slate-400
  }
}
/**
 * Estimates drive time based on distance (km)
 * Simple heuristic: 25km/h average city speed + 2min buffer
 */
export function getEstimatedDriveTime(distance?: number): number {
  if (distance === undefined || distance === null) return 0;
  if (distance < 0.1) return 1; // Minimum 1 min
  const speedKmh = 25;
  const timeHours = distance / speedKmh;
  const timeMinutes = Math.round(timeHours * 60) + 2; 
  return timeMinutes;
}

/**
 * Formats drive time as a human readable string
 */
export function formatDriveTime(minutes: number): string {
  if (minutes <= 0) return "1 min";
  if (minutes < 60) return `${minutes} min`;
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
}

/**
 * Checks if a connector is compatible with a vehicle type.
 * Standardizes common Indian EV connector mappings (CCS2, Type 2).
 */
export function checkConnectorCompatibility(connectorType: string, vehicleType?: string): boolean {
  if (!vehicleType) return true; // Default to compatible if no vehicle selected
  
  const c = connectorType.toLowerCase().replace(/\s/g, "");
  const v = vehicleType.toLowerCase().replace(/\s/g, "");

  // Common mappings
  const equivalents: Record<string, string[]> = {
    "ccs2": ["ccs", "ccs-2", "ccs2"],
    "ccs": ["ccs", "ccs-2", "ccs2"],
    "type2": ["type2", "type-2", "ac-type2"],
    "chademo": ["chademo"],
    "gbt": ["gbt", "gb/t"]
  };

  if (equivalents[v]) {
    return equivalents[v].includes(c) || c.includes(v) || v.includes(c);
  }

  // Broad fuzzy match if not in predefined map
  return c.includes(v) || v.includes(c);
}

/**
 * Formats a date relatively, handling Firestore timestamps and potentially invalid inputs safely.
 */
export function safeFormatDistanceToNow(date: any): string {
  if (!date) return "never";
  try {
    const d = typeof date.toDate === 'function' ? date.toDate() : new Date(date);
    if (isNaN(d.getTime())) return "recently";
    return formatDistanceToNow(d);
  } catch {
    return "recently";
  }
}
