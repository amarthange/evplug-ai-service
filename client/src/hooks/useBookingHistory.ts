import { useQuery } from "@tanstack/react-query";
import { collection, query, where, orderBy, limit, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { BOOKING_STATUS } from "@/constants/bookingStatus";
import type { Booking } from "@shared/schema";

/**
 * Cached hook for fetching completed and cancelled bookings for a specific user.
 * Utilizes TanStack Query for caching and efficient data management.
 */
export const useBookingHistory = (userId: string | undefined) => {
  return useQuery({
    queryKey: ["bookings", "history", userId],
    queryFn: async () => {
      if (!userId) return [];
      
      const q = query(
        collection(db, "bookings"),
        where("userId", "==", userId),
        where("status", "in", [BOOKING_STATUS.COMPLETED, BOOKING_STATUS.CANCELLED]),
        orderBy("startTime", "desc"),
        limit(50)
      );

      const snap = await getDocs(q);
      return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Booking));
    },
    enabled: !!userId,
    staleTime: 5 * 60 * 1000, // 5 minute cache
    gcTime: 30 * 60 * 1000,    // 30 minute garbage collection
  });
};
