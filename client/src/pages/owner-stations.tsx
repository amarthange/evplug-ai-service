import { useState, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";
import { db } from "@/lib/firebase";
import { doc, getDoc, updateDoc, setDoc, serverTimestamp, deleteField, addDoc, collection, query, where, getDocs, Timestamp, orderBy, limit } from "firebase/firestore";
import { subscribeToOwnerStations, type Station } from "@/lib/owner-service";
import { subscribeToOwnerChats } from "@/services/chatService";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import StationForm from "@/components/station-form";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { parseMaintenanceWindow, type StationWithWindows } from "@/lib/maintenance-scheduler";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip as RechartsTooltip, BarChart, Bar, CartesianGrid, Legend } from "recharts";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Plus, MapPin, Clock, Zap, Pencil, ZapOff, CheckCircle, Copy, Share2, CopyPlus, Calendar, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ConnectorHealthSection } from "@/components/owner/ConnectorHealthSection";
import MaintenanceScheduleDialog from "@/components/owner/MaintenanceScheduleDialog";
import MaintenanceWindowList from "@/components/owner/MaintenanceWindowList";

export default function OwnerStations() {
  const [, setLocation] = useLocation();
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [stations, setStations] = useState<Station[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingStation, setEditingStation] = useState<Station | null>(null);
  const [stationUnreads, setStationUnreads] = useState<Record<string, number>>({});
  
  const [shareModal, setShareModal] = useState<Station | null>(null);
  const [scheduleMenu, setScheduleMenu] = useState<string | null>(null);
  const [schedStart, setSchedStart] = useState("");
  const [schedEnd, setSchedEnd] = useState("");
  const [schedReason, setSchedReason] = useState("");
  const [noteState, setNoteState] = useState<Record<string, string>>({});
  const [selectedStationForMaintenance, setSelectedStationForMaintenance] = useState<Station | null>(null);
  const [isMaintenanceDialogOpen, setIsMaintenanceDialogOpen] = useState(false);


  // Fetch Bookings for Risk Calculation (last 30 days)
  const { data: allBookings = [] } = useQuery({
    queryKey: ['owner-bookings-risk', user?.uid],
    queryFn: async () => {
      if (!user) return [];
      const thirtyDaysAgo = Timestamp.fromDate(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
      const q = query(
        collection(db, "bookings"),
        where("ownerId", "==", user.uid),
        where("createdAt", ">=", thirtyDaysAgo)
      );
      const snap = await getDocs(q);
      return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    },
    enabled: !!user
  });

  // Fetch Reviews for Risk Calculation (last 30 days)
  const { data: allReviews = [] } = useQuery({
    queryKey: ['owner-reviews-risk', user?.uid],
    queryFn: async () => {
      if (!user) return [];
      const thirtyDaysAgo = Timestamp.fromDate(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
      const q = query(
        collection(db, "reviews"),
        where("createdAt", ">=", thirtyDaysAgo)
      );
      const snap = await getDocs(q);
      // Filter reviews that belong to owner's stations (client-side for simplicity if indexing is an issue)
      const stationIds = new Set(stations.map(s => s.id));
      return snap.docs
        .map(d => ({ id: d.id, ...d.data() } as any))
        .filter(r => stationIds.has(r.stationId));
    },
    enabled: !!user && stations.length > 0
  });

  // Helper: Detailed Risk Calculation
  const calculateDetailedRiskScore = (
    station: Station,
    bookings: any[],
    reviews: any[]
  ) => {
    const factors: {
      name: string,
      score: number,
      weight: number,
      status: "good" | "warning" | "critical",
      description: string
    }[] = [];
    
    const stationBookings = bookings.filter(b => b.stationId === station.id);
    const stationReviews = reviews.filter(r => r.stationId === station.id);

    // Factor 1 — Driver Complaints (last 30d)
    const lowRatings = stationReviews.filter(r => (r.rating || 0) <= 2).length;
    const ratingScore = Math.min(lowRatings * 20, 50);
    factors.push({
      name: "Driver Complaints",
      score: ratingScore,
      weight: 0.3,
      status: ratingScore > 30 ? "critical" : ratingScore > 10 ? "warning" : "good",
      description: lowRatings > 0 ? `${lowRatings} poor ratings in 30 days.` : "No recent negative feedback."
    });

    // Factor 2 — Cancellation Rate (last 30d)
    const cancelled = stationBookings.filter(b => b.status === "cancelled" && b.cancelledBy === "host").length;
    const cancelRate = stationBookings.length > 0 ? (cancelled / stationBookings.length) * 100 : 0;
    const cancelScore = Math.min(cancelRate * 2, 100);
    factors.push({
      name: "Cancellation Rate",
      score: cancelScore,
      weight: 0.25,
      status: cancelScore > 40 ? "critical" : cancelScore > 15 ? "warning" : "good",
      description: `Host-initiated: ${cancelled} (${cancelRate.toFixed(1)}%)`
    });

    // Factor 3 — Hardware Age
    const installedAt = station.createdAt ? new Date(station.createdAt) : new Date();
    const ageMonths = (Date.now() - installedAt.getTime()) / (30 * 86400000);
    const ageScore = Math.min(ageMonths * 2, 50);
    factors.push({
      name: "Hardware Age",
      score: ageScore,
      weight: 0.2,
      status: ageScore > 40 ? "critical" : ageScore > 25 ? "warning" : "good",
      description: `Station age: ${Math.floor(ageMonths)} months.`
    });

    // Factor 4 — Power Efficiency (Mocked or from Telemetry)
    const faultCount = (station as any).faultHistory?.length || 0;
    const efficiencyScore = Math.min(faultCount * 15, 100);
    factors.push({
      name: "System Stability",
      score: efficiencyScore,
      weight: 0.25,
      status: efficiencyScore > 60 ? "critical" : efficiencyScore > 20 ? "warning" : "good",
      description: `${faultCount} health alerts recorded recently.`
    });

    const totalScore = Math.min(Math.round(factors.reduce((acc, f) => acc + (f.score * f.weight), 0)), 100);
    
    let level: "Low" | "Moderate" | "High" | "Critical" = "Low";
    let levelColor = "text-emerald-500";
    if (totalScore > 75) { level = "Critical"; levelColor = "text-rose-500"; }
    else if (totalScore > 50) { level = "High"; levelColor = "text-orange-500"; }
    else if (totalScore > 25) { level = "Moderate"; levelColor = "text-amber-500"; }

    return { totalScore, level, levelColor, factors };
  };

  // Persistence: Save daily snapshot
  useEffect(() => {
    if (!user || !stations.length || !allBookings.length) return;
    
    const saveSnapshots = async () => {
      const today = new Date().toISOString().split('T')[0];
      
      for (const station of stations) {
        const { totalScore } = calculateDetailedRiskScore(station, allBookings, allReviews);
        const historyRef = doc(db, "stations", station.id, "riskHistory", today);
        
        // Only save if not already exists for today to avoid writes
        const snap = await getDoc(historyRef);
        if (!snap.exists()) {
          await updateDoc(doc(db, "stations", station.id), { maintenanceRiskScore: totalScore });
          await setDoc(historyRef, {
            date: today,
            score: totalScore,
            timestamp: serverTimestamp()
          });

          // HIGH RISK ALERT TRIGGER
          if (totalScore > 70) {
            const alertId = `RISK_${station.id}_${today}`;
            const alertRef = doc(db, "notifications", alertId);
            const alertSnap = await getDoc(alertRef);
            if (!alertSnap.exists()) {
              await setDoc(alertRef, {
                ownerId: user.uid,
                stationId: station.id,
                type: "HIGH_RISK_ALERT",
                title: "High Maintenance Risk Alert ⚠️",
                message: `Station ${station.name} has reached a critical risk score of ${totalScore}. Immediate inspection is recommended.`,
                read: false,
                createdAt: Date.now()
              });
            }
          }
        }
      }
    };

    saveSnapshots().catch(console.error);
  }, [stations.length, allBookings.length, allReviews.length]);

  // Helper to map Station to StationWithWindows
  const mapToStationWithWindows = (s: Station): StationWithWindows => ({
    stationId: s.id,
    stationName: s.name,
    currentStatus: s.status as any,
    totalConnectors: s.connectors?.length || 0,
    connectors: (s.connectors || []).map(c => ({ id: c.id, type: c.type, status: c.available ? 'active' : 'offline' })),
    maintenanceWindows: (s.maintenanceWindows || []).map(parseMaintenanceWindow)
  });

  useEffect(() => {
    if (authLoading) return;
    if (!user) { setLocation("/owner/login"); return; }
    let isMounted = true;
    const verify = async () => {
      const ownerDoc = await getDoc(doc(db, "owners", user.uid));
      if (!ownerDoc.exists()) { setLocation("/owner/login"); return; }
      subscribeToOwnerStations(user.uid, (list) => {
        if (isMounted) { setStations(list); setLoading(false); }
      });
    };
    verify().catch(console.error);
    return () => { isMounted = false; };
  }, [user, authLoading, setLocation]);

  // Subscribe to Chat Unreads per Station
  useEffect(() => {
    if (!user) return;
    const unsub = subscribeToOwnerChats(user.uid, (chats) => {
      const counts: Record<string, number> = {};
      chats.forEach(chat => {
        if (chat.ownerUnread > 0) {
          counts[chat.stationId] = (counts[chat.stationId] || 0) + chat.ownerUnread;
        }
      });
      setStationUnreads(counts);
    });
    return () => unsub();
  }, [user]);

  // Scheduled Maintenance Check Loop
  useEffect(() => {
    if (stations.length === 0) return;
    const checkScheduled = () => {
      stations.forEach(async station => {
        const sm = station.scheduledMaintenance;
        if (!sm) return;
        const now = new Date();
        const start = new Date(sm.startDate);
        const end = new Date(sm.endDate);
        
        if (now >= start && now <= end && station.status !== "maintenance") {
          await updateDoc(doc(db, "stations", station.id), {
            status: "maintenance",
            maintenanceReason: "scheduled"
          });
        }
        
        if (now > end && station.maintenanceReason === "scheduled") {
          await updateDoc(doc(db, "stations", station.id), {
            status: "active",
            scheduledMaintenance: deleteField(),
            maintenanceReason: deleteField()
          });
        }
      });
    };
    checkScheduled();
    const interval = setInterval(checkScheduled, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [stations]);

  const handleConnectorToggle = async (station: Station, index: number) => {
    const c = station.connectors[index];
    const isEnabling = c.enabled === false;
    if (!isEnabling) {
      if (!window.confirm(`Disable ${c.type} #${index + 1}?\nActive bookings will not be affected. New bookings will be blocked for this connector only.`)) return;
    }
    
    try {
      const snap = await getDoc(doc(db, "stations", station.id));
      if (!snap.exists()) return;
      const data = snap.data();
      const updated = (data.connectors as any[]).map((con, i) => {
        if (i === index) {
          if (isEnabling) {
            const { disabledAt, disabledReason, ...rest } = con;
            return { ...rest, enabled: true };
          }
          return { ...con, enabled: false, disabledAt: new Date().toISOString(), disabledReason: "manual_owner" };
        }
        return con;
      });
      await updateDoc(doc(db, "stations", station.id), { connectors: updated });
      toast({ title: isEnabling ? `${c.type} #${index + 1} Re-enabled ✅` : `${c.type} #${index + 1} disabled ✅` });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message });
    }
  };

  const handleSaveSchedule = async (stationId: string) => {
    if (!schedStart || !schedEnd || !schedReason) return toast({ variant: "destructive", title: "Error", description: "Please fill all fields" });
    const start = new Date(schedStart);
    const end = new Date(schedEnd);
    if (start <= new Date()) return toast({ variant: "destructive", title: "Error", description: "Start date must be in future" });
    if (end <= start) return toast({ variant: "destructive", title: "Error", description: "End must be after start" });
    try {
      if (!user) return;
      await updateDoc(doc(db, "stations", stationId), {
        scheduledMaintenance: {
          startDate: start.toISOString(),
          endDate: end.toISOString(),
          reason: schedReason,
          scheduledBy: user.uid,
          scheduledAt: new Date().toISOString()
        }
      });
      toast({ title: "Maintenance Scheduled ✅" });
      setScheduleMenu(null);
    } catch(e:any) { toast({ variant: "destructive", title: "Error", description: e.message }); }
  };

  const handleCancelSchedule = async (stationId: string) => {
    await updateDoc(doc(db, "stations", stationId), { scheduledMaintenance: deleteField() });
    toast({ title: "Schedule Cancelled" });
  };

  const handleDuplicate = async (stationId: string) => {
    if (!window.confirm("Duplicate Kondhwa EV Station?\n This will copy:\n ✅ Connector types and pricing\n ✅ Amenities and operating hours\n ✅ Business settings\n\n This will NOT copy:\n ❌ Location (you must set new address)\n ❌ Station images\n ❌ Station name")) return;
    try {
      const snap = await getDoc(doc(db, "stations", stationId));
      if (!snap.exists()) return;
      const data = snap.data();
      const newStation = {
        ownerId: user?.uid,
        name: data.name + " (Copy)",
        status: "pending",
        connectors: data.connectors || [],
        amenities: data.amenities || [],
        operatingHours: data.operatingHours || "08:00 - 20:00",
        peakPricing: data.peakPricing || null,
        location: { lat: 0, lon: 0 },
        images: [],
        createdAt: serverTimestamp(),
        duplicatedFrom: stationId
      };
      const newRef = await addDoc(collection(db, "stations"), newStation);
      
      toast({ 
        title: "Duplicate created! ✨", 
        description: "Update the location to go live.",
        className: "border-amber-500 bg-amber-500/10 text-amber-500" 
      });
      
      setEditingStation({ id: newRef.id, ...newStation } as any);
      setIsFormOpen(true);
    } catch(e:any) { toast({ variant: "destructive", title: "Error", description: e.message }); }
  };

  const handleSaveNote = async (stationId: string) => {
    const text = noteState[stationId] ?? "";
    await updateDoc(doc(db, "stations", stationId), {
      internalNotes: text,
      notesUpdatedAt: serverTimestamp()
    });
    toast({ title: "Notes saved ✅" });
  };

  const handleToggleMaintenance = async (station: Station) => {
    const nextStatus = station.status === "active" ? "maintenance" : "active";
    const confirmText = nextStatus === "maintenance" 
      ? `Take ${station.name} offline? Active bookings will not be affected, but new bookings will be blocked.`
      : `Bring ${station.name} back online? All connectors will be available for new bookings.`;
    
    if (nextStatus === "active" || window.confirm(confirmText)) {
      try {
        const updateData: any = { status: nextStatus, updatedAt: Date.now() };
        if (nextStatus === "maintenance") {
          updateData.maintenanceStartedAt = serverTimestamp();
          updateData.maintenanceReason = "manual_owner_action";
        } else {
          updateData.maintenanceStartedAt = null;
        }

        await updateDoc(doc(db, "stations", station.id), updateData);
        toast({ 
          title: nextStatus === "active" ? "Station is live again! 🟢" : "Station taken offline ✅",
          description: nextStatus === "active" ? `${station.name} is now accepting bookings.` : `${station.name} is now in maintenance mode.`
        });
      } catch (err: any) {
        toast({ variant: "destructive", title: "Update failed", description: err.message });
      }
    }
  };

  const statusColor: Record<string, string> = {
    active: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400 border-emerald-200",
    pending: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400 border-amber-200",
    maintenance: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400 border-red-200 animate-pulse",
  };

  if (loading) return <div className="flex items-center justify-center h-64 text-muted-foreground">Loading stations…</div>;

  return (
    <div className="space-y-6 skeleton-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-tight">My Stations</h1>
          <p className="text-muted-foreground text-sm mt-0.5 font-medium">{stations.length} station{stations.length !== 1 ? "s" : ""} registered in your portfolio</p>
        </div>
        <Button onClick={() => { setEditingStation(null); setIsFormOpen(true); }} className="gap-2 h-11 rounded-xl shadow-lg shadow-primary/20 font-black uppercase tracking-widest px-6">
          <Plus className="w-5 h-5" /> Add Station
        </Button>
      </div>

      {shareModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm shadow-2xl">
          <Card className="w-full max-w-sm glass-card border-white/10 shadow-2xl relative overflow-hidden animate-in zoom-in-95 duration-300">
            <Button variant="ghost" size="icon" className="absolute top-2 right-2 hover:bg-white/10 rounded-full h-8 w-8 text-muted-foreground z-10 hover:text-white" onClick={() => setShareModal(null)}>
              <X className="w-4 h-4" />
            </Button>
            <div className="p-6 space-y-6 text-center text-sm font-medium">
              <h2 className="font-black text-lg tracking-tight uppercase border-b border-white/10 pb-4 flex items-center justify-center gap-2">📤 Share Station</h2>
              
              <div className="bg-white/5 p-3 rounded-xl border border-white/10 text-left">
                <p className="text-[10px] uppercase font-black tracking-widest text-muted-foreground mb-1">Station Link:</p>
                <div className="flex gap-2">
                  <span className="font-mono text-xs opacity-70 truncate line-clamp-1 flex-1 self-center w-full block">
                    https://evcharging.app/station/{shareModal.id}
                  </span>
                  <Button size="sm" variant="secondary" className="h-7 text-[10px] font-black uppercase tracking-widest gap-1" onClick={() => {
                    navigator.clipboard.writeText(`https://evcharging.app/station/${shareModal.id}`);
                    toast({ title: "Link copied! 📋" });
                  }}><Copy className="w-3 h-3" /> Copy</Button>
                </div>
              </div>
              
              <div className="border border-white/10 rounded-xl p-4 bg-white/5 space-y-4 pt-6">
                <p className="text-[10px] uppercase font-black tracking-widest text-muted-foreground pb-2">QR Code</p>
                <div className="bg-white p-4 rounded-xl shadow-inner inline-block aspect-square w-48 mx-auto pointer-events-none">
                  <img src={`https://chart.googleapis.com/chart?chs=200x200&cht=qr&chl=${encodeURIComponent(`https://evcharging.app/station/${shareModal.id}`)}`} alt="QR Code" className="w-full h-full mix-blend-multiply" />
                </div>
                <div className="flex justify-center gap-2 mt-2">
                   <Button size="sm" variant="outline" className="h-7 px-3 text-[10px] font-black uppercase tracking-widest" onClick={() => {
                     const link = document.createElement("a");
                     link.href = `https://chart.googleapis.com/chart?chs=500x500&cht=qr&chl=${encodeURIComponent(`https://evcharging.app/station/${shareModal.id}`)}`;
                     link.download = `${shareModal.name}-qr.png`;
                     link.click();
                   }}>Download QR</Button>
                   <Button size="sm" className="h-7 px-3 text-[10px] font-black uppercase tracking-widest bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => {
                      const w = window.open("");
                      w?.document.write(`<html><body style="text-align:center;font-family:sans-serif;padding:50px;"><h1 style="font-size:32px;">${shareModal.name}</h1><p>Scan to Book Direct</p><img src="https://chart.googleapis.com/chart?chs=500x500&cht=qr&chl=${encodeURIComponent(`https://evcharging.app/station/${shareModal.id}`)}" style="width:500px;height:500px;"/><script>window.print();window.close();</script></body></html>`);
                   }}>Print QR</Button>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-2 mt-4">
                 <Button size="sm" variant="secondary" className="h-9 gap-2 text-[10px] font-black uppercase tracking-widest bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 border-none hover:-translate-y-0.5 transition-transform" onClick={() => {
                    window.open(`https://wa.me/?text=${encodeURIComponent("Book EV charging at " + shareModal.name + ": https://evcharging.app/station/" + shareModal.id)}`);
                 }}>📱 WhatsApp</Button>
                 <Button size="sm" variant="secondary" className="h-9 gap-2 text-[10px] font-black uppercase tracking-widest hover:bg-white/10 hover:-translate-y-0.5 transition-transform border-none" onClick={() => {
                    window.open(`mailto:?subject=Charge at ${shareModal.name}&body=${encodeURIComponent("Book EV charging at " + shareModal.name + ": https://evcharging.app/station/" + shareModal.id)}`);
                 }}>📧 Email</Button>
              </div>
              
              <p className="text-[10px] opacity-50 italic font-black uppercase tracking-widest">"Print and display at your charging spot"</p>
            </div>
          </Card>
        </div>
      )}

      {isFormOpen && (
        <Card className={cn("p-8 mb-8 glass-card border shadow-2xl animate-in zoom-in-95 duration-300 relative", editingStation?.duplicatedFrom ? "border-amber-500/50" : "border-none")}>
          {editingStation?.duplicatedFrom && (
             <div className="absolute top-6 right-8">
                <Badge variant="outline" className="border-amber-500 bg-amber-500/10 text-amber-500 font-black uppercase tracking-widest text-[9px] animate-pulse">
                   ⚠️ Set location before going live
                </Badge>
             </div>
          )}
          <StationForm initialData={editingStation || undefined} onClose={() => { setIsFormOpen(false); setEditingStation(null); }} />
        </Card>
      )}

      {stations.length === 0 ? (
        <Card className="p-24 text-center border-4 border-dashed border-muted bg-transparent rounded-[3rem] opacity-60">
          <Zap className="w-16 h-16 mx-auto mb-6 text-muted-foreground opacity-20" />
          <p className="text-xl font-black text-muted-foreground mb-4">No stations registered yet</p>
          <Button onClick={() => setIsFormOpen(true)} className="gap-2 h-12 rounded-2xl px-8 font-black uppercase tracking-widest"><Plus className="w-5 h-5" /> Provision First Asset</Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          {stations.map((station) => (
            <Card key={station.id} className="glass-card interactive-card group overflow-hidden border-none relative">
              {station.images?.[0] && (
                <div className="aspect-[16/9] overflow-hidden relative">
                   <img src={station.images[0]} alt={station.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
                   <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              )}
              <div className="p-6 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-black text-xl tracking-tight line-clamp-1">{station.name}</h3>
                  <Badge 
                    variant="outline" 
                    className={cn(
                      "text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-lg border-2", 
                      statusColor[station.status] || "",
                      station.status === 'active' && "badge-active"
                    )}
                  >
                    {station.status}
                  </Badge>
                  {stationUnreads[station.id] > 0 && (
                    <Badge className="bg-rose-500 text-white border-none animate-pulse text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-lg shadow-lg shadow-rose-500/20">
                      {stationUnreads[station.id]} Messages
                    </Badge>
                  )}
                </div>
                <div className="space-y-2 text-xs text-muted-foreground font-black uppercase tracking-tighter">
                  <div className="flex items-center gap-2"><MapPin className="w-4 h-4 shrink-0 text-primary" /><span className="truncate">{station.address}</span></div>
                  <div className="flex items-center gap-2"><Clock className="w-4 h-4 shrink-0 text-primary" /><span>{typeof station.operatingHours === 'string' ? station.operatingHours : (station.operatingHours ? `${station.operatingHours.open} - ${station.operatingHours.close}` : "08:00 - 20:00")}</span></div>
                  <div className="flex items-center gap-2 text-foreground pt-1">
                     <Zap className="w-4 h-4 text-emerald-500" />
                     {station.connectors?.length || 0} Connectors Registered
                  </div>
                </div>
                
              </div>

              {/* Connectors Individual Toggle Section */}
              <div className="space-y-2 pt-4 border-t border-white/10">
                 <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Connector Control Panel</p>
                 <div className="space-y-2">
                    {station.connectors?.map((con: any, index: number) => {
                       const isActive = con.enabled !== false;
                       return (
                         <div key={index} className={cn("flex items-center justify-between p-2 rounded-lg border", isActive ? "border-transparent bg-white/5" : "border-destructive/30 bg-destructive/10 grayscale opacity-80 mix-blend-luminosity")}>
                            <div>
                               <p className="text-xs font-black truncate">{con.type} <span className="opacity-50">#{index + 1}</span></p>
                               <span className="text-[10px] font-black opacity-60 uppercase tracking-tighter">{con.powerKw}kW</span>
                            </div>
                            <Button size="sm" variant="outline" className={cn("h-7 px-2 text-[9px] font-black uppercase tracking-widest rounded transition-all", isActive ? "border-destructive text-destructive hover:bg-destructive hover:text-white" : "border-emerald-500 text-emerald-500 hover:bg-emerald-500 hover:text-white")} onClick={() => handleConnectorToggle(station, index)}>
                               {isActive ? "🟢 Active → Disable" : "🔴 Disabled → Enable"}
                            </Button>
                         </div>
                       );
                    })}
                 </div>
              </div>

              {/* Duplicate & Share & Edit Header Buttons */}
              <div className="flex items-center gap-2 pt-4 border-t border-white/10">
                 <Button size="sm" variant="ghost" className="flex-1 h-9 rounded-lg gap-2 font-black uppercase tracking-widest text-[9px] bg-white/5 hover:bg-white/10" onClick={() => { setEditingStation(station); setIsFormOpen(true); }}>
                    <Pencil className="w-3 h-3" /> Edit Profile
                 </Button>
                 <Button size="sm" variant="ghost" className="h-9 px-3 rounded-lg font-black uppercase tracking-widest text-[9px] border hover:bg-white/10 border-white/10" title="Duplicate Station" onClick={() => handleDuplicate(station.id)}>
                    <CopyPlus className="w-3 h-3" /> Duplicate
                 </Button>
                 <Button size="sm" variant="ghost" className="h-9 px-3 rounded-lg font-black uppercase tracking-widest text-[9px] border hover:bg-sky-500/20 hover:text-sky-400 border-sky-500/20 text-sky-500/80" title="Share Station" onClick={() => setShareModal(station)}>
                    <Share2 className="w-3 h-3" />
                 </Button>
              </div>

              {/* Scheduled Maintenance Logic */}
              <div className="pt-2">
                 {station.scheduledMaintenance ? (
                    <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 flex flex-col gap-2">
                       <p className="text-[10px] font-black text-amber-500/90 uppercase tracking-widest">🔧 Maintenance Scheduled</p>
                       <p className="text-xs font-medium text-amber-100">{new Date(station.scheduledMaintenance.startDate).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })} — <br/>
                       {new Date(station.scheduledMaintenance.endDate).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</p>
                       <p className="text-[10px] text-amber-500/70 italic opacity-80">"{station.scheduledMaintenance.reason}"</p>
                       <Button size="sm" variant="ghost" className="w-full mt-1 h-7 text-[9px] font-black uppercase tracking-widest hover:bg-destructive/20 text-destructive/80 shrink-0" onClick={() => handleCancelSchedule(station.id)}>
                         Cancel Schedule
                       </Button>
                    </div>
                 ) : scheduleMenu === station.id ? (
                    <div className="bg-white/5 border border-white/10 rounded-xl p-3 space-y-3 animate-in slide-in-from-top-2">
                       <p className="text-[10px] font-black uppercase tracking-widest border-b border-white/10 pb-2">📅 Schedule Window</p>
                       <div className="space-y-1">
                          <label className="text-[9px] text-muted-foreground uppercase font-black tracking-widest pl-1">Start Date/Time</label>
                          <input type="datetime-local" className="w-full h-8 bg-black/40 border border-white/10 rounded px-2 text-[11px] font-mono outline-none focus:border-amber-500 transition-colors" value={schedStart} onChange={(e) => setSchedStart(e.target.value)} />
                       </div>
                       <div className="space-y-1">
                          <label className="text-[9px] text-muted-foreground uppercase font-black tracking-widest pl-1">End Date/Time</label>
                          <input type="datetime-local" className="w-full h-8 bg-black/40 border border-white/10 rounded px-2 text-[11px] font-mono outline-none focus:border-amber-500 transition-colors" value={schedEnd} onChange={(e) => setSchedEnd(e.target.value)} />
                       </div>
                       <div className="space-y-1">
                          <label className="text-[9px] text-muted-foreground uppercase font-black tracking-widest pl-1">Reason</label>
                          <input type="text" placeholder="e.g. Electrical inspection" className="w-full h-8 bg-black/40 border border-white/10 rounded px-2 text-[11px] outline-none focus:border-amber-500 transition-colors" value={schedReason} onChange={(e) => setSchedReason(e.target.value)} />
                       </div>
                       <div className="flex gap-2 pt-2">
                          <Button size="sm" variant="ghost" className="h-7 flex-1 text-[9px] font-black uppercase tracking-widest" onClick={() => setScheduleMenu(null)}>Cancel</Button>
                          <Button size="sm" className="h-7 flex-1 text-[9px] font-black uppercase tracking-widest bg-amber-600 hover:bg-amber-700 text-white" onClick={() => handleSaveSchedule(station.id)}>Schedule</Button>
                       </div>
                    </div>
                 ) : (
                    <div className="flex gap-2">
                      <Sheet>
                        <SheetTrigger asChild>
                          <Button size="sm" variant="outline" className="flex-1 h-10 rounded-xl border-2 border-amber-500/20 text-amber-500 font-black uppercase tracking-widest text-[9px] hover:bg-amber-500/20 gap-2 transition-all">
                             <Calendar className="w-4 h-4" /> Maintenance
                          </Button>
                        </SheetTrigger>
                        <SheetContent className="sm:max-w-[500px] overflow-y-auto bg-slate-950 border-white/10 p-0">
                          <div className="p-6 pb-4 border-b border-white/5 bg-white/5 backdrop-blur-xl sticky top-0 z-10">
                            <SheetHeader>
                              <SheetTitle className="text-2xl font-black uppercase tracking-tight flex items-center gap-3 text-white">
                                <div className="p-2 rounded-xl bg-amber-500/20">
                                  <Zap className="w-5 h-5 text-amber-500" />
                                </div>
                                {station.name}
                              </SheetTitle>
                              <SheetDescription className="text-white/60 font-medium pl-12">
                                Real-time intelligence & maintenance portal
                              </SheetDescription>
                            </SheetHeader>
                          </div>

                          <div className="p-6">
                            <Tabs defaultValue="overview" className="w-full">
                              <TabsList className="grid grid-cols-4 bg-white/5 border border-white/10 rounded-xl p-1 mb-8 h-12">
                                <TabsTrigger value="overview" className="data-[state=active]:bg-white/10 data-[state=active]:text-white rounded-lg transition-all font-bold text-xs">Overview</TabsTrigger>
                                <TabsTrigger value="connectors" className="data-[state=active]:bg-white/10 data-[state=active]:text-white rounded-lg transition-all font-bold text-xs">Health</TabsTrigger>
                                <TabsTrigger value="telemetry" className="data-[state=active]:bg-white/10 data-[state=active]:text-white rounded-lg transition-all font-bold text-xs">Telemetry</TabsTrigger>
                                <TabsTrigger value="history" className="data-[state=active]:bg-white/10 data-[state=active]:text-white rounded-lg transition-all font-bold text-xs">Windows</TabsTrigger>
                              </TabsList>

                              <TabsContent value="overview" className="space-y-6 focus-visible:outline-none">
                                <RiskScoreCard
                                  station={station}
                                  bookings={allBookings}
                                  reviews={allReviews}
                                  onSchedule={() => {
                                    setSelectedStationForMaintenance(station);
                                    setIsMaintenanceDialogOpen(true);
                                  }}
                                />
                                <div className="grid grid-cols-2 gap-4">
                                  <div className="bg-white/5 border border-white/10 p-4 rounded-2xl">
                                    <div className="text-[10px] font-black text-white/40 uppercase mb-1">Status</div>
                                    <Badge className={cn(
                                      "font-black tracking-wider text-[10px] rounded-md",
                                      station.status === 'active' ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" : "bg-red-500/20 text-red-400 border-red-500/30"
                                    )}>
                                      {station.status.toUpperCase()}
                                    </Badge>
                                  </div>
                                  <div className="bg-white/5 border border-white/10 p-4 rounded-2xl">
                                    <div className="text-[10px] font-black text-white/40 uppercase mb-1">Total Revenue</div>
                                    <div className="text-lg font-black text-white">
                                      ₹{(station as any).totalRevenue?.toLocaleString() || 0}
                                    </div>
                                  </div>
                                </div>
                              </TabsContent>

                              <TabsContent value="connectors" className="focus-visible:outline-none">
                                <div className="space-y-6">
                                  <div className="bg-indigo-500/10 border border-indigo-500/20 p-4 rounded-2xl flex items-center gap-3">
                                    <Info className="w-5 h-5 text-indigo-400" />
                                    <p className="text-xs font-medium text-indigo-100/80 leading-relaxed">
                                      Individual connector performance metrics and availability status.
                                    </p>
                                  </div>
                                  <ConnectorHealthSection station={station} />
                                </div>
                              </TabsContent>

                              <TabsContent value="telemetry" className="focus-visible:outline-none">
                                <StationTelemetryDashboard station={station} allBookings={allBookings} />
                              </TabsContent>

                              <TabsContent value="history" className="focus-visible:outline-none">
                                <div className="space-y-6">
                                  <div className="flex items-center justify-between">
                                     <h3 className="text-sm font-black uppercase tracking-widest text-white/40">Maintenance Logs</h3>
                                     <Button size="sm" className="h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white border border-white/10 font-black uppercase tracking-widest text-[10px] gap-1.5" onClick={() => {
                                       setSelectedStationForMaintenance(station);
                                       setIsMaintenanceDialogOpen(true);
                                     }}>
                                       <Plus className="w-3.5 h-3.5" /> Schedule
                                     </Button>
                                  </div>
                                  <MaintenanceWindowList station={mapToStationWithWindows(station)} />
                                </div>
                              </TabsContent>
                            </Tabs>
                          </div>
                        </SheetContent>
                      </Sheet>
                      
                      {station.status === "active" ? (
                        <Button 
                          size="sm" 
                          variant="ghost" 
                          className="flex-1 h-10 rounded-xl border-2 border-destructive/20 text-destructive font-black uppercase tracking-widest text-[9px] hover:bg-destructive hover:text-white transition-all gap-2"
                          onClick={() => handleToggleMaintenance(station)}
                          title="Take offline immediately"
                        >
                           <ZapOff className="w-4 h-4" /> Take Offline
                        </Button>
                      ) : (
                        <Button 
                          size="sm" 
                          className="flex-1 h-10 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black uppercase tracking-widest text-[9px] shadow-lg shadow-emerald-500/20 gap-2"
                          onClick={() => handleToggleMaintenance(station)}
                        >
                           <CheckCircle className="w-4 h-4" /> Bring Online
                        </Button>
                      )}
                    </div>
                 )}
              </div>

              {/* Connector Health & Wear Telemetry */}
              <div className="pt-6 mt-6 border-t border-white/10">
                 <ConnectorHealthSection station={station} />
              </div>

              {/* Maintenance Risk Intelligence */}
              <div className="pt-6 mt-6 border-t border-white/10">
                 <RiskScoreCard 
                   station={station} 
                   bookings={allBookings} 
                   reviews={allReviews}
                   onSchedule={() => {
                     setSelectedStationForMaintenance(station);
                     setIsMaintenanceDialogOpen(true);
                   }}
                 />
              </div>

              {/* Internal Notes Editor */}
              <div className="pt-4 mt-2 border-t border-dashed border-white/10">
                 <div className="bg-slate-900/40 rounded-xl p-3 border border-slate-800/60 relative overflow-hidden group/notes">
                    <div className="absolute top-0 right-0 p-3 opacity-[0.03] group-hover/notes:opacity-10 transition-opacity"><Info className="w-16 h-16" /></div>
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2 flex items-center gap-1.5"><Pencil className="w-3 h-3" /> Internal Notes <span className="opacity-50">(Private)</span></p>
                    <textarea 
                      className="w-full bg-black/60 border border-white/5 rounded-lg p-2 text-xs text-foreground/80 font-mono resize-none h-20 focus:border-slate-500/50 outline-none transition-colors relative z-10 custom-scrollbar" 
                      placeholder="Electrician contact, hardware quirks, location notes..."
                      value={noteState[station.id] ?? station.internalNotes ?? ""}
                      onChange={(e) => {
                         if (e.target.value.length <= 500) {
                            setNoteState(prev => ({...prev, [station.id]: e.target.value}));
                         }
                      }}
                    />
                    <div className="flex items-center justify-between mt-2 z-10 relative">
                       <div className="space-y-0.5 max-w-[60%]">
                          <p className="text-[8px] text-muted-foreground uppercase font-black opacity-60">
                             {(noteState[station.id] ?? station.internalNotes ?? "").length}/500 chars
                          </p>
                          {station.notesUpdatedAt && (
                             <p className="text-[8px] text-muted-foreground italic font-medium opacity-60 break-words line-clamp-1">
                                Last updated: {new Date(station.notesUpdatedAt.toDate ? station.notesUpdatedAt.toDate() : station.notesUpdatedAt).toLocaleDateString()}
                             </p>
                          )}
                       </div>
                       <Button size="sm" variant="secondary" className="h-6 px-3 text-[9px] font-black uppercase tracking-widest bg-white/10 hover:bg-white/20" onClick={() => handleSaveNote(station.id)}>
                         Save Note
                       </Button>
                    </div>
                 </div>
              </div>
            </Card>
          ))}
        </div>
      )}
      {selectedStationForMaintenance && (
        <MaintenanceScheduleDialog 
          station={mapToStationWithWindows(selectedStationForMaintenance)}
          isOpen={isMaintenanceDialogOpen}
          onOpenChange={setIsMaintenanceDialogOpen}
        />
      )}
    </div>
  );
}

// --- RISK SCORE COMPONENTS ---

function RiskScoreCard({ station, bookings, reviews, onSchedule }: { 
  station: Station, 
  bookings: any[], 
  reviews: any[],
  onSchedule: () => void 
}) {
  const { totalScore, level, levelColor, factors } = useMemo(() => {
    // We pass data directly since calculation is light
    const stationBookings = bookings.filter(b => b.stationId === station.id);
    const stationReviews = reviews.filter(r => r.stationId === station.id);
    
    const factors: any[] = [];
    
    // Logic replicated here for component isolation or use a shared helper
    const lowRatings = stationReviews.filter(r => (r.rating || 0) <= 2).length;
    const ratingScore = Math.min(lowRatings * 20, 50);
    factors.push({ name: "Driver Complaints", score: ratingScore, weight: 0.3, status: ratingScore > 30 ? "critical" : ratingScore > 10 ? "warning" : "good", description: lowRatings > 0 ? `${lowRatings} poor ratings.` : "No negative feedback." });

    const cancelled = stationBookings.filter(b => b.status === "cancelled" && b.cancelledBy === "host").length;
    const cancelRate = stationBookings.length > 0 ? (cancelled / stationBookings.length) * 100 : 0;
    const cancelScore = Math.min(cancelRate * 2, 100);
    factors.push({ name: "Cancellation Rate", score: cancelScore, weight: 0.25, status: cancelScore > 40 ? "critical" : cancelScore > 15 ? "warning" : "good", description: `${cancelRate.toFixed(1)}% host cancelled.` });

    const installedAt = station.createdAt ? new Date(station.createdAt) : new Date();
    const ageMonths = (Date.now() - installedAt.getTime()) / (30 * 86400000);
    const ageScore = Math.min(ageMonths * 2, 50);
    factors.push({ name: "Hardware Age", score: ageScore, weight: 0.2, status: ageScore > 40 ? "critical" : ageScore > 25 ? "warning" : "good", description: `${Math.floor(ageMonths)}m installed.` });

    const faultCount = (station as any).faultHistory?.length || 0;
    const efficiencyScore = Math.min(faultCount * 15, 100);
    factors.push({ name: "System Stability", score: efficiencyScore, weight: 0.25, status: efficiencyScore > 60 ? "critical" : efficiencyScore > 20 ? "warning" : "good", description: `${faultCount} health alerts.` });

    const totalScore = Math.min(Math.round(factors.reduce((acc, f) => acc + (f.score * f.weight), 0)), 100);
    
    let level: "Low" | "Moderate" | "High" | "Critical" = "Low";
    let levelColor = "text-emerald-500";
    let bgColor = "bg-emerald-500/10";
    if (totalScore > 75) { level = "Critical"; levelColor = "text-rose-500"; bgColor="bg-rose-500/10"; }
    else if (totalScore > 50) { level = "High"; levelColor = "text-orange-500"; bgColor="bg-orange-500/10"; }
    else if (totalScore > 25) { level = "Moderate"; levelColor = "text-amber-500"; bgColor="bg-amber-500/10"; }

    return { totalScore, level, levelColor, bgColor, factors };
  }, [station, bookings, reviews]);

  // Fetch Trend History
  const { data: trendData = [] } = useQuery({
    queryKey: ['station-risk-trend', station.id],
    queryFn: async () => {
      const q = query(
        collection(db, "stations", station.id, "riskHistory"),
        orderBy("timestamp", "desc"),
        limit(14)
      );
      const snap = await getDocs(q);
      return snap.docs.map(d => ({ date: d.data().date, score: d.data().score })).reverse();
    },
    enabled: !!station.id
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Maintenance Risk Intelligence</h3>
        <Badge className={cn("text-[9px] font-black uppercase tracking-widest", levelColor, (level === "High" || level === "Critical") && "animate-pulse")}>
          {level} Risk
        </Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Left: Gauge & Trend */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-col items-center justify-center relative overflow-hidden">
          <div className="absolute top-2 left-3 text-[8px] font-black uppercase tracking-widest opacity-40">14-Day Risk Trend</div>
          
          <div className="w-full h-24 mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData.length > 0 ? trendData : [{score: 0}, {score: totalScore}]}>
                <defs>
                  <linearGradient id="colorScore" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="currentColor" stopOpacity={0.3} className={levelColor} />
                    <stop offset="95%" stopColor="currentColor" stopOpacity={0} className={levelColor} />
                  </linearGradient>
                </defs>
                <Area type="monotone" dataKey="score" stroke="currentColor" fillOpacity={1} fill="url(#colorScore)" className={levelColor} strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-2 text-center">
            <div className={cn("text-3xl font-black tracking-tighter", levelColor)}>
              {totalScore}<span className="text-xs opacity-50 ml-0.5">%</span>
            </div>
            <p className="text-[9px] font-black uppercase tracking-widest opacity-60">System Health Score</p>
          </div>
        </div>

        {/* Right: Factors */}
        <div className="space-y-2">
          {factors.map(f => (
            <div key={f.name} className="bg-black/40 border border-white/5 rounded-xl p-2.5 flex items-center justify-between group hover:border-white/10 transition-colors">
              <div className="space-y-0.5">
                <p className="text-[10px] font-black uppercase tracking-tight flex items-center gap-1.5">
                  <span className={cn("w-1.5 h-1.5 rounded-full", 
                    f.status === "good" ? "bg-emerald-500" : 
                    f.status === "warning" ? "bg-amber-500" : "bg-rose-500"
                  )} />
                  {f.name}
                </p>
                <p className="text-[9px] text-muted-foreground font-medium">{f.description}</p>
              </div>
              <div className={cn("text-[10px] font-mono font-bold", 
                f.status === "good" ? "text-emerald-500/60" : 
                f.status === "warning" ? "text-amber-500/80" : "text-rose-500"
              )}>
                {f.score}
              </div>
            </div>
          ))}
          
          {(level === "High" || level === "Critical") && (
            <Button 
              onClick={onSchedule}
              className="w-full mt-2 h-9 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-black uppercase tracking-widest shadow-lg shadow-rose-900/20 gap-2"
            >
              <Calendar className="w-3.5 h-3.5" /> Schedule Maintenance Now
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function StationTelemetryDashboard({ station, allBookings }: { station: any; allBookings: any[] }) {
  const { data: telemetryData = [], isLoading } = useQuery({
    queryKey: ['station-telemetry', station.id],
    queryFn: async () => {
      const q = query(
        collection(db, "telemetry"),
        where("stationId", "==", station.id),
        orderBy("timestamp", "desc"),
        limit(100)
      );
      const snap = await getDocs(q);
      return snap.docs.map(d => ({ id: d.id, ...d.data() }) as any);
    },
    refetchInterval: 30000 // Refresh every 30s
  });

  const latestReading = telemetryData[0];
  const activeBookings = allBookings.filter(b => b.stationId === station.id && b.status === 'ACTIVE');

  const chartData = useMemo(() => {
    return telemetryData.map(t => ({
      time: t.timestamp?.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      kw: t.currentPowerKw || 0
    })).reverse();
  }, [telemetryData]);

  const connectorUtilization = useMemo(() => {
    return station.connectors?.map((c: any) => ({
      name: c.type,
      utilization: c.totalSessions > 0 ? (c.activeMinutes / (30 * 24 * 60)) * 100 : 0
    })) || [];
  }, [station]);

  const anomalies = useMemo(() => {
    const alerts: any[] = [];
    if (telemetryData.length > 0) {
      const avgPower = telemetryData.slice(0, 5).reduce((s: number, t: any) => s + (t.currentPowerKw || 0), 0) / 5;
      if (avgPower < 1 && activeBookings.length > 0) {
        alerts.push({
          type: "LOW_POWER_DURING_SESSION",
          severity: "critical",
          desc: "Low power draw detected during active session."
        });
      }
      const lastSeen = latestReading?.timestamp?.toDate().getTime() || 0;
      if (Date.now() - lastSeen > 600000) {
        alerts.push({
          type: "STALE_TELEMETRY",
          severity: "warning",
          desc: "No telemetry heartbeat for over 10 minutes."
        });
      }
    }
    return alerts;
  }, [telemetryData, activeBookings, latestReading]);

  if (isLoading) return <div className="p-8 text-center animate-pulse text-white/40 font-black uppercase tracking-widest text-xs">Initializing Telemetry Streams...</div>;

  return (
    <div className="space-y-6">
      {/* Live Stats */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white/5 border border-white/10 p-4 rounded-2xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-16 h-16 bg-emerald-500/10 blur-2xl rounded-full -mr-8 -mt-8 group-hover:bg-emerald-500/20 transition-all" />
          <div className="text-[10px] font-black text-white/40 uppercase mb-1 tracking-widest">Current Draw</div>
          <div className="text-2xl font-black text-white flex items-baseline gap-1">
            {latestReading?.currentPowerKw || 0} <span className="text-xs font-medium opacity-40 uppercase">kW</span>
          </div>
          <div className={cn(
            "text-[9px] font-black mt-2 flex items-center gap-1.5",
            latestReading ? "text-emerald-400" : "text-amber-400"
          )}>
            <div className={cn("w-1.5 h-1.5 rounded-full", latestReading ? "bg-emerald-400 animate-pulse" : "bg-amber-400")} />
            {latestReading ? "LIVE TELEMETRY" : "LAST KNOWN STATE"}
          </div>
        </div>
        <div className="bg-white/5 border border-white/10 p-4 rounded-2xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-16 h-16 bg-blue-500/10 blur-2xl rounded-full -mr-8 -mt-8 group-hover:bg-blue-500/20 transition-all" />
          <div className="text-[10px] font-black text-white/40 uppercase mb-1 tracking-widest">CO2 Saved</div>
          <div className="text-2xl font-black text-white flex items-baseline gap-1">
            {latestReading?.co2SavedKg || 0} <span className="text-xs font-medium opacity-40 uppercase">kg</span>
          </div>
          <div className="text-[9px] font-black text-emerald-400/80 mt-2 flex items-center gap-1.5">
            <CheckCircle className="w-3 h-3" /> ECO-IMPACT
          </div>
        </div>
      </div>

      {/* Anomalies */}
      {anomalies.length > 0 && (
        <div className="space-y-2">
          {anomalies.map((a, i) => (
            <div key={i} className={cn(
              "p-3 rounded-xl border flex items-start gap-3 backdrop-blur-sm",
              a.severity === 'critical' ? "bg-red-500/10 border-red-500/20 text-red-200" : "bg-amber-500/10 border-amber-500/20 text-amber-200"
            )}>
              <div className={cn(
                "p-1.5 rounded-lg",
                a.severity === 'critical' ? "bg-red-500/20" : "bg-amber-500/20"
              )}>
                <AlertTriangle className="w-3.5 h-3.5" />
              </div>
              <div>
                <div className="text-[10px] font-black uppercase tracking-tight">{a.type.replace(/_/g, ' ')}</div>
                <div className="text-[10px] opacity-70 font-medium">{a.desc}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Power Chart */}
      <div className="bg-white/5 border border-white/10 p-5 rounded-3xl h-[220px] relative">
        <div className="flex items-center justify-between mb-4">
          <div className="text-[10px] font-black text-white/40 uppercase tracking-widest">Power Trend (24h)</div>
          <div className="text-[9px] font-black text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded-full uppercase tracking-tighter">Real-time</div>
        </div>
        <ResponsiveContainer width="100%" height="80%">
          <AreaChart data={chartData.length > 0 ? chartData : [{time: 'N/A', kw: 0}]}>
            <defs>
              <linearGradient id="telemetryPower" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" vertical={false} />
            <XAxis dataKey="time" hide />
            <YAxis hide />
            <RechartsTooltip 
              contentStyle={{ background: 'rgba(15, 23, 42, 0.9)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px', backdropFilter: 'blur(10px)', padding: '12px' }}
              itemStyle={{ color: '#10b981', fontWeight: 'bold' }}
              labelStyle={{ color: 'rgba(255,255,255,0.5)', marginBottom: '4px', fontSize: '10px' }}
            />
            <Area type="monotone" dataKey="kw" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#telemetryPower)" animationDuration={1500} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Utilization Chart */}
      <div className="bg-white/5 border border-white/10 p-5 rounded-3xl h-[220px]">
        <div className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-6">Connector Utilization (%)</div>
        <ResponsiveContainer width="100%" height="80%">
          <BarChart data={connectorUtilization}>
            <XAxis dataKey="name" fontSize={9} axisLine={false} tickLine={false} tick={{fill: 'rgba(255,255,255,0.4)', fontWeight: 'bold'}} />
            <YAxis hide />
            <RechartsTooltip 
              cursor={{ fill: 'rgba(255,255,255,0.03)' }}
              contentStyle={{ background: 'rgba(15, 23, 42, 0.9)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px', backdropFilter: 'blur(10px)' }}
            />
            <Bar dataKey="utilization" fill="#6366f1" radius={[6, 6, 0, 0]} barSize={32} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
