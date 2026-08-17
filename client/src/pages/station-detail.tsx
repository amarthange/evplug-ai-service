import { useState, useEffect, useRef, useMemo } from "react";
import { useRoute, useLocation, Link } from "wouter";
import { ArrowLeft, MapPin, Star, Navigation, Clock, Repeat, Zap, Info, Share2, Clipboard, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  cn, 
  getEstimatedDriveTime, 
  formatDriveTime, 
  checkConnectorCompatibility 
} from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import { ConnectorCard } from "@/components/connector-card";
import { calculateEstimatedCost } from "@/utils/pricingUtils";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetDescription } from "@/components/ui/sheet";
import { ReviewSection } from "@/components/review-section";
import { StationReviews } from "@/components/StationReviews";
import { ChargeEstimatorCard } from "@/components/ChargeEstimatorCard";
import type { Station, Connector, EvCar } from "@shared/schema";
import { doc, getDoc, getDocs, addDoc, collection, updateDoc, onSnapshot, runTransaction, query, where, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { addMinutes } from "date-fns";
import { safeFormat } from "@/lib/date-utils";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BOOKING_STATUS } from "@/constants/bookingStatus";
import { motion, AnimatePresence, useScroll, useTransform } from "framer-motion";

// VEHICLE SWITCHER — imports
import VehicleQuickSwitcher from '@/components/VehicleQuickSwitcher';
import { buildVehicleList, getDefaultVehicle, saveLastUsedVehicle, getLastUsedVehicleId, type Vehicle } from '@/lib/vehicle-selector';
import { 
  joinWaitlist, 
  leaveWaitlist, 
  getActiveWaitlist, 
  isUserFirstInLine,
  type WaitlistEntry 
} from "@/lib/waitlist-engine";
import { WaitlistButton } from "@/components/WaitlistButton";
import { WaitlistNotificationBanner } from "@/components/WaitlistNotificationBanner";
import ChatWindow from "@/components/ChatWindow";
import { createChat } from "@/services/chatService";
import BusyTimesHeatmap from "@/components/BusyTimesHeatmap";
import SoCBottomSheet from '@/components/SoCBottomSheet';
import {
  getVehicleSoCState,
  saveVehicleSoC,
  resolveStartSoC,
  SOC_DEFAULT_FALLBACK,
  type VehicleSoCState
} from '@/lib/soc-manager';
import { FavoriteButton } from "@/components/FavoriteButton";
import { calculateTimeDecayPrice, getDecayLabel } from "@/lib/autopilot-engine";
import { useCallback } from "react";



export default function StationDetail() {
  const [, params] = useRoute("/station/:id");
  const [, setLocation] = useLocation();
  const { user, userData } = useAuth();
  const { toast } = useToast();
  const [station, setStation] = useState<Station | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedConnectorId, setSelectedConnectorId] = useState<string | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>("none");
  const [owner, setOwner] = useState<any>(null);
  const [selectedTimeOffset, setSelectedTimeOffset] = useState<number>(0);
  const [healthStats, setHealthStats] = useState<Record<string, any>>({});
  const [promotions, setPromotions] = useState<any[]>([]);
  const [waitlistEntries, setWaitlistEntries] = useState<WaitlistEntry[]>([]);
  const [showWaitlistBanner, setShowWaitlistBanner] = useState(false);
  const connectorIdRef = useRef<string | null>(null);

  // Chat State
  const [relevantBooking, setRelevantBooking] = useState<any>(null);
  const [showChat, setShowChat] = useState(false);
  const [chatId, setChatId] = useState<string | null>(null);
  const [estimatedCost, setEstimatedCost] = useState<number | null>(null);
  const [estimatedDuration, setEstimatedDuration] = useState<number | null>(null);
  const [targetSoC, setTargetSoC] = useState<number | null>(null);

  // SOC NUDGE — state
  const [socSheetOpen, setSocSheetOpen] = useState(false);
  const [vehicleSoCState, setVehicleSoCState] = useState<VehicleSoCState | null>(null);
  const [userEnteredSoC, setUserEnteredSoC] = useState<number | null>(null);
  const [socWasSkipped, setSocWasSkipped] = useState(false);
  const [isSavingSoC, setIsSavingSoC] = useState(false);
  const [startSoCSource, setStartSoCSource] = useState<'user_entered' | 'fresh_cached' | 'skipped_default' | null>(null);
  const [isSoCChecking, setIsSoCChecking] = useState(false);
  const isBookingInProgressRef = useRef(false);


  useEffect(() => {
    if (!user || !params?.id) return;
    
    const q = query(
      collection(db, "bookings"),
      where("stationId", "==", params.id),
      where("userId", "==", user.uid),
      where("status", "in", [BOOKING_STATUS.CONFIRMED, BOOKING_STATUS.ACTIVE])
    );

    const unsub = onSnapshot(q, (snap) => {
      if (!snap.empty) {
        setRelevantBooking({ id: snap.docs[0].id, ...snap.docs[0].data() });
      } else {
        setRelevantBooking(null);
      }
    });

    return () => unsub();
  }, [user, params?.id]);

  const handleOpenChat = async () => {
    if (!relevantBooking || !user) return;
    try {
      const cId = await createChat(
        relevantBooking.id,
        relevantBooking.stationId,
        user.uid,
        relevantBooking.ownerId || station?.ownerId || "",
        user.displayName || "Driver",
        relevantBooking.ownerBusinessName || owner?.businessName || "Station Owner",
        relevantBooking.stationName || station?.name || "Station"
      );
      setChatId(cId);
      setShowChat(true);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Chat Error",
        description: "Could not initialize chat with the owner."
      });
    }
  };

  const scrollRef = useRef<HTMLDivElement>(null);
  const { scrollY } = useScroll();
  const headerOpacity = useTransform(scrollY, [0, 100], [0, 1]);
  const headerBlur = useTransform(scrollY, [0, 100], [0, 10]);

  useEffect(() => {
    if (!params?.id) return;

    const unsubscribeStation = onSnapshot(doc(db, "stations", params?.id || ""), (stationDoc) => {
      if (stationDoc.exists()) {
        const data = stationDoc.data();
        const connectors = (data.connectors || []).map((c: any, index: number) => ({
          ...c,
          id: c.id || `conn-${index}-${c.type || 'unknown'}`
        }));
        const stationData = { id: stationDoc.id, ...data, connectors } as Station;
        setStation(stationData);
        setLoading(false);
      } else {
        setLoading(false);
      }
    }, (error) => {
      console.error("Station subscription error:", error);
      setLoading(false);
    });

    const now = Date.now();
    const q = query(
      collection(db, "bookings"),
      where("stationId", "==", params?.id || ""),
      where("status", "in", [BOOKING_STATUS.CONFIRMED, BOOKING_STATUS.ACTIVE, BOOKING_STATUS.PENDING])
    );

    const unsubscribeBookings = onSnapshot(q, (bookingSnapshot) => {
      const activeBookings = bookingSnapshot.docs.map(d => d.data());
      
      setStation(prev => {
        if (!prev) return prev;
        
        const filteredActive = activeBookings.filter(b => {
          if (b.status !== BOOKING_STATUS.CONFIRMED && !(b.status === BOOKING_STATUS.PENDING && b.holdExpiresAt > now)) return false;
          const bStart = b.startTime;
          const bEnd = b.startTime + (b.duration * 60 * 1000);
          return now >= bStart && now < bEnd;
        });

        const enrichedConnectors = (prev.connectors || []).map(conn => {
          const currentBookings = filteredActive.filter(b => b.connectorId === conn.id).length;
          const count = Number(conn.count) || 1;
          return { ...conn, available: currentBookings < count };
        });

        return { ...prev, connectors: enrichedConnectors };
      });
    }, (error) => {
      console.error("Bookings subscription error:", error);
    });

    return () => {
      unsubscribeStation();
      unsubscribeBookings();
    };
  }, [params?.id]);

  useEffect(() => {
    if (!params?.id) return;

    // Waitlist listener
    const unsubWaitlist = onSnapshot(collection(db, "stations", params?.id || "", "waitlist"), (snap) => {
      const entries = snap.docs.map(d => d.data() as WaitlistEntry);
      setWaitlistEntries(getActiveWaitlist(entries));
    });

    return () => unsubWaitlist();
  }, [params?.id]);

  // Waitlist Notification Logic
  useEffect(() => {
    if (!user || !station || !params?.id) return;

    const myEntry = waitlistEntries.find(e => e.userId === user.uid);
    if (!myEntry || myEntry.notified) return;

    // Check if any connector is now available
    const hasAvailable = station.connectors.some(c => c.available);
    if (!hasAvailable) return;

    // Check if user is first in line
    if (isUserFirstInLine(waitlistEntries, user.uid)) {
      setShowWaitlistBanner(true);
      // Mark as notified in Firestore
      updateDoc(doc(db, "stations", params?.id || "", "waitlist", user.uid), {
        notified: true
      });
    }
  }, [station?.connectors, waitlistEntries, user, params?.id]);

  // VEHICLE SWITCHER — build vehicle list from auth context
  const [rawVehicles, setRawVehicles] = useState<any[]>([]);

  useEffect(() => {
    if (!user?.uid) return;
    const unsub = onSnapshot(query(collection(db, "users", user.uid, "ev_vehicles")), (snapshot) => {
      setRawVehicles(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsub();
  }, [user]);

  const stationConnectors = station?.connectors.map(c => c.type) ?? [];

  const switcherVehicles = useMemo(() => 
    buildVehicleList(rawVehicles, stationConnectors),
  [rawVehicles, stationConnectors]);

  const activeVehicle = useMemo(() => 
    switcherVehicles.find(v => v.id === selectedVehicleId) || null,
  [switcherVehicles, selectedVehicleId]);

  // Initialize selected vehicle
  useEffect(() => {
    if (switcherVehicles.length > 0 && selectedVehicleId === "none") {
      const def = getDefaultVehicle(switcherVehicles, getLastUsedVehicleId());
      if (def) {
        setSelectedVehicleId(def.id);
      }
    }
  }, [switcherVehicles, selectedVehicleId]);

  // Compatibility aliases for legacy UI code
  const vehicles = rawVehicles as EvCar[];
  const selectedVehicle = vehicles.find(v => v.id === selectedVehicleId);
  const selectedConnector = station?.connectors.find(c => c.id === selectedConnectorId);

  useEffect(() => {
    if (!user || selectedVehicleId === "none") return;
    setIsSoCChecking(true);
    getVehicleSoCState(db, user.uid, selectedVehicleId).then(state => {
      setVehicleSoCState(state);
      setIsSoCChecking(false);
    });
  }, [user, selectedVehicleId]);

  const currentSlotPrice = useMemo(() => {
    if (!selectedConnector) return 0;
    const isDecayEnabled = owner?.timeDecay?.enabled ?? false;
    const floorPrice = owner?.timeDecay?.floorPrice ?? 5;
    const time = addMinutes(new Date(), selectedTimeOffset);
    
    if (isDecayEnabled) {
      return calculateTimeDecayPrice(selectedConnector, time, floorPrice);
    }
    return Number(selectedConnector.pricePerKwh || 15);
  }, [selectedConnector, selectedTimeOffset, owner?.timeDecay]);

  const currentEstimatedTotal = useMemo(() => {
    if (!selectedConnector) return 0;

    const estimate = calculateEstimatedCost(
      selectedConnector,
      selectedVehicle ? {
        batteryCapacity: selectedVehicle.batteryCapacity,
        chargeType: selectedVehicle.chargeType
      } : null,
      80
    );

    const baseRate = Number(selectedConnector.pricePerKwh || 15);
    const multiplier = currentSlotPrice / baseRate;
    
    if (estimatedCost) {
      return Math.round(estimatedCost * multiplier);
    }
    
    return Math.round(estimate.estimatedCost * multiplier);
  }, [currentSlotPrice, selectedConnector, selectedVehicle, estimatedCost]);


  useEffect(() => {
    if (!station?.ownerId) return;
    getDoc(doc(db, "owners", station.ownerId)).then(d => d.exists() && setOwner(d.data()));

    const qPromos = query(
      collection(db, "promotions"), 
      where("ownerId", "==", station.ownerId),
      where("isActive", "==", true)
    );
    const unsubPromos = onSnapshot(qPromos, (snap) => {
      setPromotions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsubPromos();
  }, [station?.ownerId]);

  const handleSelectConnector = (id: string, isWaitlist: boolean = false) => {
    connectorIdRef.current = id;
    setSelectedConnectorId(id);
    setIsSheetOpen(true);
    
    if (isWaitlist) {
      toast({
        title: "Waitlist Active 📍",
        description: "Checking current queue position...",
        className: "rounded-3xl border-primary/20 bg-slate-900/90 backdrop-blur-xl",
      });
    } else {
      toast({
        title: "Initializing Booking ⚡",
        description: "Securing your fast charger slot now.",
        className: "rounded-3xl border-primary/20 bg-slate-900/90 backdrop-blur-xl",
      });
    }
  };

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: station?.name,
        text: `Check out ${station?.name} for EV charging!`,
        url: window.location.href,
      });
    } else {
      navigator.clipboard.writeText(window.location.href);
      toast({ title: "Copied!", description: "Link copied to clipboard" });
    }
  };

  // SOC NUDGE — refactored booking writer
  const proceedWithBooking = useCallback(async (
    startSoC: number,
    socSource: 'user_entered' | 'fresh_cached' | 'skipped_default'
  ) => {
    if (isBookingInProgressRef.current) return;
    isBookingInProgressRef.current = true;
    
    setBookingLoading(true);
    try {
      const selectedConnectorObj = station!.connectors.find(c => c.id === (connectorIdRef.current || selectedConnectorId));
      if (!selectedConnectorObj) throw new Error("No connector selected");

      const estimate = calculateEstimatedCost(
        selectedConnectorObj,
        selectedVehicle ? {
          batteryCapacity: selectedVehicle.batteryCapacity,
          chargeType: selectedVehicle.chargeType
        } : null,
        80
      );

      const pricePerKwh = currentSlotPrice;
      const powerKw = Number(selectedConnectorObj.powerKw || 120);
      const duration = estimatedDuration || estimate.estimatedMinutes;
      const totalPriceValue = currentEstimatedTotal || Math.round(estimate.estimatedCost * (currentSlotPrice / (selectedConnectorObj.pricePerKwh || 15)));
      
      const isDecayApplied = currentSlotPrice < Number(selectedConnectorObj.pricePerKwh || 15);

      const bookingData = {
        userId: user!.uid,
        stationId: station!.id,
        stationName: station!.name,
        ownerId: station!.ownerId,
        ownerBusinessName: station!.name,
        connectorId: selectedConnectorObj.id,
        connectorType: selectedConnectorObj.type,
        connectorPowerKw: powerKw,
        pricePerKwh: pricePerKwh,
        startTime: Date.now() + (selectedTimeOffset * 60 * 1000),
        duration: duration,
        status: BOOKING_STATUS.PENDING,
        paymentStatus: "pending",
        holdExpiresAt: Date.now() + 10 * 60 * 1000,
        totalPrice: totalPriceValue,
        estimatedTotal: totalPriceValue,
        pricingMode: isDecayApplied ? "autopilot" : "manual",
        decayApplied: isDecayApplied,
        originalPricePerKwh: Number(selectedConnectorObj.pricePerKwh || 15),
        createdAt: Date.now(),
        // SOC NUDGE — added fields
        startSoC: Math.round(startSoC),
        targetSoC: targetSoC || 80,
        socSource
      };

      const bookingId = await runTransaction(db, async (transaction) => {
        const bookingRef = doc(collection(db, "bookings"));
        transaction.set(bookingRef, bookingData);
        return bookingRef.id;
      });

      // Notification logic (extracted for brevity)
      try {
        await addDoc(collection(db, "notifications"), {
          ownerId: station!.ownerId,
          stationId: station!.id,
          type: "NEW_BOOKING",
          title: "New Booking Reserved ⚡",
          message: `${user!.displayName || "A driver"} booked ${selectedConnectorObj.type} at ${station!.name}`,
          bookingId: bookingId,
          amount: totalPriceValue,
          read: false,
          createdAt: Date.now()
        });
      } catch (e) {}

      if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
      toast({ title: "Slot Reserved! ⚡", description: "Your session is held for 10 minutes.", className: "bg-green-500/90 text-white border-none" });
      
      setIsSheetOpen(false);
      setTimeout(() => setLocation(`/payment/${bookingId}`), 500);
    } catch (e: any) {
      console.error("Booking failed:", e);
      toast({ variant: "destructive", title: "Booking Failed", description: e.message });
      isBookingInProgressRef.current = false;
    } finally {
      setBookingLoading(false);
    }
  }, [user, station, selectedConnectorId, selectedTimeOffset, setLocation, toast, estimatedCost, estimatedDuration, targetSoC]);

  // SOC NUDGE — booking intercept
  const handleConfirmBookingClick = useCallback(async () => {
    if (!user) {
      toast({ variant: "destructive", title: "Authentication Required", description: "Please sign in to book." });
      return;
    }

    if (selectedVehicleId === "none") {
      await proceedWithBooking(SOC_DEFAULT_FALLBACK, 'skipped_default');
      return;
    }

    if (startSoCSource !== null) {
      const resolved = resolveStartSoC(vehicleSoCState!, userEnteredSoC, socWasSkipped);
      await proceedWithBooking(resolved.startSoC, startSoCSource);
      return;
    }

    setIsSoCChecking(true);
    try {
      const state = await getVehicleSoCState(db, user.uid, selectedVehicleId);
      setVehicleSoCState(state);

      if (!state.shouldPrompt) {
        const resolved = resolveStartSoC(state, null, false);
        setStartSoCSource(resolved.source);
        await proceedWithBooking(resolved.startSoC, resolved.source);
        return;
      }

      setSocSheetOpen(true);
    } finally {
      setIsSoCChecking(false);
    }
  }, [user, selectedVehicleId, startSoCSource, vehicleSoCState, userEnteredSoC, socWasSkipped, proceedWithBooking]);

  // SOC NUDGE — sheet confirm
  const handleSoCConfirm = useCallback(async (socValue: number) => {
    setIsSavingSoC(true);
    setUserEnteredSoC(socValue);
    setSocWasSkipped(false);
    setStartSoCSource('user_entered');

    if (user && selectedVehicleId !== "none") {
      await saveVehicleSoC(db, user.uid, selectedVehicleId, socValue);
    }

    setIsSavingSoC(false);
    setSocSheetOpen(false);
    await proceedWithBooking(socValue, 'user_entered');
  }, [user, selectedVehicleId, proceedWithBooking]);

  // SOC NUDGE — sheet skip
  const handleSoCSkip = useCallback(() => {
    setSocWasSkipped(true);
    setUserEnteredSoC(null);
    setStartSoCSource('skipped_default');
    setSocSheetOpen(false);
    proceedWithBooking(SOC_DEFAULT_FALLBACK, 'skipped_default');
  }, [proceedWithBooking]);

  const handleBookSession = (target: number, cost: number, duration: number) => {
    setTargetSoC(target);
    setEstimatedCost(cost);
    setEstimatedDuration(duration);
    
    // Open booking sheet for first available compatible connector
    const compatibleConnectors = station?.connectors.filter(c => 
      checkConnectorCompatibility(c.type, selectedVehicle?.chargeType)
    ) || [];
    
    const firstAvail = compatibleConnectors.find(c => c.available);
    if (firstAvail) {
      handleSelectConnector(firstAvail.id);
    } else if (compatibleConnectors.length) {
      handleSelectConnector(compatibleConnectors[0].id, true); // Join waitlist
    } else {
      toast({
        variant: "destructive",
        title: "No Compatible Chargers",
        description: `This station does not have any chargers compatible with your ${selectedVehicle?.model || "vehicle"}.`
      });
    }
  };


  if (loading) return <div className="h-screen flex items-center justify-center font-black animate-pulse">Initializing...</div>;
  if (!station) return <div className="h-screen flex flex-col items-center justify-center gap-4">Station not found <Button onClick={() => setLocation("/")}>Back</Button></div>;

  const userWaitlistEntry = waitlistEntries.find(e => e.userId === user?.uid);

  return (
    <div className="min-h-screen bg-background pb-32">
      <AnimatePresence>
        {showWaitlistBanner && (
          <WaitlistNotificationBanner 
            stationName={station.name}
            stationId={station.id}
            onDismiss={() => setShowWaitlistBanner(false)}
          />
        )}
      </AnimatePresence>
      <motion.header 
        style={{ backgroundColor: `rgba(15, 23, 42, ${headerOpacity})`, backdropFilter: `blur(${headerBlur}px)` }}
        className="fixed top-0 left-0 right-0 z-50 h-[var(--header-height)] md:hidden border-b border-transparent data-[scrolled=true]:border-border flex items-center justify-between px-4"
      >
        <Button variant="ghost" size="icon" onClick={() => setLocation("/")} className="bg-slate-900/40 backdrop-blur-md rounded-full text-white hover:bg-slate-900/60">
           <ArrowLeft className="w-6 h-6" />
        </Button>
        <div className="flex gap-2">
           {relevantBooking && (
             <Button 
               variant="ghost" 
               size="icon" 
               onClick={handleOpenChat} 
               className="bg-primary/20 backdrop-blur-md rounded-full text-primary hover:bg-primary/40 relative"
             >
               <MessageCircle className="w-6 h-6" />
               <span className="absolute -top-1 -right-1 flex h-3 w-3">
                 <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                 <span className="relative inline-flex rounded-full h-3 w-3 bg-primary"></span>
               </span>
             </Button>
           )}
           <FavoriteButton stationId={station.id} />
          <Button variant="ghost" size="icon" onClick={handleShare} className="bg-slate-900/40 backdrop-blur-md rounded-full text-white hover:bg-slate-900/60">
            <Share2 className="w-6 h-6" />
          </Button>
        </div>
      </motion.header>

      <div className="relative h-[380px] md:h-[500px] w-full overflow-hidden bg-slate-950">
        <div className="h-full w-full relative">
          <img 
            src={station.imageUrl || "https://images.unsplash.com/photo-1593941707882-a5bba14938c7?auto=format&fit=crop&q=80&w=1200"} 
            className="w-full h-full object-cover opacity-90" 
          />
          <div className="absolute inset-0 hero-gradient-overlay" />
          {promotions.length > 0 && (
            <div className="absolute top-24 md:top-6 left-0 right-0 px-4 flex justify-center z-10 animate-in slide-in-from-top-4 duration-500 delay-300">
               <div className="bg-gradient-to-r from-primary to-emerald-500 rounded-full py-2 px-5 flex items-center gap-3 shadow-2xl shadow-primary/30 border border-white/20 backdrop-blur-md">
                 <div className="bg-white text-primary text-xs font-black px-2 py-0.5 rounded-full uppercase tracking-widest">{promotions[0].discountRate}% OFF</div>
                 <span className="text-white font-bold text-sm">{promotions[0].title}</span>
                 {promotions[0].promoCode && (
                   <span className="bg-black/20 text-white text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-md border border-white/10 ml-2">Code: {promotions[0].promoCode}</span>
                 )}
               </div>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 -mt-40 relative z-10">
        <Card className="premium-glass p-8 rounded-[40px] border-none shadow-2xl mb-8">
           <div className="flex flex-col gap-6">
              <div className="flex justify-between items-start gap-4">
                <div className="flex-1">
                  <h1 className="text-4xl font-black tracking-tight text-white leading-tight">
                    {station.name}
                  </h1>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <FavoriteButton stationId={station.id} variant="ghost" className="bg-white/5 hover:bg-white/10" />
                  <div className="pill-badge-green shadow-[0_0_15px_rgba(34,197,94,0.4)]">
                    Online
                  </div>
                </div>
              </div>
             
             <div className="flex items-center gap-3">
               <div className="pill-badge-rating flex items-center gap-1">
                 <span className="text-sm">4.5</span>
                 <Star className="w-3 h-3 fill-current" />
               </div>
               <span className="text-slate-400 font-bold tracking-wide">
                 {station.address.split(',')[0]}
               </span>
             </div>

             <div className="grid grid-cols-2 gap-4 mt-2">
                <div className="stat-card-dark">
                   <p className="text-[10px] font-black uppercase text-slate-500 mb-1 tracking-widest">Price Start</p>
                   <p className="text-2xl font-black text-[#22c55e]">
                     ₹{Math.min(...station.connectors.map(c => c.pricePerKwh || 0.2))}/kWh
                   </p>
                </div>
                 <div className="stat-card-dark">
                    <p className="text-[10px] font-black uppercase text-slate-500 mb-1 tracking-widest">Drive Time</p>
                    <p className="text-2xl font-black text-primary">
                      {formatDriveTime(getEstimatedDriveTime(2.4))}
                    </p>
                 </div>
             </div>
           </div>
        </Card>

        {/* VEHICLE SWITCHER — render above existing booking form */}
        {switcherVehicles.length > 0 && (
          <div className="mb-8 px-2">
            <div className="flex items-center justify-between mb-2 px-1">
              <p className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Select Vehicle</p>
              <Link href="/user-profile#garage">
                <a className="text-[10px] font-black text-primary uppercase tracking-widest hover:opacity-70">Garage →</a>
              </Link>
            </div>
            <VehicleQuickSwitcher
              vehicles={switcherVehicles}
              selectedVehicleId={activeVehicle?.id ?? null}
              onSelect={(v) => {
                setSelectedVehicleId(v.id);
                saveLastUsedVehicle(v.id);
              }}
            />
            {activeVehicle && !activeVehicle.isCompatible && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="mt-4 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-3"
              >
                <Info className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <p className="text-xs font-bold text-amber-200/80 leading-relaxed">
                  {activeVehicle.displayName} uses {activeVehicle.connectorType}. 
                  This station may not support it directly. Please verify connector types below.
                </p>
              </motion.div>
            )}
          </div>
        )}

        <ChargeEstimatorCard 
          station={station}
          activeVehicle={activeVehicle as any}
          onBookSession={handleBookSession}
          currentSoC={vehicleSoCState?.lastKnownSoC}
        />

        <section className="space-y-6">
           <div className="flex items-center justify-between px-2">
              <h2 className="text-2xl font-black tracking-tight text-white">Available Connectors</h2>
              {vehicles.length > 0 && (
                 <Select value={selectedVehicleId} onValueChange={setSelectedVehicleId}>
                   <SelectTrigger className="w-auto min-w-[120px] h-10 rounded-full text-xs font-black bg-slate-900/50 border-slate-800 text-slate-300 hover:bg-slate-800/50 transition-all">
                     <SelectValue placeholder="Vehicle" />
                   </SelectTrigger>
                   <SelectContent className="bg-slate-900 border-slate-800 text-slate-300">
                     <SelectItem value="none">All</SelectItem>
                     {vehicles.map((v: EvCar) => <SelectItem key={v.id} value={v.id}>{v.model}</SelectItem>)}
                   </SelectContent>
                 </Select>
              )}
            </div>

            {user && (
              <div className="mb-8 px-2">
                <WaitlistButton 
                  stationId={station.id}
                  userId={user.uid}
                  displayName={user.displayName || "Driver"}
                  vehicleType={selectedVehicle?.chargeType || "CCS"}
                  isInWaitlist={!!userWaitlistEntry}
                  waitingCount={waitlistEntries.length}
                  isAvailable={station.connectors.some(c => c.available)}
                  hasActiveBooking={!!relevantBooking}
                />
              </div>
            )}

           <div className="grid gap-4">
              {station.connectors.map(c => {
                const isCompatible = checkConnectorCompatibility(c.type, selectedVehicle?.chargeType);
                
                return (
                  <ConnectorCard 
                    key={c.id} 
                    connector={c} 
                    isSelected={selectedConnectorId === c.id}
                    isCompatible={isCompatible}
                    vehicle={selectedVehicle ? {
                      batteryCapacity: selectedVehicle.batteryCapacity,
                      chargeType: selectedVehicle.chargeType
                    } : null}
                    onSelect={() => {
                      if (!isCompatible) {
                        toast({
                          variant: "destructive",
                          title: "Incompatible Charger",
                          description: `This ${c.type} charger is not compatible with your ${selectedVehicle?.model || "vehicle"}.`
                        });
                        return;
                      }
                      handleSelectConnector(c.id);
                    }}
                  />
                );
              })}
           </div>
        </section>

        {/* Heatmap Section */}
        <div className="mt-12">
          <Card className="premium-glass p-6 rounded-[30px] border-none shadow-xl">
             <BusyTimesHeatmap 
               stationId={station.id} 
               totalConnectors={station.connectors.length} 
             />
          </Card>
        </div>
        
        {/* Review Section */}
        <div className="mt-12 mb-12">
           <StationReviews 
             stationId={station.id} 
             stationName={station.name} 
           />
        </div>
      </div>

      {/* Booking Bottom Sheet */}
      <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
        <SheetContent 
          key={selectedConnectorId ?? 'none'}
          side="bottom" 
          className="rounded-t-[40px] p-6 pb-[var(--safe-bottom)] z-[100] border-t border-white/10 shadow-2xl backdrop-blur-xl"
        >
          <SheetHeader className="mb-6">
            <SheetTitle className="text-2xl font-black flex items-center gap-3">
               <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                 <Zap className="w-6 h-6 text-primary" />
               </div>
               {selectedConnector?.type} Booking
            </SheetTitle>
            <SheetDescription className="font-bold flex items-center justify-between">
               <span>{selectedConnector?.powerKw}kW Fast Charger • ₹{selectedConnector?.pricePerKwh}/kWh</span>
               {selectedConnectorId && selectedVehicle && !checkConnectorCompatibility(selectedConnector?.type || "", selectedVehicle.chargeType) && (
                 <Badge variant="destructive" className="bg-red-500/10 text-red-500 border-red-500/20 text-[10px] uppercase font-black px-2">
                   Incompatible
                 </Badge>
               )}
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-6">
            <div>
              <p className="text-xs font-black uppercase text-muted-foreground mb-3">Select Start Time</p>
              <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                 {[0, 30, 60, 90, 120].map(mins => {
                   const time = addMinutes(new Date(), mins);
                   const isSelected = selectedTimeOffset === mins;
                   
                   // Calculate Time-Decay Price
                   const isDecayEnabled = owner?.timeDecay?.enabled ?? false;
                   const floorPrice = owner?.timeDecay?.floorPrice ?? 5;
                   const decayPrice = isDecayEnabled && selectedConnector 
                    ? calculateTimeDecayPrice(selectedConnector, time, floorPrice)
                    : (selectedConnector?.pricePerKwh || 15);
                   
                   const minutesUntil = mins; // Since we are adding from 'now'
                   const decayLabel = isDecayEnabled ? getDecayLabel(minutesUntil) : null;
                   const isDiscounted = decayPrice < (selectedConnector?.pricePerKwh || 15);

                    return (
                      <div key={mins} className="flex flex-col gap-2">
                        <Button 
                          variant={isSelected ? "default" : "outline"}
                          onClick={() => setSelectedTimeOffset(mins)}
                          className={cn(
                            "rounded-2xl h-14 min-w-[100px] flex flex-col font-black border-2 transition-all shrink-0 relative overflow-hidden",
                            isSelected ? "border-primary bg-primary text-primary-foreground scale-105 shadow-xl shadow-primary/20" : "hover:border-primary opacity-70 bg-background/40"
                          )}
                        >
                           <span className="text-lg leading-tight">{safeFormat(time, "HH:mm")}</span>
                           <span className={cn("text-[9px] uppercase tracking-tighter opacity-80", isSelected ? "text-primary-foreground/90" : "text-muted-foreground")}>
                              {mins === 0 ? "START NOW" : `+${mins} MINS`}
                           </span>
                           
                           {/* Discount Tag Inside Button */}
                           {isDiscounted && !isSelected && (
                             <div className="absolute top-0 right-0 bg-emerald-500 text-[8px] px-1.5 py-0.5 rounded-bl-lg">
                               %{Math.round((1 - decayPrice / (selectedConnector?.pricePerKwh || 15)) * 100)}
                             </div>
                           )}
                        </Button>
                        
                        {/* Price & Label Below Button */}
                        <div className="text-center px-1">
                          {isDiscounted ? (
                            <div className="flex flex-col items-center">
                              <span className="text-[10px] font-black text-emerald-400">₹{decayPrice}/kWh</span>
                              <span className="text-[8px] text-slate-500 line-through opacity-60">₹{selectedConnector?.pricePerKwh}/kWh</span>
                            </div>
                          ) : (
                            <span className="text-[10px] font-black text-slate-400">₹{selectedConnector?.pricePerKwh || 15}/kWh</span>
                          )}
                          {decayLabel && (
                            <div className="mt-1">
                              <Badge className="bg-emerald-500/20 text-emerald-500 hover:bg-emerald-500/20 border-none text-[8px] px-1.5 py-0 font-black h-4">
                                {decayLabel}
                              </Badge>
                            </div>
                          )}
                        </div>
                      </div>
                    )
                 })}
              </div>
            </div>

            <div className="bg-muted/30 rounded-3xl p-6 border border-white/5">
               {(() => {
                 if (!selectedConnector) return null;
                 const sessionEstimate = calculateEstimatedCost(
                   selectedConnector,
                   selectedVehicle ? {
                     batteryCapacity: selectedVehicle.batteryCapacity,
                     chargeType: selectedVehicle.chargeType
                   } : null,
                   80
                 );
                 const finalDuration = estimatedDuration || sessionEstimate.estimatedMinutes;
                 const finalEstimatedCost = currentEstimatedTotal;

                 return (
                   <>
                     <div className="flex justify-between items-end mb-4">
                        <div>
                         <p className="text-[10px] font-black uppercase text-muted-foreground mb-1">Estimated Total</p>
                         <div className="flex items-baseline gap-2">
                           <p className="text-4xl font-black text-primary">
                             ₹{finalEstimatedCost.toLocaleString('en-IN')}
                           </p>
                           {currentSlotPrice < Number(selectedConnector?.pricePerKwh || 15) && (
                             <p className="text-sm font-bold text-slate-500 line-through opacity-60">
                               ₹{Math.round((Number(selectedConnector?.pricePerKwh || 15)) * (finalEstimatedCost / currentSlotPrice)).toLocaleString('en-IN')}
                             </p>
                           )}
                         </div>
                       </div>
                       <div className="text-right">
                         <p className="text-xs font-black uppercase">Session Duration</p>
                         <p className="text-sm font-bold">{finalDuration} Minutes</p>
                       </div>
                    </div>

                    {/* Session Timeline Preview */}
                    <div className="space-y-3">
                       <div className="session-timeline">
                         <span>{safeFormat(addMinutes(new Date(), selectedTimeOffset), "HH:mm")}</span>
                         <div className="progress-track">
                           <div className="progress-fill w-[45%]" />
                         </div>
                         <span>{safeFormat(addMinutes(new Date(), selectedTimeOffset + finalDuration), "HH:mm")}</span>
                       </div>
                       <div className="flex flex-col items-center gap-1">
                         <p className="text-[10px] font-bold text-slate-500 uppercase text-center tracking-widest">
                           Estimated {finalDuration} min for {estimatedCost ? "requested" : "80%"} charge
                         </p>
                         {sessionEstimate.calculationBasis === "default" && (
                           <div className="estimate-disclaimer text-[11px] text-muted-foreground mt-1.5 text-center">
                             * Estimate based on 40kWh battery.
                             <Link href="/user-profile">
                               <a className="text-[#22c55e] underline ml-1">Add your vehicle</a>
                             </Link> for accurate pricing.
                           </div>
                         )}
                       </div>
                    </div>
                   </>
                 );
               })()}
               <Button 
                size="lg" 
                className="w-full h-16 rounded-2xl text-lg font-black shadow-xl shadow-primary/20 animate-pulse-slow"
                  onClick={handleConfirmBookingClick}
                  disabled={bookingLoading || isSoCChecking || (!!selectedConnectorId && selectedVehicle && !checkConnectorCompatibility(selectedConnector?.type || "", selectedVehicle.chargeType))}
                >
                  {bookingLoading || isSoCChecking ? (isSoCChecking ? "Checking Battery..." : "Reserving Slot...") : 
                    (!!selectedConnectorId && selectedVehicle && !checkConnectorCompatibility(selectedConnector?.type || "", selectedVehicle.chargeType) 
                      ? "Incompatible with vehicle" 
                      : "Secure My Slot →")}
                </Button>
            </div>
            
            <p className="text-[10px] text-center font-bold text-muted-foreground uppercase px-8">
              By confirming, you agree to the 10-minute hold policy. Failure to arrive may result in a small fee.
            </p>
          </div>
        </SheetContent>
      </Sheet>

      {/* SOC NUDGE — bottom sheet */}
      {vehicleSoCState && (
        <SoCBottomSheet
          isOpen={socSheetOpen}
          onConfirm={handleSoCConfirm}
          onSkip={handleSoCSkip}
          vehicleId={selectedVehicleId}
          vehicleName={vehicles.find((v: EvCar) => v.id === selectedVehicleId)?.model || 'your vehicle'}
          lastKnownSoC={vehicleSoCState.lastKnownSoC}
          lastKnownSoCUpdatedAt={vehicleSoCState.lastKnownSoCUpdatedAt}
          isSaving={isSavingSoC}
        />
      )}

      {/* Mobile Sticky Booking Bar */}
      {!isSheetOpen && !selectedConnectorId && (
        <div className="fixed bottom-16 left-0 right-0 z-40 bg-background/80 backdrop-blur-xl border-t p-4 md:hidden flex gap-4 pb-[calc(0.5rem+var(--safe-bottom))]">
           <Button variant="outline" className="h-14 w-14 rounded-2xl shrink-0 border-white/10 bg-white/5" onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&destination=${station.lat},${station.lon}`)}>
             <Navigation className="w-6 h-6 text-primary" />
           </Button>
           <Button className="h-14 flex-1 rounded-2xl font-black text-lg shadow-lg bg-primary hover:bg-primary/90" onClick={() => {
              const firstAvail = station.connectors.find(c => c.available);
              if (firstAvail) handleSelectConnector(firstAvail.id);
           }}>
             Book Fast Charger →
           </Button>
        </div>
      )}

      {/* Chat Interface */}
      {showChat && chatId && (
        <div style={{
          position: "fixed",
          bottom: "20px",
          right: "20px",
          zIndex: 1000,
          boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
          borderRadius: "20px"
        }}>
          <ChatWindow
            chatId={chatId}
            currentUserId={user!.uid}
            currentUserRole="driver"
            currentUserName={user!.displayName || "Driver"}
            recipientName={relevantBooking?.ownerBusinessName || owner?.businessName || "Station Owner"}
            stationName={station.name}
            onClose={() => setShowChat(false)}
          />
        </div>
      )}
    </div>
  );
}
