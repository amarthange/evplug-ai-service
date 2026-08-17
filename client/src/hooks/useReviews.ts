import { useQuery } from "@tanstack/react-query";
import { collection, query, where, orderBy, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Review } from "@shared/schema";

/**
 * Cached hook for fetching reviews for a specific station.
 * Best used for the station detail reviews tab.
 */
export const useReviews = (stationId: string | undefined) => {
  return useQuery({
    queryKey: ["reviews", stationId],
    queryFn: async () => {
      if (!stationId) return [];
      
      const q = query(
        collection(db, "reviews"),
        where("stationId", "==", stationId),
        orderBy("createdAt", "desc")
      );

      const snap = await getDocs(q);
      return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Review));
    },
    enabled: !!stationId,
    staleTime: 5 * 60 * 1000, // 5 minute cache
    gcTime: 30 * 60 * 1000,    // 30 minute garbage collection
  });
};
