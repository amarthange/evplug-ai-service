// User profile and EV details management
import { doc, setDoc, getDoc, updateDoc, writeBatch, getDocs, query, collection, where, serverTimestamp } from "firebase/firestore";
import { db, auth } from "./firebase";

export interface EVProfile {
  vehicleMakeModel: string;
  vehicleRegistrationNumber: string;
  preferredConnectorType: "CCS" | "CHAdeMO" | "Type 2" | "Tesla Supercharger";
  batteryCapacityKWh?: number;
  preferredChargingPowerKW?: number;
  defaultPaymentMethod?: "card" | "upi" | "wallet";
}

export interface UserProfile {
  uid: string;
  fullName: string;
  email: string;
  phoneNumber: string;
  createdAt: number;
  hasCompletedProfile: boolean;
  evProfile?: EVProfile;
  profileCompletedAt?: number;
  role?: "ev_user" | "admin" | "owner";
  referralCode: string;
  referredBy?: string;
  referralCount: number;
  loyaltyPoints: number;
}

/**
 * Create initial user profile after signup
 */
export async function createUserProfile(uid: string, data: any) {
  const { generateUniqueReferralCode } = await import("./auth");
  const referralCode = await generateUniqueReferralCode();

  const userProfile: UserProfile = {
    uid,
    ...data,
    createdAt: Date.now(),
    hasCompletedProfile: false,
    referralCode,
    referralCount: 0,
    loyaltyPoints: 0,
  };

  await setDoc(doc(db, "users", uid), userProfile);
  console.log(`✅ Created user profile for ${uid} with code ${referralCode}`);
}

/**
 * Get user profile from Firestore
 */
export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  try {
    const userDoc = await getDoc(doc(db, "users", uid));
    if (userDoc.exists()) {
      return userDoc.data() as UserProfile;
    }
    return null;
  } catch (error) {
    console.error("Error fetching user profile:", error);
    return null;
  }
}

/**
 * Update user profile with EV details
 */
export async function updateUserProfile(
  uid: string,
  data: Partial<UserProfile>
): Promise<void> {
  await updateDoc(doc(db, "users", uid), data);
  console.log(`✅ Updated user profile for ${uid}`);
}

export const deleteUserAccount = async (
  uid: string
) => {
  const batch = writeBatch(db);
  
  // Cancel active bookings:
  const activeBookings = await getDocs(query(
    collection(db, "bookings"),
    where("userId", "==", uid),
    where("status", "in",
      ["confirmed", "active", "pending"])
  ));
  activeBookings.docs.forEach(d => {
    batch.update(d.ref, {
      status: "cancelled",
      cancelledAt: serverTimestamp(),
      cancellationReason: "account_deleted"
    });
  });
  
  // Delete user document:
  batch.delete(doc(db, "users", uid));
  await batch.commit();
  
  // Delete from Firebase Auth:
  if (auth.currentUser?.uid === uid) {
    await auth.currentUser.delete();
  }
}

export const exportUserData = async (
  uid: string
) => {
  const [userDoc, vehiclesSnap, bookingsSnap,
    reviewsSnap] = await Promise.all([
    getDoc(doc(db, "users", uid)),
    getDocs(collection(db, "users", uid,
      "ev_vehicles")),
    getDocs(query(collection(db, "bookings"),
      where("userId", "==", uid))),
    getDocs(query(collection(db, "reviews"),
      where("userId", "==", uid)))
  ]);
  
  return {
    profile: userDoc.data(),
    vehicles: vehiclesSnap.docs.map(d => d.data()),
    bookings: bookingsSnap.docs.map(d => d.data()),
    reviews: reviewsSnap.docs.map(d => d.data()),
    exportedAt: new Date().toISOString()
  };
}

export const updateFCMToken = async (
  uid: string,
  token: string
) => {
  const userRef = doc(db, "users", uid);
  const snap = await getDoc(userRef);
  if (snap.data()?.fcmToken !== token) {
    await updateDoc(userRef, { fcmToken: token });
  }
}

export const getUsersByRole = async (
  role: "ev_user" | "owner" | "admin"
) => {
  const snap = await getDocs(query(
    collection(db, "users"),
    where("role", "==", role)
  ));
  return snap.docs.map(d => ({
    id: d.id, ...d.data()
  }));
}

export const searchUsers = async (
  searchQuery: string
) => {
  const allUsers = await getDocs(
    collection(db, "users"));
  const q = searchQuery.toLowerCase();
  return allUsers.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter((u: any) =>
      u.displayName?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q) ||
      u.phoneNumber?.includes(searchQuery)
    );
}
