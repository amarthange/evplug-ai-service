import { 
  collection, 
  doc, 
  setDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy, 
  onSnapshot,
  Timestamp,
  getDocs,
  limit
} from "firebase/firestore";
import { db } from "./firebase";

export interface WaitlistEntry {
  userId: string;
  displayName: string;
  vehicleType: string;
  joinedAt: Timestamp;
  notified: boolean;
  expiresAt: Timestamp;
}

/**
 * Joins the waitlist for a specific station
 */
export async function joinWaitlist(
  stationId: string, 
  userId: string, 
  displayName: string, 
  vehicleType: string
) {
  const waitlistRef = doc(db, "stations", stationId, "waitlist", userId);
  const now = Timestamp.now();
  const expiresAt = Timestamp.fromMillis(now.toMillis() + 30 * 60 * 1000); // 30 mins

  await setDoc(waitlistRef, {
    userId,
    displayName: displayName.split(' ')[0], // First name only for privacy
    vehicleType,
    joinedAt: now,
    notified: false,
    expiresAt
  });
}

/**
 * Leaves the waitlist
 */
export async function leaveWaitlist(stationId: string, userId: string) {
  const waitlistRef = doc(db, "stations", stationId, "waitlist", userId);
  await deleteDoc(waitlistRef);
}

/**
 * Checks if the user is first in the active waitlist
 */
export function isUserFirstInLine(
  activeWaitlist: WaitlistEntry[], 
  userId: string
): boolean {
  if (activeWaitlist.length === 0) return false;
  
  // Sort by joinedAt ascending
  const sorted = [...activeWaitlist].sort((a, b) => 
    a.joinedAt.toMillis() - b.joinedAt.toMillis()
  );
  
  return sorted[0].userId === userId;
}

/**
 * Filters out expired waitlist entries
 */
export function getActiveWaitlist(entries: WaitlistEntry[]): WaitlistEntry[] {
  const now = Date.now();
  return entries.filter(entry => entry.expiresAt.toMillis() > now);
}
