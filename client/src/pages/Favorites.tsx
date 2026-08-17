import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { db } from "@/lib/firebase";
import { collection, query, where, onSnapshot, doc } from "firebase/firestore";
import { StationCard } from "@/components/station-card";
import { motion, AnimatePresence } from "framer-motion";
import { Heart, MapPin, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link, useLocation } from "wouter";

export default function Favorites() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [stations, setStations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // 1. Listen to user's favorite IDs
  useEffect(() => {
    if (!user) return;

    const userRef = doc(db, "users", user.uid);
    const unsubscribe = onSnapshot(userRef, (doc) => {
      if (doc.exists()) {
        const data = doc.data();
        setFavoriteIds(data.favoriteStations || []);
      }
    });

    return () => unsubscribe();
  }, [user]);

  // 2. Listen to the stations in the favorites list
  useEffect(() => {
    if (favoriteIds.length === 0) {
      setStations([]);
      setLoading(false);
      return;
    }

    // Note: Firestore 'in' query supports up to 30 elements
    // For a real production app with >30 favorites, we'd need to chunk this
    const q = query(
      collection(db, "stations"),
      where("__name__", "in", favoriteIds.slice(0, 30))
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedStations = snapshot.docs.map(doc => {
        const data = doc.data();
        const connectors = (data.connectors || []).map((c: any, index: number) => ({
          ...c,
          id: c.id || `conn-${index}-${c.type || 'unknown'}`
        }));
        return {
          id: doc.id,
          ...data,
          connectors
        };
      });
      
      // Maintain the order of favoriteIds if possible, or just sort by name
      setStations(fetchedStations);
      setLoading(false);
    }, (err) => {
      console.error("Error fetching favorite stations:", err);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [favoriteIds]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
        <p className="text-slate-400 font-medium">Loading your favorites...</p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-6 pb-24">
      <header className="space-y-1">
        <h1 className="text-3xl font-black tracking-tight flex items-center gap-2">
          <Heart className="w-8 h-8 text-red-500 fill-red-500" />
          My Favorites
        </h1>
        <p className="text-slate-400 text-sm">
          {stations.length} {stations.length === 1 ? "station" : "stations"} saved for quick access
        </p>
      </header>

      <AnimatePresence mode="popLayout">
        {stations.length > 0 ? (
          <motion.div 
            layout
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
          >
            {stations.map((station) => (
              <motion.div
                key={station.id}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.2 }}
              >
                <StationCard 
                  station={station} 
                  onClick={() => setLocation(`/station/${station.id}`)}
                />
              </motion.div>
            ))}
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center py-20 text-center space-y-6 bg-white/5 rounded-3xl border border-white/10 border-dashed"
          >
            <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center">
              <Heart className="w-10 h-10 text-slate-600" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-bold">No favorite stations yet</h2>
              <p className="text-slate-400 max-w-xs mx-auto">
                Bookmark stations you visit often to find them quickly here.
              </p>
            </div>
            <Link href="/">
              <Button className="bg-emerald-600 hover:bg-emerald-700 h-12 px-8 rounded-2xl font-bold gap-2">
                <Search className="w-4 h-4" />
                Browse Map
              </Button>
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
