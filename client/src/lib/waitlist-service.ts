import { db } from "./firebase";
import { 
  collection, 
  addDoc, 
  query, 
  where, 
  onSnapshot, 
  updateDoc, 
  doc, 
  getDocs, 
  serverTimestamp,
  orderBy,
  limit,
  Timestamp
} from "firebase/firestore";

export interface WaitlistEntry {
  id: string;
  stationId: string;
  connectorType: string;
  userId: string;
  userName: string;
  vehicleId: string;
  joinedAt: Timestamp;
  status: "waiting" | "notified" | "expired" | "booked";
  notifiedAt: Timestamp | null;
  position: number;
}

export const joinWaitlist = async (data: Omit<WaitlistEntry, "id" | "joinedAt" | "status" | "notifiedAt" | "position">) => {
  // Get current queue size to determine position
  const q = query(
    collection(db, "waitlists"),
    where("stationId", "==", data.stationId),
    where("connectorType", "==", data.connectorType),
    where("status", "==", "waiting")
  );
  const snap = await getDocs(q);
  const position = snap.size + 1;

  return addDoc(collection(db, "waitlists"), {
    ...data,
    joinedAt: serverTimestamp(),
    status: "waiting",
    notifiedAt: null,
    position
  });
};

export const leaveWaitlist = async (entryId: string) => {
  return updateDoc(doc(db, "waitlists", entryId), {
    status: "expired"
  });
};

export const getWaitlistStatus = (callback: (entries: WaitlistEntry[]) => void, stationId: string, connectorType?: string) => {
  let q = query(
    collection(db, "waitlists"),
    where("stationId", "==", stationId),
    where("status", "==", "waiting"),
    orderBy("joinedAt", "asc")
  );

  if (connectorType) {
    q = query(q, where("connectorType", "==", connectorType));
  }

  return onSnapshot(q, (snap) => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as WaitlistEntry)));
  });
};

export const notifyNextInWaitlist = async (stationId: string, connectorType: string) => {
  const q = query(
    collection(db, "waitlists"),
    where("stationId", "==", stationId),
    where("connectorType", "==", connectorType),
    where("status", "==", "waiting"),
    orderBy("joinedAt", "asc"),
    limit(1)
  );
  
  const snap = await getDocs(q);
  if (!snap.empty) {
    const entry = snap.docs[0];
    await updateDoc(doc(db, "waitlists", entry.id), {
      status: "notified",
      notifiedAt: serverTimestamp()
    });
    
    // Also create a notification for the user
    await addDoc(collection(db, "notifications"), {
      userId: entry.data().userId,
      title: "Station Available! ⚡",
      body: `A ${connectorType} connector is now available at ${entry.data().stationName || "your requested station"}. You have 15 minutes to start your booking.`,
      type: "STATION_AVAILABLE",
      stationId: entry.data().stationId,
      createdAt: serverTimestamp(),
      read: false
    });
    
    return entry.id;
  }
  return null;
};
