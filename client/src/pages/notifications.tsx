import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  Bell, Check, Trash2, MapPin, Loader2, 
  ChevronRight,
  Sparkles
} from "lucide-react";
import { db } from "@/lib/firebase";
import { 
  collection, query, where, orderBy, onSnapshot, 
  doc, updateDoc, writeBatch 
} from "firebase/firestore";
import { useAuth } from "@/lib/auth-context";
import { isToday } from "date-fns";
import { safeFormat, toJSDate } from "@/lib/date-utils";
import { Badge } from "@/components/ui/badge";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useLocation } from "wouter";

interface Notification {
  id: string;
  title: string;
  message: string;
  type: string;
  read: boolean;
  createdAt: any;
  metadata?: any;
}

const evUserNotificationTypes: Record<string, { icon: string; color: string; navigate: string }> = {
  BOOKING_CONFIRMED: {
    icon: "⚡", color: "green",
    navigate: "/bookings"
  },
  SESSION_ACTIVE: {
    icon: "🔵", color: "blue",
    navigate: "/charge/{bookingId}"
  },
  SESSION_COMPLETE: {
    icon: "✅", color: "green",
    navigate: "/receipt/{bookingId}"
  },
  BOOKING_CANCELLED: {
    icon: "❌", color: "red",
    navigate: "/bookings"
  },
  REVIEW_RESPONSE: {
    icon: "💬", color: "blue",
    navigate: "/station/{stationId}"
  },
  STATION_AVAILABLE: {
    icon: "📍", color: "green",
    navigate: "/station/{stationId}"
  },
  REVIEW_REQUEST: {
    icon: "⭐", color: "amber",
    navigate: "/review/{bookingId}"
  }
};

export default function Notifications() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, "notifications"),
      where("userId", "==", user.uid),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Notification[];
      setNotifications(data);
      setLoading(false);
    }, (error) => {
      console.error("Notification listener error:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  const markAsRead = async (id: string) => {
    try {
      await updateDoc(doc(db, "notifications", id), { read: true });
    } catch (err) {
      console.error(err);
    }
  };

  const handleNotificationClick = async (n: Notification) => {
    if (!n.read) await markAsRead(n.id);
    
    const config = evUserNotificationTypes[n.type];
    if (config?.navigate) {
      let path = config.navigate;
      if (n.metadata?.bookingId) path = path.replace("{bookingId}", n.metadata.bookingId);
      if (n.metadata?.stationId) path = path.replace("{stationId}", n.metadata.stationId);
      setLocation(path);
    }
  };

  const markAllAsRead = async () => {
    if (!user || notifications.length === 0) return;
    const batch = writeBatch(db);
    notifications.filter(n => !n.read).forEach(n => {
      batch.update(doc(db, "notifications", n.id), { read: true });
    });
    await batch.commit();
  };

  const clearAll = async () => {
    if (!user || notifications.length === 0) return;
    const batch = writeBatch(db);
    notifications.forEach(n => {
      batch.delete(doc(db, "notifications", n.id));
    });
    await batch.commit();
  };

  const groupNotifications = (list: Notification[]) => {
    const today: Notification[] = [];
    const earlier: Notification[] = [];

    list.forEach(n => {
      const date = toJSDate(n.createdAt);
      if (isToday(date)) today.push(n);
      else earlier.push(n);
    });

    return { today, earlier };
  };

  const groups = groupNotifications(notifications);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0f172a] flex items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0f172a] text-white flex flex-col pb-32">
      {/* Sticky Premium Header */}
      <header className="sticky top-0 z-30 bg-[#0f172a]/80 backdrop-blur-2xl border-b border-white/5 px-6 py-6 pt-[var(--safe-top)]">
        <div className="max-w-2xl mx-auto flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-black tracking-tight">Updates</h1>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 text-[10px] font-black uppercase">
                {notifications.filter(n => !n.read).length} New
              </Badge>
              <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest">Notification Center</span>
            </div>
          </div>
          <div className="flex gap-2">
            <Button 
               variant="ghost" 
               size="sm" 
               className="rounded-full bg-white/5 hover:bg-white/10 text-[10px] font-black uppercase tracking-widest h-9"
               onClick={markAllAsRead}
               disabled={!notifications.some(n => !n.read)}
            >
              <Check className="w-4 h-4 mr-2" /> Mark Read
            </Button>
            <Button 
               variant="ghost" 
               size="icon" 
               className="rounded-full bg-red-500/10 hover:bg-red-500/20 text-red-400 h-9 w-9"
               onClick={clearAll}
               disabled={notifications.length === 0}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 px-4 pt-6 max-w-2xl mx-auto w-full">
        {notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 text-center space-y-6">
             <div className="w-24 h-24 rounded-[40px] bg-gradient-to-br from-white/5 to-transparent flex items-center justify-center relative shadow-inner">
                <Bell className="w-10 h-10 text-white/10" />
                <motion.div 
                   animate={{ scale: [1, 1.2, 1], opacity: [0.1, 0.3, 0.1] }}
                   transition={{ duration: 4, repeat: Infinity }}
                   className="absolute inset-0 rounded-[40px] border-2 border-primary/20"
                />
             </div>
             <div className="space-y-2">
                <h3 className="text-xl font-black">Garage is quiet</h3>
                <p className="text-sm font-bold text-white/20 max-w-[240px] leading-relaxed mx-auto">
                  We'll notify you here about your bookings, session starts, and system updates.
                </p>
                <Button variant="ghost" className="text-primary font-black uppercase text-[10px] tracking-widest mt-4" onClick={() => setLocation("/")}>
                   DISCOVER STATIONS <ChevronRight className="w-3 h-3 ml-1" />
                </Button>
             </div>
          </div>
        ) : (
          <div className="space-y-10">
            {Object.entries(groups).map(([key, list]) => (
              list.length > 0 && (
                <div key={key} className="space-y-4">
                  <div className="flex items-center gap-3 px-2">
                    <span className="h-px flex-1 bg-white/5" />
                    <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-white/30 truncate">
                       {key === "today" ? "Recent Activity" : "Older Updates"}
                    </h2>
                    <span className="h-px flex-1 bg-white/5" />
                  </div>
                  
                  <div className="space-y-3">
                    <AnimatePresence mode="popLayout">
                      {list.map((n) => {
                        const config = evUserNotificationTypes[n.type];
                        return (
                          <motion.div
                            key={n.id}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, scale: 0.9 }}
                            layout
                          >
                            <Card 
                              onClick={() => handleNotificationClick(n)}
                              className={cn(
                                 "relative overflow-hidden transition-all duration-500 border-none cursor-pointer group",
                                 !n.read 
                                 ? "bg-white/[0.06] hover:bg-white/[0.08] ring-1 ring-white/10 shadow-xl" 
                                 : "bg-white/[0.02] hover:bg-white/[0.04] opacity-50"
                              )}
                              style={{ borderRadius: '24px' }}
                            >
                               {/* Interior glow for unread */}
                               {!n.read && (
                                 <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 blur-3xl rounded-full -mr-16 -mt-16 group-hover:bg-primary/10 transition-colors" />
                               )}
                               
                               <CardContent className="p-4">
                                  <div className="flex gap-4 items-center relative z-10">
                                     <div className={cn(
                                       "shrink-0 w-12 h-12 rounded-2xl flex items-center justify-center text-xl shadow-inner transition-transform group-hover:scale-110 duration-500",
                                       !n.read ? "bg-white/10" : "bg-white/5"
                                     )}>
                                        {config?.icon || "🔔"}
                                     </div>
                                     
                                     <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between gap-2 mb-0.5">
                                           <h3 className={cn("font-black text-sm truncate pr-2", !n.read ? "text-white" : "text-white/60")}>
                                              {n.title}
                                           </h3>
                                           <div className="flex items-center gap-2 shrink-0">
                                              {!n.read && <div className="w-2 h-2 bg-primary rounded-full animate-pulse shadow-[0_0_8px_rgba(var(--primary),0.8)]" />}
                                              <span className="text-[9px] font-bold text-white/20 uppercase">
                                                 {safeFormat(toJSDate(n.createdAt), "HH:mm")}
                                              </span>
                                           </div>
                                        </div>
                                        <p className={cn("text-xs font-bold leading-relaxed truncate", !n.read ? "text-white/50" : "text-white/30")}>
                                           {n.message}
                                        </p>
                                     </div>
                                     
                                     <div className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity translate-x-2 group-hover:translate-x-0 duration-300">
                                        <ChevronRight className="w-4 h-4 text-primary" />
                                     </div>
                                  </div>
                                  
                                  {/* Interaction Footer for specific types */}
                                  {n.metadata?.stationName && !n.read && (
                                    <div className="mt-3 pt-3 border-t border-white/5 flex items-center justify-between">
                                       <div className="flex items-center gap-1.5 opacity-60">
                                          <MapPin className="w-3 h-3 text-primary" />
                                          <span className="text-[10px] font-black uppercase tracking-tight truncate max-w-[150px]">{n.metadata.stationName}</span>
                                       </div>
                                       <div className="flex items-center gap-1 text-[9px] font-black uppercase text-primary tracking-widest">
                                          View Details <ChevronRight className="w-3 h-3 ml-1" />
                                       </div>
                                    </div>
                                  )}
                               </CardContent>
                            </Card>
                          </motion.div>
                        );
                      })}
                    </AnimatePresence>
                  </div>
                </div>
              )
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
