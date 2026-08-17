import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { BookingCard } from "@/components/booking-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Activity, Navigation, Calendar, Clock, ChevronRight, 
  AlertCircle, Radio, ArrowRight, Zap, LayoutGrid 
} from "lucide-react";
import SessionShareModal from "@/components/SessionShareModal";
import type { SessionShareData } from "@/lib/session-share-engine";
import type { Booking, Station } from "@shared/schema";
import { useAuth } from "@/lib/auth-context";
import { doc, getDoc, deleteDoc, collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import { cn, getEstimatedDriveTime, formatDriveTime } from "@/lib/utils";
import { toJSDate, toTimestamp } from "@/lib/date-utils";
import { BOOKING_STATUS, ACTIVE_STATUSES } from "@/constants/bookingStatus";
import { createChat } from "@/services/chatService";
import ChatWindow from "@/components/ChatWindow";

// OFFLINE CACHE — imports
import { cacheSessions, loadCachedSessions, getLastSyncTime, clearSessionsOlderThan, type CachedSession } from '@/lib/session-cache';
import OfflineSessionBanner from '@/components/OfflineSessionBanner';

export default function Bookings() {
  const [, setLocation] = useLocation();
  const { user, userRole, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [allBookings, setAllBookings] = useState<Booking[]>([]);
  const [activeTab, setActiveTab] = useState("upcoming");
  const [stations, setStations] = useState<Record<string, Station>>({});
  const fetchedIds = useRef<Set<string>>(new Set());
  // Chat State
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [activeBookingForChat, setActiveBookingForChat] = useState<any>(null);
  const [chatUnreads, setChatUnreads] = useState<Record<string, number>>({});
  const [chatReadOnly, setChatReadOnly] = useState(false);
  
  // Share Modal State
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [selectedShareSession, setSelectedShareSession] = useState<SessionShareData | null>(null);

  // OFFLINE CACHE — state
  const [cachedSessions, setCachedSessions] = useState<CachedSession[]>([]);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isShowingCache, setIsShowingCache] = useState(false);
  const [isFirestoreError, setIsFirestoreError] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setLocation("/auth");
      return;
    }

    if (userRole === "owner") {
      setLocation("/owner/dashboard");
      return;
    }

    // Real-time listener for ALL user bookings
    const bookingsRef = collection(db, "bookings");
    const qAll = query(
      bookingsRef, 
      where("userId", "==", user.uid)
    );

    const unsub = onSnapshot(qAll, (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as Booking));
      // Sort by startTime desc
      const sorted = [...data].sort((a, b) => b.startTime - a.startTime);
      setAllBookings(sorted);
      setIsFirestoreError(false);
    }, (err: any) => {
      console.error("Snapshot error:", err);
      setIsFirestoreError(true);
    });

    return () => unsub();
  }, [user, userRole, authLoading, setLocation]);

  // Fetch stations reactively to avoid stale closure issues
  useEffect(() => {
    if (allBookings.length === 0) return;
    
    const stationIds = Array.from(new Set(allBookings.map(b => b.stationId)));
    stationIds.forEach(async (id) => {
      if (fetchedIds.current.has(id)) return;
      fetchedIds.current.add(id);
      
      try {
        const sDoc = await getDoc(doc(db, "stations", id));
        if (sDoc.exists()) {
          const data = sDoc.data() as any;
          const connectors = (data.connectors || []).map((c: any, index: number) => ({
            ...c,
            id: c.id || `conn-${index}-${c.type || 'unknown'}`
          }));
          setStations(prev => ({
            ...prev,
            [id]: { id: sDoc.id, ...data, connectors } as Station
          }));
        } else {
          fetchedIds.current.delete(id);
        }
      } catch (err) {
        console.error("Error fetching station:", err);
        fetchedIds.current.delete(id);
      }
    });
  }, [allBookings]);

  // OFFLINE CACHE — hydrate from IndexedDB before Firestore loads
  useEffect(() => {
    loadCachedSessions().then(setCachedSessions);
    getLastSyncTime().then(setLastSyncTime);
    clearSessionsOlderThan(30);

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // OFFLINE CACHE — write to IndexedDB after successful Firestore fetch
  useEffect(() => {
    if (!allBookings || allBookings.length === 0) return;
    
    const toCache: CachedSession[] = allBookings.map(s => ({
      id: s.id!,
      userId: s.userId,
      stationId: s.stationId,
      stationName: stations[s.stationId]?.name || (s as any).stationName || 'Unknown station',
      connectorId: s.connectorId,
      status: s.status,
      energyDelivered: Number(s.energyDeliveredKwh) || 0,
      totalCost: Number(s.totalPrice) || 0,
      startTime: toJSDate(s.startTime),
      endTime: s.endedAt ? toJSDate(s.endedAt) : null,
      cachedAt: new Date()
    }));
    
    cacheSessions(toCache);
    setLastSyncTime(new Date());
    setIsShowingCache(false);
  }, [allBookings, stations]);

  // OFFLINE CACHE — show cached data if Firestore errors or offline
  useEffect(() => {
    if ((isFirestoreError || !isOnline) && cachedSessions.length > 0) {
      setIsShowingCache(true);
    } else if (isOnline && !isFirestoreError) {
      setIsShowingCache(false);
    }
  }, [isFirestoreError, isOnline, cachedSessions]);

  const handleDelete = async (bookingId: string) => {
    try {
      await deleteDoc(doc(db, "bookings", bookingId));
      toast({
        title: "Booking Deleted",
        description: "The record has been permanently removed.",
      });
    } catch (err) {
      toast({
        title: "Delete Failed",
        variant: "destructive",
        description: "Could not remove the booking record.",
      });
    }
  };

  const getConnectorType = (booking: Booking) => {
    const station = stations[booking.stationId];
    if (!station) return undefined;
    const connector = station.connectors.find((c) => c.id === booking.connectorId);
    return connector?.type;
  };

  // Smart Filtering Logic
  const categorized = allBookings.reduce((acc, booking) => {
    const startMs = toTimestamp(booking.startTime);
    const endMs = startMs + (booking.duration || 60) * 60000;
    const now = Date.now();
    
    // A booking is "past" if it's completed, cancelled, or its end time has passed
    const isCompletedOrCancelled = [BOOKING_STATUS.COMPLETED, BOOKING_STATUS.CANCELLED].includes(booking.status as any);
    const isPast = endMs < now;

    // Exception: If it's ACTIVE, it stays in upcoming regardless of endMs 
    // (the simulator/logic will eventually complete it)
    if ((isCompletedOrCancelled || isPast) && booking.status !== BOOKING_STATUS.ACTIVE) {
      acc.past.push(booking);
    } else {
      acc.upcoming.push(booking);
    }
    return acc;
  }, { upcoming: [] as Booking[], past: [] as Booking[] });

  // Track unread counts for all upcoming bookings in real-time
  useEffect(() => {
    if (!categorized.upcoming.length || !user) return;
    
    const unsubs = categorized.upcoming.map(booking => {
      const chatId = `${booking.id}_${user.uid}`;
      
      return onSnapshot(
        doc(db, "chats", chatId),
        snap => {
          if (snap.exists()) {
            setChatUnreads(prev => ({
              ...prev,
              [booking.id!]: snap.data().driverUnread || 0
            }));
          }
        },
        () => {}
      );
    });
    
    return () => unsubs.forEach(u => u());
  }, [categorized.upcoming.length, user]);

  const handleOpenChat = async (booking: any, isReadOnly: boolean = false) => {
    try {
      const chatId = await createChat(
        booking.id,
        booking.stationId!,
        user!.uid,
        booking.ownerId || "",
        user!.displayName || "Driver",
        booking.ownerBusinessName || "Station Owner",
        booking.stationName || "Charging Station"
      );
      setActiveChatId(chatId);
      setActiveBookingForChat(booking);
      setChatReadOnly(isReadOnly);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Chat Error",
        description: "Could not open chat with the owner."
      });
    }
  };

  const handleShareSession = (booking: any) => {
    const startMs = toTimestamp(booking.startTime);
    const station = stations[booking.stationId];
    
    const shareData: SessionShareData = {
      stationName: (booking as any).stationName || station?.name || "Charging Station",
      sessionDate: new Date(startMs),
      energyDelivered: Number(booking.energyDeliveredKwh) || 0,
      durationMinutes: Number(booking.duration) || 0,
      totalCost: Number(booking.totalPrice || booking.estimatedTotal) || 0,
      connectorType: (booking as any).connectorType || getConnectorType(booking) || "Fast Charger"
    };
    
    setSelectedShareSession(shareData);
    setIsShareModalOpen(true);
  };

  const activeSession = categorized.upcoming.find(b => b.status === BOOKING_STATUS.ACTIVE);

  // OFFLINE CACHE — compute display data
  const displayBookings = isShowingCache 
    ? cachedSessions.map(cs => ({
        ...cs,
        energyDeliveredKwh: cs.energyDelivered,
        totalPrice: cs.totalCost,
      } as any as Booking))
    : allBookings;

  const categorizedDisplay = displayBookings.reduce((acc, booking) => {
    const startMs = toTimestamp(booking.startTime);
    const endMs = startMs + (booking.duration || 60) * 60000;
    const now = Date.now();
    const isCompletedOrCancelled = [BOOKING_STATUS.COMPLETED, BOOKING_STATUS.CANCELLED].includes(booking.status as any);
    const isPast = endMs < now;

    if ((isCompletedOrCancelled || isPast) && booking.status !== BOOKING_STATUS.ACTIVE) {
      acc.past.push(booking);
    } else {
      acc.upcoming.push(booking);
    }
    return acc;
  }, { upcoming: [] as Booking[], past: [] as Booking[] });

  if (!user) return null;

  return (
    <div className="min-h-full bg-background pb-32">
      {/* Dynamic Header */}
      <div className="bg-background/80 backdrop-blur-xl border-b sticky top-0 z-20 px-6 py-6 pt-[var(--safe-top)]">
         <div className="max-w-2xl mx-auto">
            <div className="flex items-center justify-between mb-2">
               <h1 className="text-3xl font-black tracking-tight">Activity</h1>
               <div className="flex -space-x-2">
                  <div className="w-8 h-8 rounded-full bg-primary/10 border-2 border-background flex items-center justify-center">
                    <Zap className="w-4 h-4 text-primary" />
                  </div>
                  <div className="w-8 h-8 rounded-full bg-emerald-500/10 border-2 border-background flex items-center justify-center">
                    <Activity className="w-4 h-4 text-emerald-600" />
                  </div>
               </div>
            </div>
            <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest opacity-60">Management Console</p>
         </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-6">
        {/* OFFLINE CACHE — banner */}
        {isShowingCache && (
          <OfflineSessionBanner
            lastSyncTime={lastSyncTime}
            sessionCount={cachedSessions.length}
            isOnline={isOnline}
          />
        )}

        {/* Active Session Spotlight */}
        <AnimatePresence>
          {activeSession && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="mb-8"
            >
              <Card className="bg-primary border-none shadow-2xl shadow-primary/30 overflow-hidden relative">
                 <div className="absolute top-0 right-0 p-8 opacity-10">
                    <Zap className="w-32 h-32 text-white" />
                 </div>
                 <CardContent className="p-6">
                    <div className="flex items-center gap-4 mb-6">
                       <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center animate-pulse">
                          <Radio className="w-6 h-6 text-white" />
                       </div>
                       <div>
                          <Badge className="bg-white/20 text-white font-black text-[9px] uppercase border-none mb-1">Live Session</Badge>
                          <h2 className="text-xl font-black text-white leading-tight">Currently Charging</h2>
                       </div>
                    </div>
                    <div className="bg-white/10 rounded-[32px] p-6 mb-6">
                         <div className="flex justify-between items-end mb-2">
                           <p className="text-[10px] font-black uppercase text-white/60 tracking-widest">Energy Delivered</p>
                           <p className="text-4xl font-black text-white">{(Number(activeSession.energyDeliveredKwh) || 0).toFixed(1)} <span className="text-sm font-normal opacity-60">kWh</span></p>
                        </div>
                        <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                           <motion.div animate={{ x: ["-100%", "100%"] }} transition={{ repeat: Infinity, duration: 2, ease: "linear" }} className="h-full w-24 bg-white/40" />
                        </div>
                    </div>
                    <Button 
                      className="w-full h-14 bg-white text-primary hover:bg-white/90 font-black rounded-2xl shadow-xl transition-all"
                      onClick={() => setLocation(`/charge/${activeSession.id}`)}
                    >
                       RESUME DASHBOARD <ChevronRight className="w-5 h-5 ml-1" />
                    </Button>
                 </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2 bg-muted/50 p-1.5 rounded-[24px] mb-8 h-14">
            <TabsTrigger 
              value="upcoming" 
              className="rounded-[18px] font-black text-xs uppercase tracking-widest data-[state=active]:bg-background data-[state=active]:shadow-lg"
            >
              Scheduled
            </TabsTrigger>
            <TabsTrigger 
              value="past" 
              className="rounded-[18px] font-black text-xs uppercase tracking-widest data-[state=active]:bg-background data-[state=active]:shadow-lg"
            >
              History
            </TabsTrigger>
          </TabsList>

          <TabsContent value="upcoming" className="space-y-6 outline-none">
            {categorized.upcoming.filter(b => b.status === BOOKING_STATUS.CONFIRMED).length > 0 && (
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className="bg-emerald-500/10 border-l-4 border-emerald-500 p-4 rounded-r-2xl mb-6 flex items-center justify-between group cursor-pointer"
                onClick={() => {
                  const b = categorized.upcoming.find(b => b.status === BOOKING_STATUS.CONFIRMED);
                  if (b) {
                    const s = stations[b.stationId];
                    if (s) window.open(`https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lon}`, '_blank');
                  }
                }}
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-emerald-500 flex items-center justify-center text-white shadow-lg shadow-emerald-500/20 group-hover:scale-110 transition-transform">
                    <Navigation className="w-5 h-5 fill-current" />
                  </div>
                  <div>
                    <h4 className="text-sm font-black text-emerald-900 uppercase tracking-tight">Start Driving Now</h4>
                    <p className="text-xs font-bold text-emerald-700/70">
                      ETA: {formatDriveTime(getEstimatedDriveTime(2.4))} • Traffic is light
                    </p>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-emerald-500" />
              </motion.div>
            )}

            {categorized.upcoming.length === 0 ? (
              <div className="text-center py-20 px-8 bg-muted/20 rounded-[48px] border-2 border-dashed border-muted">
                <div className="w-20 h-20 bg-background rounded-full flex items-center justify-center mx-auto mb-6 shadow-xl">
                  <Calendar className="w-10 h-10 text-muted-foreground opacity-20" />
                </div>
                <h3 className="text-xl font-black mb-2 tracking-tight">No active plans</h3>
                <p className="text-sm font-bold text-muted-foreground mb-8 leading-relaxed">
                  Your garage is ready. Find a charging station near you to start your next journey.
                </p>
                <Button 
                  onClick={() => setLocation("/")} 
                  className="h-14 px-8 rounded-2xl font-black shadow-xl shadow-primary/20"
                >
                  EXPLORE STATIONS
                </Button>
              </div>
            ) : (
              categorizedDisplay.upcoming.map((booking) => (
                <BookingCard
                  key={booking.id}
                  booking={booking}
                  stationName={stations[booking.stationId]?.name || (booking as any).stationName}
                  connectorType={getConnectorType(booking)}
                  onDelete={handleDelete}
                  onChat={() => handleOpenChat(booking, false)}
                  unreadCount={chatUnreads[booking.id!]}
                />
              ))
            )}
          </TabsContent>

          <TabsContent value="past" className="space-y-6 outline-none">
            {categorized.past.length > 0 && (
              <Card className="rounded-[40px] bg-emerald-500/5 border-none p-8 mb-8 overflow-hidden relative">
                 <div className="absolute top-0 right-0 p-8 opacity-5">
                    <Activity className="w-32 h-32 text-emerald-600" />
                 </div>
                 <h3 className="text-lg font-black mb-6 flex items-center gap-2">
                    <Activity className="w-5 h-5 text-emerald-600" /> Lifetime Statistics
                 </h3>
                 <div className="grid grid-cols-2 gap-8">
                    <div>
                       <p className="text-[10px] font-black uppercase text-muted-foreground mb-1 tracking-widest">ECO TRIPS</p>
                       <p className="text-4xl font-black text-foreground">{categorized.past.filter(b => b.status === BOOKING_STATUS.COMPLETED).length}</p>
                    </div>
                    <div>
                       <p className="text-[10px] font-black uppercase text-muted-foreground mb-1 tracking-widest">TOTAL ENERGY</p>
                       <p className="text-4xl font-black text-foreground">
                         {categorized.past.reduce((acc, b) => acc + (Number(b.energyDeliveredKwh) || 0), 0).toFixed(0)} <span className="text-sm font-normal opacity-40">kWh</span>
                       </p>
                    </div>
                 </div>
                 <div className="mt-8 pt-8 border-t border-emerald-500/10">
                    <div className="flex justify-between items-center bg-white/10 p-4 rounded-2xl">
                       <span className="text-xs font-black uppercase tracking-tighter text-emerald-700">Carbon Offset</span>
                       <span className="text-xl font-black text-emerald-600">
                         🌱 {(categorized.past.reduce((acc, b) => acc + (Number(b.energyDeliveredKwh) || 0), 0) * 0.708).toFixed(1)} <span className="text-xs">kg</span>
                       </span>
                    </div>
                 </div>
              </Card>
            )}

            {categorized.past.length === 0 ? (
              <div className="text-center py-20 bg-muted/20 rounded-[48px]">
                <Clock className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-20" />
                <h3 className="text-lg font-black mb-1">Archive is empty</h3>
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">No transaction history yet</p>
              </div>
            ) : (
              categorizedDisplay.past.map((booking) => (
                <BookingCard
                  key={booking.id}
                  booking={booking}
                  stationName={(booking as any).stationName || stations[booking.stationId]?.name}
                  connectorType={(booking as any).connectorType || getConnectorType(booking)}
                  onDelete={handleDelete}
                  onChat={() => handleOpenChat(booking, true)}
                  onShare={() => handleShareSession(booking)}
                />
              ))
            )}
          </TabsContent>
        </Tabs>
      </div>

      {activeChatId && activeBookingForChat && (
        <div style={{
          position: "fixed",
          bottom: "100px",
          right: "20px",
          zIndex: 500,
          boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
          borderRadius: "20px"
        }}>
          <ChatWindow
            chatId={activeChatId}
            currentUserId={user!.uid}
            currentUserRole="driver"
            currentUserName={user!.displayName || "Driver"}
            recipientName={activeBookingForChat.ownerBusinessName || "Station Owner"}
            stationName={activeBookingForChat.stationName || "Station"}
            readOnly={chatReadOnly}
            onClose={() => {
              setActiveChatId(null);
              setActiveBookingForChat(null);
              setChatReadOnly(false);
            }}
          />
        </div>
      )}
      <SessionShareModal 
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        session={selectedShareSession}
      />
    </div>
  );
}

// OFFLINE CACHE — Acceptance Tests
// Test 1 — Online load: Firestore succeeds → sessions written to IDB
//   loadCachedSessions() after fetch returns same sessions
// Test 2 — Offline load: navigator.onLine=false on mount
//   cachedSessions shown immediately, OfflineSessionBanner visible
// Test 3 — Firestore error while online: isFirestoreError=true
//   Falls back to cache, banner shows 'Reconnecting...' with spinner
// Test 4 — Never synced: IDB empty, offline
//   Banner shows 'No cached data available', no session list rendered
// Test 5 — Stale cleanup: sessions with cachedAt > 30 days ago
//   clearSessionsOlderThan(30) removes them on next mount
