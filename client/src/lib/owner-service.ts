import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDoc,
  query,
  where,
  onSnapshot,
  Timestamp,
  writeBatch,
  getDocs,
  serverTimestamp,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL, deleteObject, listAll } from "firebase/storage";
import { db, storage } from "@/lib/firebase";

export interface OwnerProfile {
  uid: string;
  email: string;
  fullName: string;
  businessName: string;
  phone: string;
  address: string;
  role: "owner";
  createdAt: number;
  upiId?: string;
  upiQrUrl?: string;
  operatingHours?: {
    [key: string]: { open: string; close: string; closed: boolean };
  };
  vacationMode?: { enabled: boolean; startDate?: string; endDate?: string };
  timeDecay?: {
    enabled: boolean;
    priceFloor: number;
  };
}

export interface Connector {
  id: string;
  type: "CCS" | "CHAdeMO" | "Type 2" | "Tesla Supercharger";
  powerKw: number;
  count: number;
  pricePerKwh: number;
  available: boolean;
  pricing?: {
    baseRate: number;
    peakRate: number;
    peakStart: string;
    peakEnd: string;
    weekendRate: number;
  };
  enabled?: boolean;
  disabledAt?: string;
  disabledReason?: string;
}

export interface Station {
  id: string;
  name: string;
  description?: string;
  address: string;
  lat: number;
  lon: number;
  connectors: Connector[];
  images?: string[];
  hoursLabel?: string; 
  operatingHours?: { open: string; close: string };
  status: "pending" | "active" | "maintenance" | "rejected" | "offline";
  ownerId: string;
  createdAt?: number;
  updatedAt?: number;
  amenities?: string[];
  maintenanceStartedAt?: any;
  maintenanceReason?: string;
  scheduledMaintenance?: {
    startDate: string;
    endDate: string;
    reason: string;
  };
  maintenanceWindows?: any[];
  duplicatedFrom?: string;
  internalNotes?: string;
  notesUpdatedAt?: any;
  maintenanceRiskScore?: number;
  lastMaintenanceDate?: number;
  nextSuggestedMaintenance?: number;
  faultHistory?: {
    date: number;
    type: string;
    resolved: boolean;
  }[];
}

// Get owner profile
export async function getOwnerProfile(uid: string): Promise<OwnerProfile | null> {
  try {
    const ownerDoc = await getDoc(doc(db, "owners", uid));
    if (ownerDoc.exists()) {
      return ownerDoc.data() as OwnerProfile;
    }
    return null;
  } catch (error) {
    console.error("Error fetching owner profile:", error);
    return null;
  }
}

// Create station
export async function createStation(
  ownerId: string,
  stationData: Omit<Station, "id" | "ownerId" | "createdAt" | "updatedAt" | "status">
): Promise<string> {
  // Data Validation Layer
  if (typeof stationData.lat !== 'number' || isNaN(stationData.lat) ||
      typeof stationData.lon !== 'number' || isNaN(stationData.lon)) {
    throw new Error("Invalid location: lat and lon must be numbers");
  }
  if (!Array.isArray(stationData.connectors)) {
    throw new Error("Invalid connectors: must be an array");
  }
  stationData.connectors.forEach((c, idx) => {
    if (typeof c.powerKw !== 'number' || isNaN(c.powerKw)) throw new Error(`Connector ${idx}: powerKw must be a number`);
    if (typeof c.pricePerKwh !== 'number' || isNaN(c.pricePerKwh)) throw new Error(`Connector ${idx}: pricePerKwh must be a number`);
    // Connector Safety Fix: Handle NaN/undefined count
    c.count = isNaN(Number(c.count)) || c.count === undefined ? 0 : Number(c.count);
  });

  try {
    const docRef = await addDoc(collection(db, "stations"), {
      ...stationData,
      ownerId,
      status: "pending",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    console.log("✅ Station created:", docRef.id);
    return docRef.id;
  } catch (error) {
    console.error("Error creating station:", error);
    throw error;
  }
}

// Update station
export async function updateStation(
  stationId: string,
  updates: Partial<Omit<Station, "id" | "ownerId" | "createdAt">>
): Promise<void> {
  // Partial validation
  if (updates.lat !== undefined || updates.lon !== undefined) {
    const lat = updates.lat ?? (updates as any).location?.lat;
    const lon = updates.lon ?? (updates as any).location?.lon;
    if (typeof lat !== 'number' || isNaN(lat) ||
        typeof lon !== 'number' || isNaN(lon)) {
      throw new Error("Invalid location: lat and lon must be numbers");
    }
  }
  if (updates.connectors) {
    if (!Array.isArray(updates.connectors)) throw new Error("Invalid connectors: must be an array");
    updates.connectors.forEach((c, idx) => {
      if (typeof c.powerKw !== 'number' || isNaN(c.powerKw)) throw new Error(`Connector ${idx}: powerKw must be a number`);
      if (typeof c.pricePerKwh !== 'number' || isNaN(c.pricePerKwh)) throw new Error(`Connector ${idx}: pricePerKwh must be a number`);
      c.count = isNaN(Number(c.count)) || c.count === undefined ? 0 : Number(c.count);
    });
  }

  try {
    await updateDoc(doc(db, "stations", stationId), {
      ...updates,
      updatedAt: Date.now(),
    });
    console.log("✅ Station updated:", stationId);
  } catch (error) {
    console.error("Error updating station:", error);
    throw error;
  }
}

// Delete station
export async function deleteStation(stationId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, "stations", stationId));
    console.log("✅ Station deleted:", stationId);
  } catch (error) {
    console.error("Error deleting station:", error);
    throw error;
  }
}

// Get owner's stations (real-time)
export function subscribeToOwnerStations(
  ownerId: string,
  callback: (stations: Station[]) => void
): () => void {
  try {
    const q = query(collection(db, "stations"), where("ownerId", "==", ownerId));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const stations = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      } as Station));
      callback(stations);
    });
    return unsubscribe;
  } catch (error) {
    console.error("Error subscribing to stations:", error);
    return () => {};
  }
}

// Upload station image
export async function uploadStationImage(
  stationId: string,
  file: File
): Promise<string> {
  try {
    const fileName = `${Date.now()}-${file.name}`;
    const storageRef = ref(storage, `stations/${stationId}/images/${fileName}`);
    
    // Use uploadBytes instead for simpler implementation
    const snapshot = await uploadBytes(storageRef, file);
    const downloadURL = await getDownloadURL(snapshot.ref);
    
    console.log("✅ Image uploaded:", downloadURL);
    return downloadURL;
  } catch (error) {
    console.error("Error uploading image:", error);
    throw error;
  }
}

// Delete station image
export async function deleteStationImage(imagePath: string): Promise<void> {
  try {
    const imageRef = ref(storage, imagePath);
    await deleteObject(imageRef);
    console.log("✅ Image deleted");
  } catch (error) {
    console.error("Error deleting image:", error);
    throw error;
  }
}

// Upload Owner UPI QR Code
export async function uploadOwnerQrImage(
  ownerId: string,
  file: File
): Promise<string> {
  try {
    const fileName = `upi-qr-${Date.now()}`;
    const storageRef = ref(storage, `owners/${ownerId}/payment/${fileName}`);
    
    const snapshot = await uploadBytes(storageRef, file);
    const downloadURL = await getDownloadURL(snapshot.ref);
    
    console.log("✅ UPI QR Code uploaded:", downloadURL);
    return downloadURL;
  } catch (error) {
    console.error("Error uploading QR code:", error);
    throw error;
  }
}

// Helper to calculate session duration in minutes
const calculateDuration = (booking: any) => {
  if (!booking.startTime || !booking.endTime) return 0;
  const start = booking.startTime.toDate ? booking.startTime.toDate() : new Date(booking.startTime);
  const end = booking.endTime.toDate ? booking.endTime.toDate() : new Date(booking.endTime);
  return Math.max(0, (end.getTime() - start.getTime()) / (1000 * 60));
};

export const deleteStationExtended = async (
  stationId: string,
  ownerId: string
) => {
  // Cancel future bookings:
  const futureBookings = await getDocs(query(
    collection(db, "bookings"),
    where("stationId", "==", stationId),
    where("status", "in",
      ["confirmed", "pending"])
  ));
  
  const batch = writeBatch(db);
  futureBookings.docs.forEach(d => {
    batch.update(d.ref, {
      status: "cancelled",
      cancellationReason: "station_deleted"
    });
  });
  batch.delete(doc(db, "stations", stationId));
  await batch.commit();
  
  // Delete images from Storage:
  try {
    const imageRef = ref(storage,
      `stations/${stationId}/images`);
    const list = await listAll(imageRef);
    await Promise.all(list.items.map(
      item => deleteObject(item)));
  } catch (error) {
    console.warn("Storage deletion warning:", error);
  }
}

export const getStationAnalytics = async (
  stationId: string,
  days: number = 30
) => {
  const since = new Date(
    Date.now() - days * 86400000);
  
  const bookingsSnap = await getDocs(query(
    collection(db, "bookings"),
    where("stationId", "==", stationId),
    where("status", "==", "completed"),
    where("createdAt", ">=",
      Timestamp.fromDate(since))
  ));
  
  const bookings = bookingsSnap.docs.map(
    d => d.data());
  
  return {
    totalSessions: bookings.length,
    totalRevenue: bookings.reduce(
      (s, b) => s + (b.totalPrice || 0), 0),
    totalKwh: bookings.reduce(
      (s, b) => s + (b.energyDeliveredKwh || 0), 0),
    avgSessionDuration: bookings.length > 0
      ? bookings.reduce((s, b) => 
          s + calculateDuration(b), 0) / 
        bookings.length
      : 0,
    uniqueDrivers: new Set(
      bookings.map(b => b.userId)).size
  };
}

export const bulkUpdateStations = async (
  stationIds: string[],
  updates: Record<string, any>
) => {
  const batch = writeBatch(db);
  stationIds.forEach(id => {
    batch.update(doc(db, "stations", id), updates);
  });
  await batch.commit();
}

export const uploadOwnerLogo = async (
  ownerId: string,
  file: File
): Promise<string> => {
  if (file.size > 2 * 1024 * 1024) {
    throw new Error("File too large. Max 2MB.");
  }
  
  const fileRef = ref(storage,
    `owners/${ownerId}/logo.jpg`);
  await uploadBytes(fileRef, file);
  const url = await getDownloadURL(fileRef);
  
  await updateDoc(doc(db, "owners", ownerId), {
    logoUrl: url,
    logoUpdatedAt: serverTimestamp()
  });
  
  return url;
}
