import { useState, useEffect, useMemo, useRef } from "react";
import { collection, query, where, getDocs, doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { subscribeToOwnerStations } from "@/lib/owner-service";
import { toJSDate, safeFormatDistanceToNow } from "@/lib/date-utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Users, TrendingUp, Zap, Clock, ShieldCheck, Mail, Phone, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { DriverCohortSection } from "@/components/owner/DriverCohortSection";


// Define the shape of our aggregated driver
interface DriverStat {
  userId: string;
  name: string;
  sessions: number;
  totalSpent: number;
  totalKwh: number;
  lastVisit: number | null;
  firstVisit: number | null;
  stations: Set<string>;
}

export default function OwnerDrivers() {
  const { user } = useAuth();
  const [completedBookings, setCompletedBookings] = useState<any[]>([]);
  const [ownerStationIds, setOwnerStationIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    if (!user?.uid) return;
    let isMounted = true;

    // 1. Subscribe to owner's stations
    const unsubscribe = subscribeToOwnerStations(user.uid, async (stationsList) => {
      if (!isMounted) return;
      
      const sIds = stationsList.map(s => s.id);
      setOwnerStationIds(sIds);
      
      if (sIds.length === 0) {
        setLoading(false);
        return;
      }

      // 2. Fetch all bookings for this owner directly
      try {
        const all: any[] = [];
        const snap = await getDocs(query(
          collection(db, "bookings"), 
          where("ownerId", "==", user.uid)
        ));
        
        snap.forEach((d) => {
          const data = d.data();
          // Broaden filter: Include anything that is recorded as paid/completed/confirmed
          const isSuccessful = 
            data.status === "completed" || 
            data.status === "confirmed" ||
            ["paid", "completed", "success"].includes(data.paymentStatus);
            
          if (isSuccessful) {
            all.push({ id: d.id, ...data });
          }
        });
        
        if (isMounted) {
          setCompletedBookings(all);
          setLoading(false);
        }
      } catch (err) {
        console.error("Failed to load CRM bookings:", err);
        if (isMounted) setLoading(false);
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [user?.uid]);

  const driverStats = useMemo(() => {
    const stats: Record<string, DriverStat> = {};
    
    // We only process if we have station IDs
    if (ownerStationIds.length === 0) return [];

    completedBookings
      .filter(b => ownerStationIds.includes(b.stationId))
      .forEach(b => {
        if (!stats[b.userId]) {
          stats[b.userId] = {
            userId: b.userId,
            name: b.userName || "Driver #" + b.userId.substring(0, 6),
            sessions: 0,
            totalSpent: 0,
            totalKwh: 0,
            lastVisit: null,
            firstVisit: null,
            stations: new Set(),
          };
        }
        const d = stats[b.userId];
        d.sessions++;
        d.totalSpent += Number(b.totalPrice) || 0;
        d.totalKwh += Number(b.energyDeliveredKwh) || 0;
        d.stations.add(b.stationId);
        
        // Normalize time for comparison
        const bTime = toJSDate(b.startTime || b.createdAt).getTime();
        if (!d.lastVisit || bTime > d.lastVisit) d.lastVisit = bTime;
        if (!d.firstVisit || bTime < d.firstVisit) d.firstVisit = bTime;
      });

    return Object.values(stats);
  }, [completedBookings, ownerStationIds]);

  const getTier = (spent: number) => {
    if (spent >= 5000) return { name: "Gold", color: "bg-amber-400 text-amber-900 border-amber-500/20" };
    if (spent >= 2000) return { name: "Silver", color: "bg-slate-300 text-slate-800 border-slate-400/20" };
    return { name: "Bronze", color: "bg-orange-800/20 text-orange-700 border-orange-800/10" };
  };

  const filteredStats = driverStats
    .filter(d => d.name.toLowerCase().includes(searchTerm.toLowerCase()))
    .filter(d => d.sessions >= 2);
  
  filteredStats.sort((a, b) => b.totalSpent - a.totalSpent || b.sessions - a.sessions || (b.lastVisit || 0) - (a.lastVisit || 0));

  const totalDrivers = driverStats.length;
  const loyalDrivers = driverStats.filter(d => d.sessions >= 2).length;
  const avgSpend = totalDrivers > 0 ? (driverStats.reduce((acc, d) => acc + d.totalSpent, 0) / totalDrivers) : 0;

  // Name resolution for loyal drivers
  const [namesMap, setNamesMap] = useState<Record<string, string>>({});
  const fetchedUids = useRef(new Set<string>());

  useEffect(() => {
    let isMounted = true;
    const fetchLoyalNames = async () => {
      // Get UIDs of loyal drivers that we haven't attempted to fetch yet
      const missingNameUids = filteredStats
        .map(d => d.userId)
        .filter(uid => !fetchedUids.current.has(uid));

      if (missingNameUids.length === 0) return;

      for (const uid of missingNameUids) {
        fetchedUids.current.add(uid);
        if (!isMounted) break;
        try {
          const userDoc = await getDoc(doc(db, "users", uid));
          if (userDoc.exists() && isMounted) {
            const data = userDoc.data();
            let nameToSet = "";
            if (data.fullName) {
              nameToSet = data.fullName;
            } else if (data.displayName) {
              nameToSet = data.displayName;
            } else if (data.email) {
              nameToSet = data.email.split('@')[0];
            }
            
            if (nameToSet) {
              setNamesMap(prev => ({ ...prev, [uid]: nameToSet }));
            } else {
              setNamesMap(prev => ({ ...prev, [uid]: "Driver #" + uid.substring(0, 6) }));
            }
          } else {
            setNamesMap(prev => ({ ...prev, [uid]: "Driver #" + uid.substring(0, 6) }));
          }
        } catch (err) {
          console.error(`Error fetching profile for ${uid}:`, err);
          if (isMounted) {
            setNamesMap(prev => ({ ...prev, [uid]: "Driver #" + uid.substring(0, 6) }));
          }
        }
      }
    };

    fetchLoyalNames();
    
    return () => {
      isMounted = false;
    }
  }, [filteredStats]);
  if (loading) {
    return <div className="h-full flex items-center justify-center animate-pulse font-black text-slate-400">Loading CRM Data...</div>;
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col gap-2">
        <h1 className="text-4xl font-black tracking-tight text-slate-900 dark:text-white">Driver CRM</h1>
        <p className="text-muted-foreground font-medium">Understand and reward your top customers.</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="rounded-[30px] border-none shadow-sm bg-gradient-to-br from-blue-500/10 to-blue-600/5 dark:from-blue-500/20 dark:to-blue-600/10">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-black uppercase tracking-widest text-blue-600 dark:text-blue-400 mb-1">Total Unique Drivers</p>
                <h3 className="text-3xl font-black">{totalDrivers}</h3>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-blue-500/20 flex items-center justify-center text-blue-600 dark:text-blue-400">
                <Users className="w-6 h-6" />
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="rounded-[30px] border-none shadow-sm bg-gradient-to-br from-emerald-500/10 to-emerald-600/5 dark:from-emerald-500/20 dark:to-emerald-600/10">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400 mb-1">Loyal Customers (≥ 2 visits)</p>
                <h3 className="text-3xl font-black">{loyalDrivers}</h3>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                <ShieldCheck className="w-6 h-6" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-[30px] border-none shadow-sm bg-gradient-to-br from-indigo-500/10 to-indigo-600/5 dark:from-indigo-500/20 dark:to-indigo-600/10">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-400 mb-1">Avg Lifetime Value</p>
                <h3 className="text-3xl font-black">₹{avgSpend.toFixed(0)}</h3>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-indigo-500/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                <TrendingUp className="w-6 h-6" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Retention Analysis Suite */}
      <DriverCohortSection 
        bookings={completedBookings} 
        isLoading={loading} 
      />

      {/* Main Table */}

      <Card className="rounded-[30px] border-2 shadow-sm overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between border-b bg-muted/20 px-6 py-5">
           <CardTitle className="text-lg font-black tracking-tight">Driver Leaderboard</CardTitle>
           <div className="relative max-w-xs w-full">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input 
                placeholder="Search drivers..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 h-10 w-full rounded-full bg-background font-medium" 
              />
           </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow className="hover:bg-transparent">
                <TableHead className="font-black tracking-wider uppercase text-[10px] h-12 px-6 text-slate-500">Driver</TableHead>
                <TableHead className="font-black tracking-wider uppercase text-[10px] h-12 text-slate-500">Tier</TableHead>
                <TableHead className="font-black tracking-wider uppercase text-[10px] h-12 text-slate-500 text-right">Sessions</TableHead>
                <TableHead className="font-black tracking-wider uppercase text-[10px] h-12 text-slate-500 text-right">Total Spent</TableHead>
                <TableHead className="font-black tracking-wider uppercase text-[10px] h-12 text-slate-500 text-right hidden md:table-cell">Energy (kWh)</TableHead>
                <TableHead className="font-black tracking-wider uppercase text-[10px] h-12 text-slate-500 text-right">Last Visit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredStats.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center text-muted-foreground font-medium">
                    No drivers found. Start running bookings to populate CRM!
                  </TableCell>
                </TableRow>
              ) : (
                filteredStats.map((driver) => {
                  const tier = getTier(driver.totalSpent);
                  return (
                    <TableRow key={driver.userId} className="group hover:bg-muted/40 transition-colors">
                      <TableCell className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary shrink-0">
                             {driver.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-bold text-slate-900 dark:text-slate-100">{namesMap[driver.userId] || driver.name}</p>
                            <p className="text-xs text-muted-foreground font-medium flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                              <span className="truncate max-w-[120px]">{driver.userId}</span>
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                         <Badge className={`border uppercase text-[10px] font-black pointer-events-none px-2 py-0.5 ${tier.color}`}>
                           {tier.name}
                         </Badge>
                      </TableCell>
                      <TableCell className="text-right font-bold text-slate-700 dark:text-slate-300">
                        {driver.sessions}
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="font-black text-primary">₹{driver.totalSpent.toLocaleString()}</span>
                      </TableCell>
                      <TableCell className="text-right font-medium hidden md:table-cell text-slate-500">
                        {driver.totalKwh.toFixed(1)} kWh
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex flex-col items-end">
                           <span className="text-sm font-bold text-slate-700 dark:text-slate-300">
                             {driver.lastVisit ? safeFormatDistanceToNow(driver.lastVisit, { addSuffix: true }) : "N/A"}
                           </span>
                           <span className="text-[10px] text-muted-foreground font-medium hidden lg:block uppercase tracking-widest mt-0.5">
                             {driver.stations.size} Station{driver.stations.size !== 1 && "s"} Visited
                           </span>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      
      {/* Privacy Notice */}
      <div className="flex items-start gap-3 bg-blue-500/10 border border-blue-500/20 p-4 rounded-2xl">
         <ShieldCheck className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
         <div>
           <p className="text-sm font-bold text-blue-900 dark:text-blue-100">Data Privacy Standard</p>
           <p className="text-xs text-blue-800/80 dark:text-blue-200/80 mt-1">Driver emails and phone numbers are hidden to comply with platform privacy policies. You can communicate securely through push notifications directly via the Promotions tab.</p>
         </div>
      </div>
    </div>
  );
}
