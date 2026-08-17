import { useState, useEffect } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Booking } from "@shared/schema";

/**
 * Real-time hook for monitoring a specific booking's state.
 * Best used for active charging sessions where immediate updates are critical.
 */
export const useActiveBooking = (bookingId: string | undefined) => {
  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!bookingId) {
      setLoading(false);
      return;
    }

    const unsub = onSnapshot(
      doc(db, "bookings", bookingId),
      (snap) => {
        if (snap.exists()) {
          setBooking({ id: snap.id, ...snap.data() } as Booking);
        } else {
          setBooking(null);
        }
        setLoading(false);
      },
      (err) => {
        console.error("Error fetching active booking:", err);
        setError(err);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [bookingId]);

  return { booking, loading, error };
};
