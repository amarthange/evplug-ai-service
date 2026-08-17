import { useState, useEffect } from "react";
import { collection, query, where, orderBy, limit, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";

/**
 * Real-time notification hook for monitoring a user's alerts.
 * Best used for the notification bell badge and live alerts.
 */
export const useNotifications = (userId: string | undefined) => {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, "notifications"),
      where("userId", "==", userId),
      orderBy("createdAt", "desc"),
      limit(20)
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        setNotifications(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        setLoading(false);
      },
      (err) => {
        console.error("Error fetching notifications:", err);
        setError(err);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [userId]);

  return { notifications, loading, error };
};
