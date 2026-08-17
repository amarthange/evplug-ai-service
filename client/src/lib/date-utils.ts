import { format as dfnsFormat, formatDistanceToNow as dfnsFormatDistanceToNow } from "date-fns";

/**
 * Normalizes various date formats (Firestore Timestamp, ISO String, Number, Date) 
 * into a standard JavaScript Date object.
 */
export function toJSDate(val: any): Date {
  if (!val) return new Date();
  
  // Handle Firestore Timestamp { seconds: number, nanoseconds: number }
  if (typeof val === "object" && "seconds" in val) {
    return new Date(val.seconds * 1000);
  }
  
  // Handle strings (ISO) or numbers (ms)
  const date = new Date(val);
  if (isNaN(date.getTime())) {
    return new Date(); // Fallback to now if invalid
  }
  
  return date;
}

/**
 * Normalizes to absolute millisecond timestamp
 */
export function toTimestamp(val: any): number {
  return toJSDate(val).getTime();
}

/**
 * Safely format distance to now, handling Firestore Timestamps or nulls.
 */
export function safeFormatDistanceToNow(val: any, options?: any): string {
  if (!val) return "N/A";
  try {
    return dfnsFormatDistanceToNow(toJSDate(val), options);
  } catch (err) {
    console.error("Date formatting error (distance):", err, "Value:", val);
    return "N/A";
  }
}

/**
 * Safely format a date string, handling Firestore Timestamps or nulls.
 */
export function safeFormat(val: any, formatStr: string): string {
  if (!val) return "N/A";
  try {
    return dfnsFormat(toJSDate(val), formatStr);
  } catch (err) {
    console.error("Date formatting error (format):", err, "Value:", val, "Pattern:", formatStr);
    return "N/A";
  }
}
