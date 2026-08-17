import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import { useLocation } from "wouter";
import { db } from "@/lib/firebase";
import { 
  collection, query, where, onSnapshot, 
  addDoc, serverTimestamp, doc, updateDoc,
  getDocs, deleteDoc, getDoc, setDoc, Timestamp, collectionGroup
} from "firebase/firestore";
import { 
  Users, Car, TrendingUp, CreditCard, 
  Plus, Search, ShieldCheck, Mail, Phone,
  ChevronRight, MoreVertical, Trash2,
  Building2, Wallet, History, FileText, Download, TrendingUp as AnalyticsIcon,
  CheckCircle, IndianRupee, Sparkles, Percent
} from "lucide-react";
import { startOfMonth, endOfMonth, format } from "date-fns";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetDescription } from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import { Label } from "@/components/ui/label";

export default function FleetManagement() {
  const { user, userRole, loading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [fleet, setFleet] = useState<any>(null);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  
  const [inviteData, setInviteData] = useState({ email: "", role: "driver" });
  
  // Analytics & Billing State
  const [fleetBookings, setFleetBookings] = useState<any[]>([]);
  const [statements, setStatements] = useState<any[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), "yyyy-MM"));
  const [printingMonth, setPrintingMonth] = useState<string | null>(null);

  // Station Owner Fleet Partnerships State
  const [allFleets, setAllFleets] = useState<any[]>([]);
  const [ownerStations, setOwnerStations] = useState<any[]>([]);
  const [ownerFleetBookings, setOwnerFleetBookings] = useState<any[]>([]);
  const [ownerFleetDiscounts, setOwnerFleetDiscounts] = useState<Record<string, number>>({});
  const [fleetMembersMap, setFleetMembersMap] = useState<Record<string, string>>({}); // userId -> fleetId
  
  const [discountSheetOpen, setDiscountSheetOpen] = useState(false);
  const [selectedFleetForDiscount, setSelectedFleetForDiscount] = useState<any>(null);
  const [customDiscountValue, setCustomDiscountValue] = useState("");
  const [isSavingDiscount, setIsSavingDiscount] = useState(false);

  useEffect(() => {
    if (!authLoading && userRole && userRole !== "owner" && userRole !== "admin") {
      setLocation("/");
      toast({ 
        variant: "destructive", 
        title: "Access Denied", 
        description: "This portal is reserved for owners and administrators." 
      });
    }
  }, [userRole, authLoading]);

  useEffect(() => {
    if (!user) return;

    // Fetch Fleet Info (Assuming user is an Admin of a Fleet)
    const qFleet = query(collection(db, "fleets"), where("adminId", "==", user.uid));
    const unsubFleet = onSnapshot(qFleet, (snap) => {
      if (!snap.empty) {
        setFleet({ id: snap.docs[0].id, ...snap.docs[0].data() });
      } else {
        setFleet(null);
      }
      setLoading(false);
    }, (err) => {
      console.error("Fleet fetch error:", err);
      setFleet(null);
      setLoading(false);
    });

    return () => unsubFleet();
  }, [user]);

  // Fetch Drivers & Statements for Fleet Admins
  useEffect(() => {
    if (!fleet?.id) return;

    const qDrivers = query(collection(db, "fleets", fleet.id, "members"));
    const unsubDrivers = onSnapshot(qDrivers, (snap) => {
      const driverList = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setDrivers(driverList);
      
      // Fetch bookings for these drivers
      const uids = driverList.filter((d: any) => d.uid && typeof d.uid === 'string').map((d: any) => d.uid);
      if (uids.length > 0) {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);
        const qBookings = query(
          collection(db, "bookings"),
          where("userId", "in", uids.slice(0, 30)),
          where("status", "==", "completed"),
          where("createdAt", ">=", Timestamp.fromDate(thirtyDaysAgo))
        );
        
        getDocs(qBookings).then(snap => {
          if (snap.empty) {
            setFleetBookings([]);
          } else {
            setFleetBookings(snap.docs.map(d => ({ id: d.id, ...d.data() })));
          }
        }).catch(err => console.error("Fleet bookings fetch error:", err));
      }
    }, (err) => console.error("Drivers listener error:", err));

    const qStatements = query(
      collection(db, "fleets", fleet.id, "monthlyStatements"),
      where("month", "<=", format(new Date(), "yyyy-MM"))
    );
    const unsubStatements = onSnapshot(qStatements, (snap) => {
      setStatements(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => console.error("Statements listener error:", err));

    return () => {
      unsubDrivers();
      unsubStatements();
    };
  }, [fleet?.id]);

  // Fetch data for Station Owner Fleet Partnerships View
  useEffect(() => {
    if (!user || userRole !== "owner" || fleet) return;

    // 1. Fetch all fleets
    const unsubAllFleets = onSnapshot(collection(db, "fleets"), (snap) => {
      setAllFleets(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => console.error("Error fetching all fleets:", err));

    // 2. Fetch owner stations
    const qStations = query(collection(db, "stations"), where("ownerId", "==", user.uid));
    const unsubStations = onSnapshot(qStations, (stationsSnap) => {
      const stationIds = stationsSnap.docs.map(d => d.id);
      setOwnerStations(stationsSnap.docs.map(d => ({ id: d.id, ...d.data() })));

      if (stationIds.length > 0) {
        // 3. Fetch bookings for these stations
        const qBookings = query(
          collection(db, "bookings"),
          where("stationId", "in", stationIds.slice(0, 10)),
          where("status", "==", "completed")
        );
        const unsubBookings = onSnapshot(qBookings, (bookingsSnap) => {
          setOwnerFleetBookings(bookingsSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        }, (err) => console.error("Error fetching bookings:", err));

        return () => unsubBookings();
      } else {
        setOwnerFleetBookings([]);
      }
    }, (err) => console.error("Error fetching stations:", err));

    // 4. Fetch custom fleet discounts set by this owner
    const qDiscounts = query(collection(db, "ownerFleetDiscounts"), where("ownerId", "==", user.uid));
    const unsubDiscounts = onSnapshot(qDiscounts, (snap) => {
       const discountMap: Record<string, number> = {};
       snap.docs.forEach(doc => {
          const data = doc.data();
          discountMap[data.fleetId] = data.discountPercent || 0;
       });
       setOwnerFleetDiscounts(discountMap);
    }, (err) => console.error("Error fetching discounts:", err));

    return () => {
      unsubAllFleets();
      unsubStations();
      unsubDiscounts();
    };
  }, [user, userRole, fleet]);

  // Fetch all fleet members to associate driver userIds with their corporate fleet
  useEffect(() => {
    if (!user || userRole !== "owner" || fleet) return;

    const unsubMembers = onSnapshot(collectionGroup(db, "members"), (snap) => {
       const m: Record<string, string> = {};
       snap.docs.forEach(doc => {
          const data = doc.data();
          if (data.uid && data.status === "active") {
             const fleetId = doc.ref.parent.parent?.id;
             if (fleetId) {
                m[data.uid] = fleetId;
             }
          }
       });
       setFleetMembersMap(m);
    }, (err) => console.error("Error fetching fleet members:", err));

    return () => unsubMembers();
  }, [user, userRole, fleet]);

  // Calculate statistics per fleet for Station Owner
  const fleetStats = useMemo(() => {
     const stats: Record<string, { sessions: number, kwh: number, revenue: number }> = {};
     
     allFleets.forEach(f => {
        stats[f.id] = { sessions: 0, kwh: 0, revenue: 0 };
     });

     ownerFleetBookings.forEach(booking => {
        const fleetId = fleetMembersMap[booking.userId];
        if (fleetId && stats[fleetId]) {
           stats[fleetId].sessions += 1;
           stats[fleetId].kwh += Number(booking.energyDeliveredKwh) || 0;
           stats[fleetId].revenue += Number(booking.totalPrice) || 0;
        }
     });

     return stats;
  }, [allFleets, ownerFleetBookings, fleetMembersMap]);

  // Calculate total owner statistics from fleets
  const totalOwnerStats = useMemo(() => {
     let totalRevenue = 0;
     let totalKwh = 0;
     let totalSessions = 0;
     
     Object.values(fleetStats).forEach(s => {
        totalRevenue += s.revenue;
        totalKwh += s.kwh;
        totalSessions += s.sessions;
     });

     return { totalRevenue, totalKwh, totalSessions };
  }, [fleetStats]);

  const generateFleetStatement = async (accountId: string, month: string) => {
    setIsGenerating(true);
    try {
      const [yearStr, monthStr] = month.split("-");
      const monthStart = startOfMonth(new Date(parseInt(yearStr), parseInt(monthStr) - 1));
      const monthEnd = endOfMonth(monthStart);
      
      const fleetRef = doc(db, "fleets", accountId);
      const fleetSnap = await getDoc(fleetRef);
      const memberIds = fleetSnap.data()?.members || [];
      
      if (memberIds.length === 0) {
        toast({ variant: "destructive", title: "No Members", description: "Cannot generate statement for an empty fleet." });
        return;
      }

      const memberBookings: Record<string, any[]> = {};
      
      await Promise.all(memberIds.map(async (uid: string) => {
        const snap = await getDocs(query(
          collection(db, "bookings"),
          where("userId", "==", uid),
          where("status", "==", "completed"),
          where("createdAt", ">=", Timestamp.fromDate(monthStart)),
          where("createdAt", "<=", Timestamp.fromDate(monthEnd))
        ));
        memberBookings[uid] = snap.docs.map(d => d.data());
      }));
      
      const allBookings = Object.values(memberBookings).flat();
      const grossAmount = allBookings.reduce((s, b) => s + (b.totalPrice || 0), 0);
      const fleetDiscount = fleetSnap.data()?.discountPercent || 0;
      const discount = grossAmount * (fleetDiscount / 100);
      const netAmount = grossAmount - discount;
      
      const memberBreakdown: Record<string, any> = {};
      Object.entries(memberBookings).forEach(([uid, bookings]) => {
        memberBreakdown[uid] = {
          sessions: bookings.length,
          kwh: bookings.reduce((s, b) => s + (b.energyDeliveredKwh || 0), 0),
          amount: bookings.reduce((s, b) => s + (b.totalPrice || 0), 0)
        };
      });
      
      await setDoc(doc(db, "fleets", accountId, "monthlyStatements", month), {
        month,
        totalSessions: allBookings.length,
        totalKwh: allBookings.reduce((s, b) => s + (b.energyDeliveredKwh || 0), 0),
        grossAmount,
        discount,
        netAmount,
        memberBreakdown,
        generatedAt: serverTimestamp(),
        status: "draft"
      });
      
      toast({ title: "Statement Generated!", description: `Statement for ${month} is now available in Billing.` });
    } catch (error) {
      console.error(error);
      toast({ variant: "destructive", title: "Generation Failed", description: "Could not create monthly statement." });
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePrintInvoice = (statement: any) => {
    setPrintingMonth(statement.month);
    setTimeout(() => {
      window.print();
      setPrintingMonth(null);
    }, 100);
  };

  const handleInviteDriver = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fleet?.id) return;
    
    try {
      await addDoc(collection(db, "fleets", fleet.id, "members"), {
        email: inviteData.email,
        role: inviteData.role,
        status: "pending",
        addedAt: serverTimestamp()
      });
      setIsInviteOpen(false);
      setInviteData({ email: "", role: "driver" });
      toast({ title: "Invitation Sent! 📨", description: `Invited ${inviteData.email} to join your fleet.` });
    } catch (error) {
      toast({ variant: "destructive", title: "Invite Failed", description: "Could not send invitation." });
    }
  };

  const handleRemoveDriver = async (driverId: string) => {
    if (!fleet?.id) return;
    try {
      await deleteDoc(doc(db, "fleets", fleet.id, "members", driverId));
      toast({ title: "Member Removed" });
    } catch (error) {
      toast({ variant: "destructive", title: "Action Failed" });
    }
  };

  const handleSaveDiscount = async (e: React.FormEvent) => {
     e.preventDefault();
     if (!user || !selectedFleetForDiscount) return;
     setIsSavingDiscount(true);
     try {
        const discountPercent = parseFloat(customDiscountValue);
        if (isNaN(discountPercent) || discountPercent < 0 || discountPercent > 100) {
           toast({ variant: "destructive", title: "Invalid Discount", description: "Discount must be between 0% and 100%" });
           return;
        }
        
        const docId = `${user.uid}_${selectedFleetForDiscount.id}`;
        await setDoc(doc(db, "ownerFleetDiscounts", docId), {
           ownerId: user.uid,
           fleetId: selectedFleetForDiscount.id,
           discountPercent,
           updatedAt: serverTimestamp()
        });

        toast({ title: "Discount Updated 🎉", description: `Offered ${discountPercent}% discount to ${selectedFleetForDiscount.name}.` });
        setDiscountSheetOpen(false);
     } catch (error) {
        console.error("Error saving discount:", error);
        toast({ variant: "destructive", title: "Action Failed", description: "Could not save custom discount." });
     } finally {
        setIsSavingDiscount(false);
     }
  };

  const handleSeedMockData = async () => {
     if (!user) return;
     try {
        toast({ title: "Seeding...", description: "Creating mock fleet partnership data..." });
        
        let stationId = "";
        let stationName = "";
        
        if (ownerStations.length > 0) {
           stationId = ownerStations[0].id;
           stationName = ownerStations[0].name;
        } else {
           const stationsCol = collection(db, "stations");
           const newStationRef = await addDoc(stationsCol, {
              name: "EVPlugFinder Premium Plaza - Pune 1",
              address: "101 High Street, Pune, India",
              lat: 18.5204,
              lon: 73.8567,
              rating: 4.8,
              amenities: ["WiFi", "Café", "Restrooms"],
              operatingHours: "24/7",
              lastUpdated: Date.now(),
              status: "active",
              ownerId: user.uid,
              connectors: [
                 {
                    id: "conn-premium-1",
                    type: "CCS",
                    powerKw: 150,
                    pricePerKwh: 15,
                    count: 2,
                    available: true
                 }
              ],
              chargerTypes: ["CCS"]
           });
           stationId = newStationRef.id;
           stationName = "EVPlugFinder Premium Plaza - Pune 1";
        }

        const fleetsCol = collection(db, "fleets");
        
        const fleet1Ref = await addDoc(fleetsCol, {
           name: "Tata Power Fleet",
           companyId: "CORP-TATA",
           balance: 150000,
           discountPercent: 15,
           adminId: user.uid,
           upiId: "tata@upi",
           createdBy: "system-seed"
        });

        const fleet2Ref = await addDoc(fleetsCol, {
           name: "Amazon Logistics",
           companyId: "CORP-AMZN",
           balance: 250000,
           discountPercent: 20,
           adminId: user.uid,
           upiId: "amazon@upi",
           createdBy: "system-seed"
        });

        const member1Id = "mock-driver-1";
        await setDoc(doc(db, "fleets", fleet1Ref.id, "members", member1Id), {
           email: "ramesh@tata.com",
           uid: member1Id,
           status: "active",
           role: "driver",
           name: "Ramesh Kumar"
        });

        const member2Id = "mock-driver-2";
        await setDoc(doc(db, "fleets", fleet2Ref.id, "members", member2Id), {
           email: "suresh@amazon.com",
           uid: member2Id,
           status: "active",
           role: "driver",
           name: "Suresh Patel"
        });

        const bookingsCol = collection(db, "bookings");
        
        const twoDaysAgo = new Date(Date.now() - 2 * 86400000);
        const threeDaysAgo = new Date(Date.now() - 3 * 86400000);
        
        await addDoc(bookingsCol, {
           stationId,
           stationName,
           userId: member1Id,
           status: "completed",
           totalPrice: 650,
           energyDeliveredKwh: 43.3,
           connectorType: "CCS",
           createdAt: Timestamp.fromDate(twoDaysAgo)
        });

        await addDoc(bookingsCol, {
           stationId,
           stationName,
           userId: member1Id,
           status: "completed",
           totalPrice: 420,
           energyDeliveredKwh: 28.0,
           connectorType: "CCS",
           createdAt: Timestamp.fromDate(threeDaysAgo)
        });

        await addDoc(bookingsCol, {
           stationId,
           stationName,
           userId: member2Id,
           status: "completed",
           totalPrice: 850,
           energyDeliveredKwh: 56.6,
           connectorType: "CCS",
           createdAt: Timestamp.fromDate(twoDaysAgo)
        });

        await setDoc(doc(db, "ownerFleetDiscounts", `${user.uid}_${fleet1Ref.id}`), {
           ownerId: user.uid,
           fleetId: fleet1Ref.id,
           discountPercent: 18,
           updatedAt: serverTimestamp()
        });

        toast({ title: "Seed Successful! 🎉", description: "Mock fleet partnership data generated." });
     } catch (error: any) {
        console.error("Seed error:", error);
        toast({ variant: "destructive", title: "Seed Failed", description: error.message || "Failed to generate mock data." });
     }
  };

  if (loading) return <div className="h-screen flex items-center justify-center font-black animate-pulse">Initializing Fleet Portal...</div>;

  if (!fleet) {
     if (userRole === "owner") {
        return (
          <div className="min-h-screen bg-[#0f172a] text-white pb-32">
             {/* Header */}
             <header className="px-6 pt-8 pb-12 bg-gradient-to-b from-primary/10 to-transparent">
                <div className="flex justify-between items-start mb-6">
                   <div>
                      <Badge className="bg-primary/20 text-primary border-none font-black text-[10px] uppercase mb-2">Ecosystem Insights</Badge>
                      <div className="flex items-center gap-3">
                         <h1 className="text-3xl font-black tracking-tight">Fleet Partnerships</h1>
                         <Button
                            size="sm"
                            onClick={handleSeedMockData}
                            className="bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border-none font-black text-[10px] uppercase tracking-wider h-7 px-3 rounded-full flex items-center gap-1.5"
                         >
                            <Sparkles className="w-3 h-3 text-emerald-400" /> Seed Mock Data
                         </Button>
                      </div>
                      <p className="text-white/40 font-bold text-sm mt-1">Optimize corporate fleet charging revenue at your stations.</p>
                   </div>
                   <div className="p-3 bg-white/5 rounded-2xl border border-white/10">
                      <Sparkles className="w-6 h-6 text-primary animate-pulse" />
                   </div>
                </div>

                {/* Owner Stats Summary */}
                <div className="grid grid-cols-3 gap-4">
                   <Card className="premium-glass p-4 border-none">
                      <p className="text-[9px] font-black uppercase text-white/40 mb-1 tracking-widest">Fleet Revenue</p>
                      <p className="text-xl font-black text-emerald-400">₹{totalOwnerStats.totalRevenue.toLocaleString()}</p>
                   </Card>
                   <Card className="premium-glass p-4 border-none">
                      <p className="text-[9px] font-black uppercase text-white/40 mb-1 tracking-widest">Fleet Energy</p>
                      <p className="text-xl font-black text-primary">{totalOwnerStats.totalKwh.toFixed(1)} <span className="text-xs">kWh</span></p>
                   </Card>
                   <Card className="premium-glass p-4 border-none">
                      <p className="text-[9px] font-black uppercase text-white/40 mb-1 tracking-widest">Fleet Bookings</p>
                      <p className="text-xl font-black text-white">{totalOwnerStats.totalSessions}</p>
                   </Card>
                </div>
             </header>

             <main className="px-6 -mt-6 space-y-6">
                <div className="flex items-center justify-between">
                   <h2 className="text-lg font-black uppercase tracking-wider text-white/70">Available Corporate Fleets</h2>
                   <Badge className="bg-white/5 border border-white/10 font-bold">{allFleets.length} Active</Badge>
                </div>

                <div className="space-y-4">
                   {allFleets.map(f => {
                      const stats = fleetStats[f.id] || { sessions: 0, kwh: 0, revenue: 0 };
                      const offeredDiscount = ownerFleetDiscounts[f.id] || 0;

                      return (
                         <Card key={f.id} className="bg-white/5 border-none p-5 rounded-3xl group hover:bg-white/[0.08] transition-all">
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                               <div className="flex items-center gap-4">
                                  <div className="w-14 h-14 bg-primary/10 rounded-2xl flex items-center justify-center border border-primary/25">
                                     <Building2 className="w-6 h-6 text-primary" />
                                  </div>
                                  <div>
                                     <h3 className="text-lg font-black">{f.name}</h3>
                                     <div className="flex flex-wrap items-center gap-2 mt-1">
                                        <Badge className="bg-white/5 text-white/60 border border-white/10 text-[9px] font-black uppercase">
                                           {stats.sessions} bookings
                                        </Badge>
                                        <Badge className="bg-white/5 text-white/60 border border-white/10 text-[9px] font-black uppercase">
                                           {stats.kwh.toFixed(1)} kWh
                                        </Badge>
                                        {offeredDiscount > 0 && (
                                           <Badge className="bg-emerald-500/20 text-emerald-400 border-none text-[9px] font-black uppercase flex items-center gap-1">
                                              <Percent className="w-2.5 h-2.5" /> {offeredDiscount}% Off Partner Rate
                                           </Badge>
                                        )}
                                     </div>
                                  </div>
                               </div>

                               <div className="flex items-center justify-between md:justify-end gap-6 border-t md:border-t-0 border-white/5 pt-3 md:pt-0">
                                  <div className="text-left md:text-right">
                                     <p className="text-[10px] font-black text-white/40 uppercase tracking-widest">Station Revenue</p>
                                     <p className="text-lg font-black text-emerald-400">₹{stats.revenue.toLocaleString()}</p>
                                  </div>
                                  <Button 
                                     onClick={() => {
                                        setSelectedFleetForDiscount(f);
                                        setCustomDiscountValue(offeredDiscount.toString());
                                        setDiscountSheetOpen(true);
                                     }}
                                     className="rounded-2xl font-black text-xs px-5 h-11 bg-primary hover:bg-primary/95 text-white"
                                  >
                                     Offer Custom Discount
                                  </Button>
                               </div>
                            </div>
                         </Card>
                      );
                   })}

                   {allFleets.length === 0 && (
                      <div className="text-center py-16 bg-white/5 rounded-[32px] border border-dashed border-white/10">
                         <Building2 className="w-12 h-12 text-white/10 mx-auto mb-4" />
                         <p className="text-sm font-bold text-white/30 tracking-widest uppercase">No fleets registered on EVPlugFinder yet</p>
                      </div>
                   )}
                </div>
             </main>

             {/* Discount Sheet */}
             <Sheet open={discountSheetOpen} onOpenChange={setDiscountSheetOpen}>
                <SheetContent side="bottom" className="rounded-t-[40px] p-6 pb-[var(--safe-bottom)] outline-none bg-slate-900 border-t border-white/10">
                   <SheetHeader className="mb-6">
                      <SheetTitle className="text-2xl font-black flex items-center gap-3 text-white">
                         <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                            <Percent className="w-6 h-6 text-primary" />
                         </div>
                         Offer Fleet Discount
                      </SheetTitle>
                      <SheetDescription className="font-bold text-white/60">
                         Set a custom discount rate for drivers belonging to <span className="text-white font-black">{selectedFleetForDiscount?.name}</span> at your charging stations.
                      </SheetDescription>
                   </SheetHeader>

                   <form onSubmit={handleSaveDiscount} className="space-y-6">
                      <div className="space-y-2">
                         <Label className="text-[10px] font-black uppercase text-white/40">Discount Percentage (%)</Label>
                         <Input 
                            type="number" 
                            min="0"
                            max="100"
                            step="0.5"
                            required
                            value={customDiscountValue} 
                            onChange={(e) => setCustomDiscountValue(e.target.value)}
                            placeholder="e.g. 5" 
                            className="h-14 rounded-2xl font-bold bg-white/5 border-none text-white focus:ring-primary"
                         />
                         <p className="text-[10px] text-white/30 font-medium leading-relaxed mt-1">
                            This discount will automatically deduct from the normal energy fees when Google Fleet members pay at your station.
                         </p>
                      </div>

                      <Button 
                         disabled={isSavingDiscount}
                         size="lg" 
                         className="w-full h-16 rounded-2xl text-lg font-black shadow-xl shadow-primary/20 bg-primary hover:bg-primary/95 text-white"
                      >
                         {isSavingDiscount ? "Saving..." : "Save Discount Settings →"}
                      </Button>
                   </form>
                </SheetContent>
             </Sheet>
          </div>
        );
     }

    return (
      <div className="h-screen p-6 flex flex-col items-center justify-center text-center space-y-6">
        <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center">
          <Building2 className="w-10 h-10 text-primary" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-black">Corporate Fleet Accounts</h1>
          <p className="text-muted-foreground font-bold text-sm max-w-xs mx-auto">
            Manage your company's EV fleet, track driver spending, and get consolidated tax-ready reports.
          </p>
        </div>
        <Button size="lg" className="rounded-2xl font-black px-8" onClick={() => toast({ title: "Onboarding Coming Soon", description: "Enterprise sales team will contact you." })}>
          Request Fleet Account
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0f172a] text-white pb-32">
      {/* Fleet Hero */}
      <header className="px-6 pt-8 pb-12 bg-gradient-to-b from-primary/10 to-transparent">
        <div className="flex justify-between items-start mb-8">
          <div>
            <Badge className="bg-primary/20 text-primary border-none font-black text-[10px] uppercase mb-2">Fleet Administration</Badge>
            <h1 className="text-3xl font-black tracking-tight">{fleet.name}</h1>
            <p className="text-white/40 font-bold text-sm">{fleet.companyId || "CORP-PLAT-421"}</p>
          </div>
          <div className="p-3 bg-white/5 rounded-2xl border border-white/10">
            <Building2 className="w-6 h-6 text-white/50" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Card className="premium-glass p-5 border-none">
            <p className="text-[10px] font-black uppercase text-white/40 mb-1 tracking-widest">Available Credit</p>
            <p className="text-2xl font-black text-emerald-400">₹{fleet.balance || 0}</p>
          </Card>
          <Card className="premium-glass p-5 border-none">
            <p className="text-[10px] font-black uppercase text-white/40 mb-1 tracking-widest">Monthly Spend</p>
            <p className="text-2xl font-black text-primary">₹{fleet.monthlySpend || 0}</p>
          </Card>
        </div>
      </header>

      <main className="px-6 -mt-6">
        <Tabs defaultValue="drivers" className="space-y-6">
          <TabsList className="bg-white/5 w-full rounded-2xl p-1 h-12 border border-white/5 overflow-x-auto justify-start">
            <TabsTrigger value="drivers" className="rounded-xl font-black text-xs h-10 data-[state=active]:bg-primary data-[state=active]:text-white transition-all"><Users className="w-3 h-3 mr-2" /> Drivers</TabsTrigger>
            <TabsTrigger value="reports" className="rounded-xl font-black text-xs h-10 data-[state=active]:bg-primary data-[state=active]:text-white transition-all"><TrendingUp className="w-3 h-3 mr-2" /> Usage</TabsTrigger>
            <TabsTrigger value="billing" className="rounded-xl font-black text-xs h-10 data-[state=active]:bg-primary data-[state=active]:text-white transition-all"><Wallet className="w-3 h-3 mr-2" /> Billing</TabsTrigger>
          </TabsList>

          <TabsContent value="drivers" className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-black">Fleet Members</h2>
              <Button size="sm" className="rounded-full font-black text-[10px] uppercase tracking-widest h-8" onClick={() => setIsInviteOpen(true)}>
                <Plus className="w-3 h-3 mr-1" /> Add Member
              </Button>
            </div>

            <div className="space-y-3">
              <AnimatePresence>
                {drivers.map((driver) => (
                  <motion.div 
                    key={driver.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                  >
                    <Card className="bg-white/5 border-none p-4 rounded-2xl group hover:bg-white/[0.08] transition-all">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center">
                          <Users className="w-6 h-6 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-black truncate">{driver.email}</h3>
                          <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">{driver.role}</p>
                        </div>
                        <Badge variant="outline" className={cn(
                          "font-black text-[9px] uppercase border-none",
                          driver.status === "active" ? "bg-emerald-500/20 text-emerald-400" : "bg-orange-500/20 text-orange-400"
                        )}>
                          {driver.status}
                        </Badge>
                        <Button variant="ghost" size="icon" className="rounded-full opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => handleRemoveDriver(driver.id)}>
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    </Card>
                  </motion.div>
                ))}
              </AnimatePresence>

              {drivers.length === 0 && (
                <div className="text-center py-12 bg-white/5 rounded-3xl border border-dashed border-white/10">
                   <Users className="w-10 h-10 text-white/10 mx-auto mb-3" />
                   <p className="text-sm font-bold text-white/30 tracking-widest uppercase">No drivers added yet</p>
                </div>
              )}
            </div>
          </TabsContent>
          <TabsContent value="reports" className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card className="premium-glass p-4 border-none">
                <p className="text-[10px] font-black uppercase text-white/40 mb-1 tracking-widest">Total Bookings</p>
                <p className="text-2xl font-black">{fleetBookings.length}</p>
              </Card>
              <Card className="premium-glass p-4 border-none">
                <p className="text-[10px] font-black uppercase text-white/40 mb-1 tracking-widest">Total Energy</p>
                <p className="text-2xl font-black text-primary">{fleetBookings.reduce((s, b) => s + (b.energyDeliveredKwh || 0), 0).toFixed(1)} <span className="text-xs">kWh</span></p>
              </Card>
              <Card className="premium-glass p-4 border-none">
                <p className="text-[10px] font-black uppercase text-white/40 mb-1 tracking-widest">Active Drivers</p>
                <p className="text-2xl font-black">{new Set(fleetBookings.map(b => b.userId)).size}</p>
              </Card>
              <Card className="premium-glass p-4 border-none">
                <p className="text-[10px] font-black uppercase text-white/40 mb-1 tracking-widest">Month Cost</p>
                <p className="text-2xl font-black text-emerald-400">₹{fleetBookings.reduce((s, b) => s + (b.totalPrice || 0), 0).toLocaleString()}</p>
              </Card>
            </div>

            <Card className="premium-glass border-none overflow-hidden">
              <div className="p-4 border-b border-white/5 flex justify-between items-center">
                <h3 className="font-black text-sm uppercase tracking-widest">Member Utilization</h3>
                <AnalyticsIcon className="w-4 h-4 text-primary" />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-white/5 text-[10px] font-black uppercase tracking-widest text-white/40">
                    <tr>
                      <th className="px-4 py-3">Member</th>
                      <th className="px-4 py-3">Sessions</th>
                      <th className="px-4 py-3">Energy (kWh)</th>
                      <th className="px-4 py-3">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {drivers.map((driver: any) => {
                      const memberStats = fleetBookings.filter(b => b.userId === driver.uid);
                      const totalKwh = memberStats.reduce((s, b) => s + (b.energyDeliveredKwh || 0), 0);
                      const totalAmt = memberStats.reduce((s, b) => s + (b.totalPrice || 0), 0);
                      
                      return (
                        <tr key={driver.id} className="text-sm font-bold hover:bg-white/[0.02]">
                          <td className="px-4 py-4 truncate max-w-[150px]">{driver.email}</td>
                          <td className="px-4 py-4">{memberStats.length}</td>
                          <td className="px-4 py-4">{totalKwh.toFixed(1)}</td>
                          <td className="px-4 py-4 text-primary">₹{totalAmt.toLocaleString()}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="billing" className="space-y-6">
            <Card className="premium-glass p-6 border-none flex flex-col md:flex-row items-center justify-between gap-6">
              <div className="space-y-1">
                <h3 className="font-black text-lg">Billing Cycle</h3>
                <p className="text-xs font-bold text-white/40 uppercase tracking-widest">Generate tax-ready monthly statements</p>
              </div>
              <div className="flex items-center gap-3 w-full md:w-auto">
                <Input 
                  type="month" 
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="bg-white/5 border-white/10 rounded-xl h-12 font-black"
                />
                <Button 
                  disabled={isGenerating}
                  onClick={() => generateFleetStatement(fleet.id, selectedMonth)}
                  className="h-12 rounded-xl px-6 font-black bg-primary text-white"
                >
                  {isGenerating ? "Processing..." : "Generate Statement"}
                </Button>
              </div>
            </Card>

            <div className="space-y-4">
              <h3 className="font-black text-sm uppercase tracking-widest text-white/40">Statement History</h3>
              {statements.sort((a, b) => b.month.localeCompare(a.month)).map(statement => (
                <Card key={statement.id} className="bg-white/5 border-none p-5 rounded-2xl group">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-white/5 rounded-xl flex items-center justify-center">
                        <FileText className="w-6 h-6 text-white/40" />
                      </div>
                      <div>
                        <h4 className="font-black text-lg">{format(new Date(statement.month + "-01"), "MMMM yyyy")}</h4>
                        <div className="flex items-center gap-2">
                          <Badge className="bg-emerald-500/20 text-emerald-400 border-none font-black text-[9px] uppercase">
                            {statement.status}
                          </Badge>
                          <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest">
                            {statement.totalSessions} Sessions • ₹{statement.netAmount.toLocaleString()}
                          </span>
                        </div>
                      </div>
                    </div>
                    <Button 
                      variant="outline" 
                      onClick={() => handlePrintInvoice(statement)}
                      className="rounded-xl border-white/10 bg-white/5 hover:bg-white/10 font-black text-xs"
                    >
                      <Download className="w-3 h-3 mr-2" /> Invoice
                    </Button>
                  </div>

                    {/* Hidden Printable Invoice */}
                    {printingMonth === statement.month && (
                      <div id={`invoice-${statement.month}`} className="hidden print:block p-10 bg-white text-black font-sans min-h-screen">
                    <div className="max-w-3xl mx-auto space-y-8">
                      <div className="flex justify-between items-start border-b-2 border-black pb-6">
                        <div>
                          <h1 className="text-4xl font-black uppercase tracking-tighter">EVPlugFinder Fleet Invoice</h1>
                          <p className="text-sm font-bold text-gray-500">Corporate Charging Statement</p>
                        </div>
                        <div className="text-right">
                          <p className="font-black text-xl">{fleet.name}</p>
                          <p className="text-sm font-bold">GST: {fleet.gstNumber || "27AADCV1234F1Z5"}</p>
                          <p className="text-sm font-bold">Account: {fleet.companyId}</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-12 py-6">
                        <div className="space-y-1">
                          <p className="text-[10px] font-black uppercase text-gray-400">Statement Period</p>
                          <p className="text-xl font-bold">{format(new Date(statement.month + "-01"), "MMMM yyyy")}</p>
                        </div>
                        <div className="space-y-1 text-right">
                          <p className="text-[10px] font-black uppercase text-gray-400">Statement ID</p>
                          <p className="text-xl font-bold">INV-{statement.month}-{fleet.id.slice(0, 4)}</p>
                        </div>
                      </div>

                      <table className="w-full border-collapse">
                        <thead>
                          <tr className="bg-gray-100 text-[10px] font-black uppercase">
                            <th className="border border-gray-200 p-3 text-left">Member Email</th>
                            <th className="border border-gray-200 p-3 text-center">Sessions</th>
                            <th className="border border-gray-200 p-3 text-center">Energy (kWh)</th>
                            <th className="border border-gray-200 p-3 text-right">Amount (₹)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Object.entries(statement.memberBreakdown).map(([uid, data]: [string, any]) => {
                            const driver = drivers.find((d: any) => d.uid === uid);
                            return (
                              <tr key={uid} className="text-sm font-medium">
                                <td className="border border-gray-200 p-3">{(driver as any)?.email || uid}</td>
                                <td className="border border-gray-200 p-3 text-center">{data.sessions}</td>
                                <td className="border border-gray-200 p-3 text-center">{data.kwh.toFixed(1)}</td>
                                <td className="border border-gray-200 p-3 text-right">{data.amount.toLocaleString()}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot>
                          <tr className="font-black">
                            <td colSpan={3} className="border border-gray-200 p-3 text-right">Gross Total</td>
                            <td className="border border-gray-200 p-3 text-right">₹{statement.grossAmount.toLocaleString()}</td>
                          </tr>
                          <tr className="text-gray-500 font-bold">
                            <td colSpan={3} className="border border-gray-200 p-3 text-right italic">Fleet Discount ({fleet.discountPercent || 0}%)</td>
                            <td className="border border-gray-200 p-3 text-right">-₹{statement.discount.toLocaleString()}</td>
                          </tr>
                          <tr className="text-2xl font-black bg-gray-50">
                            <td colSpan={3} className="border border-gray-200 p-3 text-right uppercase tracking-tight">Net Amount Due</td>
                            <td className="border border-gray-200 p-3 text-right">₹{statement.netAmount.toLocaleString()}</td>
                          </tr>
                        </tfoot>
                      </table>

                      <div className="pt-12 border-t border-gray-200 flex justify-between items-end">
                        <div className="space-y-4">
                          <p className="text-[10px] font-black uppercase text-gray-400">Payment Instructions</p>
                          <div className="flex items-center gap-4">
                            <div className="w-16 h-16 bg-gray-100 rounded-lg flex items-center justify-center font-black text-[8px] text-gray-400 border border-dashed border-gray-300">
                               QR Code
                            </div>
                            <div>
                               <p className="text-sm font-bold">Pay via UPI: <span className="font-black">{fleet.upiId || "evplugfinder.fleet@okicici"}</span></p>
                               <p className="text-xs font-bold text-gray-500 italic">Please include Statement ID in the note.</p>
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                           <p className="text-[10px] font-black uppercase text-gray-400 mb-2">Authorized Signatory</p>
                            <div className="h-10 w-32 bg-gray-50 border-b border-gray-300 mb-1"></div>
                            <p className="text-xs font-bold text-gray-500">EVPlugFinder Billing Team</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </Card>
              ))}

                {statements.length === 0 && (
                  <div className="text-center py-12 bg-white/5 rounded-3xl border border-dashed border-white/10">
                    <FileText className="w-10 h-10 text-white/10 mx-auto mb-3" />
                    <p className="text-sm font-bold text-white/30 tracking-widest uppercase">No statements generated yet</p>
                  </div>
                )}
              </div>
            </TabsContent>
        </Tabs>
      </main>

      {/* Invite Sheet */}
      <Sheet open={isInviteOpen} onOpenChange={setIsInviteOpen}>
        <SheetContent side="bottom" className="rounded-t-[40px] p-6 pb-[var(--safe-bottom)] outline-none">
          <SheetHeader className="mb-6">
            <SheetTitle className="text-2xl font-black flex items-center gap-3">
               <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                 <Mail className="w-6 h-6 text-primary" />
               </div>
               Invite Fleet Member
            </SheetTitle>
            <SheetDescription className="font-bold">
               Invite drivers to your corporate account by email.
            </SheetDescription>
          </SheetHeader>

          <form onSubmit={handleInviteDriver} className="space-y-6">
             <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase text-muted-foreground">Work Email Address</Label>
                <Input 
                  type="email" 
                  required
                  value={inviteData.email} 
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setInviteData({...inviteData, email: e.target.value})}
                  placeholder="driver@company.com" 
                  className="h-14 rounded-2xl font-bold bg-muted/30 border-none"
                />
             </div>

             <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase text-muted-foreground">Access Role</Label>
                <div className="grid grid-cols-2 gap-4">
                   <Button 
                    type="button" 
                    variant={inviteData.role === "driver" ? "default" : "outline"}
                    className="h-14 rounded-2xl font-black"
                    onClick={() => setInviteData({...inviteData, role: "driver"})}
                   >
                     Driver
                   </Button>
                   <Button 
                    type="button" 
                    variant={inviteData.role === "manager" ? "default" : "outline"}
                    className="h-14 rounded-2xl font-black"
                    onClick={() => setInviteData({...inviteData, role: "manager"})}
                   >
                     Manager
                   </Button>
                </div>
             </div>

             <Button size="lg" className="w-full h-16 rounded-2xl text-lg font-black shadow-xl shadow-primary/20">
                Send Invitation →
             </Button>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}
