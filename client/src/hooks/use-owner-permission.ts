import { useState, useEffect } from "react";
import { db, auth } from "@/lib/firebase";
import { collectionGroup, query, where, getDocs } from "firebase/firestore";

/**
 * useOwnerPermission Hook
 * 
 * Determines the current user's role in the station management ecosystem.
 * - Owner: Primary account holder with full CRUD access.
 * - Manager: Can view most data and edit stations (no delete).
 * - View Only: Read-only access to dashboard and ledger.
 */
export const useOwnerPermission = () => {
  const [role, setRole] = useState<"owner" | "manager" | "view_only">("owner");
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    const checkRole = async () => {
      // Ensure user is logged in
      const user = auth.currentUser;
      if (!user?.email) {
        setLoading(false);
        return;
      }
      
      try {
        // Query across all teamMembers subcollections for this email
        // Note: Requires an Every-Level Index on 'teamMembers' (collectionGroup)
        const snap = await getDocs(
          query(collectionGroup(db, "teamMembers"),
          where("email", "==", user.email))
        );
        
        if (!snap.empty) {
          // For now, take the first role found. 
          // In a multi-owner scenario, this would filter by the current workspace ownerId.
          const data = snap.docs[0].data();
          setRole(data.role as "owner" | "manager" | "view_only");
        } else {
          // If not found in any teamMembers subcollection, default to 'owner' 
          // (assuming they are the primary owner of their own account).
          setRole("owner");
        }
      } catch (error) {
        console.error("Error checking permissions:", error);
        // Fallback to owner to avoid locking out legitimate primary owners
        setRole("owner");
      } finally {
        setLoading(false);
      }
    };
    
    checkRole();
  }, []);
  
  return { role, loading };
};
