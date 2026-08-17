import { useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { getWriteQueue, clearWriteQueue, type QueuedWrite } from "@/lib/offline-storage";
import { db } from "@/lib/firebase";
import { doc, setDoc, addDoc, collection } from "firebase/firestore";

export function useOfflineSync() {
  const { toast } = useToast();

  useEffect(() => {
    const syncQueue = async () => {
      const queue = await getWriteQueue();
      if (queue.length === 0) return;

      toast({
        title: "Syncing data...",
        description: `Back online! Syncing ${queue.length} pending updates.`,
      });

      try {
        for (const item of queue) {
          if (item.id) {
            await setDoc(doc(db, item.collection, item.id), item.data, { merge: true });
          } else {
            await addDoc(collection(db, item.collection), item.data);
          }
        }
        
        await clearWriteQueue();
        
        toast({
          title: "Sync Complete",
          description: "All pending updates have been synchronized with the cloud.",
          variant: "default",
        });
      } catch (error) {
        console.error("Offline sync failed:", error);
        toast({
          title: "Sync Failed",
          description: "Some updates couldn't be synced. We will try again later.",
          variant: "destructive",
        });
      }
    };

    window.addEventListener("online", syncQueue);
    
    // Check on mount as well if we just came online
    if (navigator.onLine) {
      syncQueue();
    }

    return () => {
      window.removeEventListener("online", syncQueue);
    };
  }, [toast]);
}
