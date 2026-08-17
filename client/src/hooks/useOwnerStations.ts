import { useState, useEffect } from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Station } from "@shared/schema";

/**
 * Real-time hook for monitoring charging stations owned by a specific user.
 * Best used for the Owner Dashboard and management flows.
 */
export const useOwnerStations = (ownerId: string | undefined) => {
  const [stations, setStations] = useState<Station[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!ownerId) {
      setLoading(false);
      return;
    }

    const q = query(collection(db, "stations"), where("ownerId", "==", ownerId));

    const unsub = onSnapshot(
      q,
      (snap) => {
        setStations(snap.docs.map((doc) => {
          const data = doc.data();
          const connectors = (data.connectors || []).map((c: any, index: number) => ({
            ...c,
            id: c.id || `conn-${index}-${c.type || 'unknown'}`
          }));
          return { id: doc.id, ...data, connectors } as Station;
        }));
        setLoading(false);
      },
      (err) => {
        console.error("Error fetching owner stations:", err);
        setError(err);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [ownerId]);

  return { stations, loading, error };
};
