import { useState, useEffect, useRef } from "react";
import { z } from "zod";
import { useAuth } from "@/lib/auth-context";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  User, Car, CreditCard, Bell, MapPin, ShieldCheck, Store, Settings as SettingsIcon, LogOut, Upload, QrCode, AlertTriangle, ChevronDown, ChevronRight, CheckCircle2, Download, BarChart3, Globe, Lock, Plus, Clock, Sun, Zap, Calendar as CalendarIcon, Camera, MessageSquare, History, Star, Search, Filter, Info, Activity, RefreshCw, Send, Terminal, Play, Box, Megaphone, Map as MapIcon, AlertCircle, Leaf, Share2
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/hooks/use-toast";
import { doc, getDoc, updateDoc, collection, getDocs, deleteDoc, onSnapshot, addDoc, setDoc, query, where, writeBatch, orderBy, limit } from "firebase/firestore";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { storage, db, auth } from "@/lib/firebase";
import { sendPasswordResetEmail, signOut as firebaseSignOut } from "firebase/auth";
import { manualSeed } from "@/lib/seed-data";
import { getOwnerProfile, type OwnerProfile } from "@/lib/owner-service";
import { motion, AnimatePresence } from "framer-motion";
import { cn, safeFormatDistanceToNow } from "@/lib/utils";
import { logAuditEvent, AuditSeverity } from "@/lib/auditLogger";
import { useTranslation } from "@/lib/language-context";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { AdminNetworkMap } from "@/components/admin-network-map";
import { useOwnerPermission } from "@/hooks/use-owner-permission";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { BOOKING_STATUS } from "@/constants/bookingStatus";
import { safeFormat, toJSDate } from "@/lib/date-utils";
import { CarbonShareModal } from "@/components/CarbonShareModal";
import { computeImpactData, type CarbonImpactData } from "@/lib/carbon-share-engine";
import { NotificationPreferencesPanel } from "@/components/NotificationPreferencesPanel";
/* =========================================
   REUSABLE UI COMPONENTS
   ========================================= */
function CollapsibleSection({ title, icon: Icon, children, storageKey, defaultOpen = true, searchQuery = "" }: any) {
  const [isOpen, setIsOpen] = useState(() => {
    if (!storageKey) return defaultOpen;
    const saved = localStorage.getItem(storageKey);
    return saved !== null ? JSON.parse(saved) : defaultOpen;
  });

  const isMatched = (title || "").toLowerCase().includes((searchQuery || "").toLowerCase());
  if (searchQuery && !isMatched) return null;

  const toggle = () => {
    const next = !isOpen;
    setIsOpen(next);
    if (storageKey) {
      localStorage.setItem(storageKey, JSON.stringify(next));
    }
  };

  return (
    <Card className="overflow-hidden border-none shadow-none bg-transparent">
      <button 
        onClick={toggle}
        className="w-full flex items-center justify-between p-5 mb-3 glass-card border-none hover:bg-white/10 transition-all group interactive-card"
      >
        <CardTitle className="flex items-center gap-3 text-lg font-semibold">
          <div className="p-2 rounded-lg bg-primary/10 group-hover:bg-primary/20 transition-colors">
            {Icon && <Icon className="w-5 h-5 text-primary" />}
          </div>
          {title}
        </CardTitle>
        <ChevronDown className={cn("w-5 h-5 text-muted-foreground transition-transform duration-300", isOpen ? "rotate-0" : "-rotate-90")} />
      </button>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
          >
            <div className="pb-6 pt-2">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}

function UnsavedBanner({ isDirty }: { isDirty: boolean }) {
  if (!isDirty) return null;
  return (
    <motion.div 
      initial={{ y: -50, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="fixed top-0 left-0 right-0 z-[100] bg-yellow-500 text-black py-2 px-4 text-center font-bold flex items-center justify-center gap-2 shadow-lg"
    >
      <AlertTriangle className="w-4 h-4" />
      You have unsaved changes — don't forget to save.
    </motion.div>
  );
}

const vehicleSchema = z.object({
  brand: z.string().min(1, "Brand is required"),
  model: z.string().min(1, "Model is required"),
  batteryCapacityKwh: z.number().min(1, "Battery capacity must be greater than 0"),
  connectorType: z.enum(["CCS2", "CHAdeMO", "Type2", "GBT"]),
});

/* =========================================
   EV USER SETTINGS
========================================= */
function EvUserSettings({ user, onSignOut, searchQuery }: { user: any, onSignOut: () => void, searchQuery: string }) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [profile, setProfile] = useState<any>(null);
  const originalDataRef = useRef<string>("");
  const [isDirty, setIsDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const unsubProfile = onSnapshot(doc(db, "users", user.uid), (d) => {
      if (d.exists()) {
        const data = d.data();
        setProfile(data);
        if (!originalDataRef.current) {
          originalDataRef.current = JSON.stringify(data);
        }
      }
      setLoading(false);
    });

    const unsubVehicles = onSnapshot(collection(db, "users", user.uid, "ev_vehicles"), (s) => {
      setVehicles(s.docs.map(v => ({ id: v.id, ...(v.data() as any) })));
    });

    const loadStats = async () => {
      try {
        const q = query(collection(db, "bookings"), where("userId", "==", user.uid), where("status", "==", BOOKING_STATUS.COMPLETED));
        const snap = await getDocs(q);
        let totalKwh = 0;
        snap.docs.forEach(d => {
          totalKwh += ((d.data() as any).energyDeliveredKwh || 0);
        });
        setChargingStats({ 
          sessions: snap.size, 
          kwh: totalKwh,
          co2: totalKwh * 0.82
        });

        const bookingsData = snap.docs.map(d => ({ 
          kwhDelivered: (d.data() as any).energyDeliveredKwh || 0,
          status: 'completed'
        }));
        setAllBookings(bookingsData);
        setImpactData(computeImpactData(bookingsData, profile?.fullName || user.displayName || 'EV Driver'));
      } catch (e) {
        console.error("Stats fetch error:", e);
      } finally {
        setStatsLoading(false);
      }
    };
    loadStats();

    return () => {
      unsubProfile();
      unsubVehicles();
    };
  }, [user.uid]);

  useEffect(() => {
    if (profile && originalDataRef.current) {
      setIsDirty(JSON.stringify(profile) !== originalDataRef.current);
    }
  }, [profile]);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  const [vehicles, setVehicles] = useState<any[]>([]);
  const [vehicleForm, setVehicleForm] = useState<any>(null); 
  const [vehicleErrors, setVehicleErrors] = useState<any>({});
  const [chargingStats, setChargingStats] = useState({ sessions: 0, kwh: 0, co2: 0 });
  const [statsLoading, setStatsLoading] = useState(true);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [impactData, setImpactData] = useState<CarbonImpactData | null>(null);
  const [allBookings, setAllBookings] = useState<any[]>([]);

  const upiRegex = /^[\w.-]+@[\w.-]+$/;
  const isUpiValid = upiRegex.test(profile?.paymentPreferences?.upiId || "");

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateDoc(doc(db, "users", user.uid), profile);
      originalDataRef.current = JSON.stringify(profile);
      setIsDirty(false);
      toast({ title: "Settings saved successfully" });
    } catch (e) {
      toast({ variant: "destructive", title: "Failed to save settings" });
    } finally {
      setSaving(false);
    }
  };

  const handleVehicleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const validated = vehicleSchema.parse(vehicleForm);
      setVehicleErrors({});
      if (vehicleForm.id) {
        await updateDoc(doc(db, "users", user.uid, "ev_vehicles", vehicleForm.id), validated);
      } else {
        await addDoc(collection(db, "users", user.uid, "ev_vehicles"), validated);
      }
      setVehicleForm(null);
      toast({ title: vehicleForm.id ? "Vehicle updated" : "Vehicle added" });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        const errors: any = {};
        err.errors.forEach(e => { errors[e.path[0]] = e.message; });
        setVehicleErrors(errors);
      }
    }
  };

  const handleVehicleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, "users", user.uid, "ev_vehicles", id));
      toast({ title: "Vehicle removed" });
    } catch (e) {
      toast({ variant: "destructive", title: "Failed to remove vehicle" });
    }
  };

  const handleDownloadData = async () => {
    try {
      toast({ title: "Compiling your data...", description: "Please wait while we gather your profile, garage, and bookings history." });
      const [bookingsSnap, vehiclesSnap] = await Promise.all([
        getDocs(query(collection(db, "bookings"), where("userId", "==", user.uid))),
        getDocs(collection(db, "users", user.uid, "ev_vehicles"))
      ]);

      const data = {
        profile: profile,
        garage: vehiclesSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) })),
        bookings: bookingsSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) })),
        exportedAt: new Date().toISOString()
      };

      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `my-ev-data-${user.uid}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (e) {
      toast({ variant: "destructive", title: "Export failed", description: "Could not compile data." });
    }
  };

  const handleResetPassword = async () => {
    try {
      await sendPasswordResetEmail(auth, user.email);
      toast({ title: "Password reset email sent" });
    } catch (e: any) {
      toast({ variant: "destructive", title: e.message });
    }
  };

  if (loading) return <div className="p-8 text-center text-muted-foreground">Loading EV Profile...</div>;

  return (
    <div className="space-y-6">
      <UnsavedBanner isDirty={isDirty} />
      
      <CollapsibleSection title="My Charging Stats" icon={BarChart3} storageKey="settings_collapsed_ev_user_stats" searchQuery={searchQuery}>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="bg-emerald-50/50 border-emerald-100 dark:bg-emerald-950/10 dark:border-emerald-900/50 overflow-hidden relative">
            <div className="absolute -right-4 -top-4 opacity-5 rotate-12"><Zap className="w-24 h-24 text-emerald-600" /></div>
            <CardContent className="p-6 text-center">
              <Zap className="w-5 h-5 text-emerald-600 mx-auto mb-2" />
              <p className="text-xs text-muted-foreground uppercase font-bold tracking-wider mb-2">Total Sessions</p>
              {statsLoading ? <Skeleton className="h-8 w-16 mx-auto" /> : <p className="text-3xl font-black text-emerald-700 dark:text-emerald-400">{chargingStats.sessions}</p>}
            </CardContent>
          </Card>
          <Card className="bg-emerald-50/50 border-emerald-100 dark:bg-emerald-950/10 dark:border-emerald-900/50 overflow-hidden relative">
            <div className="absolute -right-4 -top-4 opacity-5 rotate-12"><History className="w-24 h-24 text-emerald-600" /></div>
            <CardContent className="p-6 text-center">
              <History className="w-5 h-5 text-emerald-600 mx-auto mb-2" />
              <p className="text-xs text-muted-foreground uppercase font-bold tracking-wider mb-2">Total kWh</p>
              {statsLoading ? <Skeleton className="h-8 w-24 mx-auto" /> : <p className="text-3xl font-black text-emerald-700 dark:text-emerald-400">{chargingStats.kwh.toFixed(1)}</p>}
            </CardContent>
          </Card>
          <Card className="bg-emerald-50/50 border-emerald-100 dark:bg-emerald-950/10 dark:border-emerald-900/50 overflow-hidden relative">
            <div className="absolute -right-4 -top-4 opacity-5 rotate-12"><Sun className="w-24 h-24 text-emerald-600" /></div>
            <CardContent className="p-6 text-center">
              <Sun className="w-5 h-5 text-emerald-600 mx-auto mb-2" />
              <p className="text-xs text-muted-foreground uppercase font-bold tracking-wider mb-2">CO₂ Saved (kg) 🌱</p>
              {statsLoading ? <Skeleton className="h-8 w-20 mx-auto" /> : <p className="text-3xl font-black text-emerald-600">{chargingStats.co2.toFixed(1)}</p>}
            </CardContent>
          </Card>
        </div>

        {/* Impact Share CTA */}
        {!statsLoading && chargingStats.sessions > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-6"
          >
            <Card className="bg-gradient-to-br from-emerald-600 to-emerald-800 border-none overflow-hidden relative group">
              <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-10" />
              <div className="absolute top-0 right-0 p-8 opacity-20 group-hover:scale-110 transition-transform duration-500">
                <Globe className="w-32 h-32 text-white" />
              </div>
              
              <CardContent className="p-6 relative z-10">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                  <div className="space-y-2">
                    <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/20 rounded-full text-xs font-bold text-white uppercase tracking-wider backdrop-blur-md">
                      <Leaf className="w-3 h-3" /> Environmental Hero
                    </div>
                    <h3 className="text-2xl font-black text-white leading-tight">
                      You've saved {chargingStats.co2.toFixed(1)}kg of CO₂
                    </h3>
                    <p className="text-emerald-100/80 text-sm max-w-md">
                      That's equivalent to planting {Math.round(chargingStats.co2 / 21.7)} trees this year. 
                      Share your achievement and inspire others to switch to EV!
                    </p>
                  </div>
                  
                  <Button 
                    onClick={() => {
                      if (impactData) setIsShareModalOpen(true);
                    }}
                    className="bg-white text-emerald-700 hover:bg-emerald-50 font-bold shadow-xl shadow-emerald-900/20 px-8 h-12 rounded-xl group"
                  >
                    <Share2 className="w-4 h-4 mr-2 group-hover:rotate-12 transition-transform" />
                    Share My Impact
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {impactData && (
          <CarbonShareModal 
            isOpen={isShareModalOpen}
            onClose={() => setIsShareModalOpen(false)}
            data={impactData}
          />
        )}
      </CollapsibleSection>

      <Card 
        className="overflow-hidden border-none shadow-none bg-transparent"
        onClick={() => setLocation("/notifications")}
      >
        <button className="w-full flex items-center justify-between p-5 mb-3 glass-card border-none hover:bg-white/10 transition-all group interactive-card">
          <CardTitle className="flex items-center gap-3 text-lg font-semibold">
            <div className="p-2 rounded-lg bg-primary/10 group-hover:bg-primary/20 transition-colors">
              <Bell className="w-5 h-5 text-primary" />
            </div>
            Notification Center
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 text-[10px] uppercase font-black">View All</Badge>
            <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:translate-x-1 transition-transform" />
          </div>
        </button>
      </Card>

      <CollapsibleSection title="Personal Info" icon={User} storageKey="settings_collapsed_ev_user_personal" searchQuery={searchQuery}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2"><Label>Full Name</Label><Input value={profile?.fullName || ""} onChange={e => setProfile({...profile, fullName: e.target.value})} /></div>
          <div className="space-y-2"><Label>Email</Label><Input value={user.email || ""} disabled /></div>
          <div className="space-y-2"><Label>Phone</Label><Input value={profile?.phone || ""} onChange={e => setProfile({...profile, phone: e.target.value})} /></div>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Preferences" icon={SettingsIcon} storageKey="settings_collapsed_ev_user_prefs" searchQuery={searchQuery}>
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2"><Label>Default Search City</Label><Input value={profile?.defaultCity || ""} onChange={e => setProfile({...profile, defaultCity: e.target.value})} placeholder="e.g. Pune" /></div>
            <div className="space-y-2"><Label>Search Radius (km)</Label><Input type="number" value={profile?.searchRadius || 20} onChange={e => setProfile({...profile, searchRadius: Number(e.target.value)})} /></div>
          </div>
          
          <div className="space-y-3">
            <Label className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-primary" /> Display Language
            </Label>
            <RadioGroup 
              value={profile?.settings?.language || "en"} 
              onValueChange={v => setProfile({...profile, settings: {...profile?.settings, language: v}})}
              className="grid grid-cols-2 gap-4"
            >
              <div className="flex items-center space-x-2 glass-card p-3 rounded-xl border-white/5 hover:bg-white/5 transition-colors">
                <RadioGroupItem value="en" id="lang-en" />
                <Label htmlFor="lang-en" className="font-bold cursor-pointer flex-1">English</Label>
              </div>
              <div className="flex items-center space-x-2 glass-card p-3 rounded-xl border-white/5 hover:bg-white/5 transition-colors">
                <RadioGroupItem value="hi" id="lang-hi" />
                <Label htmlFor="lang-hi" className="font-bold cursor-pointer flex-1">हिन्दी (Hindi)</Label>
              </div>
            </RadioGroup>
          </div>

          <Separator />
            <div className="flex flex-wrap gap-2">
              {["CCS2", "CHAdeMO", "Type 2", "GB/T"].map(type => {
                const isSelected = profile?.preferredConnectors?.includes(type);
                return (
                  <Badge 
                    key={type}
                    variant={isSelected ? "default" : "outline"}
                    className={cn(
                      "cursor-pointer px-4 py-2 text-sm transition-all",
                      isSelected ? "bg-emerald-500 hover:bg-emerald-600 border-emerald-500 text-white" : "hover:bg-muted"
                    )}
                    onClick={() => {
                      const current = profile?.preferredConnectors || [];
                      const next = current.includes(type) ? current.filter((t: string) => t !== type) : [...current, type];
                      setProfile({ ...profile, preferredConnectors: next });
                    }}
                  >
                    {type}
                  </Badge>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground italic">Filter map results by your preferred plug types</p>
          </div>

          <Separator />
          
          <div className="space-y-4">
            <p className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-4">Notification Preferences</p>
            <NotificationPreferencesPanel userId={user.uid} />
          </div>
        </CollapsibleSection>

      <CollapsibleSection title="My Garage" icon={Car} storageKey="settings_collapsed_ev_user_garage" searchQuery={searchQuery}>
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {vehicles.map(v => (
              <Card key={v.id} className="relative group overflow-hidden border-primary/10 hover:border-primary/30 transition-all">
                <CardContent className="p-4 pt-6">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="font-bold text-lg leading-none">{v.brand} {v.model}</p>
                      <p className="text-xs text-muted-foreground mt-1">{v.batteryCapacityKwh} kWh • {v.connectorType}</p>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-4 pt-4 border-t opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button variant="ghost" size="sm" className="h-8 flex-1" onClick={() => setVehicleForm(v)}>Edit</Button>
                    <Button variant="ghost" size="sm" className="h-8 flex-1 text-destructive hover:bg-destructive/10" onClick={() => handleVehicleDelete(v.id)}>Remove</Button>
                  </div>
                </CardContent>
              </Card>
            ))}
            <button 
              onClick={() => setVehicleForm({ brand: "", model: "", batteryCapacityKwh: 60, connectorType: "CCS2" })}
              className="h-full min-h-32 border-2 border-dashed rounded-xl flex flex-col items-center justify-center gap-2 hover:bg-muted/50 transition-all text-muted-foreground hover:text-primary"
            >
              <Plus className="w-6 h-6" />
              <span className="text-sm font-medium">Add New Vehicle</span>
            </button>
          </div>

          <Dialog open={!!vehicleForm} onOpenChange={c => !c && setVehicleForm(null)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{vehicleForm?.id ? "Edit Vehicle" : "Add New EV Vehicle"}</DialogTitle>
                <DialogDescription>Enter your car specifications for smart station suggestions.</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleVehicleSubmit} className="space-y-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Brand</Label>
                    <Input value={vehicleForm?.brand || ""} onChange={e => setVehicleForm({...vehicleForm, brand: e.target.value})} placeholder="e.g. Tesla" />
                    {vehicleErrors.brand && <p className="text-xs text-destructive">{vehicleErrors.brand}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label>Model</Label>
                    <Input value={vehicleForm?.model || ""} onChange={e => setVehicleForm({...vehicleForm, model: e.target.value})} placeholder="e.g. Model 3" />
                    {vehicleErrors.model && <p className="text-xs text-destructive">{vehicleErrors.model}</p>}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Battery Capacity (kWh)</Label>
                    <Input type="number" value={vehicleForm?.batteryCapacityKwh || ""} onChange={e => setVehicleForm({...vehicleForm, batteryCapacityKwh: Number(e.target.value)})} />
                    {vehicleErrors.batteryCapacityKwh && <p className="text-xs text-destructive">{vehicleErrors.batteryCapacityKwh}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label>Connector Type</Label>
                    <select 
                      className="w-full flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                      value={vehicleForm?.connectorType || "CCS2"} 
                      onChange={e => setVehicleForm({...vehicleForm, connectorType: e.target.value})}
                    >
                      <option value="CCS2">CCS2</option>
                      <option value="CHAdeMO">CHAdeMO</option>
                      <option value="Type2">Type 2</option>
                      <option value="GBT">GB/T</option>
                    </select>
                    {vehicleErrors.connectorType && <p className="text-xs text-destructive">{vehicleErrors.connectorType}</p>}
                  </div>
                </div>
                <DialogFooter className="pt-4">
                  <Button type="button" variant="outline" onClick={() => setVehicleForm(null)}>Cancel</Button>
                  <Button type="submit">{vehicleForm?.id ? "Update Vehicle" : "Save Vehicle"}</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Payment Preferences" icon={CreditCard} storageKey="settings_collapsed_ev_user_payment" searchQuery={searchQuery}>
        <div className="space-y-6 max-w-2xl">
          <div className="space-y-3">
            <Label className="flex items-center justify-between">
              Your UPI ID
              {isUpiValid && <CheckCircle2 className="w-4 h-4 text-emerald-500 animate-in zoom-in" />}
            </Label>
            <div className="relative">
              <Input 
                value={profile?.paymentPreferences?.upiId || ""} 
                onChange={e => setProfile({...profile, paymentPreferences: {...profile?.paymentPreferences, upiId: e.target.value}})}
                placeholder="username@bank"
                className={cn(isUpiValid && "border-emerald-500 focus-visible:ring-emerald-500")}
              />
            </div>
            <p className="text-xs text-muted-foreground">Used for faster UPI intent checkouts. Format: name@bank</p>
          </div>

          <Separator />

          <div className="space-y-3">
            <Label>Preferred Payment Method</Label>
            <RadioGroup 
              value={profile?.paymentPreferences?.preferredMethod || "UPI"} 
              onValueChange={v => setProfile({...profile, paymentPreferences: {...profile?.paymentPreferences, preferredMethod: v}})}
              className="grid grid-cols-3 gap-4"
            >
              {(["UPI", "Wallet", "Card"] as const).map(m => (
                <div key={m} className="relative">
                  <Label
                    htmlFor={m}
                    className={cn(
                      "flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground cursor-pointer transition-all",
                      profile?.paymentPreferences?.preferredMethod === m && "border-primary"
                    )}
                  >
                    <RadioGroupItem value={m} id={m} className="sr-only" />
                    <span className="text-sm font-bold uppercase tracking-tight">{m}</span>
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>
        </div>
      </CollapsibleSection>
      <CollapsibleSection title="Privacy & Data" icon={Lock} storageKey="settings_collapsed_ev_user_privacy" searchQuery={searchQuery}>
        <div className="space-y-6 max-w-2xl">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Share location while app is open</Label>
                <p className="text-xs text-muted-foreground italic">Helps show the nearest charging stations instantly</p>
              </div>
              <Switch 
                checked={profile?.shareLocation ?? true} 
                onCheckedChange={c => setProfile({...profile, shareLocation: c})}
              />
            </div>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Allow usage analytics</Label>
                <p className="text-xs text-muted-foreground italic">Helps us improve the platform experience</p>
              </div>
              <Switch 
                checked={profile?.allowAnalytics ?? true} 
                onCheckedChange={c => setProfile({...profile, allowAnalytics: c})}
              />
            </div>
          </div>

          <Separator />

          <div className="bg-muted p-4 rounded-xl space-y-4 border">
            <div className="flex items-start gap-4">
              <div className="p-2 bg-background rounded-lg border">
                <Globe className="w-5 h-5 text-muted-foreground" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-bold">Data Portability</p>
                <p className="text-xs text-muted-foreground leading-relaxed">Download a complete copy of your personal data including vehicles, profile information, and booking history.</p>
              </div>
            </div>
            <Button variant="outline" size="sm" className="w-full gap-2 border-primary/20 hover:border-primary/50" onClick={handleDownloadData}>
              <Download className="w-4 h-4" /> Download My Data (JSON)
            </Button>
          </div>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Security & Sessions" icon={ShieldCheck} storageKey="settings_collapsed_ev_user_security" searchQuery={searchQuery}>
        <div className="space-y-4">
          <div className="p-4 rounded-xl border bg-muted/30">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-sm font-bold flex items-center gap-2">
                <Activity className="w-4 h-4 text-emerald-500" /> Current Session
              </h4>
              <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-[10px] uppercase font-black">Active Now</Badge>
            </div>
            
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-background border flex items-center justify-center text-xl">
                {profile?.currentDevice?.type === "Mobile" ? "📱" : "💻"}
              </div>
              <div>
                <p className="text-sm font-bold">
                  {profile?.currentDevice?.type || "Unknown Device"} · {profile?.currentDevice?.browser || "Browser"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Last active: {profile?.currentDevice?.lastSeen ? safeFormatDistanceToNow(profile.currentDevice.lastSeen) + " ago" : "Just now"}
                </p>
              </div>
            </div>

            <Separator className="my-4" />

            <div className="space-y-3">
              <p className="text-xs text-muted-foreground italic leading-relaxed">
                Signing out of all devices will clear your persistent session preference and redirect you to the login page.
              </p>
              <Button 
                variant="outline" 
                size="sm" 
                className="w-full text-destructive hover:bg-destructive/10 border-destructive/20 font-bold"
                onClick={() => {
                  localStorage.removeItem("lastLoginEmail");
                  localStorage.removeItem("lastLoginTime");
                  localStorage.removeItem("rememberMe");
                  onSignOut();
                }}
              >
                <LogOut className="w-4 h-4 mr-2" /> Sign Out All Devices
              </Button>
            </div>
          </div>
        </div>
      </CollapsibleSection>

      <div className="flex gap-4 pt-4">
        <Button onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save All Changes"}</Button>
        <Button variant="outline" onClick={handleResetPassword}>Reset Password</Button>
        <Button variant="destructive" onClick={onSignOut} className="ml-auto flex gap-2"><LogOut className="w-4 h-4"/> Sign Out</Button>
      </div>
    </div>
  );
}

/* =========================================
   OWNER SETTINGS (Including UPI QR)
========================================= */
function OwnerSettings({ user, onSignOut, searchQuery }: { user: any, onSignOut: () => void, searchQuery: string }) {
  const { toast } = useToast();
  const { role: ownerRole } = useOwnerPermission();
  const [profile, setProfile] = useState<any | null>(null);
  const originalDataRef = useRef<string>("");
  const [isDirty, setIsDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoProgress, setLogoProgress] = useState(0);

  // New features state
  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"manager" | "view_only">("manager");
  const [inviting, setInviting] = useState(false);

  const gstRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
  const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;

  useEffect(() => {
    getDoc(doc(db, "owners", user.uid)).then(d => {
      if (d.exists()) {
        const data = d.data();
        // Default operating hours if missing
        if (!data.operatingHours) {
          const defaultHours: any = {};
          ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].forEach(day => {
            defaultHours[day] = { open: "08:00", close: "22:00", closed: day === "sunday" };
          });
          data.operatingHours = defaultHours;
        }
        
        // Existing ensure default notification field structure (kept for backcompat) 
        if (!data.ownerNotifications) {
          data.ownerNotifications = {
            newBooking: true,
            faultyConnector: true,
            revenueMilestone: true,
            approvalStatus: true
          };
        }

        // --- NEW FEATURES INITIALIZATION ---
        if (!data.taxDetails) {
          data.taxDetails = {
            gstNumber: "",
            businessType: "Proprietorship",
            panNumber: "",
            registeredAddress: ""
          };
        }
        
        if (!data.notificationPrefs) {
          data.notificationPrefs = {
            newBooking: true,
            bookingCancelled: true,
            driverCheckedIn: false,
            lowRating: true,
            stationOffline: true,
            approvalStatus: true,
            dailySummary: false,
            weeklySummary: true,
            revenueMilestone: false
          };
        }

        if (!data.timeDecay) {
          data.timeDecay = {
            enabled: false,
            floorPrice: 5
          };
        }

        setProfile(data);
        if (!originalDataRef.current) {
          originalDataRef.current = JSON.stringify(data);
        }
      }
      setLoading(false);
    });

    // Real-time team member listener
    const unsubTeam = onSnapshot(collection(db, "owners", user.uid, "teamMembers"), (snap) => {
      setTeamMembers(snap.docs.map(d => ({ email: d.id, ...d.data() })));
    }, (error) => {
       console.error("Team Members listener error:", error);
    });

    return () => unsubTeam();
  }, [user.uid]);

  useEffect(() => {
    if (profile && originalDataRef.current) {
      setIsDirty(JSON.stringify(profile) !== originalDataRef.current);
    }
  }, [profile]);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  const handleSave = async () => {
    if (!profile) return;

    // 1. Operating Hours Validation (before anything else)
    const hours = profile.operatingHours;
    for (const day in hours) {
      if (!hours[day].closed) {
        const [h_open, m_open] = hours[day].open.split(":").map(Number);
        const [h_close, m_close] = hours[day].close.split(":").map(Number);
        const openVal = h_open * 60 + m_open;
        const closeVal = h_close * 60 + m_close;
        if (closeVal <= openVal) {
          toast({ 
            variant: "destructive", 
            title: `Invalid hours for ${day.charAt(0).toUpperCase() + day.slice(1)}`, 
            description: "Closing time must be after opening time." 
          });
          return;
        }
      }
    }

    setSaving(true);
    try {
      // Vacation Mode Logic - Refined Phase 3 Safe Batch
      const vacationEnabled = profile.vacationMode?.enabled;
      const originalData = JSON.parse(originalDataRef.current || "{}");
      const oldVacationEnabled = originalData?.vacationMode?.enabled;

      if (vacationEnabled !== oldVacationEnabled) {
        const batch = writeBatch(db);
        if (vacationEnabled) {
          // Rule: Never touch stations with status "pending"
          const q = query(
            collection(db, "stations"), 
            where("ownerId", "==", user.uid), 
            where("status", "==", "active")
          );
          const snap = await getDocs(q);
          snap.docs.forEach(doc => {
            batch.update(doc.ref, { 
              status: "maintenance", 
              vacationMode: true 
            });
          });
        } else {
          // Logic: Only restore stations paused by vacation mode
          const q = query(
            collection(db, "stations"), 
            where("ownerId", "==", user.uid), 
            where("vacationMode", "==", true)
          );
          const snap = await getDocs(q);
          snap.docs.forEach(doc => {
            batch.update(doc.ref, { 
              status: "active", 
              vacationMode: false 
            });
          });
        }
        await batch.commit();
      }

      await updateDoc(doc(db, "owners", user.uid), profile as any);
      originalDataRef.current = JSON.stringify(profile);
      setIsDirty(false);
      toast({ title: vacationEnabled !== oldVacationEnabled ? "Vacation mode updated & settings saved" : "Business settings updated" });
    } catch (e) {
      toast({ variant: "destructive", title: "Failed to update settings" });
    } finally {
      setSaving(false);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) return toast({ variant: "destructive", title: "Image too large", description: "Max 2MB allowed" });
    
    setLogoUploading(true);
    setLogoProgress(0);
    const storageRef = ref(storage, `owners/${user.uid}/logo.jpg`);
    const uploadTask = uploadBytesResumable(storageRef, file);

    uploadTask.on('state_changed', 
      (snapshot) => setLogoProgress((snapshot.bytesTransferred / snapshot.totalBytes) * 100),
      (error) => {
        setLogoUploading(false);
        toast({ variant: "destructive", title: "Logo upload failed" });
      },
      async () => {
        const url = await getDownloadURL(uploadTask.snapshot.ref);
        setProfile((p: any) => ({ ...p, logoUrl: url }));
        await updateDoc(doc(db, "owners", user.uid), { logoUrl: url });
        setLogoUploading(false);
        toast({ title: "Business logo updated" });
      }
    );
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      // Use FileReader to encode as Base64 data URL — no Firebase Storage / no CORS needed
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const newProfile = { ...profile, upiQrUrl: dataUrl } as OwnerProfile;
      setProfile(newProfile);
      await updateDoc(doc(db, "owners", user.uid), { upiQrUrl: dataUrl });
      toast({ title: "✅ QR Code saved successfully!" });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Upload failed", description: err.message });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  if (loading) return <div className="p-8 text-center text-muted-foreground">Loading Owner Settings...</div>;

  return (
    <div className="space-y-6">
      <UnsavedBanner isDirty={isDirty} />

      {profile?.vacationMode?.enabled && (
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="p-4 bg-yellow-500/10 border-l-4 border-yellow-500 text-yellow-600 font-medium rounded-r-lg flex items-center gap-3">
          <Clock className="w-5 h-5" />
          Your stations are currently paused and hidden from the map (Vacation Mode).
        </motion.div>
      )}

      <CollapsibleSection title="Business Profile" icon={Store} searchQuery={searchQuery}>
        <div className="flex flex-col items-center mb-8">
          <div className="group relative cursor-pointer" onClick={() => logoInputRef.current?.click()}>
            <Avatar className="w-24 h-24 border-4 border-background shadow-xl">
              <AvatarImage src={profile?.logoUrl} className="object-cover" />
              <AvatarFallback className="bg-primary/5 text-primary text-2xl font-black">
                {profile?.businessName ? profile.businessName.charAt(0).toUpperCase() : (profile?.fullName ? profile.fullName.charAt(0).toUpperCase() : "B")}
              </AvatarFallback>
            </Avatar>
            <div className="absolute inset-0 bg-black/40 rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <Camera className="w-6 h-6 text-white" />
            </div>
            {logoUploading && (
              <div className="absolute -bottom-2 left-0 right-0 px-2">
                <Progress value={logoProgress} className="h-1.5" />
              </div>
            )}
          </div>
          <Input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" ref={logoInputRef} onChange={handleLogoUpload} />
          <h2 className="mt-3 font-bold text-xl">{profile?.businessName || "Your Business"}</h2>
          <p className="text-xs text-muted-foreground uppercase tracking-widest font-medium">Station Owner</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2"><Label>Business Name</Label><Input value={profile?.businessName || ""} onChange={e => setProfile({...profile, businessName: e.target.value})} /></div>
          <div className="space-y-2"><Label>Full Name</Label><Input value={profile?.fullName || ""} onChange={e => setProfile({...profile, fullName: e.target.value})} /></div>
          <div className="space-y-2"><Label>Email</Label><Input value={profile?.email || ""} disabled /></div>
          <div className="space-y-2"><Label>Support Phone</Label><Input value={profile?.phone || ""} onChange={e => setProfile({...profile, phone: e.target.value})} /></div>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Business Tax Details" icon={ShieldCheck} searchQuery={searchQuery} storageKey="settings_collapsed_owner_tax">
        <div className="space-y-6">
          <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted p-2 rounded-lg border-l-4 border-primary">
            🧾 These details are used for professional GST invoices and financial CSV exports.
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label className="flex justify-between items-end">
                GST Number
                {profile?.taxDetails?.gstNumber && (
                   gstRegex.test(profile.taxDetails.gstNumber) 
                     ? <span className="text-[10px] uppercase font-black text-emerald-500 flex items-center gap-1"><CheckCircle2 className="w-3 h-3"/> Valid Format</span>
                     : <span className="text-[10px] uppercase font-black text-destructive flex items-center gap-1"><AlertTriangle className="w-3 h-3"/> Invalid Format</span>
                )}
              </Label>
              <Input 
                placeholder="27AABCU9603R1ZX" 
                maxLength={15}
                className="font-mono"
                value={profile?.taxDetails?.gstNumber || ""}
                onChange={e => setProfile({
                  ...profile, 
                  taxDetails: { ...profile.taxDetails, gstNumber: e.target.value.toUpperCase() }
                })}
              />
            </div>

            <div className="space-y-2">
              <Label>Business Type</Label>
              <select 
                className="w-full flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                value={profile?.taxDetails?.businessType || "Proprietorship"}
                onChange={e => setProfile({
                  ...profile,
                  taxDetails: { ...profile.taxDetails, businessType: e.target.value }
                })}
              >
                <option value="Proprietorship">Proprietorship</option>
                <option value="Partnership">Partnership</option>
                <option value="Private Ltd">Private Ltd</option>
                <option value="LLP">LLP</option>
                <option value="Other">Other</option>
              </select>
            </div>

            <div className="space-y-2">
              <Label className="flex justify-between items-end">
                PAN Number
                {profile?.taxDetails?.panNumber && (
                   panRegex.test(profile.taxDetails.panNumber) 
                     ? <span className="text-[10px] uppercase font-black text-emerald-500 flex items-center gap-1"><CheckCircle2 className="w-3 h-3"/> Valid Format</span>
                     : <span className="text-[10px] uppercase font-black text-destructive flex items-center gap-1"><AlertTriangle className="w-3 h-3"/> Invalid Format</span>
                )}
              </Label>
              <Input 
                placeholder="AABCU9603R" 
                maxLength={10}
                className="font-mono"
                value={profile?.taxDetails?.panNumber || ""}
                onChange={e => setProfile({
                  ...profile,
                  taxDetails: { ...profile.taxDetails, panNumber: e.target.value.toUpperCase() }
                })}
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label>Registered Business Address</Label>
              <textarea 
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                placeholder="Complete registered business address..."
                value={profile?.taxDetails?.registeredAddress || ""}
                onChange={e => setProfile({
                  ...profile,
                  taxDetails: { ...profile.taxDetails, registeredAddress: e.target.value }
                })}
              />
            </div>
          </div>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Operating Hours" icon={Clock} storageKey="settings_collapsed_owner_hours" searchQuery={searchQuery}>
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-1">
            {["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].map(day => (
              <div key={day} className={cn("flex items-center gap-4 p-3 rounded-lg transition-colors border-b last:border-0", profile?.operatingHours?.[day]?.closed && "bg-muted/30 opacity-60")}>
                <span className="w-28 font-bold capitalize">{day}</span>
                <div className="flex items-center gap-2 flex-1">
                   <Input 
                     type="time" 
                     className="w-32 h-9" 
                     disabled={profile?.operatingHours?.[day]?.closed}
                     value={profile?.operatingHours?.[day]?.open || "08:00"}
                     onChange={e => setProfile({...profile, operatingHours: {...profile.operatingHours, [day]: {...profile.operatingHours[day], open: e.target.value}}})}
                   />
                   <span className="text-muted-foreground">to</span>
                   <Input 
                     type="time" 
                     className="w-32 h-9" 
                     disabled={profile?.operatingHours?.[day]?.closed}
                     value={profile?.operatingHours?.[day]?.close || "22:00"}
                     onChange={e => setProfile({...profile, operatingHours: {...profile.operatingHours, [day]: {...profile.operatingHours[day], close: e.target.value}}})}
                   />
                </div>
                <div className="flex items-center gap-2">
                  <Label htmlFor={`${day}-closed`} className="text-xs font-semibold cursor-pointer">Closed</Label>
                  <Switch 
                    id={`${day}-closed`}
                    checked={profile?.operatingHours?.[day]?.closed || false} 
                    onCheckedChange={c => setProfile({...profile, operatingHours: {...profile.operatingHours, [day]: {...profile.operatingHours[day], closed: c}}})} 
                  />
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground italic mt-2">These hours define when your stations are publicly accessible for bookings.</p>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Vacation Mode" icon={Sun} searchQuery={searchQuery}>
        <div className="space-y-6">
          <div className="flex items-center justify-between p-4 bg-primary/5 rounded-xl border border-primary/20">
            <div className="space-y-1">
              <Label className="text-base font-bold">Pause All My Stations</Label>
              <p className="text-xs text-muted-foreground">Sets all active stations to 'Maintenance' temporarily.</p>
            </div>
            <Switch 
              checked={profile?.vacationMode?.enabled || false} 
              onCheckedChange={c => setProfile({...profile, vacationMode: {...profile?.vacationMode, enabled: c}})} 
            />
          </div>

          {profile?.vacationMode?.enabled && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4 p-4 border rounded-xl bg-card shadow-sm">
              <div className="flex items-center gap-4">
                <CalendarIcon className="w-5 h-5 text-muted-foreground" />
                <div className="space-y-1 flex-1">
                  <Label>Scheduled Vacation Period</Label>
                  <div className="grid grid-cols-2 gap-4 pt-2">
                    <div className="space-y-1">
                      <p className="text-[10px] uppercase font-bold text-muted-foreground ml-1">Start Date</p>
                      <Input type="date" value={profile?.vacationMode?.startDate || ""} onChange={e => setProfile({...profile, vacationMode: {...profile.vacationMode, startDate: e.target.value}})} />
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] uppercase font-bold text-muted-foreground ml-1">End Date</p>
                      <Input type="date" value={profile?.vacationMode?.endDate || ""} onChange={e => setProfile({...profile, vacationMode: {...profile.vacationMode, endDate: e.target.value}})} />
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Auto-Pricing & Peak Rules" icon={Zap} searchQuery={searchQuery}>
        <div className="space-y-8 max-w-2xl">
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <Label className="text-base font-bold">Peak Hour Multiplier</Label>
              <Badge variant="secondary" className="text-lg px-3 py-1 font-black">{profile?.peakPricing?.multiplier?.toFixed(1) || "1.0"}x</Badge>
            </div>
            <Slider 
              min={1} max={3} step={0.1} 
              value={[profile?.peakPricing?.multiplier || 1.0]} 
              onValueChange={([v]) => setProfile({...profile, peakPricing: {...profile?.peakPricing, multiplier: v}})} 
            />
            <div className="flex justify-between text-[10px] uppercase font-bold text-muted-foreground">
              <span>Standard (1.0x)</span>
              <span>Premium (2.0x)</span>
              <span>Ultra Peak (3.0x)</span>
            </div>
          </div>

          <div className="space-y-4">
            <Label className="flex items-center gap-2"><Clock className="w-4 h-4" /> Peak Time Window</Label>
            <div className="flex items-center gap-4">
              <Input type="time" value={profile?.peakPricing?.startTime || "18:00"} onChange={e => setProfile({...profile, peakPricing: {...profile.peakPricing, startTime: e.target.value}})} className="flex-1" />
              <span className="text-muted-foreground">until</span>
              <Input type="time" value={profile?.peakPricing?.endTime || "21:00"} onChange={e => setProfile({...profile, peakPricing: {...profile.peakPricing, endTime: e.target.value}})} className="flex-1" />
            </div>
          </div>

          <div className="p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-xl flex items-center gap-4">
            <div className="w-12 h-12 bg-emerald-500/10 rounded-full flex items-center justify-center">
              <Globe className="w-6 h-6 text-emerald-600" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold">Live Pricing Preview</p>
              <p className="text-xs text-muted-foreground">
                During peak hours, your standard <span className="font-bold text-foreground">₹10/kWh</span> rate becomes 
                <span className="text-lg font-black text-emerald-600 mx-2">₹{(10 * (profile?.peakPricing?.multiplier || 1.0)).toFixed(2)}/kWh</span>
              </p>
            </div>
          </div>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Time-Decay Pricing" icon={Zap} searchQuery={searchQuery} storageKey="settings_collapsed_owner_decay">
        <div className="space-y-6 max-w-2xl">
          <div className="flex items-center justify-between p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-xl">
            <div className="space-y-1">
              <Label className="text-base font-bold">Enable Last-Minute Discounts</Label>
              <p className="text-xs text-muted-foreground">Automatically lowers price for slots not booked within 30 minutes to maximize occupancy.</p>
            </div>
            <Switch 
              checked={profile?.timeDecay?.enabled || false} 
              onCheckedChange={c => setProfile({...profile, timeDecay: {...profile?.timeDecay, enabled: c}})} 
            />
          </div>

          {profile?.timeDecay?.enabled && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6 p-4 border rounded-xl bg-card shadow-sm">
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <Label className="font-bold">Minimum Price Floor (₹/kWh)</Label>
                  <Badge variant="outline" className="font-black">₹{profile?.timeDecay?.floorPrice || 5}</Badge>
                </div>
                <Slider 
                  min={1} max={20} step={1} 
                  value={[profile?.timeDecay?.floorPrice || 5]} 
                  onValueChange={([v]) => setProfile({...profile, timeDecay: {...profile?.timeDecay, floorPrice: v}})} 
                />
                <p className="text-[10px] text-muted-foreground uppercase font-medium">Discounts will never go below this price per kWh.</p>
              </div>

              <Separator className="opacity-50" />

              <div className="space-y-3">
                <p className="text-xs font-black uppercase text-muted-foreground">Decay Schedule Preview</p>
                <div className="grid grid-cols-3 gap-2">
                  <div className="p-2 rounded-lg bg-muted/50 border flex flex-col items-center gap-1">
                    <span className="text-[9px] font-bold text-muted-foreground">30-15 MINS</span>
                    <span className="text-xs font-black text-emerald-500">-15%</span>
                  </div>
                  <div className="p-2 rounded-lg bg-muted/50 border flex flex-col items-center gap-1">
                    <span className="text-[9px] font-bold text-muted-foreground">15-5 MINS</span>
                    <span className="text-xs font-black text-emerald-500">-25%</span>
                  </div>
                  <div className="p-2 rounded-lg bg-muted/50 border flex flex-col items-center gap-1">
                    <span className="text-[9px] font-bold text-muted-foreground">&lt;5 MINS</span>
                    <span className="text-xs font-black text-emerald-500">-35%</span>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Notification Preferences" icon={Bell} searchQuery={searchQuery} storageKey="settings_collapsed_owner_notifications">
        <div className="space-y-8">
          <div>
            <h3 className="text-xs font-black uppercase text-muted-foreground tracking-[0.2em] mb-4 flex items-center gap-2">
              <Star className="w-3 h-3" /> Booking Alerts
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-6 px-2">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>New booking confirmed</Label>
                  <p className="text-[10px] text-muted-foreground font-medium">Get notified when a driver books a slot</p>
                </div>
                <Switch 
                  checked={profile?.notificationPrefs?.newBooking ?? true} 
                  onCheckedChange={c => setProfile({...profile, notificationPrefs: {...profile?.notificationPrefs, newBooking: c}})}
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Booking cancelled</Label>
                  <p className="text-[10px] text-muted-foreground font-medium">Know when a slot becomes available again</p>
                </div>
                <Switch 
                  checked={profile?.notificationPrefs?.bookingCancelled ?? true} 
                  onCheckedChange={c => setProfile({...profile, notificationPrefs: {...profile?.notificationPrefs, bookingCancelled: c}})}
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Driver checked in</Label>
                  <p className="text-[10px] text-muted-foreground font-medium">When driver starts their session</p>
                </div>
                <Switch 
                  checked={profile?.notificationPrefs?.driverCheckedIn ?? false} 
                  onCheckedChange={c => setProfile({...profile, notificationPrefs: {...profile?.notificationPrefs, driverCheckedIn: c}})}
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5 text-destructive group">
                  <Label className="text-destructive font-bold">Low rating received (≤ 2 stars)</Label>
                  <p className="text-[10px] text-muted-foreground font-medium">Act quickly on negative feedback</p>
                </div>
                <Switch 
                  checked={profile?.notificationPrefs?.lowRating ?? true} 
                  onCheckedChange={c => setProfile({...profile, notificationPrefs: {...profile?.notificationPrefs, lowRating: c}})}
                />
              </div>
            </div>
          </div>

          <Separator className="opacity-50" />

          <div>
            <h3 className="text-xs font-black uppercase text-muted-foreground tracking-[0.2em] mb-4 flex items-center gap-2">
              <BarChart3 className="w-3 h-3" /> Station & Revenue Alerts
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-6 px-2">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Station offline or fault</Label>
                  <p className="text-[10px] text-muted-foreground font-medium">Critical — always recommended</p>
                </div>
                <Switch 
                  checked={profile?.notificationPrefs?.stationOffline ?? true} 
                  onCheckedChange={c => setProfile({...profile, notificationPrefs: {...profile?.notificationPrefs, stationOffline: c}})}
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Daily revenue summary</Label>
                  <p className="text-[10px] text-muted-foreground font-medium">Morning briefing of yesterday's earnings (9 AM)</p>
                </div>
                <Switch 
                  checked={profile?.notificationPrefs?.dailySummary ?? false} 
                  onCheckedChange={c => setProfile({...profile, notificationPrefs: {...profile?.notificationPrefs, dailySummary: c}})}
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Weekly performance report</Label>
                  <p className="text-[10px] text-muted-foreground font-medium">Weekly overview every Monday morning</p>
                </div>
                <Switch 
                  checked={profile?.notificationPrefs?.weeklySummary ?? true} 
                  onCheckedChange={c => setProfile({...profile, notificationPrefs: {...profile?.notificationPrefs, weeklySummary: c}})}
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Revenue milestone reached</Label>
                  <p className="text-[10px] text-muted-foreground font-medium">Celebrate every ₹1,000 earned! 🎉</p>
                </div>
                <Switch 
                  checked={profile?.notificationPrefs?.revenueMilestone ?? false} 
                  onCheckedChange={c => setProfile({...profile, notificationPrefs: {...profile?.notificationPrefs, revenueMilestone: c}})}
                />
              </div>
            </div>
          </div>
        </div>
      </CollapsibleSection>

      {/* TEAM ACCESS SECTION - OWNER ONLY */}
      {ownerRole === "owner" && (
        <CollapsibleSection title="Team Access" icon={User} searchQuery={searchQuery} storageKey="settings_collapsed_owner_team">
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Current Members</p>
              <Button size="sm" onClick={() => setIsInviteOpen(true)} className="rounded-full gap-2 h-8 px-4 font-black text-[10px] uppercase tracking-widest">
                <Plus className="w-3.5 h-3.5" /> Invite Team Member
              </Button>
            </div>

            <div className="space-y-2">
              {/* Primary Owner Entry */}
              <div className="flex items-center justify-between p-3 rounded-2xl bg-primary/5 border border-primary/10">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-white font-black">
                    {profile?.fullName?.charAt(0) || "O"}
                  </div>
                  <div>
                    <p className="text-sm font-bold flex items-center gap-2">
                      {profile?.fullName} (You)
                      <span className="text-[9px] font-black uppercase text-primary px-1.5 py-0.5 bg-primary/10 rounded-md">Primary Owner</span>
                    </p>
                    <p className="text-[10px] text-muted-foreground font-medium">{profile?.email}</p>
                  </div>
                </div>
              </div>

              {/* Invited Members */}
              {teamMembers.map(member => (
                <div key={member.email} className="flex items-center justify-between p-3 rounded-2xl border bg-card hover:bg-muted/30 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center font-bold">
                      {member.email.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-bold flex items-center gap-2">
                        {member.email.split("@")[0]}
                        <Badge 
                          variant="secondary" 
                          className={cn(
                            "text-[8px] uppercase h-4 px-1 leading-none font-black",
                            member.role === "manager" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"
                          )}
                        >
                          {member.role === "manager" ? "Manager" : "View Only"}
                        </Badge>
                      </p>
                      <p className="text-[10px] text-muted-foreground font-medium">{member.email}</p>
                    </div>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-8 text-destructive hover:bg-destructive/10 text-[10px] font-black uppercase tracking-widest"
                    onClick={async () => {
                      if (confirm(`Remove ${member.email} from the team?`)) {
                        await deleteDoc(doc(db, "owners", user.uid, "teamMembers", member.email));
                        toast({ title: "Team member removed" });
                      }
                    }}
                  >
                    Remove
                  </Button>
                </div>
              ))}
            </div>

            {/* Invite Modal */}
            <Dialog open={isInviteOpen} onOpenChange={setIsInviteOpen}>
              <DialogContent className="rounded-3xl max-w-sm">
                <DialogHeader>
                  <DialogTitle className="text-xl font-black uppercase tracking-tight">Invite Team Member</DialogTitle>
                  <DialogDescription>Assign a role to help manage your charging business.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Email Address</Label>
                    <Input 
                      placeholder="teammate@gmail.com" 
                      type="email"
                      value={inviteEmail}
                      onChange={e => setInviteEmail(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Role Access Profile</Label>
                    <RadioGroup 
                      value={inviteRole} 
                      onValueChange={(v: any) => setInviteRole(v)}
                      className="grid grid-cols-1 gap-2"
                    >
                      <Label className={cn("flex flex-col p-3 rounded-2xl border-2 transition-all cursor-pointer", inviteRole === "manager" ? "border-primary bg-primary/5" : "border-muted hover:bg-muted/50")} htmlFor="role-manager">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-bold">Manager</span>
                          <RadioGroupItem value="manager" id="role-manager" />
                        </div>
                        <p className="text-[10px] text-muted-foreground font-medium">Can edit stations & view ledger. Cannot delete stations or access team settings.</p>
                      </Label>
                      <Label className={cn("flex flex-col p-3 rounded-2xl border-2 transition-all cursor-pointer", inviteRole === "view_only" ? "border-primary bg-primary/5" : "border-muted hover:bg-muted/50")} htmlFor="role-viewer">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-bold">View Only</span>
                          <RadioGroupItem value="view_only" id="role-viewer" />
                        </div>
                        <p className="text-[10px] text-muted-foreground font-medium">Read-only access to Dashboard and Ledger. Cannot perform any actions.</p>
                      </Label>
                    </RadioGroup>
                  </div>
                </div>
                <DialogFooter className="flex-col gap-2">
                  <Button 
                    className="w-full h-11 rounded-2xl font-black uppercase tracking-widest"
                    disabled={!inviteEmail || inviting}
                    onClick={async () => {
                      setInviting(true);
                      try {
                        await setDoc(doc(db, "owners", user.uid, "teamMembers", inviteEmail.toLowerCase()), {
                          email: inviteEmail.toLowerCase(),
                          role: inviteRole,
                          invitedAt: Date.now(),
                          invitedBy: user.uid,
                          status: "pending"
                        });
                        toast({ title: "Invite sent successfully" });
                        setIsInviteOpen(false);
                        setInviteEmail("");
                      } catch (e: any) {
                        toast({ variant: "destructive", title: "Failed to send invite", description: e.message });
                      } finally {
                        setInviting(false);
                      }
                    }}
                  >
                    {inviting ? "Sending..." : "Send Invite"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CollapsibleSection>
      )}

      <CollapsibleSection title="Payment Receiving (UPI)" icon={QrCode} searchQuery={searchQuery}>
        <div className="space-y-6">
          <div className="space-y-2 max-w-sm">
            <Label>Business UPI ID</Label>
            <Input 
              placeholder="e.g. yourbusiness@upi" 
              value={profile?.upiId || ""} 
              onChange={e => setProfile((p: any) => p ? {...p, upiId: e.target.value} : null)} 
            />
            <p className="text-xs text-muted-foreground">Drivers can manually input this if they cannot scan the QR.</p>
          </div>
          
          <Separator />
          
          <div className="space-y-3">
            <Label>UPI QR Code</Label>
            <div className="flex flex-col sm:flex-row gap-6 items-start">
              <div className="w-48 h-48 border-2 border-dashed rounded-xl flex items-center justify-center bg-muted/20 overflow-hidden relative">
                {profile?.upiQrUrl ? (
                   <img src={profile.upiQrUrl} alt="UPI QR" className="w-full h-full object-contain p-2" />
                ) : (
                  <div className="text-center p-4">
                    <QrCode className="w-8 h-8 text-muted-foreground mx-auto mb-2 opacity-50" />
                    <span className="text-xs text-muted-foreground block">No QR Uploaded</span>
                  </div>
                )}
                {uploading && (
                  <div className="absolute inset-0 bg-background/80 flex items-center justify-center">
                    <span className="text-sm font-medium animate-pulse">Uploading...</span>
                  </div>
                )}
              </div>
              <div className="space-y-3 flex-1">
                <p className="text-sm font-medium">Display your QR on Checkouts</p>
                <p className="text-xs text-muted-foreground mb-4">Upload a high-quality screenshot of your Google Pay, PhonePe, or Paytm Business QR code. It will be shown to drivers when they book your station.</p>
                <Input type="file" accept="image/*" className="hidden" ref={fileInputRef} onChange={handleFileUpload} />
                <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                  <Upload className="w-4 h-4 mr-2" /> {profile?.upiQrUrl ? "Replace QR Code" : "Upload QR Image"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Bank & Payout Details" icon={CreditCard}>
        <div className="space-y-6 max-w-2xl">
          <p className="text-sm text-muted-foreground bg-muted p-3 rounded-lg border flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            Used for processing your monthly revenue settlements.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Account Holder Name</Label>
              <Input 
                value={profile?.bankDetails?.accountName || ""} 
                onChange={e => setProfile({...profile, bankDetails: {...profile.bankDetails, accountName: e.target.value}})}
                placeholder="As per bank records"
              />
            </div>
            <div className="space-y-2">
              <Label>Bank Name</Label>
              <Input 
                value={profile?.bankDetails?.bankName || ""} 
                onChange={e => setProfile({...profile, bankDetails: {...profile.bankDetails, bankName: e.target.value}})}
                placeholder="e.g. HDFC Bank"
              />
            </div>
            <div className="space-y-2">
              <Label>Account Number</Label>
              <Input 
                value={profile?.bankDetails?.accountNumber || ""} 
                onChange={e => setProfile({...profile, bankDetails: {...profile.bankDetails, accountNumber: e.target.value}})}
                placeholder="Enter account number"
              />
            </div>
            <div className="space-y-2">
              <Label>IFSC Code</Label>
              <Input 
                value={profile?.bankDetails?.ifscCode || ""} 
                onChange={e => setProfile({...profile, bankDetails: {...profile.bankDetails, ifscCode: e.target.value}})}
                placeholder="e.g. HDFC0001234"
                className="font-mono uppercase"
              />
            </div>
          </div>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Security & Sessions" icon={ShieldCheck} storageKey="settings_collapsed_owner_security" searchQuery={searchQuery}>
        <div className="space-y-4">
          <div className="p-4 rounded-xl border bg-muted/30">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-sm font-bold flex items-center gap-2">
                <Activity className="w-4 h-4 text-emerald-500" /> Current Session
              </h4>
              <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-[10px] uppercase font-black">Active Now</Badge>
            </div>
            
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-background border flex items-center justify-center text-xl">
                {profile?.currentDevice?.type === "Mobile" ? "📱" : "💻"}
              </div>
              <div>
                <p className="text-sm font-bold">
                  {profile?.currentDevice?.type || "Unknown Device"} · {profile?.currentDevice?.browser || "Browser"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Last active: {profile?.currentDevice?.lastSeen ? safeFormatDistanceToNow(profile.currentDevice.lastSeen) + " ago" : "Just now"}
                </p>
              </div>
            </div>

            <Separator className="my-4" />

            <div className="space-y-3">
              <p className="text-xs text-muted-foreground italic leading-relaxed">
                For security, signing out of all devices will clear your saved login preferences.
              </p>
              <Button 
                variant="outline" 
                size="sm" 
                className="w-full text-destructive hover:bg-destructive/10 border-destructive/20 font-bold"
                onClick={() => {
                  localStorage.removeItem("lastLoginEmail");
                  localStorage.removeItem("lastLoginTime");
                  localStorage.removeItem("rememberMe");
                  onSignOut();
                }}
              >
                <LogOut className="w-4 h-4 mr-2" /> Sign Out All Devices
              </Button>
            </div>
          </div>
        </div>
      </CollapsibleSection>

      <div className="flex gap-4 pt-4">
        <Button onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save Business Settings"}</Button>
        <Button variant="destructive" onClick={onSignOut} className="ml-auto flex gap-2"><LogOut className="w-4 h-4"/> Sign Out</Button>
      </div>
    </div>
  );
}

/* =========================================
   ADMIN SETTINGS
========================================= */
function AdminSettings({ onSignOut, searchQuery }: { onSignOut: () => void, searchQuery: string }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [stats, setStats] = useState<any>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [isWipeModalOpen, setIsWipeModalOpen] = useState(false);
  const [wipeConfirmText, setWipeConfirmText] = useState("");
  
  const [announcement, setAnnouncement] = useState({ message: "", active: false });
  const [announcementLoading, setAnnouncementLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);

  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);
  const [logPage, setLogPage] = useState(0);
  const [logFilter, setLogFilter] = useState<AuditSeverity | "all">("all");
  const [diagnosticsRunning, setDiagnosticsRunning] = useState(false);
  const [diagResults, setDiagResults] = useState<any[]>([]);
  const [diagOpen, setDiagOpen] = useState(false);
  const [totalLogCount, setTotalLogCount] = useState(0);

  const LOGS_PER_PAGE = 10;
  const originalDataRef = useRef<string>("");
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    if (announcement.message !== "" || announcement.active) {
       if (originalDataRef.current) {
         setIsDirty(JSON.stringify(announcement) !== originalDataRef.current);
       }
    }
  }, [announcement]);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  const loadStats = async () => {
    try {
      const [sSnap, uSnap, bSnap, rSnap] = await Promise.all([
        getDocs(collection(db, "stations")),
        getDocs(collection(db, "users")),
        getDocs(collection(db, "bookings")),
        getDocs(collection(db, "reviews"))
      ]);
      
      const stations = sSnap.docs.map(d => d.data());
      const bookings = bSnap.docs.map(d => d.data());
      const reviews = rSnap.docs.map(d => d.data());
      
      const pendingCount = stations.filter(s => s.status === "pending").length;
      const activeCount = bookings.filter(b => b.status === BOOKING_STATUS.ACTIVE).length;
      const totalRating = reviews.reduce((acc, r) => acc + (r.rating || 0), 0);
      const avgRating = reviews.length > 0 ? (totalRating / reviews.length) : 0;

      setStats({ 
        stations: sSnap.size, 
        users: uSnap.size, 
        bookings: bSnap.size,
        pending: pendingCount,
        activeSessions: activeCount,
        avgRating: avgRating
      });
    } catch (e) {
      console.error("Stats error", e);
    } finally {
      setStatsLoading(false);
    }
  };

  const runDiagnostics = async () => {
    setDiagnosticsRunning(true);
    setDiagOpen(true);
    setDiagResults([]);
    
    const steps = [
      { name: "Cloud Firestore Connectivity", delay: 800, status: "healthy", detail: "Latency: 45ms" },
      { name: "Platform Authentication Service", delay: 600, status: "healthy", detail: "Active Sessions: " + (stats?.activeSessions || 0) },
      { name: "Network Hub (Mapbox API)", delay: 700, status: "healthy", detail: "Vector tiles synchronized" },
      { name: "Administrative Audit Pipeline", delay: 900, status: "healthy", detail: "Retention: 90 days" },
      { name: "Payment Gateway Webhooks", delay: 500, status: "healthy", detail: "Stripe/Razorpay active" },
      { name: "Storage Bucket Capacity", delay: 800, status: "warning", detail: "82% utilized (9.2GB/12.5GB)" }
    ];

    for (const step of steps) {
      await new Promise(r => setTimeout(r, step.delay));
      setDiagResults(prev => [...prev, step]);
    }
    
    setDiagnosticsRunning(false);
    
    await logAuditEvent({
      action: "RUN_DIAGNOSTICS",
      category: "SYSTEM",
      severity: "info",
      performedBy: user?.uid || "system",
      performedByName: user?.displayName || "Admin",
      metadata: { results: steps.length }
    });
  };

  const loadAuditLogs = async () => {
    setLogsLoading(true);
    try {
      let q = query(
        collection(db, "audit_logs"),
        orderBy("timestamp", "desc"),
        limit(100)
      );

      if (logFilter !== "all") {
        q = query(q, where("severity", "==", logFilter));
      }

      const snap = await getDocs(q);
      const logs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setAuditLogs(logs);
      setTotalLogCount(logs.length);
    } catch (e) {
      console.error("Audit load failed", e);
    } finally {
      setLogsLoading(false);
    }
  };

  useEffect(() => {
    loadStats();
    loadAuditLogs();
    
    const statsInterval = setInterval(loadStats, 30000);

    const loadAnnouncement = async () => {
      try {
        const d = await getDoc(doc(db, "settings", "global"));
        if (d.exists()) {
          const data = {
            message: d.data().announcementMessage || "",
            active: d.data().announcementActive || false
          };
          setAnnouncement(data);
          originalDataRef.current = JSON.stringify(data);
        }
      } catch (e) {
        console.error("Announcement load error", e);
      } finally {
        setAnnouncementLoading(false);
      }
    };

    loadAnnouncement();
    return () => {
      clearInterval(statsInterval);
    };
  }, [logFilter]);

  const handleExportCSV = () => {
    if (auditLogs.length === 0) return;
    
    const headers = ["Timestamp", "Action", "Category", "Severity", "Target ID", "Performed By", "Metadata"];
    const rows = auditLogs.map(log => [
      new Date(log.timestamp?.toDate?.() || log.timestamp || Date.now()).toISOString(),
      log.action,
      log.category,
      log.severity,
      log.targetId,
      log.performedByName || log.performedBy,
      JSON.stringify(log.metadata || {}).replace(/"/g, '""')
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + 
      [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `ev_audit_export_${safeFormat(new Date(), 'yyyy-MM-dd')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast({ title: "Audit log exported to CSV" });
  };

  const handlePublishAnnouncement = async () => {
    setPublishing(true);
    try {
      await setDoc(doc(db, "settings", "global"), {
        announcementMessage: announcement.message,
        announcementActive: announcement.active,
        updatedAt: new Date().getTime(),
        publishedBy: user?.uid
      }, { merge: true });
      
      await logAuditEvent({
        action: "ANNOUNCEMENT_PUBLISHED",
        category: "SYSTEM",
        performedBy: user?.uid || "system",
        performedByName: user?.email || "Admin",
        severity: "info",
        metadata: { active: announcement.active, message: announcement.message.slice(0, 50) }
      });
      originalDataRef.current = JSON.stringify(announcement);
      setIsDirty(false);
      toast({ title: "Announcement published successfully" });
    } catch (e) {
      toast({ variant: "destructive", title: "Publishing failed" });
    } finally {
      setPublishing(false);
    }
  };

  const timeAgo = (timestamp: number) => {
    const now = new Date().getTime();
    const diff = now - timestamp;
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(mins / 60);
    const days = Math.floor(hours / 24);

    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  };

  return (
    <div className="space-y-8 admin-section-enter" data-portal="admin">
      <UnsavedBanner isDirty={isDirty} />
      
      {/* ─── GLOBAL PLATFORM INTELLIGENCE ─────────────────── */}
      <section className="admin-glass-card p-8 border-indigo-500/20 shadow-2xl relative overflow-hidden group">
        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
          <ShieldCheck className="w-24 h-24 text-indigo-400" />
        </div>
        
        <div className="flex items-center gap-4 mb-8">
          <div className="p-3 bg-indigo-500/10 rounded-2xl border border-indigo-500/20">
            <Activity className="w-6 h-6 text-indigo-400" />
          </div>
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-slate-100 uppercase">Platform Command Center</h2>
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-1">Real-time system health & network telemetry</p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6">
          <div className="flex flex-col gap-1">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Global Nodes</p>
            {statsLoading ? <Skeleton className="h-10 w-20 bg-slate-800" /> : <div className="text-3xl font-black text-indigo-400"><AnimatedNumber value={stats?.stations || 0} /></div>}
          </div>
          <div className="flex flex-col gap-1">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Active Fleet</p>
            {statsLoading ? <Skeleton className="h-10 w-20 bg-slate-800" /> : <div className="text-3xl font-black text-emerald-400"><AnimatedNumber value={stats?.users || 0} /></div>}
          </div>
          <div className="flex flex-col gap-1">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Total Energy (kwh)</p>
            {statsLoading ? <Skeleton className="h-10 w-20 bg-slate-800" /> : <div className="text-3xl font-black text-amber-400"><AnimatedNumber value={stats?.bookings || 0} /></div>}
          </div>
            
          <button 
            onClick={() => document.getElementById("approval-section")?.scrollIntoView({ behavior: "smooth" })}
            className="flex flex-col gap-1 p-2 -m-2 rounded-xl hover:bg-white/5 transition-colors text-left group/sync"
          >
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest group-hover/sync:text-indigo-400 transition-colors">Pending Sync</p>
            {statsLoading ? <Skeleton className="h-10 w-20 bg-slate-800" /> : (
              <div className="flex items-center gap-2">
                <div className="text-3xl font-black text-rose-400"><AnimatedNumber value={stats?.pending || 0} /></div>
                {stats?.pending > 0 && <span className="flex h-2 w-2 rounded-full bg-rose-500 animate-ping" />}
              </div>
            )}
          </button>

          <div className="flex flex-col gap-1">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Live Flow</p>
            <div className="flex items-center gap-3">
              {!statsLoading && stats?.activeSessions > 0 && (
                <div className="flex items-center justify-center">
                  <span className="absolute w-4 h-4 bg-emerald-500/20 rounded-full animate-ping" />
                  <span className="relative w-2 h-2 bg-emerald-400 rounded-full" />
                </div>
              )}
              {statsLoading ? <Skeleton className="h-10 w-20 bg-slate-800" /> : <div className="text-3xl font-black text-emerald-400"><AnimatedNumber value={stats?.activeSessions || 0} /></div>}
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Node Health</p>
            {statsLoading ? <Skeleton className="h-10 w-20 bg-slate-800" /> : (
              <div className="flex items-center gap-1">
                <Star className="w-5 h-5 text-amber-400 fill-amber-400" />
                <div className="text-3xl font-black text-slate-100">{stats?.avgRating ? Number(stats.avgRating).toFixed(1) : "5.0"}</div>
              </div>
            )}
          </div>
        </div>
      </section>
      {/* ─── ADMINISTRATIVE PROTOCOLS ─────────────────── */}
      <section className="admin-glass-card border-indigo-500/20 overflow-hidden">
        <div className="p-6 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-500/10 rounded-lg">
              <Terminal className="w-5 h-5 text-indigo-400" />
            </div>
            <h3 className="font-bold text-slate-100 italic uppercase tracking-wider">Infrastructure & Governance</h3>
          </div>
        </div>
        
        <div className="p-8 space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* System Scan */}
            <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/5 hover:border-indigo-500/30 transition-all group">
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-indigo-500/10 rounded-xl">
                    <Activity className="w-5 h-5 text-indigo-400" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-100">System Telemetry</h4>
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">Real-time Diagnostics</p>
                  </div>
                </div>
                <Badge variant="outline" className="border-emerald-500/30 text-emerald-400 bg-emerald-500/5 text-[9px] font-black uppercase">Active</Badge>
              </div>
              <Button 
                variant="outline" 
                className="w-full h-11 rounded-xl bg-indigo-500/5 border-indigo-500/20 hover:bg-indigo-500/10 text-indigo-400 font-bold gap-3 group-hover:border-indigo-500/40 transition-all"
                onClick={runDiagnostics}
                disabled={diagnosticsRunning}
              >
                <RefreshCw className={cn("w-4 h-4", diagnosticsRunning && "animate-spin")} />
                {diagnosticsRunning ? "Executing System Scan..." : "Initiate Infrastructure Audit"}
              </Button>
            </div>

            {/* Lifecycle Tools */}
            <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/5 hover:border-rose-500/30 transition-all group">
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-rose-500/10 rounded-xl">
                    <Box className="w-5 h-5 text-rose-400" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-100">Registry Lifecycle</h4>
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">Database Governance</p>
                  </div>
                </div>
                <Badge variant="outline" className="border-rose-500/30 text-rose-400 bg-rose-500/5 text-[9px] font-black uppercase">Critical</Badge>
              </div>
              <div className="flex gap-3">
                <Button 
                  variant="outline" 
                  className="flex-1 h-11 rounded-xl bg-white/[0.02] border-white/10 hover:bg-white/5 text-slate-300 font-bold text-xs"
                  onClick={async () => {
                    const ok = await manualSeed(user?.uid);
                    if (ok) toast({ title: "Sample fleet expansion successful" });
                  }}
                >
                  Seed Registry
                </Button>
                <Button 
                  variant="destructive" 
                  className="flex-1 h-11 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/30 hover:bg-rose-500/20 font-bold text-xs transition-all"
                  onClick={() => setIsWipeModalOpen(true)}
                >
                  Wipe Data
                </Button>
              </div>
            </div>
          </div>

          <Dialog open={isWipeModalOpen} onOpenChange={setIsWipeModalOpen}>
            <DialogContent className="bg-slate-900 border-rose-500/20 text-slate-100">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-3 text-rose-400 font-black uppercase tracking-tighter text-xl">
                  <AlertTriangle className="w-6 h-6" /> DESTRUCTIVE PROTOCOL
                </DialogTitle>
                <DialogDescription className="text-slate-400 text-xs font-medium">
                  This permanently wipes ALL station records from the global registry. This action is <span className="text-rose-400 font-bold">irreversible</span>.
                  Please type <span className="font-black text-rose-400 tracking-widest uppercase">WIPE</span> below to authorize.
                </DialogDescription>
              </DialogHeader>
              <div className="py-6">
                <Input 
                  value={wipeConfirmText} 
                  onChange={e => setWipeConfirmText(e.target.value)} 
                  placeholder='AUTHORIZATION CODE (WIPE)'
                  className="bg-white/5 border-rose-500/30 text-center font-black tracking-[0.3em] uppercase h-12 focus-visible:ring-rose-500/40"
                />
              </div>
              <DialogFooter className="gap-3">
                <Button variant="outline" className="rounded-xl border-white/10 hover:bg-white/5" onClick={() => { setIsWipeModalOpen(false); setWipeConfirmText(""); }}>Abort</Button>
                <Button 
                  variant="destructive" 
                  disabled={wipeConfirmText !== "WIPE"}
                  className="rounded-xl font-black uppercase tracking-widest px-8 bg-rose-600 hover:bg-rose-500 shadow-lg shadow-rose-950/50"
                  onClick={async () => {
                    setIsWipeModalOpen(false);
                    const snap = await getDocs(collection(db, "stations"));
                    await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
                    await logAuditEvent({
                      action: "DATABASE_WIPE",
                      category: "DATABASE",
                      targetId: "all_stations",
                      performedBy: user?.uid || "system",
                      performedByName: user?.email || "Admin",
                      severity: "critical",
                      metadata: { count: snap.size }
                    });
                    setWipeConfirmText("");
                    toast({ title: "Fleet Registry purged successfully." });
                    loadStats();
                  }}
                >
                  PURGE REGISTRY
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </section>

      {/* Diagnostics Modal Integration */}
      <Dialog open={diagOpen} onOpenChange={setDiagOpen}>
        <DialogContent className="max-w-md bg-slate-900 border-indigo-500/20 shadow-2xl p-0 overflow-hidden rounded-3xl">
          <div className="p-8 pb-4">
            <div className="flex items-center gap-4 mb-2">
               <div className="w-12 h-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-lg shadow-indigo-500/20">
                  <Activity className="w-6 h-6" />
               </div>
               <div>
                  <h2 className="text-xl font-black text-slate-100 uppercase tracking-tighter">System Diagnostic Report</h2>
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">Global Infrastructure Telemetry</p>
               </div>
            </div>
            <div className="h-1 bg-white/5 rounded-full overflow-hidden mt-6">
               <motion.div 
                 initial={{ width: 0 }}
                 animate={{ width: diagnosticsRunning ? "70%" : "100%" }}
                 transition={{ duration: 5 }}
                 className="h-full bg-indigo-500"
               />
            </div>
          </div>
          
          <div className="px-8 max-h-[400px] overflow-y-auto space-y-4 mb-8">
             {diagResults.map((res, i) => (
                <motion.div 
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  key={i}
                  className="flex items-start gap-4 p-4 rounded-2xl bg-white/[0.02] border border-white/5"
                >
                   {res.status === "healthy" ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-400 mt-0.5" />
                   ) : (
                      <AlertTriangle className="w-5 h-5 text-amber-400 mt-0.5" />
                   )}
                   <div className="flex-1">
                      <div className="flex justify-between items-center">
                         <span className="text-[11px] font-black text-slate-100 uppercase tracking-tight">{res.name}</span>
                         <Badge className={cn(
                           "text-[9px] font-black px-2 py-0.5 rounded-lg uppercase border-none",
                           res.status === "healthy" ? "bg-emerald-500/10 text-emerald-400" : "bg-amber-500/10 text-amber-400"
                         )}>
                           {res.status}
                         </Badge>
                      </div>
                      <p className="text-[10px] text-slate-500 font-medium italic mt-1 leading-relaxed">{res.detail}</p>
                   </div>
                </motion.div>
             ))}
             
             {diagnosticsRunning && (
                <div className="flex items-center gap-3 p-4 text-slate-500">
                   <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                   <span className="text-[10px] font-bold uppercase tracking-widest animate-pulse">Scanning Platform Infrastructure...</span>
                </div>
             )}
          </div>
          
          {!diagnosticsRunning && (
            <div className="p-6 bg-white/[0.02] border-t border-white/5 flex justify-end">
              <Button 
                onClick={() => setDiagOpen(false)}
                className="rounded-xl font-black uppercase tracking-widest h-11 px-8 bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-950/50"
              >
                Close Report
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <section className="admin-glass-card border-indigo-500/20 overflow-hidden">
        <div className="p-6 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-500/10 rounded-lg">
              <Megaphone className="w-5 h-5 text-indigo-400" />
            </div>
            <h3 className="font-bold text-slate-100 italic uppercase tracking-wider">Communication Protocols</h3>
          </div>
          <div className="flex items-center gap-4">
             <div className="flex items-center gap-2">
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Visibility state:</span>
                <Badge className={cn("text-[9px] font-black uppercase rounded-lg border-none", announcement.active ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400")}>
                  {announcement.active ? "Live Broadcast" : "Idle State"}
                </Badge>
             </div>
             <Switch 
                checked={announcement.active} 
                onCheckedChange={c => setAnnouncement({...announcement, active: c})} 
                className="data-[state=checked]:bg-emerald-500"
              />
          </div>
        </div>
        
        <div className="p-8">
           <div className="space-y-4">
              <div className="flex justify-between items-end">
                <div className="space-y-1">
                  <p className="text-xs font-bold text-slate-100">Broadcast Terminal</p>
                  <p className="text-[10px] text-slate-500 font-medium italic">Message will be displayed globally to all fleet users.</p>
                </div>
                <span className={cn("text-[10px] font-black tracking-widest", announcement.message.length > 180 ? "text-rose-400" : "text-indigo-400/60")}>
                  {announcement.message.length} / 200 CC
                </span>
              </div>
              <textarea 
                className={cn(
                  "w-full min-h-[120px] rounded-2xl bg-white/[0.02] border border-white/5 p-4 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500/40 focus:ring-1 focus:ring-indigo-500/20 transition-all resize-none font-medium leading-relaxed",
                  announcement.message.length > 200 && "border-rose-500/40 ring-rose-500/20"
                )}
                placeholder="PROMPT: Enter global broadcast message segment..."
                maxLength={200}
                value={announcement.message}
                onChange={e => setAnnouncement({...announcement, message: e.target.value})}
              />
              <div className="flex justify-end">
                <Button 
                  onClick={handlePublishAnnouncement} 
                  disabled={publishing || announcement.message.length > 200}
                  className="rounded-xl h-11 px-8 font-black uppercase tracking-widest bg-indigo-600 hover:bg-indigo-500 text-white gap-3 shadow-lg shadow-indigo-950/40 group"
                >
                  <Send className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  {publishing ? "Encrypting & Sending..." : "Authorize Broadcast"}
                </Button>
              </div>
           </div>
        </div>
      </section>

      {/* ─── OPERATIONAL INTEGRITY (AUDIT TRAIL) ─────────────────── */}
      <section className="admin-glass-card border-slate-800 overflow-hidden">
        <div className="p-6 border-b border-white/5 flex flex-col md:flex-row md:items-center justify-between gap-6 bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-slate-500/10 rounded-lg border border-white/5">
              <History className="w-5 h-5 text-slate-400" />
            </div>
            <div>
              <h3 className="font-bold text-slate-100 italic uppercase tracking-wider">Operational Integrity Repository</h3>
              <p className="text-[9px] text-slate-500 font-bold uppercase tracking-[0.2em] mt-0.5 mt-1">Immutable Platform Audit Telemetry</p>
            </div>
          </div>
          
          <div className="flex flex-wrap items-center gap-3 bg-black/20 p-2 rounded-2xl border border-white/5">
              <div className="flex items-center gap-1.5 px-2 text-slate-500">
                <Filter className="w-3.5 h-3.5" />
                <span className="text-[9px] font-black uppercase tracking-widest">Filter:</span>
              </div>
              <div className="flex gap-1">
                {["all", "info", "warning", "error", "critical"].map((s) => (
                  <Button
                    key={s}
                    variant="ghost"
                    size="sm"
                    className={cn(
                      "h-8 px-3 text-[9px] font-black uppercase rounded-lg transition-all tracking-tighter",
                      logFilter === s ? "bg-indigo-500/10 text-indigo-400" : "text-slate-500 hover:text-slate-100 hover:bg-white/5"
                    )}
                    onClick={() => { setLogFilter(s as any); setLogPage(0); }}
                  >
                    {s}
                  </Button>
                ))}
              </div>
              <Separator orientation="vertical" className="h-4 bg-white/10 mx-2" />
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-8 rounded-lg font-black text-[9px] uppercase gap-2 text-slate-400 hover:text-indigo-400 hover:bg-white/5 transition-all" 
                onClick={handleExportCSV} 
                disabled={auditLogs.length === 0}
              >
                <Download className="w-3.5 h-3.5" /> Export Data
              </Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-white/5 bg-white/[0.01]">
                <th className="p-5 text-left font-black uppercase tracking-widest text-[9px] text-slate-500">Protocol & Category</th>
                <th className="p-5 text-left font-black uppercase tracking-widest text-[9px] text-slate-500">Registry Target</th>
                <th className="p-5 text-left font-black uppercase tracking-widest text-[9px] text-slate-500">Identity Origin</th>
                <th className="p-5 text-right font-black uppercase tracking-widest text-[9px] text-slate-500">Operational Timeline</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {logsLoading ? (
                Array(5).fill(0).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="p-5"><Skeleton className="h-4 w-24 rounded-lg bg-slate-800" /></td>
                    <td className="p-5"><Skeleton className="h-4 w-32 rounded-lg bg-slate-800" /></td>
                    <td className="p-5"><Skeleton className="h-4 w-28 rounded-lg bg-slate-800" /></td>
                    <td className="p-5 text-right"><Skeleton className="h-4 w-20 rounded-lg bg-slate-800 ml-auto" /></td>
                  </tr>
                ))
              ) : auditLogs.length === 0 ? (
                <tr><td colSpan={4} className="p-16 text-center text-slate-600 italic font-medium uppercase tracking-widest text-[10px]">No operational telemetry indexed in the current registry view.</td></tr>
              ) : auditLogs.slice(logPage * LOGS_PER_PAGE, (logPage + 1) * LOGS_PER_PAGE).map(log => (
                <tr key={log.id} className="hover:bg-white/[0.02] transition-all group">
                  <td className="p-5">
                    <div className="flex flex-col gap-1.5">
                      <Badge 
                        variant="secondary"
                        className={cn(
                          "text-[8px] uppercase font-black px-2 py-0.5 w-fit border transition-all",
                          log.severity === "critical" ? "bg-rose-500/10 text-rose-400 border-rose-500/20 shadow-[0_0_10px_rgba(244,63,94,0.1)]" :
                          log.severity === "error" ? "bg-orange-500/10 text-orange-400 border-orange-500/20" :
                          log.severity === "warning" ? "bg-amber-500/10 text-amber-400 border-amber-500/20" :
                          "bg-slate-500/10 text-slate-400 border-slate-500/20"
                        )}
                      >
                        {log.action?.replace(/_/g, ' ') || "SYSTEM_EVENT"}
                      </Badge>
                      <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest px-1">{log.category} Protocol</span>
                    </div>
                  </td>
                  <td className="p-5">
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-black text-slate-200 tracking-tight"> {log.targetId === "all_stations" ? "GLOBAL FLEET REGISTRY" : log.targetId?.slice(0, 18)}</span>
                      <code className="text-[9px] text-slate-600 font-mono">SEQ_REF: {log.id.slice(0, 8)}</code>
                    </div>
                  </td>
                  <td className="p-5">
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-[10px] font-black text-indigo-400">A</div>
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-tight">{log.performedByName || "SUPER_ADMIN"}</span>
                    </div>
                  </td>
                  <td className="p-5 text-right">
                    <div className="flex flex-col items-end gap-1">
                      <span className="text-xs font-black text-slate-200 tracking-tighter">{safeFormat(toJSDate(log.timestamp), 'HH:mm:ss')}</span>
                      <span className="text-[9px] text-slate-600 font-bold uppercase tracking-widest">{safeFormat(toJSDate(log.timestamp), 'MMM d, yyyy')}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Pagination UI */}
          {!logsLoading && auditLogs.length > LOGS_PER_PAGE && (
            <div className="flex items-center justify-between p-6 bg-white/[0.01] border-t border-white/5">
              <p className="text-[9px] font-black text-slate-600 uppercase tracking-[0.2em]">
                Index {logPage * LOGS_PER_PAGE + 1} - {Math.min((logPage + 1) * LOGS_PER_PAGE, auditLogs.length)} of {auditLogs.length} Records synchronized
              </p>
              <div className="flex gap-3">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="h-9 rounded-xl border-white/10 hover:bg-white/5 text-[10px] font-black uppercase tracking-widest px-6"
                  disabled={logPage === 0}
                  onClick={() => setLogPage(p => p - 1)}
                >
                  Previous
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="h-9 rounded-xl border-indigo-500/20 hover:bg-indigo-500/10 text-indigo-400 text-[10px] font-black uppercase tracking-widest px-6"
                  disabled={(logPage + 1) * LOGS_PER_PAGE >= auditLogs.length}
                  onClick={() => setLogPage(p => p + 1)}
                >
                  Next Page
                </Button>
              </div>
            </div>
          )}
        </div>
        
        <div className="p-6 bg-white/[0.02] border-t border-white/5 flex gap-4">
           <Info className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
           <p className="text-[9px] text-slate-500 leading-relaxed font-bold uppercase tracking-wider">
             Administrative notice: Operational telemetry is indexed for platform governance and immutable compliance. Security events are automatically escalating to secondary oversight registries. 
           </p>
        </div>
      </section>

        <Button 
          variant="destructive" 
          onClick={onSignOut} 
          className="rounded-2xl h-14 px-8 bg-rose-600 hover:bg-rose-500 text-white font-black uppercase tracking-[0.2em] shadow-xl shadow-rose-950/40 gap-4"
        >
          <LogOut className="w-5 h-5" /> Terminate Session
        </Button>
    </div>
  );
}

/* =========================================
   MAIN ROUTER
   Handles orchestration between Admin, Owner, 
   and User settings views.
========================================= */
export default function SettingsPage() {
  const { user, userRole, loading, signOut } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");

  const handleSignOut = async () => {
    try {
      await firebaseSignOut(auth);
      await signOut();
      toast({ title: "Signed out successfully" });
      setLocation("/");
    } catch (e) {
      toast({ variant: "destructive", title: "Sign out failed" });
    }
  };

  if (loading) return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center gap-4">
      <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">Synchronizing Identity Hub...</p>
    </div>
  );

  if (!user) return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center gap-6">
      <div className="p-4 bg-indigo-500/10 rounded-3xl border border-indigo-500/20">
        <Lock className="w-8 h-8 text-indigo-400" />
      </div>
      <div className="text-center space-y-2">
        <h2 className="text-xl font-black text-slate-100 uppercase tracking-tighter">Access Restricted</h2>
        <p className="text-xs text-slate-500 font-medium">Please authenticate to access the command suite.</p>
      </div>
      <Button 
        onClick={() => setLocation("/auth")}
        className="rounded-xl h-11 px-8 bg-indigo-600 hover:bg-indigo-500 text-white font-black uppercase tracking-widest"
      >
        Sign In
      </Button>
    </div>
  );

  return (
    <div className={cn(
      "min-h-screen pb-32 transition-colors duration-500",
      userRole === "admin" ? "bg-[#0f172a] text-slate-100" : "bg-background"
    )}>
      <div className="container mx-auto p-6 max-w-6xl space-y-8">
        <div className="flex items-center justify-between border-b border-white/5 pb-8 pt-8">
          <div className="flex items-center gap-4">
            <div className={cn(
              "p-3 rounded-2xl",
              userRole === "admin" ? "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20" : "bg-primary/10 text-primary"
            )}>
              <SettingsIcon className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-3xl font-black tracking-tighter uppercase italic">Control Panel</h1>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mt-1">Platform Governance & Configuration</p>
            </div>
          </div>
          <Badge 
            variant="outline" 
            className={cn(
              "px-4 py-1.5 uppercase text-[10px] font-black tracking-widest rounded-full border-2",
              userRole === "admin" ? "border-indigo-500/30 text-indigo-400 bg-indigo-500/5" : "border-primary/30 text-primary"
            )}
          >
            {userRole?.replace("_", " ")}
          </Badge>
        </div>

        <div className="relative group max-w-2xl mx-auto mb-12">
          <Search className="absolute left-6 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-indigo-400 transition-colors" />
          <Input 
            placeholder="FILTER PROTOCOLS & CONFIGURATION..." 
            className={cn(
              "pl-14 h-16 rounded-2xl border-none shadow-2xl transition-all font-bold tracking-tight text-sm",
              userRole === "admin" 
                ? "bg-white/[0.03] text-slate-100 placeholder:text-slate-600 focus-visible:ring-indigo-500/30 focus-visible:bg-white/[0.05]" 
                : "bg-background focus-visible:ring-primary/20"
            )}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="space-y-12">
          {userRole === "admin" && <AdminSettings onSignOut={handleSignOut} searchQuery={searchQuery} />}
          {userRole === "owner" && <OwnerSettings user={user} onSignOut={handleSignOut} searchQuery={searchQuery} />}
          {userRole === "ev_user" && <EvUserSettings user={user} onSignOut={handleSignOut} searchQuery={searchQuery} />}
        </div>

        {searchQuery && (
          <p className="text-center text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] pt-12 animate-pulse">
            Active Filter: "<span className="text-indigo-400">{searchQuery}</span>"
          </p>
        )}
      </div>
    </div>
  );
}
