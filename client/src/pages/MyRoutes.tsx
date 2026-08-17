import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { db } from "@/lib/firebase";
import { collection, query, where, getDocs, deleteDoc, doc, orderBy } from "firebase/firestore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { 
  Navigation, 
  Trash2, 
  Calendar, 
  MapPin, 
  Zap, 
  ChevronRight,
  Route as RouteIcon,
  Search
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { format } from "date-fns";
import { useLocation } from "wouter";

export default function MyRoutes() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [routes, setRoutes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRoutes = async () => {
    if (!user) return;
    try {
      const q = query(
        collection(db, "saved_routes"), 
        where("userId", "==", user.uid),
        orderBy("createdAt", "desc")
      );
      const snap = await getDocs(q);
      setRoutes(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    } catch (err) {
      console.error("Error fetching routes:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRoutes();
  }, [user]);

  const deleteRoute = async (id: string) => {
    try {
      await deleteDoc(doc(db, "saved_routes", id));
      setRoutes(routes.filter(r => r.id !== id));
      toast({ title: "Deleted", description: "Route removed from your list" });
    } catch (err) {
      toast({ title: "Error", description: "Failed to delete route", variant: "destructive" });
    }
  };

  return (
    <div className="min-h-screen bg-[#0f172a] text-white pb-32 pt-8 px-6">
      <div className="max-w-2xl mx-auto space-y-8">
        <div className="flex justify-between items-center">
          <div className="space-y-1">
            <h1 className="text-3xl font-black bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
              My Journeys
            </h1>
            <p className="text-sm text-white/40">Your saved trips and itineraries</p>
          </div>
          <Button 
            onClick={() => setLocation("/plan-route")}
            className="rounded-xl bg-emerald-500 hover:bg-emerald-600 font-bold h-12 px-6"
          >
            New Trip
          </Button>
        </div>

        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-32 bg-white/5 rounded-3xl animate-pulse" />
            ))}
          </div>
        ) : routes.length === 0 ? (
          <Card className="bg-white/5 border-dashed border-2 border-white/10 rounded-[32px] p-12 text-center">
            <RouteIcon className="w-16 h-16 text-white/10 mx-auto mb-4" />
            <h2 className="text-xl font-black mb-2">No Saved Trips</h2>
            <p className="text-sm text-white/40 mb-6">Plan your first EV journey with optimized charging stops.</p>
            <Button 
              variant="outline" 
              className="rounded-2xl font-black border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/10"
              onClick={() => setLocation("/plan-route")}
            >
              Start Planning
            </Button>
          </Card>
        ) : (
          <div className="space-y-4">
            <AnimatePresence>
              {routes.map((route, idx) => (
                <motion.div
                  key={route.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ delay: idx * 0.1 }}
                >
                  <Card className="bg-[#1e293b]/50 border-white/10 overflow-hidden hover:border-emerald-500/50 transition-all group">
                    <CardContent className="p-0">
                      <div className="p-6 space-y-4">
                        <div className="flex justify-between items-start">
                          <div className="space-y-1">
                            <h3 className="text-xl font-black text-white group-hover:text-emerald-400 transition-colors">
                              {route.name}
                            </h3>
                            <p className="text-[10px] font-black uppercase text-white/40 flex items-center gap-1.5">
                              <Calendar className="w-3 h-3" /> 
                              {format(route.createdAt.toDate(), "PPP")}
                            </p>
                          </div>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => deleteRoute(route.id)}
                            className="text-white/20 hover:text-red-400 hover:bg-red-400/10 rounded-xl"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>

                        <div className="flex items-center gap-4 py-2 relative">
                          <div className="absolute left-[11px] top-6 bottom-6 w-0.5 bg-dashed border-l border-white/10" />
                          <div className="flex flex-col gap-6 w-full">
                            <div className="flex items-center gap-3">
                              <div className="w-6 h-6 rounded-full bg-emerald-500/20 border border-emerald-500/50 flex items-center justify-center shrink-0">
                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                              </div>
                              <p className="text-sm font-bold truncate opacity-80">{route.origin.address}</p>
                            </div>
                            <div className="flex items-center gap-3">
                              <MapPin className="w-6 h-6 text-red-500 shrink-0" />
                              <p className="text-sm font-bold truncate opacity-80">{route.destination.address}</p>
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-4 pt-2">
                          <div className="bg-white/5 rounded-2xl p-3 text-center">
                            <p className="text-[10px] font-black uppercase text-white/40 mb-0.5">Distance</p>
                            <p className="font-black text-sm">{Math.round(route.totalDistance)} km</p>
                          </div>
                          <div className="bg-white/5 rounded-2xl p-3 text-center">
                            <p className="text-[10px] font-black uppercase text-white/40 mb-0.5">Duration</p>
                            <p className="font-black text-sm">{Math.round(route.totalDuration / 60)}h {Math.round(route.totalDuration % 60)}m</p>
                          </div>
                          <div className="bg-white/5 rounded-2xl p-3 text-center">
                            <p className="text-[10px] font-black uppercase text-white/40 mb-0.5">Stops</p>
                            <div className="flex items-center justify-center gap-1.5">
                              <Zap className="w-3 h-3 text-orange-400" />
                              <p className="font-black text-sm">{route.chargingStops?.length || 0}</p>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="bg-white/5 p-4 flex gap-3">
                        <Button 
                          onClick={() => setLocation(`/plan-route?id=${route.id}`)}
                          className="flex-1 bg-white text-black hover:bg-white/90 rounded-xl font-black h-12 uppercase tracking-widest text-xs"
                        >
                          View on Map <Navigation className="w-3.5 h-3.5 ml-2" />
                        </Button>
                        <Button 
                          variant="outline"
                          className="flex-1 rounded-xl border-white/10 hover:bg-white/5 font-black h-12 uppercase tracking-widest text-xs"
                        >
                          Start Journey <ChevronRight className="w-3.5 h-3.5 ml-2" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}
