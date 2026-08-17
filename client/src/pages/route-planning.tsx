import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  MapPin, Navigation2, ChevronRight, Zap, 
  Battery, Clock, Fuel, ArrowRight, 
  Plus, History, Search, Locate, 
  Map as MapIcon, Info, AlertTriangle, ShieldCheck
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { Badge } from "@/components/ui/badge";
import { db } from "@/lib/firebase";
import { collection, query, getDocs } from "firebase/firestore";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";

type Step = "setup" | "vehicle" | "result";

export default function RoutePlanning() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [step, setStep] = useState<Step>("setup");
  const [cars, setCars] = useState<any[]>([]);
  const [selectedCar, setSelectedCar] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  
  const [routeData, setRouteData] = useState({
    from: "Akurdi, Pune",
    to: "Mahabaleshwar, Maharashtra",
    currentBattery: 85
  });

  useEffect(() => {
    if (!user) return;
    const fetchCars = async () => {
      const q = query(collection(db, "users", user.uid, "ev_vehicles"));
      const snap = await getDocs(q);
      const vehicleList = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setCars(vehicleList);
      if (vehicleList.length > 0) setSelectedCar(vehicleList[0]);
    };
    fetchCars();
  }, [user]);

  const handleCalculate = () => {
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setStep("result");
    }, 1500);
  };

  const getStepProgress = () => {
     if (step === "setup") return 33;
     if (step === "vehicle") return 66;
     return 100;
  };

  return (
    <div className="min-h-screen bg-[#0f172a] text-white flex flex-col pb-32 pt-[var(--safe-top)] overflow-x-hidden">
      {/* Progress Header */}
      <div className="px-6 pt-6 pb-2 space-y-4">
         <div className="flex justify-between items-center">
            <h1 className="text-2xl font-black">Plan Trip</h1>
            <Badge variant="outline" className="border-emerald-500/20 text-emerald-400 bg-emerald-500/10 font-black">AI ROUTE</Badge>
         </div>
         <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
            <motion.div 
               animate={{ width: `${getStepProgress()}%` }}
               className="h-full bg-primary shadow-[0_0_10px_rgba(34,197,94,0.5)]"
            />
         </div>
      </div>

      <main className="flex-1 flex flex-col">
        <AnimatePresence mode="wait">
          {step === "setup" && (
            <motion.div 
               key="setup"
               initial={{ opacity: 0, x: 20 }}
               animate={{ opacity: 1, x: 0 }}
               exit={{ opacity: 0, x: -20 }}
               className="p-6 space-y-8 flex-1"
            >
               <div className="space-y-6">
                  <div className="relative pt-6">
                     <div className="absolute left-6 top-12 bottom-12 w-0.5 bg-dashed border-l-2 border-dashed border-white/10" />
                     
                     <div className="space-y-12">
                        <div className="relative flex gap-6">
                           <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0 z-10">
                              <div className="w-3 h-3 rounded-full bg-emerald-500 shadow-[0_0_10px_#22c55e]" />
                           </div>
                           <div className="flex-1 space-y-1.5">
                              <Label className="text-[10px] font-black uppercase text-white/40 tracking-widest pl-1">Starting Point</Label>
                              <div className="relative">
                                 <Input 
                                    value={routeData.from}
                                    onChange={e => setRouteData({...routeData, from: e.target.value})}
                                    className="h-14 bg-white/5 border-none rounded-2xl pl-11 font-bold text-sm" 
                                    placeholder="Enter origin"
                                 />
                                 <Locate className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-500" />
                              </div>
                           </div>
                        </div>

                        <div className="relative flex gap-6">
                           <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0 z-10">
                              <MapPin className="w-5 h-5 text-red-500 drop-shadow-[0_0_8px_rgba(239,68,68,0.5)]" />
                           </div>
                           <div className="flex-1 space-y-1.5">
                              <Label className="text-[10px] font-black uppercase text-white/40 tracking-widest pl-1">Destination</Label>
                              <div className="relative">
                                 <Input 
                                    value={routeData.to}
                                    onChange={e => setRouteData({...routeData, to: e.target.value})}
                                    className="h-14 bg-white/5 border-none rounded-2xl pl-11 font-bold text-sm" 
                                    placeholder="Enter destination" 
                                 />
                                 <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
                              </div>
                           </div>
                        </div>
                     </div>
                  </div>

                  <div className="bg-white/5 rounded-[32px] p-6 space-y-4">
                     <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                           <Battery className="w-4 h-4 text-emerald-500" />
                           <span className="text-xs font-black uppercase tracking-widest text-white/60">Current Charge</span>
                        </div>
                        <span className="text-lg font-black font-mono">{routeData.currentBattery}%</span>
                     </div>
                     <Progress value={routeData.currentBattery} className="h-2 bg-white/5" />
                     <div className="flex justify-between gap-2 overflow-x-auto no-scrollbar pt-2">
                        {[10, 30, 50, 80, 100].map(val => (
                           <Button 
                              key={val}
                              onClick={() => setRouteData({...routeData, currentBattery: val})}
                              variant="ghost" 
                              className={cn(
                                 "h-10 px-4 rounded-xl text-xs font-black transition-all",
                                 routeData.currentBattery === val ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/20" : "bg-white/5 text-white/40"
                              )}
                           >
                              {val}%
                           </Button>
                        ))}
                     </div>
                  </div>
               </div>

               <div className="pt-8">
                  <Button 
                     onClick={() => setStep("vehicle")}
                     className="w-full h-16 rounded-[24px] text-lg font-black shadow-xl shadow-primary/20"
                  >
                     Select Vehicle <ChevronRight className="ml-2 w-5 h-5" />
                  </Button>
               </div>
            </motion.div>
          )}

          {step === "vehicle" && (
            <motion.div 
               key="vehicle"
               initial={{ opacity: 0, x: 20 }}
               animate={{ opacity: 1, x: 0 }}
               exit={{ opacity: 0, x: -20 }}
               className="p-6 space-y-6 flex-1"
            >
               <div className="space-y-1">
                  <h2 className="text-xl font-black">Which EV are you driving?</h2>
                  <p className="text-sm font-bold text-white/40">We use this to calculate specific range & charger types</p>
               </div>

               <div className="space-y-4 pt-4">
                  {cars.length > 0 ? (
                     cars.map(car => (
                        <div 
                           key={car.id}
                           onClick={() => setSelectedCar(car)}
                           className={cn(
                              "p-5 rounded-[28px] border-2 transition-all flex items-center justify-between",
                              selectedCar?.id === car.id ? "bg-primary/10 border-primary" : "bg-white/5 border-transparent"
                           )}
                        >
                           <div className="flex items-center gap-4">
                              <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center">
                                 <Plus className="w-6 h-6 rotate-45" />
                              </div>
                              <div>
                                 <h3 className="font-black">{car.brand} {car.model}</h3>
                                 <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">{car.batteryCapacity}kWh • {car.chargeType}</p>
                              </div>
                           </div>
                           {selectedCar?.id === car.id && <ShieldCheck className="w-6 h-6 text-primary" />}
                        </div>
                     ))
                  ) : (
                     <Card className="bg-white/5 border-dashed border-2 border-white/10 rounded-[32px] p-8 text-center">
                        <Fuel className="w-12 h-12 text-white/20 mx-auto mb-4" />
                        <p className="text-sm font-black text-white/60 mb-4">No Vehicles Found</p>
                        <Button variant="outline" className="rounded-2xl font-black text-xs" onClick={() => setLocation("/user-profile")}>Go to Garage</Button>
                     </Card>
                  )}
               </div>

               <div className="pt-auto mt-10">
                  <div className="flex gap-3">
                     <Button 
                        variant="ghost" 
                        onClick={() => setStep("setup")}
                        className="h-16 px-6 rounded-2xl bg-white/5 font-black"
                     > Back </Button>
                     <Button 
                        onClick={handleCalculate}
                        disabled={!selectedCar || loading}
                        className="flex-1 h-16 rounded-2xl text-lg font-black shadow-xl shadow-primary/20"
                     >
                        {loading ? "Calculating..." : "Plan My Route →"}
                     </Button>
                  </div>
               </div>
            </motion.div>
          )}

          {step === "result" && (
            <motion.div 
               key="result"
               initial={{ opacity: 0, scale: 0.95 }}
               animate={{ opacity: 1, scale: 1 }}
               className="p-6 space-y-8 flex-1"
            >
               {/* Result Card */}
               <div className="bg-gradient-to-br from-primary/20 via-blue-900/40 to-black rounded-[40px] p-8 border border-white/10 relative overflow-hidden">
                  <div className="relative z-10 space-y-6">
                     <div className="flex justify-between items-start">
                        <div className="p-3 bg-primary rounded-2xl shadow-lg shadow-primary/30">
                           <MapIcon className="w-6 h-6 text-white" />
                        </div>
                        <div className="text-right">
                           <h3 className="text-3xl font-black font-mono">118<span className="text-sm ml-1 opacity-60">km</span></h3>
                           <p className="text-[10px] font-black uppercase text-white/40 tracking-widest">Total Trip Distance</p>
                        </div>
                     </div>

                     <div className="grid grid-cols-2 gap-4">
                        <div className="bg-white/5 rounded-2xl p-4">
                           <p className="text-[10px] font-black uppercase text-white/40 mb-1">Duration</p>
                           <div className="flex items-center gap-2">
                              <Clock className="w-4 h-4 text-emerald-400" />
                              <span className="font-black">2h 15m</span>
                           </div>
                        </div>
                        <div className="bg-white/5 rounded-2xl p-4">
                           <p className="text-[10px] font-black uppercase text-white/40 mb-1">Stops</p>
                           <div className="flex items-center gap-2">
                              <Zap className="w-4 h-4 text-orange-400" />
                              <span className="font-black">1 Stop</span>
                           </div>
                        </div>
                     </div>
                  </div>
                  <div className="absolute top-0 right-0 -mr-20 -mt-20 w-64 h-64 bg-primary/20 blur-[80px] rounded-full" />
               </div>

               {/* Itinerary */}
               <div className="space-y-6">
                  <h3 className="text-sm font-black uppercase tracking-widest text-white/40 flex items-center gap-2">
                     <History className="w-4 h-4" /> Trip Itinerary
                  </h3>

                  <div className="space-y-0 relative">
                     <div className="absolute left-6 top-8 bottom-8 w-0.5 bg-white/5" />
                     
                     {/* Start */}
                     <div className="relative flex gap-6 pb-10">
                        <div className="w-12 h-12 rounded-full bg-[#0f172a] border-4 border-emerald-500/20 flex items-center justify-center shrink-0 z-10">
                           <div className="w-3 h-3 rounded-full bg-emerald-500" />
                        </div>
                        <div className="flex-1 space-y-1">
                           <p className="font-black text-sm">{routeData.from}</p>
                           <p className="text-[10px] font-bold text-white/40">Start with {routeData.currentBattery}% Battery</p>
                        </div>
                     </div>

                     {/* Stop */}
                     <div className="relative flex gap-6 pb-10">
                        <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0 z-10">
                           <Zap className="w-5 h-5 text-orange-500" />
                        </div>
                        <div className="flex-1 bg-white/5 rounded-[24px] p-5 mr-4 space-y-3">
                           <div className="flex justify-between items-start">
                              <h4 className="font-black text-sm">Khandala Supercharge</h4>
                              <Badge className="bg-orange-500/10 text-orange-400 border-none text-[8px]">STOP1</Badge>
                           </div>
                           <div className="flex items-center gap-4">
                              <div className="flex items-center gap-1.5 text-xs font-bold text-white/60">
                                 <Clock className="w-3.5 h-3.5" /> 15m
                              </div>
                              <div className="flex items-center gap-1.5 text-xs font-bold text-white/60">
                                 <Battery className="w-3.5 h-3.5" /> 20% → 85%
                              </div>
                           </div>
                           <Button variant="ghost" className="w-full justify-between h-10 px-4 rounded-xl bg-white/5 hover:bg-white/10 font-bold text-[10px]">
                              Pre-book Spot <ChevronRight className="w-3.5 h-3.5" />
                           </Button>
                        </div>
                     </div>

                     {/* Finish */}
                     <div className="relative flex gap-6">
                        <div className="w-12 h-12 rounded-full bg-[#0f172a] border-4 border-red-500/20 flex items-center justify-center shrink-0 z-10">
                           <MapPin className="w-5 h-5 text-red-500" />
                        </div>
                        <div className="flex-1 space-y-1 pt-3">
                           <p className="font-black text-sm">{routeData.to}</p>
                           <p className="text-[10px] font-bold text-white/40">Expected arrival: 14:45 PM</p>
                        </div>
                     </div>
                  </div>
               </div>

               <div className="pt-8 flex flex-col gap-3 pb-12">
                  <Button 
                    variant="ghost" 
                    onClick={() => setStep("setup")}
                    className="text-white/40 font-black text-xs uppercase tracking-widest hover:text-white transition-colors"
                  >
                    Recalculate Route
                  </Button>
                  <Button className="h-16 rounded-[24px] text-lg font-black bg-white text-black hover:bg-white/90 shadow-xl">
                     Start Navigation <Navigation2 className="ml-2 w-5 h-5" />
                  </Button>
               </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
