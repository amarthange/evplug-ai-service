import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useRoute, useLocation } from "wouter";
import { doc, onSnapshot, updateDoc, serverTimestamp, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { 
  ArrowLeft, BatteryCharging, MoreVertical, 
  Zap, Clock, IndianRupee, Power,
  CheckCircle2, AlertTriangle, X, MessageCircle
} from "lucide-react";
import type { Booking, Station, Connector } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { BOOKING_STATUS, isValidTransition } from "@/constants/bookingStatus";
import { notifyNextInWaitlist } from "@/lib/waitlist-service";
import ChatWindow from "@/components/ChatWindow";
import { closeChat } from "@/services/chatService";

// GRACE FLOW — Section A: New imports
import TopUpModal from '@/components/TopUpModal';
import { logAuditEvent } from "@/lib/auditLogger";
import { cn } from "@/lib/utils";

// OFFLINE RESILIENCE: Imports
import { 
  saveSessionDelta, getUnsyncedDeltas, markDeltasSynced,
  getLatestDelta, pruneOldDeltas, type SessionDelta 
} from '@/lib/session-idb';
import { SOC_DEFAULT_FALLBACK } from '@/lib/soc-manager';

// GRACE FLOW — State Machine Type
export type GraceFlowState =
  | 'idle'           // normal charging, no grace flow
  | 'prompted'       // modal is open, countdown running
  | 'topping_up'     // user clicked a top-up button, Firestore write in progress
  | 'topped_up'      // write succeeded, modal dismissed, session continues
  | 'expired'        // countdown hit zero, session ending
  | 'dismissed'      // user closed modal without topping up (session ends)

/**
 * Physics model for non-linear EV charging simulation.
 * Real-world batteries throttle power intake as SoC increases (BMS tapering).
 */
function computeChargingState(
  startSoC: number,
  powerKw: number,
  ratePerKwh: number,
  elapsedSecs: number,
  batteryCapacityKwh: number = 40
) {
  let currentSoC = startSoC;
  let totalKwh = 0;
  let lastEffectivePower = powerKw;

  for (let s = 0; s < elapsedSecs; s++) {
    let effectivePower;
    if (currentSoC <= 80) {
      effectivePower = powerKw;
    } else {
      effectivePower = powerKw * Math.exp(-5 * ((currentSoC / 100) - 0.8));
    }

    const kwhThisSecond = effectivePower / 3600;
    const socGainThisSecond = (kwhThisSecond / batteryCapacityKwh) * 100;

    totalKwh += kwhThisSecond;
    currentSoC += socGainThisSecond;
    lastEffectivePower = effectivePower;

    if (currentSoC >= 100) {
      currentSoC = 100;
      lastEffectivePower = 0;
      break;
    }
  }

  let futureSoC = currentSoC;
  let additionalSecs = 0;
  const MAX_FUTURE_SECS = 3600 * 12;

  while (futureSoC < 100 && additionalSecs < MAX_FUTURE_SECS) {
    let p;
    if (futureSoC <= 80) p = powerKw;
    else p = powerKw * Math.exp(-5 * ((futureSoC / 100) - 0.8));
    const kwhNext = p / 3600;
    const socGainNext = (kwhNext / batteryCapacityKwh) * 100;
    futureSoC += socGainNext;
    additionalSecs++;
  }

  return {
    soc: Math.min(currentSoC, 100),
    kwhDelivered: totalKwh,
    currentCost: totalKwh * ratePerKwh,
    effectivePowerKw: lastEffectivePower,
    isTapered: currentSoC > 80,
    minsToFull: additionalSecs > 0 ? Math.min(Math.ceil(additionalSecs / 60), 999) : 0
  };
}

export default function ActiveCharge() {
  const [, params] = useRoute("/charge/:id");
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [booking, setBooking] = useState<Booking | null>(null);
  const [station, setStation] = useState<Station | null>(null);
  const [loading, setLoading] = useState(true);
  const [finishing, setFinishing] = useState(false);
  const [showEndConfirm, setShowEndConfirm] = useState(false);

  const [localEnergy, setLocalEnergy] = useState(0);
  const [localCost, setLocalCost] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [percentage, setPercentage] = useState(0);
  
  const [effectivePower, setEffectivePower] = useState(0);
  const [isTapered, setIsTapered] = useState(false);
  const [minsToFull, setMinsToFull] = useState<number | null>(null);
  const batteryCapacityRef = useRef<number>(40);

  // GRACE FLOW — Section B: New state and refs
  const [graceFlowState, setGraceFlowState] = useState<GraceFlowState>('idle');
  const [displayCountdown, setDisplayCountdown] = useState(120);
  const [walletBalance, setWalletBalance] = useState<number>(0);
  const [topUpError, setTopUpError] = useState<string | null>(null);
  const [isTopUpProcessing, setIsTopUpProcessing] = useState(false);
  const [prePaidAmount, setPrePaidAmount] = useState<number>(0);
  const [selectedTopUpAmount, setSelectedTopUpAmount] = useState<number | null>(null);

  const hasTriggeredGrace = useRef(false);
  const graceCountdownRef = useRef(120);
  const graceIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prePaidAmountRef = useRef<number>(0);

  // Sync ref to state
  useEffect(() => { 
    prePaidAmountRef.current = prePaidAmount;
  }, [prePaidAmount]);

  // Chat State
  const [showChat, setShowChat] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  // OFFLINE RESILIENCE: New state variables
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'synced' | 'error'>('idle');
  const [pendingDeltaCount, setPendingDeltaCount] = useState(0);

  // OFFLINE RESILIENCE: Refs
  const workerRef = useRef<Worker | null>(null);
  const idbSaveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastSavedDeltaRef = useRef<number>(0);
  const latestTickRef = useRef<any>(null);

  const bookingId = params?.id;

  // OFFLINE RESILIENCE: Extended syncToFirestore
  const syncToFirestore = useCallback(async (data: {
    kwhDelivered: number;
    currentCost: number;
    soc: number;
    elapsedSecs: number;
    effectivePowerKw: number;
    isTapered: boolean;
    minsToFull: number | null;
    lastSyncedAt?: Date;
  }) => {
    if (!bookingId) return;
    try {
      await updateDoc(doc(db, "bookings", bookingId), {
        energyDeliveredKwh: data.kwhDelivered,
        totalPrice: data.currentCost,
        effective_power_kw: data.effectivePowerKw,
        is_tapered: data.isTapered,
        mins_to_full: data.minsToFull,
        lastSyncAt: data.lastSyncedAt || serverTimestamp()
      });
    } catch (err) {
      console.error("[SeniorDevOps] Firestore sync failed:", err);
      throw err; // Re-throw for reconcileAndSync to handle
    }
  }, [bookingId]);

  // OFFLINE RESILIENCE: Reconcile and Sync
  const reconcileAndSync = useCallback(async () => {
    if (!bookingId || !navigator.onLine) return;
    setSyncStatus('syncing');

    try {
      const deltas = await getUnsyncedDeltas(bookingId);
      if (deltas.length === 0) {
        setSyncStatus('synced');
        setTimeout(() => setSyncStatus('idle'), 3000);
        return;
      }

      // Take the most recent delta as the source of truth for Firestore
      const latest = deltas[deltas.length - 1];

      await syncToFirestore({
        kwhDelivered: latest.kwhDelivered,
        currentCost: latest.currentCost,
        soc: latest.soc,
        elapsedSecs: latest.elapsedSecs,
        effectivePowerKw: latest.effectivePowerKw,
        isTapered: latest.isTapered,
        minsToFull: latest.minsToFull,
        lastSyncedAt: new Date(latest.timestamp)
      });

      // Mark all deltas as synced
      const ids = deltas.map(d => d.id!).filter(Boolean);
      await markDeltasSynced(ids);
      setPendingDeltaCount(0);
      setSyncStatus('synced');

      setTimeout(() => setSyncStatus('idle'), 3000);
    } catch (err) {
      console.error('[SeniorDevOps] Reconcile sync failed:', err);
      setSyncStatus('error');
    }
  }, [bookingId, syncToFirestore]);

  // GRACE FLOW — Countdown Implementation
  const startGraceCountdown = useCallback(() => {
    graceCountdownRef.current = 120;
    setDisplayCountdown(120);
    if (graceIntervalRef.current) clearInterval(graceIntervalRef.current);
    
    graceIntervalRef.current = setInterval(() => {
      graceCountdownRef.current -= 1;
      setDisplayCountdown(graceCountdownRef.current);
      if (graceCountdownRef.current <= 0) {
        if (graceIntervalRef.current) clearInterval(graceIntervalRef.current);
        setGraceFlowState('expired');
      }
    }, 1000);
  }, []);

  const clearGraceCountdown = useCallback(() => {
    if (graceIntervalRef.current) {
      clearInterval(graceIntervalRef.current);
      graceIntervalRef.current = null;
    }
  }, []);

  // GRACE FLOW — Section D: handleTopUp function
  /**
   * Performs an optimistic update of the session budget and wallet balance.
   * Updates prePaidAmountRef immediately to prevent the simulation from stopping
   * while the Firestore write is in progress.
   */
  const handleTopUp = useCallback(async (amount: number) => {
    if (!user || !bookingId) return;
    if (walletBalance < amount) {
      setTopUpError(`Insufficient balance. You have ₹${walletBalance.toFixed(2)}.`);
      return;
    }

    setIsTopUpProcessing(true);
    setTopUpError(null);
    setSelectedTopUpAmount(amount);
    setGraceFlowState('topping_up');

    // Optimistic local update — apply immediately so simulation continues
    const prevPrePaid = prePaidAmountRef.current;
    const newPrePaidAmount = prevPrePaid + amount;
    prePaidAmountRef.current = newPrePaidAmount;
    setPrePaidAmount(newPrePaidAmount);

    const prevWallet = walletBalance;
    const newWalletBalance = prevWallet - amount;
    setWalletBalance(newWalletBalance);

    try {
      if (!navigator.onLine) throw new Error('offline');

      // Two concurrent Firestore writes
      await Promise.all([
        updateDoc(doc(db, 'bookings', bookingId), {
          estimatedTotal: newPrePaidAmount // Using estimatedTotal as budget
        }),
        updateDoc(doc(db, 'users', user.uid, 'wallet', 'balance'), {
          balance: newWalletBalance
        })
      ]);

      // Log success to audit log
      logAuditEvent({
        action: 'payment_topup_completed',
        category: 'FINANCE',
        performedBy: user.uid,
        targetId: bookingId,
        severity: 'info',
        metadata: {
          topUpAmount: amount,
          newPrePaidAmount,
          walletBalanceAfter: newWalletBalance
        }
      });

      clearGraceCountdown();
      setGraceFlowState('topped_up');
      setIsTopUpProcessing(false);

      // After 2s success display, return to normal charging
      setTimeout(() => {
        setGraceFlowState('idle');
        // hasTriggeredGrace remains true, ensuring only one grace prompt per session
      }, 2000);

    } catch (err: any) {
      // Rollback optimistic update
      prePaidAmountRef.current = prevPrePaid;
      setPrePaidAmount(prevPrePaid);
      setWalletBalance(prevWallet);

      logAuditEvent({
        action: 'payment_topup_failed',
        category: 'FINANCE',
        performedBy: user.uid,
        targetId: bookingId,
        severity: 'error',
        metadata: { 
          selectedAmount: amount, 
          error: err.message,
          isOffline: !navigator.onLine
        }
      });

      setTopUpError(err.message === 'offline' 
        ? 'Cannot top up while offline. Reconnect to continue charging.' 
        : 'Payment failed. Please try again or end your session.');
      setGraceFlowState('prompted');
      setIsTopUpProcessing(false);
    }
  }, [walletBalance, bookingId, user, clearGraceCountdown]);

  // GRACE FLOW — Section E: handleGraceExpiry effect
  useEffect(() => {
    if (graceFlowState === 'expired' || graceFlowState === 'dismissed') {
      clearGraceCountdown();
      // Small delay so the modal can animate out before session end UI mounts
      const timeout = setTimeout(() => {
        handleSessionEndAuto('PREPAID_LIMIT');
      }, 400);
      return () => clearTimeout(timeout);
    }
  }, [graceFlowState, clearGraceCountdown]);

  // Chat Effect
  useEffect(() => {
    if (!bookingId || !user) return;
    const chatId = `${bookingId}_${user.uid}`;
    
    return onSnapshot(doc(db, "chats", chatId), (snap) => {
      if (snap.exists()) {
        setUnreadCount(snap.data().driverUnread || 0);
      }
    }, () => {});
  }, [bookingId, user]);
  
  // Main session effect
  useEffect(() => {
    if (!bookingId || !user) return;

    // OFFLINE RESILIENCE: Network detection
    const handleOnline = () => {
      setIsOnline(true);
      reconcileAndSync();
    };
    const handleOffline = () => setIsOnline(false);
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        reconcileAndSync();
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    const unsubscribe = onSnapshot(doc(db, "bookings", bookingId), async (docSnap) => {
      if (!docSnap.exists()) {
        setLocation("/bookings");
        return;
      }

      const data = { id: docSnap.id, ...docSnap.data() } as Booking;
      if (data.userId !== user.uid) {
        setLocation("/bookings");
        return;
      }

      // Session start logic
      if ([BOOKING_STATUS.PENDING, BOOKING_STATUS.CONFIRMED].includes(data.status as any) || (data.status === BOOKING_STATUS.ACTIVE && !data.startTime)) {
        const startMs = Date.now();
        try {
          await updateDoc(doc(db, "bookings", data.id), {
            status: BOOKING_STATUS.ACTIVE,
            startTime: startMs,
            lastSyncAt: serverTimestamp()
          });
          data.status = BOOKING_STATUS.ACTIVE;
          data.startTime = startMs;
        } catch (err) {
          console.error("Failed to start session:", err);
        }
      }

      setBooking(data);
      
      // Update local budget state if it hasn't been set or if changed externally
      const initialPrePaid = data.estimatedTotal || data.totalPrice || 0;
      if (prePaidAmountRef.current === 0) {
        setPrePaidAmount(initialPrePaid);
        prePaidAmountRef.current = initialPrePaid;
      }

      // Fetch station & vehicle
      if (data.stationId && !station) {
        try {
          const stationSnap = await getDoc(doc(db, "stations", data.stationId));
          if (stationSnap.exists()) {
            setStation({ id: stationSnap.id, ...stationSnap.data() } as Station);
          }
        } catch (err) { console.error("Station fetch error:", err); }
      }

      if (!workerRef.current && data.status === BOOKING_STATUS.ACTIVE) {
        // GRACE FLOW — Section C: Wallet balance fetch
        try {
          const walletSnap = await getDoc(
            doc(db, 'users', user.uid, 'wallet', 'balance')
          );
          if (walletSnap.exists()) {
            setWalletBalance(walletSnap.data()?.balance ?? 0);
          }
        } catch (e) { console.warn("Wallet load failed", e); }

        // STEP 3: Fetch Battery Capacity before starting worker
        let bCap = 40;
        try {
          const vehicleId = (data as any).vehicleId;
          const uSnap = await getDoc(doc(db, "users", user.uid));
          const primaryId = uSnap.data()?.primaryVehicleId;
          const targetVehicleId = vehicleId || primaryId;

          if (targetVehicleId) {
            const vSnap = await getDoc(doc(db, "users", user.uid, "ev_vehicles", targetVehicleId));
            if (vSnap.exists()) {
              bCap = vSnap.data().battery_capacity_kwh ?? vSnap.data().batteryCapacity ?? 40;
              batteryCapacityRef.current = bCap;
            }
          }
        } catch (e) { console.warn("Vehicle capacity load failed"); }

        // OFFLINE RESILIENCE: Housekeeping
        pruneOldDeltas().catch(console.error);

        // OFFLINE RESILIENCE: Resume from IDB logic
        const existingDelta = await getLatestDelta(bookingId);
        const sessionStart = new Date(data.startTime || Date.now());
        const resumeElapsedSecs = existingDelta
          ? Math.max(
              existingDelta.elapsedSecs,
              Math.floor((Date.now() - sessionStart.getTime()) / 1000)
            )
          : Math.floor((Date.now() - sessionStart.getTime()) / 1000);

        // OFFLINE RESILIENCE: Web Worker initialization
        try {
          const worker = new Worker(
            new URL('../workers/session-worker.ts', import.meta.url),
            { type: 'module' }
          );
          workerRef.current = worker;

          const connector = station?.connectors.find(c => c.id === data.connectorId);
          const powerKw = (data as any).connectorPowerKw || connector?.powerKw || 7.4;
          const rate = (data as any).pricePerKwh || connector?.pricePerKwh || 8;

          worker.postMessage({
            type: 'START',
            payload: {
              sessionId: bookingId,
              userId: user.uid,
              startSoC: (data as any).startSoC ?? SOC_DEFAULT_FALLBACK,
              powerKw,
              ratePerKwh: rate,
              batteryCapacityKwh: bCap,
              prePaidAmount: prePaidAmountRef.current,
              sessionStartTimestamp: sessionStart.getTime(),
              resumeFromSecs: resumeElapsedSecs
            }
          });

          worker.onmessage = (event: MessageEvent) => {
            const msg = event.data;
            if (msg.type === 'TICK') {
              const p = msg.payload;
              setPercentage(p.soc);
              setLocalEnergy(p.kwhDelivered);
              setLocalCost(p.currentCost);
              setEffectivePower(p.effectivePowerKw);
              setIsTapered(p.isTapered);
              setMinsToFull(p.minsToFull);
              setElapsed(p.elapsedSecs);
              latestTickRef.current = p;

              // GRACE FLOW — Trigger Logic
              const remaining = prePaidAmountRef.current - p.currentCost;
              if (
                remaining < 20 &&
                graceFlowState === 'idle' &&
                !hasTriggeredGrace.current
              ) {
                hasTriggeredGrace.current = true;
                setGraceFlowState('prompted');
                startGraceCountdown();
                
                logAuditEvent({
                  action: 'payment_topup_prompt',
                  category: 'FINANCE',
                  performedBy: user.uid,
                  targetId: bookingId,
                  severity: 'warning',
                  metadata: {
                    remainingBalance: remaining,
                    prePaidAmount: prePaidAmountRef.current,
                    kwhDelivered: p.kwhDelivered,
                    soc: p.soc,
                    triggeredAt: new Date().toISOString()
                  }
                });
              }
            }
            if (msg.type === 'AUTO_STOP') {
              // GRACE FLOW — Modified auto-stop check
              if (graceFlowState === 'idle' && !hasTriggeredGrace.current) {
                handleSessionEndAuto(msg.reason);
              }
              // If grace flow is active (prompted/topping_up), the countdown or success handler 
              // will govern the session lifecycle.
            }
          };

          worker.onerror = (e) => {
            console.warn('[SeniorDevOps] Worker failed, falling back to main thread tick', e);
            startFallbackSimulation(data, bCap);
          };

          // OFFLINE RESILIENCE: IDB Save interval (30s)
          idbSaveIntervalRef.current = setInterval(async () => {
            const tick = latestTickRef.current;
            if (!tick) return;
            
            const delta: SessionDelta = {
              sessionId: bookingId,
              userId: user.uid,
              timestamp: Date.now(),
              elapsedSecs: tick.elapsedSecs,
              kwhDelivered: tick.kwhDelivered,
              currentCost: tick.currentCost,
              soc: tick.soc,
              effectivePowerKw: tick.effectivePowerKw,
              isTapered: tick.isTapered,
              minsToFull: tick.minsToFull,
              synced: false
            };
            await saveSessionDelta(delta);
            lastSavedDeltaRef.current = Date.now();
            const unsynced = await getUnsyncedDeltas(bookingId);
            setPendingDeltaCount(unsynced.length);
          }, 30_000);

        } catch (workerErr) {
          console.error("Worker start failed", workerErr);
          startFallbackSimulation(data, bCap);
        }
      }

      setLoading(false);
    });

    return () => {
      unsubscribe();
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      workerRef.current?.postMessage({ type: 'STOP' });
      workerRef.current = null;
      if (idbSaveIntervalRef.current) clearInterval(idbSaveIntervalRef.current);
      clearGraceCountdown();
    };
  }, [bookingId, user, station, startGraceCountdown, clearGraceCountdown, reconcileAndSync, graceFlowState]);

  // OFFLINE RESILIENCE: Fallback simulation if worker unavailable
  const startFallbackSimulation = (data: Booking, bCap: number) => {
    const sessionStart = new Date(data.startTime || Date.now());
    const connector = station?.connectors.find(c => c.id === data.connectorId);
    const powerKw = (data as any).connectorPowerKw || connector?.powerKw || 7.4;
    const rate = (data as any).pricePerKwh || connector?.pricePerKwh || 8;
    const startSoC = (data as any).startSoC ?? 68;

    const timer = setInterval(() => {
      const elapsedSecs = Math.floor((Date.now() - sessionStart.getTime()) / 1000);
      const state = computeChargingState(startSoC, powerKw, rate, elapsedSecs, bCap);
      
      setPercentage(state.soc);
      setLocalEnergy(state.kwhDelivered);
      setLocalCost(state.currentCost);
      setEffectivePower(state.effectivePowerKw);
      setIsTapered(state.isTapered);
      setMinsToFull(state.minsToFull);
      setElapsed(elapsedSecs);
      
      latestTickRef.current = { elapsedSecs, ...state };

      // GRACE FLOW — Trigger Logic (Fallback)
      const remaining = prePaidAmountRef.current - state.currentCost;
      if (
        remaining < 20 &&
        graceFlowState === 'idle' &&
        !hasTriggeredGrace.current
      ) {
        hasTriggeredGrace.current = true;
        setGraceFlowState('prompted');
        startGraceCountdown();
        
        logAuditEvent({
          action: 'payment_topup_prompt',
          category: 'FINANCE',
          performedBy: user!.uid,
          targetId: bookingId,
          severity: 'warning',
          metadata: {
            remainingBalance: remaining,
            prePaidAmount: prePaidAmountRef.current,
            kwhDelivered: state.kwhDelivered,
            soc: state.soc,
            triggeredAt: new Date().toISOString()
          }
        });
      }

      if (state.soc >= 100 || (prePaidAmountRef.current > 0 && state.currentCost >= prePaidAmountRef.current)) {
        if (graceFlowState === 'idle' && !hasTriggeredGrace.current) {
          handleSessionEndAuto(state.soc >= 100 ? 'BATTERY_FULL' : 'PREPAID_LIMIT');
          clearInterval(timer);
        }
      }
    }, 1000);

    return () => clearInterval(timer);
  };

  const handleSessionEndAuto = (reason: 'PREPAID_LIMIT' | 'BATTERY_FULL') => {
    if (finishing) return;
    toast({ 
      title: reason === 'BATTERY_FULL' ? "Battery Full! ⚡" : "Pre-paid Limit Reached! 💰",
      description: "Finalizing your charging session now...",
      className: "bg-amber-600 text-white border-none"
    });
    handleEndSession();
  };

  const handleEndSession = async () => {
    if (!user || !booking || !isValidTransition(booking.status as any, BOOKING_STATUS.COMPLETED)) {
      return;
    }
    setFinishing(true);
    try {
      await updateDoc(doc(db, "bookings", booking.id), {
        status: BOOKING_STATUS.COMPLETED,
        endedAt: serverTimestamp(),
        energyDeliveredKwh: localEnergy,
        totalPrice: localCost,
        actualEndTime: new Date().toISOString(),
        is_tapered: isTapered,
        effective_power_kw: effectivePower
      });
      
      const stationRef = doc(db, "stations", booking.stationId);
      const stationSnap = await getDoc(stationRef);
      if (stationSnap.exists()) {
        const stationData = stationSnap.data() as Station;
        const updatedConnectors = (stationData.connectors || []).map(c => 
          c.id === booking.connectorId ? { ...c, available: true } : c
        );
        await updateDoc(stationRef, { connectors: updatedConnectors });
        
        if (booking.connectorType) {
          await notifyNextInWaitlist(booking.stationId, booking.connectorType);
        }
      }

      const userRef = doc(db, "users", user.uid);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        const userData = userSnap.data();
        const pointsEarned = Math.round(localEnergy * 10);
        const carbonOffset = Number((localEnergy * 0.82).toFixed(2));
        
        await updateDoc(userRef, {
          loyaltyPoints: (userData.loyaltyPoints || 0) + pointsEarned,
          totalCarbonOffset: (userData.totalCarbonOffset || 0) + carbonOffset,
          completedBookingsCount: (userData.completedBookingsCount || 0) + 1,
          lastActivityAt: serverTimestamp()
        });
        
        toast({
          title: `Rewards Earned! 🎖️`,
          description: `You earned ${pointsEarned} Points and offset ${carbonOffset}kg of CO2.`,
          className: "bg-emerald-600 text-white border-none shadow-lg shadow-emerald-500/20"
        });
      }

      if (navigator.vibrate) navigator.vibrate([100, 50, 100, 50, 300]);
      
      const chatId = `${booking.id}_${user.uid}`;
      setTimeout(() => {
        closeChat(chatId).catch(err => console.error("Auto-close chat failed:", err));
      }, 120000);

      setLocation(`/receipt/${booking.id}`);
    } catch (e) {
      toast({ variant: "destructive", title: "Failed to end session" });
    } finally {
      setFinishing(false);
      setShowEndConfirm(false);
    }
  };

  const formatElapsedTime = (sec: number) => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return `${h > 0 ? h + ':' : ''}${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  if (loading) return null;

  // GRACE FLOW — Reactive balance calculation
  const remainingBalance = prePaidAmount - localCost;

  return (
    <div className="min-h-screen bg-[#0f172a] text-white flex flex-col charging-bg pt-[var(--safe-top)] pb-[var(--safe-bottom)] selective-overscroll-none">
      <header className="flex items-center justify-between px-6 h-16 shrink-0">
        <Button variant="ghost" size="icon" className="rounded-full text-white/70 hover:text-white" onClick={() => setLocation("/bookings")}>
          <ArrowLeft className="w-6 h-6" />
        </Button>
        <span className="font-black uppercase tracking-widest text-[10px] text-white/50">Active Session</span>
        <div className="flex items-center gap-1">
          <Button 
            variant="ghost" 
            size="icon" 
            className="rounded-full text-white/70 hover:text-white relative"
            onClick={() => setShowChat(!showChat)}
          >
            <MessageCircle className="w-6 h-6" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center border-2 border-[#0f172a] animate-bounce-slow">
                {unreadCount}
              </span>
            )}
          </Button>
          <Button variant="ghost" size="icon" className="rounded-full text-white/70 hover:text-white">
            <MoreVertical className="w-6 h-6" />
          </Button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-6 space-y-8 pb-32">
        <div className="text-center space-y-1">
          <h1 className="text-xl font-black">{booking?.stationName || "EV Charging Station"}</h1>
          <p className="text-xs font-mono text-emerald-400 opacity-80 uppercase tracking-wider">
            {booking?.connectorType || "CCS2"} · {booking?.connectorId || "Charger ID"}
          </p>
        </div>

        {/* OFFLINE RESILIENCE: Banners */}
        <div className="px-1">
          <AnimatePresence>
            {!isOnline && (
              <motion.div
                key="offline-banner"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.25, ease: 'easeInOut' }}
                className="overflow-hidden"
              >
                <div className="flex items-center gap-2 rounded-lg border border-slate-200
                                bg-slate-50 dark:bg-slate-900 dark:border-slate-700
                                px-3 py-2 text-xs text-slate-600 dark:text-slate-400 mb-3">
                  <div className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-pulse" />
                  <span>
                    Offline — session continuing locally.
                    {pendingDeltaCount > 0 && ` ${pendingDeltaCount} snapshot${pendingDeltaCount > 1 ? 's' : ''} queued.`}
                  </span>
                </div>
              </motion.div>
            )}

            {isOnline && syncStatus === 'synced' && (
              <motion.div
                key="synced-banner"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.25 }}
                className="overflow-hidden"
              >
                <div className="flex items-center gap-2 rounded-lg border border-emerald-200
                                bg-emerald-50 dark:bg-emerald-950 dark:border-emerald-800
                                px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300 mb-3">
                  <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  <span>Session synced successfully.</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="relative flex items-center justify-center py-4">
          <svg className="w-64 h-64 -rotate-90">
            <circle cx="128" cy="128" r="100" stroke="currentColor" strokeWidth="12" fill="transparent" className="text-white/5" />
            <motion.circle
              cx="128" cy="128" r="100" stroke="currentColor" strokeWidth="12" fill="transparent" strokeDasharray="628"
              initial={{ strokeDashoffset: 628 }}
              animate={{ strokeDashoffset: 628 - (628 * percentage) / 100 }}
              className="text-emerald-500 drop-shadow-[0_0_15px_rgba(16,185,129,0.5)]"
              strokeLinecap="round"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <motion.div 
              animate={{ opacity: [0.5, 1, 0.5] }} 
              transition={{ duration: 2, repeat: Infinity }}
              className="text-emerald-500 font-black text-6xl tracking-tighter mb-1"
            >
              {Math.floor(percentage)}%
            </motion.div>
            <div className="flex items-center gap-2 bg-emerald-500/10 px-4 py-1.5 rounded-full border border-emerald-500/20">
              <Zap className="w-3.5 h-3.5 text-emerald-500 fill-emerald-500" />
              <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400">Charging</span>
            </div>
          </div>
        </div>

        <AnimatePresence>
          {isTapered && (
            <motion.div
              key="taper-notice"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
              className="flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-xs text-amber-500 backdrop-blur-md"
            >
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>
                <strong>BMS Tapering Active:</strong> Charging slowed to protect battery health ({effectivePower.toFixed(1)} kW).
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="grid grid-cols-2 gap-4">
          <div className="metric-card">
            <div className="text-[24px] font-bold font-mono tracking-tighter">{localEnergy.toFixed(2)}</div>
            <div className="metric-label uppercase font-black tracking-widest text-[9px] opacity-40 mt-1">Energy (kWh)</div>
          </div>
          <div className="metric-card">
            <div className="text-[24px] font-bold font-mono tracking-tighter text-emerald-400">{effectivePower.toFixed(1)}</div>
            <div className="metric-label uppercase font-black tracking-widest text-[9px] opacity-40 mt-1">Flow (kW)</div>
          </div>
          <div className="metric-card">
            <div className="text-[24px] font-bold font-mono tracking-tighter">{formatElapsedTime(elapsed)}</div>
            <div className="metric-label uppercase font-black tracking-widest text-[9px] opacity-40 mt-1">Elapsed</div>
          </div>
          <div className="metric-card relative overflow-hidden">
            {/* GRACE FLOW — Section G: Remaining balance display */}
            <div className={cn(
              "text-[24px] font-bold font-mono tracking-tighter tabular-nums",
              remainingBalance > 20 ? "text-emerald-400" :
              remainingBalance > 10 ? "text-amber-400" :
              "text-red-500 animate-pulse"
            )}>
              ₹{remainingBalance.toFixed(2)}
            </div>
            <div className="metric-label uppercase font-black tracking-widest text-[9px] opacity-40 mt-1">Remaining</div>
            {prePaidAmount > 0 ? (
              <div className="absolute top-2 right-2 flex items-center gap-1 opacity-40">
                <span className="text-[8px] font-black">BUDGET: ₹{prePaidAmount.toFixed(0)}</span>
              </div>
            ) : null}
          </div>
        </div>

        <div className="space-y-4 pt-4">
          <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-white/30">
            <span>Battery Status</span>
            <span className="text-white/70">
              {minsToFull !== null ? (
                minsToFull < 60 
                  ? `${minsToFull} min to full` 
                  : `${Math.floor(minsToFull/60)}h ${minsToFull % 60}m to full`
              ) : "Calculating..."}
            </span>
          </div>
          <div className="progress-track">
             <motion.div 
               className="progress-fill" 
               initial={{ width: 0 }}
               animate={{ width: `${percentage}%` }}
             />
          </div>
        </div>
      </main>

      <div className="fixed bottom-16 left-0 right-0 p-6 bg-gradient-to-t from-[#0f172a] to-transparent pt-12">
        <Button 
          className="w-full h-14 rounded-2xl bg-red-500 hover:bg-red-600 font-black text-lg shadow-2xl shadow-red-500/20 active:scale-95 transition-all"
          onClick={() => setShowEndConfirm(true)}
        >
          <Power className="w-5 h-5 mr-2" /> End Charging Session
        </Button>
      </div>

      <Sheet open={showEndConfirm} onOpenChange={setShowEndConfirm}>
        <SheetContent side="bottom" className="bg-[#1e293b] border-white/5 rounded-t-[32px] p-6 pb-[var(--safe-bottom)] outline-none text-white">
          <SheetHeader className="mb-6">
            <div className="w-12 h-1.5 bg-white/10 rounded-full mx-auto mb-4" />
            <SheetTitle className="text-xl font-black text-white">End Charging Session?</SheetTitle>
            <SheetDescription className="text-white/50 font-bold">
              Review your session summary before finishing.
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-4 mb-8">
            <div className="bg-white/5 p-5 rounded-2xl border border-white/5 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm font-bold opacity-50">Energy Delivered</span>
                <span className="font-mono font-bold">{localEnergy.toFixed(2)} kWh</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm font-bold opacity-50">Duration</span>
                <span className="font-mono font-bold">{Math.floor(elapsed / 60)} minutes</span>
              </div>
              <div className="h-px bg-white/5 w-full" />
              <div className="flex justify-between items-center">
                <span className="text-sm font-bold opacity-50 uppercase tracking-widest text-[10px]">Total Cost</span>
                <span className="text-xl font-black text-emerald-400 font-mono">₹{localCost.toFixed(2)}</span>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3">
             <Button variant="ghost" className="h-14 rounded-2xl font-black text-white/50 hover:text-white hover:bg-white/5" onClick={() => setShowEndConfirm(false)}>
                Continue Charging
             </Button>
             <Button className="h-14 rounded-2xl bg-emerald-500 hover:bg-emerald-600 font-black text-lg shadow-xl shadow-emerald-500/20" onClick={handleEndSession} disabled={finishing}>
                {finishing ? "Finalizing..." : "End Session & View Receipt →"}
             </Button>
          </div>
        </SheetContent>
      </Sheet>

      {showChat && booking && user && (
        <div style={{ position: "fixed", bottom: "20px", right: "20px", zIndex: 1000 }}>
          <ChatWindow
            chatId={`${booking.id}_${user.uid}`}
            currentUserId={user.uid}
            currentUserRole="driver"
            currentUserName={user.displayName || "Driver"}
            recipientName={booking.ownerBusinessName || "Station Owner"}
            stationName={booking.stationName || "Station"}
            onClose={() => setShowChat(false)}
          />
        </div>
      )}

      {/* GRACE FLOW — Section F: TopUpModal mount in JSX */}
      {user && bookingId && (
        <TopUpModal
          isOpen={graceFlowState === 'prompted' ||
                  graceFlowState === 'topping_up' ||
                  graceFlowState === 'topped_up'}
          graceFlowState={graceFlowState}
          displayCountdown={displayCountdown}
          walletBalance={walletBalance}
          currentCost={localCost}
          prePaidAmount={prePaidAmount}
          onTopUp={handleTopUp}
          onEndSession={() => setGraceFlowState('dismissed')}
          topUpError={topUpError}
          isProcessing={isTopUpProcessing}
        />
      )}
    </div>
  );
}

// ACCEPTANCE TESTS:
// Test 1 — Grace trigger:
// Set prePaidAmount = ₹25, let simulation run until currentCost = ₹6
// (remaining = ₹19, below ₹20 threshold)
// Expected: modal opens, countdown starts at 2:00, audit log receives
// 'payment_topup_prompt' event, hasTriggeredGrace.current === true

// Test 2 — Modal does not re-trigger:
// After Test 1 modal opens, close it by ending session, then start a new
// session in the same component mount — hasTriggeredGrace resets to false
// on mount, so a new session correctly can trigger grace again
// (confirm useRef initialises to false on every mount, not persisted)

// Test 3 — Successful top-up (₹100):
// walletBalance = ₹150, click ₹100 button
// Expected: button shows spinner, prePaidAmount updates to original + 100
// immediately (before Firestore responds), walletBalance shows ₹50,
// on Firestore success: success state shown for 2s, modal closes,
// session continues, countdown stopped

// Test 4 — Insufficient balance:
// walletBalance = ₹30
// Expected: ₹50 button disabled with "Insufficient balance" label,
// ₹100 and ₹200 buttons disabled, only ₹50 unaffordable message shown,
// no crash

// Test 5 — Firestore write failure:
// Mock updateDoc to throw, click ₹100
// Expected: optimistic update applied instantly, then rolled back on error,
// topUpError shows in modal, graceFlowState returns to 'prompted',
// countdown continues uninterrupted, audit log receives 'payment_topup_failed'

// Test 6 — Countdown expiry:
// Let countdown reach 0:00 without topping up
// Expected: graceFlowState becomes 'expired', 400ms later handleSessionEnd
// fires with reason 'PREPAID_LIMIT', session status written as 'completed'
// in Firestore, modal closes

// Test 7 — "End session now" button:
// Click "End session now" while countdown is at 1:23
// Expected: graceFlowState becomes 'dismissed', session ends in 400ms,
// countdown interval cleared (no interval leak), no duplicate session-end call

// Test 8 — Offline top-up attempt:
// Set navigator.onLine = false (DevTools → Network → Offline)
// Open grace modal, click ₹100
// Expected: error "Cannot top up while offline" shown in modal,
// prePaidAmountRef NOT permanently mutated (rollback worked),
// countdown continues
