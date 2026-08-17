import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { useLocation } from "wouter";
import { db } from "@/lib/firebase";
import { collection, addDoc, query, where, onSnapshot, deleteDoc, doc, getDoc, getDocs, setDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { getEarnedMilestones, calculateImpact, MILESTONES } from "@/lib/gamification";
import { 
  User, Settings, LogOut, ChevronRight, Car, 
  Plus, Fuel, Zap, PenLine, Sparkles, 
  Leaf, TreeDeciduous, Award, History, Info, Heart, Pencil, Cog,
  BatteryCharging, TrendingUp, MapPin, Bell
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, 
  Tooltip as ReTooltip, ResponsiveContainer, AreaChart, Area, BarChart, Bar, Cell 
} from "recharts";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetDescription } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";
import { AnimatePresence, motion } from "framer-motion";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { computeStreak, getISOWeekInfo } from "@/lib/streak-engine";
import { StreakCard } from "@/components/StreakCard";
import { getISOWeek, getISOWeekYear } from "date-fns";
import { NotificationPreferencesPanel } from "@/components/NotificationPreferencesPanel";
import ReferralCard from "@/components/ReferralCard";
const BRANDS = {
  Indian: ["Tata Motors", "Mahindra", "MG Motor", "Ather Energy", "Ola Electric", "Hero Electric", "TVS Motor", "Bajaj Auto"],
  Global: ["Tesla", "BYD", "Hyundai", "Kia", "BMW", "Mercedes", "Audi", "Volvo"]
};

const BRAND_MODELS: Record<string, string[]> = {
  "Tata Motors": ["Nexon EV", "Tiago EV", "Punch EV", "Tigor EV"],
  "Mahindra": ["XUV400 EV", "e-Verito"],
  "MG Motor": ["ZS EV", "Comet EV"],
  "Hyundai": ["Kona Electric", "IONIQ 5"],
  "Tesla": ["Model 3", "Model Y", "Model S"],
  "Ather Energy": ["450X", "450S"],
  "Ola Electric": ["S1 Pro", "S1 Air", "S1 X"],
  "BYD": ["Atto 3", "e6", "Seal"],
};

const MODEL_DEFAULTS: Record<string, string> = {
  "Nexon EV": "CCS",
  "Model 3": "CCS",
  "Leaf": "CHAdeMO",
  "ZS EV": "CCS",
  "450X": "Type 2",
  "Atto 3": "CCS",
  "IONIQ 5": "CCS",
};

export default function UserProfile() {
  const { user, userRole, loading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [cars, setCars] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [userName, setUserName] = useState("");
  const [primaryVehicleId, setPrimaryVehicleId] = useState<string | null>(null);
  const [editingCarId, setEditingCarId] = useState<string | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [efficiencyMode, setEfficiencyMode] = useState<"City" | "Highway" | "Mixed">("Mixed");
  const [stats, setStats] = useState({ sessions: 0, kwh: 0, co2: 0, totalSpend: 0 });
  const [favoriteStations, setFavoriteStations] = useState<any[]>([]);
  const [favsLoading, setFavsLoading] = useState(false);
  const [chartData, setChartData] = useState<any[]>([]);
  const [userData, setUserData] = useState<any>(null);
  const [sessions, setSessions] = useState<any[]>([]);
  const [streakInfo, setStreakInfo] = useState<any>(null);
  
  const [formData, setFormData] = useState({
    brand: "",
    model: "",
    year: new Date().getFullYear(),
    batteryCapacity: 60,
    chargeType: "CCS" as const,
    licensePlate: "",
  });

  // Gamification Metrics — computed from real stats
  const totalKwh = stats.kwh || 0;
  const impact = calculateImpact(totalKwh);
  const earnedMilestones = getEarnedMilestones({ 
     bookings: stats.sessions, 
     kwh: totalKwh, 
     co2: stats.co2 
  });

  useEffect(() => {
    if (MODEL_DEFAULTS[formData.model]) {
      setFormData(prev => ({ ...prev, chargeType: MODEL_DEFAULTS[formData.model] as any }));
    }
  }, [formData.model]);

  useEffect(() => {
    if (!user) return;
    const unsubUser = onSnapshot(doc(db, "users", user.uid), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setUserData(data);
        setUserName(data.name || user.displayName || "");
        setPrimaryVehicleId(data.primaryVehicleId || null);
        
        // Fetch Favorite Station Details
        const favIds = data.favoriteStations || [];
        if (favIds.length > 0) {
          setFavsLoading(true);
          const fetchFavs = async () => {
             const stationDocs = await Promise.all(favIds.map((id: string) => getDoc(doc(db, "stations", id))));
             const stationData = stationDocs.filter(d => d.exists()).map(d => {
                const data = d.data() as any;
                const connectors = (data.connectors || []).map((c: any, index: number) => ({
                  ...c,
                  id: c.id || `conn-${index}-${c.type || 'unknown'}`
                }));
                return { id: d.id, ...data, connectors };
              });
             setFavoriteStations(stationData);
             setFavsLoading(false);
          };
          fetchFavs();
        } else {
          setFavoriteStations([]);
        }
      }
    });

    const unsubCars = onSnapshot(query(collection(db, "users", user.uid, "ev_vehicles")), (snapshot) => {
      setCars(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const fetchStats = async () => {
      // Fetch ALL completed bookings for streak and stats
      const q = query(
        collection(db, "bookings"), 
        where("userId", "==", user.uid), 
        where("status", "in", ["completed", "COMPLETED"])
      );
      const snap = await getDocs(q);
      
      const sessionList = snap.docs.map(d => {
        const b = d.data();
        return {
          startTime: b.startTime?.toDate ? b.startTime.toDate() : new Date(b.startTime),
          status: b.status
        };
      });
      setSessions(sessionList);

      let totalKwh = 0;
      let totalSpend = 0;
      const dailyData: Record<string, number> = {};
      
      // Initialize last 7 days
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        dailyData[d.toLocaleDateString('en-US', { weekday: 'short' })] = 0;
      }

      snap.docs.forEach(d => {
        const b = d.data();
        const kwh = (b.energyDeliveredKwh || b.energyConsumedContent || 0);
        totalKwh += kwh;
        totalSpend += (b.totalPrice || 0);
        
        const bDate = b.startTime?.toDate ? b.startTime.toDate() : new Date(b.startTime);
        const dateKey = bDate.toLocaleDateString('en-US', { weekday: 'short' });
        if (dailyData[dateKey] !== undefined) {
          dailyData[dateKey] += kwh;
        }
      });

      setStats({
        sessions: snap.size,
        kwh: Math.round(totalKwh),
        co2: Math.round(totalKwh * 0.708),
        totalSpend: Math.round(totalSpend)
      });

      setChartData(Object.entries(dailyData).map(([name, kwh]) => ({ name, kwh })));
    };
    fetchStats();

    return () => { unsubUser(); unsubCars(); };
  }, [user]);

  // Streak Computation & Sync Effect
  useEffect(() => {
    if (!user || !userData || sessions.length === 0) return;

    const streak = computeStreak(
      sessions,
      userData.chargeStreak || 0,
      userData.lastChargeWeek || 0,
      userData.lastChargeYear || 0,
      userData.longestStreak || 0
    );

    setStreakInfo(streak);

    const hasChanged = 
      streak.currentStreak !== (userData.chargeStreak || 0) ||
      streak.longestStreak !== (userData.longestStreak || 0) ||
      streak.lastChargeWeek !== (userData.lastChargeWeek || 0) ||
      streak.lastChargeYear !== (userData.lastChargeYear || 0);

    if (hasChanged) {
      updateDoc(doc(db, "users", user.uid), {
        chargeStreak: streak.currentStreak,
        longestStreak: streak.longestStreak,
        lastChargeWeek: streak.lastChargeWeek,
        lastChargeYear: streak.lastChargeYear
      });
    }
  }, [user, userData, sessions]);

  const handleSetPrimary = async (carId: string) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, "users", user.uid), { primaryVehicleId: carId });
      toast({ title: "Primary Vehicle Updated" });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message });
    }
  };

  const handleSaveCar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setLoading(true);
    try {
      if (editingCarId) {
        await updateDoc(doc(db, "users", user.uid, "ev_vehicles", editingCarId), {
          ...formData, updatedAt: serverTimestamp(),
        });
      } else {
        const docRef = await addDoc(collection(db, "users", user.uid, "ev_vehicles"), {
          ...formData, createdAt: serverTimestamp(),
        });
        if (!primaryVehicleId) await handleSetPrimary(docRef.id);
      }
      setIsSheetOpen(false);
      setFormData({ brand: "", model: "", year: 2024, batteryCapacity: 60, chargeType: "CCS", licensePlate: "" });
      setEditingCarId(null);
      toast({ title: "Vehicle saved!" });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteCar = async (carId: string) => {
    if (!user) return;
    await deleteDoc(doc(db, "users", user.uid, "ev_vehicles", carId));
    if (primaryVehicleId === carId) await updateDoc(doc(db, "users", user.uid), { primaryVehicleId: null });
    toast({ title: "Vehicle removed" });
  };

  return (
    <div className="min-h-screen bg-[#0f172a] text-white flex flex-col pb-32 pt-[var(--safe-top)]">
      {/* Premium Header */}
      <header className="px-6 pt-6 pb-8 space-y-4">
        <div className="flex justify-between items-start">
          <div className="space-y-1">
             <div className="flex items-center gap-2">
             <h1 className="text-3xl font-black">Profile</h1>
               <Badge className="bg-emerald-500/20 text-emerald-400 border-none px-2 rounded-lg font-black text-[10px] uppercase">Pro</Badge>
             </div>
             <p className="text-white/40 font-bold opacity-80">Welcome back, {user?.displayName}</p>
          </div>
          <Button variant="ghost" size="icon" className="rounded-full bg-white/5 border border-white/10" onClick={() => setLocation("/settings")}>
            <Settings className="w-5 h-5" />
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 space-y-10 overflow-x-hidden">
        
        {/* Achievements Section (Horizontal Scroll) */}
        <section className="space-y-4">
           <div className="px-6 flex justify-between items-center">
              <h2 className="text-xs font-black uppercase tracking-widest text-white/40 flex items-center gap-2">
                 <Award className="w-3.5 h-3.5" /> Achievements
              </h2>
              <span className="text-[10px] font-black text-emerald-400">{earnedMilestones.length}/{MILESTONES.length}</span>
           </div>
           
           <div className="flex gap-4 overflow-x-auto px-6 no-scrollbar pb-2">
              {MILESTONES.map((m) => {
                 const isEarned = earnedMilestones.some(em => em.id === m.id);
                 return (
                    <motion.div 
                       key={m.id}
                       whileTap={{ scale: 0.95 }}
                       className={`milestone-card min-w-[140px] ${isEarned ? 'earned' : 'locked'}`}
                    >
                       <div className="text-3xl mb-3 drop-shadow-lg">{m.icon}</div>
                       <h3 className="text-[11px] font-black leading-tight mb-1">{m.title}</h3>
                       <p className="text-[9px] font-bold opacity-60 leading-tight">{m.description}</p>
                    </motion.div>
                 );
              })}
           </div>
        </section>

        {/* Green Impact Card */}
        <section className="px-6">
           <div className="bg-gradient-to-br from-emerald-600/30 to-blue-600/20 rounded-[32px] p-6 border border-white/5 relative overflow-hidden">
              <div className="relative z-10 space-y-6">
                 <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-emerald-500 rounded-2xl shadow-lg shadow-emerald-500/30">
                       <Leaf className="w-5 h-5 text-white" />
                    </div>
                    <div>
                       <h3 className="font-black text-lg">Green Impact</h3>
                       <p className="text-[10px] font-black uppercase tracking-widest text-emerald-400/70">Your CO2 Savings</p>
                    </div>
                 </div>

                 <div className="grid grid-cols-3 gap-3">
                    <div className="text-center space-y-1">
                       <div className="text-xl font-black font-mono">{stats.co2}<span className="text-[8px] opacity-40 ml-0.5">kg</span></div>
                       <p className="text-[8px] font-black uppercase tracking-tighter opacity-40">CO2 Reduced</p>
                    </div>
                    <div className="text-center space-y-1">
                       <div className="text-xl font-black font-mono">{impact.petrolSaved}<span className="text-[8px] opacity-40 ml-0.5">L</span></div>
                       <p className="text-[8px] font-black uppercase tracking-tighter opacity-40">Petrol Saved</p>
                    </div>
                    <div className="text-center space-y-1">
                       <div className="text-xl font-black font-mono">{impact.treesEquivalent}</div>
                       <p className="text-[8px] font-black uppercase tracking-tighter opacity-40">Trees Saved</p>
                    </div>
                 </div>
              </div>
              {/* Background Glow */}
              <div className="absolute top-0 right-0 -mr-12 -mt-12 w-48 h-48 bg-emerald-500/20 blur-[60px] rounded-full" />
           </div>
        </section>

        {/* Streak Tracker */}
        {streakInfo && (
          <section className="px-6">
            <StreakCard 
              currentStreak={streakInfo.currentStreak}
              longestStreak={streakInfo.longestStreak}
              daysUntilStreakExpires={streakInfo.daysUntilStreakExpires}
              hasChargedThisWeek={
                streakInfo.lastChargeWeek === getISOWeek(new Date()) && 
                streakInfo.lastChargeYear === getISOWeekYear(new Date())
              }
            />
          </section>
        )}

        {/* Referral Card */}
        {user && (
          <section className="px-6">
            <ReferralCard userId={user.uid} db={db} />
          </section>
        )}

        {/* Loyalty Status */}
        <section className="px-6 space-y-4">
           <h2 className="text-xs font-black uppercase tracking-widest text-white/40 flex items-center gap-2">
              <Award className="w-3.5 h-3.5" /> Loyalty Rewards
           </h2>
           <Card className="premium-glass p-6 border-none overflow-hidden relative rounded-[32px] bg-white/5">
              <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 blur-[60px] -mr-16 -mt-16" />
              <div className="flex justify-between items-start mb-6 relative">
                 <div>
                   <Badge className={cn("mb-2 uppercase font-black tracking-widest", 
                     (userData?.loyaltyPoints || 0) > 2000 ? "bg-amber-400/10 text-amber-400" : 
                     (userData?.loyaltyPoints || 0) > 500 ? "bg-slate-300/10 text-slate-300" : 
                     "bg-orange-400/10 text-orange-400")}>
                     {(userData?.loyaltyPoints || 0) > 2000 ? "Gold" : 
                      (userData?.loyaltyPoints || 0) > 500 ? "Silver" : "Bronze"} Member
                   </Badge>
                   <p className="text-4xl font-black">{userData?.loyaltyPoints || 0} <span className="text-sm font-bold text-muted-foreground uppercase tracking-widest ml-1">Pts</span></p>
                 </div>
                 <div className="text-right">
                   <p className="text-[10px] font-black text-white/30 uppercase tracking-widest">Next Tier</p>
                   <p className="font-bold text-xs text-primary">
                     {(userData?.loyaltyPoints || 0) > 2000 ? "Max Tier" : 
                      (userData?.loyaltyPoints || 0) > 500 ? `${2000 - (userData?.loyaltyPoints || 0)} pts to Gold` : 
                      `${500 - (userData?.loyaltyPoints || 0)} pts to Silver`}
                   </p>
                 </div>
              </div>
              
              {(userData?.loyaltyPoints || 0) <= 2000 && (
                 <div className="space-y-2 relative">
                   <Progress value={((userData?.loyaltyPoints || 0) / ((userData?.loyaltyPoints || 0) > 500 ? 2000 : 500)) * 100} className="h-1.5 bg-white/5" />
                 </div>
              )}
           </Card>
        </section>

        {/* Environmental Dashboard */}
        <section className="px-6 space-y-4">
           <h2 className="text-xs font-black uppercase tracking-widest text-white/40 flex items-center gap-2">
              <Leaf className="w-3.5 h-3.5 text-emerald-500" /> Environmental Dashboard
           </h2>
           <Card className="premium-glass p-6 border-none rounded-[32px] bg-white/5">
              <div className="flex justify-between items-end mb-8 relative">
                 <div>
                   <p className="text-[10px] font-black text-white/30 uppercase tracking-widest mb-1">Total CO₂ Saved</p>
                   <p className="text-3xl font-black text-emerald-400">{userData?.totalCarbonOffset || 0} kg</p>
                 </div>
                 <p className="text-[9px] font-bold text-emerald-500/60 uppercase tracking-widest flex items-center gap-1">
                   <TreeDeciduous className="w-3 h-3" /> ~{Math.floor((userData?.totalCarbonOffset || 0) / 10)} trees offset
                 </p>
              </div>
              
              <div className="h-[150px] w-full mt-4 relative">
                 <ResponsiveContainer width="100%" height="100%">
                   <AreaChart data={Array.from({ length: 15 }, (_, i) => ({ day: i, offset: Math.random() * 5 + (i * 0.5) }))}>
                     <defs>
                       <linearGradient id="colorOffset" x1="0" y1="0" x2="0" y2="1">
                         <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                         <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                       </linearGradient>
                     </defs>
                     <CartesianGrid strokeDasharray="3 3" stroke="#ffffff01" vertical={false} />
                     <XAxis dataKey="day" hide />
                     <YAxis hide />
                     <ReTooltip 
                       contentStyle={{ backgroundColor: '#0f172a', border: 'none', borderRadius: '12px', fontSize: '10px', fontWeight: 'bold' }}
                       itemStyle={{ color: '#10b981' }}
                     />
                     <Area type="monotone" dataKey="offset" stroke="#10b981" fillOpacity={1} fill="url(#colorOffset)" strokeWidth={3} />
                   </AreaChart>
                 </ResponsiveContainer>
              </div>
           </Card>
        </section>

        {/* Notification Preferences */}
        <section className="px-6 space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-xs font-black uppercase tracking-widest text-white/40 flex items-center gap-2">
              <Bell className="w-3.5 h-3.5" /> Notification Preferences
            </h2>
          </div>
          {user && <NotificationPreferencesPanel userId={user.uid} />}
        </section>

        {/* Digital Garage */}
        <div className="max-w-4xl mx-auto px-4 py-8">
         <div className="flex items-center justify-between mb-6 px-2">
            <h2 className="text-xl font-black flex items-center gap-2">
              <Car className="w-5 h-5 text-primary" /> My Vehicles
            </h2>
            <Button size="sm" variant="outline" className="rounded-full font-black text-xs" onClick={() => { setEditingCarId(null); setIsSheetOpen(true); }}>
              <Plus className="w-4 h-4 mr-1" /> Add EV
            </Button>
         </div>

         <div className="space-y-4">
            <AnimatePresence mode="popLayout">
               {cars.map((car) => (
                 <motion.div
                    key={car.id}
                    layout
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                 >
                   <Card className={cn(
                     "relative overflow-hidden rounded-[32px] border-none shadow-xl transition-all duration-300",
                     car.id === primaryVehicleId ? "ring-2 ring-primary bg-primary/[0.03]" : "bg-muted/30"
                   )}>
                     <CardContent className="p-0">
                       <div className="flex p-6 gap-4">
                         <div className="w-24 h-24 bg-primary/10 rounded-3xl flex items-center justify-center shrink-0">
                            <Car className={cn("w-12 h-12", car.id === primaryVehicleId ? "text-primary" : "text-muted-foreground")} />
                         </div>
                         <div className="flex-1 min-w-0">
                            <div className="flex justify-between items-start">
                               <div className="truncate pr-4">
                                  <h3 className="text-lg font-black tracking-tight truncate">{car.brand} {car.model}</h3>
                                  <Badge variant="outline" className="font-mono text-[10px] uppercase font-bold tracking-widest mt-1">{car.licensePlate}</Badge>
                               </div>
                               <div className="flex gap-1 shrink-0">
                                  <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={() => handleSetPrimary(car.id)}>
                                    <Heart className={cn("w-5 h-5", car.id === primaryVehicleId ? "fill-primary text-primary" : "text-muted-foreground")} />
                                  </Button>
                                  <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={() => { setEditingCarId(car.id); setFormData(car); setIsSheetOpen(true); }}>
                                    <Pencil className="w-4 h-4 text-muted-foreground" />
                                  </Button>
                               </div>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-white/5">
                               <div>
                                  <p className="text-[10px] font-black uppercase text-muted-foreground tracking-tighter">Connector</p>
                                  <p className="text-xs font-bold flex items-center gap-1.5"><Zap className="w-3 h-3 text-orange-500" /> {car.chargeType}</p>
                               </div>
                               <div>
                                  <p className="text-[10px] font-black uppercase text-muted-foreground tracking-tighter">Battery</p>
                                  <p className="text-xs font-bold flex items-center gap-1.5"><BatteryCharging className="w-3 h-3 text-primary" /> {car.batteryCapacity} kWh</p>
                               </div>
                            </div>
                         </div>
                       </div>
                       
                       <div className="flex border-t border-white/5 bg-background/20 p-2">
                          <Button variant="ghost" className="flex-1 text-[10px] font-black uppercase tracking-widest text-destructive" onClick={() => handleDeleteCar(car.id)}>
                             Remove Vehicle
                          </Button>
                       </div>
                     </CardContent>
                   </Card>
                 </motion.div>
               ))}
            </AnimatePresence>
            
            {cars.length === 0 && (
              <div className="text-center py-20 bg-muted/20 rounded-[40px] border-2 border-dashed border-muted flex flex-col items-center justify-center gap-4">
                 <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center">
                    <Car className="w-8 h-8 text-muted-foreground opacity-30" />
                 </div>
                 <p className="text-sm font-black text-muted-foreground uppercase tracking-widest">No vehicles found</p>
              </div>
            )}
         </div>

         {/* Charging Intelligence Analytics */}
         <section className="px-6 mt-12 mb-12">
            <h2 className="text-xl font-black flex items-center gap-2 mb-6">
               <TrendingUp className="w-5 h-5 text-primary" /> Charging Intelligence
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
               <Card className="bg-white/5 border-none rounded-3xl p-5">
                  <p className="text-[10px] font-black uppercase text-white/40 mb-1 tracking-widest">Total Energy</p>
                  <p className="text-2xl font-black text-primary">{stats.kwh} <span className="text-xs opacity-40">kWh</span></p>
               </Card>
               <Card className="bg-white/5 border-none rounded-3xl p-5">
                  <p className="text-[10px] font-black uppercase text-white/40 mb-1 tracking-widest">Total Spend</p>
                  <p className="text-2xl font-black text-[#22c55e]">₹{stats.totalSpend}</p>
               </Card>
               <Card className="bg-white/5 border-none rounded-3xl p-5">
                  <p className="text-[10px] font-black uppercase text-white/40 mb-1 tracking-widest">Sessions</p>
                  <p className="text-2xl font-black text-blue-400">{stats.sessions}</p>
               </Card>
            </div>

            <Card className="bg-white/5 border-none rounded-[32px] p-6 h-[300px] flex flex-col">
               <div className="flex justify-between items-center mb-6">
                  <p className="text-xs font-black uppercase tracking-widest text-white/40">Weekly Consumption (kWh)</p>
                  <Badge variant="outline" className="text-[9px] font-black uppercase opacity-60">Last 7 Days</Badge>
               </div>
               <div className="flex-1 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData}>
                      <XAxis 
                        dataKey="name" 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 10, fontWeight: 900 }} 
                      />
                      <ReTooltip 
                        cursor={{ fill: 'rgba(255,255,255,0.05)' }} 
                        contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '12px', fontSize: '12px', fontWeight: 900 }}
                      />
                      <Bar dataKey="kwh" radius={[6, 6, 0, 0]}>
                        {chartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={index === chartData.length - 1 ? '#3b82f6' : 'rgba(59, 130, 246, 0.3)'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
               </div>
            </Card>
         </section>

         {/* Range Intelligence (Moved below analytics) */}
         <Card className="mt-12 rounded-[40px] bg-emerald-500/5 border-none p-8">
            <h3 className="text-lg font-black mb-6 flex items-center gap-2">
               <TrendingUp className="w-5 h-5 text-emerald-600" /> Range Intelligence
            </h3>
            <div className="space-y-6">
               <div className="flex justify-between items-end">
                  <div>
                    <p className="text-[10px] font-black uppercase text-muted-foreground mb-1">Max Estimated Range</p>
                    <p className="text-5xl font-black text-emerald-600 tracking-tighter">420 <span className="text-lg">km</span></p>
                  </div>
                  <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 font-bold border-emerald-500/20">98% ECO Score</Badge>
               </div>
               <div className="h-4 bg-muted/30 rounded-full overflow-hidden">
                  <motion.div initial={{ width: 0 }} animate={{ width: "98%" }} className="h-full bg-emerald-500" />
               </div>
               <p className="text-xs font-bold text-muted-foreground leading-relaxed">
                  Based on your {primaryVehicleId ? "primary vehicle" : "profile"}, your driving behavior is saving 12kg of CO2 per week compared to an ICE equivalent. Keep at it!
               </p>
            </div>
         </Card>
        </div>
      </main>

      {/* Add Vehicle Sheet */}
      <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
        <SheetContent side="bottom" className="rounded-t-[40px] p-6 pb-[var(--safe-bottom)] outline-none">
          <SheetHeader className="mb-6">
            <SheetTitle className="text-2xl font-black flex items-center gap-3">
               <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                 <Plus className="w-6 h-6 text-primary" />
               </div>
               {editingCarId ? "Update EV" : "Add Your EV"}
            </SheetTitle>
            <SheetDescription className="font-bold">
               Tell us about your vehicle to optimize your charging experience.
            </SheetDescription>
          </SheetHeader>

          <form onSubmit={handleSaveCar} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-[10px] font-black uppercase text-muted-foreground">Brand</Label>
                <Select value={formData.brand} onValueChange={b => setFormData({...formData, brand: b, model: ""})}>
                   <SelectTrigger className="h-12 rounded-2xl font-bold font-mono"><SelectValue placeholder="Select" /></SelectTrigger>
                   <SelectContent>
                      {Object.entries(BRANDS).map(([cat, list]) => (
                        <div key={cat}>
                          <p className="px-2 py-1 text-[8px] font-black uppercase opacity-40">{cat}</p>
                          {list.map(b => <SelectItem key={b} value={b} className="font-mono">{b}</SelectItem>)}
                        </div>
                      ))}
                   </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] font-black uppercase text-muted-foreground">Model</Label>
                <Select value={formData.model} onValueChange={m => setFormData({...formData, model: m})}>
                   <SelectTrigger className="h-12 rounded-2xl font-bold font-mono" disabled={!formData.brand}><SelectValue placeholder="Select" /></SelectTrigger>
                   <SelectContent>
                      {(BRAND_MODELS[formData.brand] || []).map(m => <SelectItem key={m} value={m} className="font-mono">{m}</SelectItem>)}
                   </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
               <div className="space-y-1.5">
                  <Label className="text-[10px] font-black uppercase text-muted-foreground">Battery (kWh)</Label>
                  <Input type="number" value={formData.batteryCapacity} onChange={e => setFormData({...formData, batteryCapacity: Number(e.target.value)})} className="h-12 rounded-2xl font-mono text-center font-black" />
               </div>
               <div className="space-y-1.5">
                  <Label className="text-[10px] font-black uppercase text-muted-foreground">Connector Type</Label>
                  <Select value={formData.chargeType} onValueChange={(v: any) => setFormData({...formData, chargeType: v})}>
                    <SelectTrigger className="h-12 rounded-2xl font-bold font-mono"><SelectValue /></SelectTrigger>
                    <SelectContent>
                       {["CCS", "Type 2", "CHAdeMO", "GB/T", "Tesla"].map(t => <SelectItem key={t} value={t} className="font-mono">{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
               </div>
            </div>

            <div className="space-y-1.5">
               <Label className="text-[10px] font-black uppercase text-muted-foreground">License Plate</Label>
               <Input 
                 value={formData.licensePlate} 
                 onChange={e => setFormData({...formData, licensePlate: e.target.value.toUpperCase()})} 
                 placeholder="MH 12 AB 1234" 
                 className="h-14 rounded-2xl font-mono text-center tracking-widest text-lg font-black bg-muted/30 border-none"
               />
            </div>

            <div className="pt-4">
               <Button type="submit" className="w-full h-16 rounded-2xl text-lg font-black shadow-xl shadow-primary/20" disabled={loading}>
                  {loading ? "Saving..." : editingCarId ? "Update Vehicle" : "Save Vehicle →"}
               </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}
