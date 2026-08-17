import { collection, query, where, getDocs, limit } from "firebase/firestore";
import { db } from "./firebase";

/**
 * Generates a random alphanumeric string of specified length
 */
export function generateRandomString(length: number): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Generates a unique referral code and checks its existence in Firestore
 */
export async function generateUniqueReferralCode(): Promise<string> {
  let isUnique = false;
  let code = "";
  
  while (!isUnique) {
    code = `SENEV-${generateRandomString(6)}`;
    const q = query(
      collection(db, "users"),
      where("referralCode", "==", code),
      limit(1)
    );
    const querySnapshot = await getDocs(q);
    if (querySnapshot.empty) {
      isUnique = true;
    }
  }
  
  return code;
}
