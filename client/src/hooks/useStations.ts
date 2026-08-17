import { useQuery } from "@tanstack/react-query";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Station } from "@shared/schema";

/**
 * Cached hook for fetching all active charging stations.
 * Best used for mapping and general station discovery.
 */
export const useStations = () => {
  return useQuery({
    queryKey: ["stations", "all"],
    queryFn: async () => {
      const q = query(collection(db, "stations"), where("status", "==", "active"));
      const snap = await getDocs(q);
      return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Station));
    },
    staleTime: 5 * 60 * 1000, // 5 minute cache
    gcTime: 30 * 60 * 1000,    // 30 minute garbage collection
  });
};
