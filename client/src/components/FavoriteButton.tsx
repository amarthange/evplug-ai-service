import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Heart } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { db } from "@/lib/firebase";
import { doc, updateDoc, arrayUnion, arrayRemove, onSnapshot } from "firebase/firestore";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

interface FavoriteButtonProps {
  stationId: string;
  className?: string;
  variant?: "ghost" | "default" | "secondary";
}

export function FavoriteButton({ stationId, className, variant = "ghost" }: FavoriteButtonProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isFavorite, setIsFavorite] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    if (!user) return;

    // We listen to the user profile to get real-time favorite status
    const userRef = doc(db, "users", user.uid);
    const unsubscribe = onSnapshot(userRef, (doc) => {
      if (doc.exists()) {
        const data = doc.data();
        setIsFavorite(
          data.favouriteStationIds?.includes(stationId) || 
          data.favoriteStations?.includes(stationId) || 
          false
        );
      }
    });

    return () => unsubscribe();
  }, [user, stationId]);

  const toggleFavorite = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!user) {
      toast({
        title: "Sign in required",
        description: "Please sign in to save favorite stations.",
        variant: "destructive",
      });
      return;
    }

    if (isUpdating) return;

    setIsUpdating(true);
    const userRef = doc(db, "users", user.uid);

    try {
      // Haptic feedback
      if (navigator.vibrate) {
        navigator.vibrate(50);
      }

      if (isFavorite) {
        await updateDoc(userRef, {
          favouriteStationIds: arrayRemove(stationId),
          favoriteStations: arrayRemove(stationId) // Legacy compatibility
        });
      } else {
        await updateDoc(userRef, {
          favouriteStationIds: arrayUnion(stationId),
          favoriteStations: arrayUnion(stationId) // Legacy compatibility
        });
      }
    } catch (err) {
      console.error("Error toggling favorite:", err);
      toast({
        title: "Error",
        description: "Failed to update favorites. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <motion.button
      whileTap={{ scale: 0.8 }}
      onClick={toggleFavorite}
      className={cn(
        "relative p-2 rounded-full transition-colors",
        variant === "ghost" && "hover:bg-white/10",
        className
      )}
      disabled={isUpdating}
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={isFavorite ? "filled" : "outline"}
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0, opacity: 0 }}
          transition={{ duration: 0.2, type: "spring", stiffness: 400, damping: 25 }}
        >
          <Heart
            className={cn(
              "w-6 h-6",
              isFavorite 
                ? "fill-red-500 text-red-500 drop-shadow-[0_0_8px_rgba(239,68,68,0.5)]" 
                : "text-slate-400"
            )}
          />
        </motion.div>
      </AnimatePresence>
    </motion.button>
  );
}
