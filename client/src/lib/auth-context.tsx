import React, { createContext, useContext, useState, useEffect } from "react";
import { User as FirebaseUser, onAuthStateChanged, signOut as firebaseSignOut } from "firebase/auth";
import { auth, db, messaging } from "./firebase";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { getToken } from "firebase/messaging";
import type { UserRoleValue } from "@shared/schema";

interface AuthContextType {
  user: FirebaseUser | null;
  userData: any | null;
  userRole: UserRoleValue | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  console.log("🛠️ AuthProvider initializing...");
  console.log("📦 React status:", React ? "Loaded" : "NULL");
  console.log("📦 useState status:", typeof useState === "function" ? "Available" : "Missing");

  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [userData, setUserData] = useState<any | null>(null);
  const [userRole, setUserRole] = useState<UserRoleValue | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      
      if (firebaseUser) {
        try {
          // 1️⃣ Check if user is an Owner first (owners collection)
          const ownerDocRef = doc(db, "owners", firebaseUser.uid);
          const ownerDoc = await getDoc(ownerDocRef);
          if (ownerDoc.exists()) {
            setUserData(ownerDoc.data());
            setUserRole("owner");
            setLoading(false);
            return;
          }

          // 2️⃣ Then check the regular users collection
          const userDocRef = doc(db, "users", firebaseUser.uid);
          const userDoc = await getDoc(userDocRef);
          if (userDoc.exists()) {
            const data = userDoc.data();
            setUserData(data);
            const role = data.role;
            setUserRole(role === "admin" ? "admin" : "ev_user");
          } else {
            setUserRole("ev_user"); // Default
          }
        } catch (error) {
          console.error("Error fetching user role:", error);
          setUserRole("ev_user");
        }
      } else {
        setUserRole(null);
        setUserData(null);
      }
      
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  // Request notification permission and save FCM token
  useEffect(() => {
    if (!user || userRole !== "ev_user" || !messaging) return;

    const saveTokenToFirestore = async (token: string) => {
       try {
         const userRef = doc(db, "users", user.uid);
         await updateDoc(userRef, { fcmToken: token });
         console.log("✅ FCM Token saved to Firestore");
       } catch (error) {
         console.error("Failed to save FCM token:", error);
       }
    };

    const requestPermission = async () => {
      try {
        const permission = await Notification.requestPermission();
        if (permission === 'granted' && messaging) {
          const token = await getToken(messaging, { 
            vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY 
          });
          if (token) {
            await saveTokenToFirestore(token);
          }
        }
      } catch (error) {
        console.error("Notification permission error:", error);
      }
    };

    requestPermission();
  }, [user, userRole]);

  const signOut = async () => {
    await firebaseSignOut(auth);
    setUserRole(null);
    setUserData(null);
  };

  return (
    <AuthContext.Provider value={{ user, userData, userRole, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
