import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { 
  doc, 
  getDoc, 
  setDoc, 
  collection, 
  getDocs, 
  updateDoc, 
  addDoc,
  serverTimestamp,
  onSnapshot,
  query,
  where,
  deleteDoc,
  limit,
  orderBy,
  writeBatch,
  Timestamp
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/hooks/use-toast";
import { 
  Settings, 
  Percent, 
  ShieldAlert, 
  Database, 
  Users, 
  Zap, 
  Activity, 
  Trash2, 
  Play,
  Save,
  Loader2,
  Calendar,
  AlertCircle,
  Megaphone,
  Clock,
  Layout,
  Plus,
  Bell,
  Trash
} from "lucide-react";
import { format } from "date-fns";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger,
  DialogFooter 
} from "@/components/ui/dialog";

export default function AdminSettings() {
  const [location, setLocation] = useLocation();
  const { user, userRole, loading: authLoading } = useAuth();
  const { toast } = useToast();

  // Platform Fee State
  const [platformFee, setPlatformFee] = useState(5);
  const [oldFee, setOldFee] = useState(5);
  const [feeLoading, setFeeLoading] = useState(false);

  // Maintenance Mode State
  const [maintenance, setMaintenance] = useState({
    mode: false,
    message: "",
    endsAt: ""
  });
  const [mLoading, setMLoading] = useState(false);

  // Stats State
  const [liveStats, setLiveStats] = useState({
    stations: 0,
    users: 0,
    bookings: 0
  });

  // Admin List State
  const [admins, setAdmins] = useState<any[]>([]);

  // Typed Confirmation for Wipe
  const [showWipeModal, setShowWipeModal] = useState(false);
  const [wipeConfirm, setWipeConfirm] = useState("");

  // Maintenance Windows State
  const [maintenanceWindows, setMaintenanceWindows] = useState<any[]>([]);
  const [showWindowForm, setShowWindowForm] = useState(false);
  const [windowForm, setWindowForm] = useState({
    title: "",
    description: "",
    startDate: "",
    startTime: "",
    endDate: "",
    endTime: "",
    affectedSystems: [] as string[],
    notifyUsers: true,
    notifyOwners: true
  });

  // Announcements State
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [showAnnForm, setShowAnnForm] = useState(false);
  const [annForm, setAnnForm] = useState({
    title: "",
    message: "",
    type: "info" as any,
    targetAudience: "all",
    publishImmediately: true,
    publishAt: "",
    expiresAt: ""
  });
  const [activeTab, setActiveTab] = useState("published");

  if (!authLoading && userRole !== "admin") {
    setLocation("/");
    return null;
  }

  useEffect(() => {
    // Update last login
    if (user) {
      updateDoc(doc(db, "users", user.uid), {
        lastLogin: serverTimestamp()
      });
    }

    // Load Global Settings
    const loadSettings = async () => {
      const snap = await getDoc(doc(db, "settings", "global"));
      if (snap.exists()) {
        const data = snap.data();
        setPlatformFee(data.platformFeePercent || 5);
        setOldFee(data.platformFeePercent || 5);
        setMaintenance({
          mode: data.maintenanceMode || false,
          message: data.maintenanceMessage || "",
          endsAt: data.maintenanceEndsAt ? 
            (data.maintenanceEndsAt.toDate ? format(data.maintenanceEndsAt.toDate(), "yyyy-MM-dd'T'HH:mm") : data.maintenanceEndsAt) : ""
        });
      }
    };
    loadSettings();

    // Live Stats Subscriptions
    const subStations = onSnapshot(collection(db, "stations"), s => setLiveStats(p => ({ ...p, stations: s.size })));
    const subUsers = onSnapshot(collection(db, "users"), s => setLiveStats(p => ({ ...p, users: s.size })));
    const subBookings = onSnapshot(collection(db, "bookings"), s => setLiveStats(p => ({ ...p, bookings: s.size })));

    // Fetch Admins
    const fetchAdmins = async () => {
      const q = query(collection(db, "users"), where("role", "==", "admin"));
      const snap = await getDocs(q);
      setAdmins(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    };
    fetchAdmins();

    // Maintenance Windows Subscription
    const unsubMaintenance = onSnapshot(
      query(collection(db, "maintenanceWindows"), orderBy("startDate", "desc"), limit(10)),
      snap => setMaintenanceWindows(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );

    // Announcements Subscription
    const unsubAnn = onSnapshot(
      query(collection(db, "announcements"), orderBy("createdAt", "desc")),
      snap => setAnnouncements(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );

    return () => {
      subStations();
      subUsers();
      subBookings();
      unsubMaintenance();
      unsubAnn();
    };
  }, [user]);

  // AUTO-ACTIVATE MAINTENANCE
  useEffect(() => {
    const checkWindows = async () => {
      const now = new Date();
      for (const window of maintenanceWindows) {
        const start = window.startDate?.toDate ? window.startDate.toDate() : new Date(window.startDate);
        const end = window.endDate?.toDate ? window.endDate.toDate() : new Date(window.endDate);
        if (!start || !end) continue;

        if (start <= now && end >= now && window.status === "scheduled") {
          await updateDoc(doc(db, "maintenanceWindows", window.id), { status: "active" });
          await setDoc(doc(db, "settings", "global"), {
            maintenanceMode: true,
            maintenanceMessage: window.description,
            maintenanceEndsAt: Timestamp.fromDate(end)
          }, { merge: true });
        }

        if (end < now && window.status === "active") {
          await updateDoc(doc(db, "maintenanceWindows", window.id), { status: "completed" });
          await setDoc(doc(db, "settings", "global"), { maintenanceMode: false }, { merge: true });
        }
      }
    };
    checkWindows();
    const interval = setInterval(checkWindows, 1 * 60 * 1000); // Check every minute
    return () => clearInterval(interval);
  }, [maintenanceWindows]);

  // AUTO-PUBLISH / EXPIRE ANNOUNCEMENTS
  useEffect(() => {
    const checkAnnouncements = async () => {
      const now = new Date();
      
      // Publish Scheduled
      const scheduled = announcements.filter(a => a.status === "scheduled" && a.publishAt?.toDate() <= now);
      for (const a of scheduled) {
        await updateDoc(doc(db, "announcements", a.id), { status: "published", publishedAt: serverTimestamp() });
        await setDoc(doc(db, "settings", "global"), {
          announcementId: a.id,
          announcementMessage: a.message,
          announcementType: a.type,
          announcementActive: true,
          targetAudience: a.targetAudience,
          publishedAt: serverTimestamp()
        }, { merge: true });
      }

      // Expire Published
      const expired = announcements.filter(a => a.status === "published" && a.expiresAt?.toDate() <= now);
      for (const a of expired) {
        await updateDoc(doc(db, "announcements", a.id), { status: "archived" });
        await setDoc(doc(db, "settings", "global"), { announcementActive: false }, { merge: true });
      }
    };
    checkAnnouncements();
    const interval = setInterval(checkAnnouncements, 60000);
    return () => clearInterval(interval);
  }, [announcements]);

  const handleScheduleWindow = async () => {
    const startDateTime = new Date(`${windowForm.startDate}T${windowForm.startTime}`);
    const endDateTime = new Date(`${windowForm.endDate}T${windowForm.endTime}`);

    if (endDateTime <= startDateTime) {
      toast({ variant: "destructive", title: "Invalid Dates", description: "End time must be after start time" });
      return;
    }

    try {
      const ref = await addDoc(collection(db, "maintenanceWindows"), {
        title: windowForm.title,
        description: windowForm.description,
        startDate: Timestamp.fromDate(startDateTime),
        endDate: Timestamp.fromDate(endDateTime),
        affectedSystems: windowForm.affectedSystems,
        status: "scheduled",
        createdBy: user?.uid,
        createdAt: serverTimestamp(),
        notifyUsers: windowForm.notifyUsers,
        notifyOwners: windowForm.notifyOwners
      });

      if (windowForm.notifyOwners) {
        const ownersSnap = await getDocs(collection(db, "owners"));
        const notifBatch = writeBatch(db);
        ownersSnap.docs.forEach(owner => {
          const notifRef = doc(collection(db, "notifications"));
          notifBatch.set(notifRef, {
            userId: owner.id,
            type: "MAINTENANCE_SCHEDULED",
            title: `Maintenance: ${windowForm.title}`,
            message: `Platform maintenance scheduled from ${format(startDateTime, "MMM d, h:mm a")} to ${format(endDateTime, "h:mm a")}`,
            read: false,
            createdAt: serverTimestamp()
          });
        });
        await notifBatch.commit();
      }

      await addDoc(collection(db, "audit_logs"), {
        action: "MAINTENANCE_SCHEDULED",
        severity: "HIGH",
        performedBy: user?.uid,
        targetId: ref.id,
        targetType: "system",
        metadata: { title: windowForm.title, start: startDateTime.toISOString() },
        timestamp: serverTimestamp()
      });

      setShowWindowForm(false);
      toast({ title: "Maintenance scheduled ✅" });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message });
    }
  };

  const handleSaveAnnouncement = async (status: "draft" | "scheduled" | "published") => {
    try {
      const payload: any = {
        title: annForm.title,
        message: annForm.message,
        type: annForm.type,
        targetAudience: annForm.targetAudience,
        status,
        createdBy: user?.uid,
        createdAt: serverTimestamp(),
        viewCount: 0,
        publishAt: annForm.publishAt ? Timestamp.fromDate(new Date(annForm.publishAt)) : null,
        expiresAt: annForm.expiresAt ? Timestamp.fromDate(new Date(annForm.expiresAt)) : null
      };

      if (status === "published") {
        payload.publishedAt = serverTimestamp();
      }

      const ref = await addDoc(collection(db, "announcements"), payload);

      if (status === "published") {
        await setDoc(doc(db, "settings", "global"), {
          announcementId: ref.id,
          announcementMessage: annForm.message,
          announcementType: annForm.type,
          announcementActive: true,
          targetAudience: annForm.targetAudience,
          publishedAt: serverTimestamp()
        }, { merge: true });
      }

      setShowAnnForm(false);
      toast({ title: `Announcement ${status} ✓` });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message });
    }
  };

  const cancelMaintenanceWindow = async (id: string) => {
    await updateDoc(doc(db, "maintenanceWindows", id), { status: "cancelled" });
    toast({ title: "Maintenance window cancelled" });
  };

  const handleSaveFee = async () => {
    setFeeLoading(true);
    try {
      await setDoc(doc(db, "settings", "global"), { platformFeePercent: platformFee }, { merge: true });
      await addDoc(collection(db, "audit_logs"), {
        action: "PLATFORM_FEE_UPDATED",
        severity: "HIGH",
        performedBy: user?.uid,
        performedByEmail: user?.email,
        metadata: { previousFee: oldFee, newFee: platformFee },
        timestamp: serverTimestamp()
      });
      setOldFee(platformFee);
      toast({ title: "Platform fee updated" });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message });
    } finally {
      setFeeLoading(false);
    }
  };

  const handleToggleMaintenance = async () => {
    setMLoading(true);
    const newStatus = !maintenance.mode;
    try {
      const payload: any = { maintenanceMode: newStatus };
      if (newStatus) {
        payload.maintenanceMessage = maintenance.message || "Scheduled Maintenance";
        payload.maintenanceStartedAt = serverTimestamp();
        payload.maintenanceEndsAt = maintenance.endsAt ? new Date(maintenance.endsAt) : null;
        payload.maintenanceStartedBy = user?.uid;
      } else {
        payload.maintenanceEndedAt = serverTimestamp();
      }

      await setDoc(doc(db, "settings", "global"), payload, { merge: true });
      setMaintenance(p => ({ ...p, mode: newStatus }));
      toast({ title: `Maintenance mode ${newStatus ? 'ENABLED' : 'DISABLED'}` });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message });
    } finally {
      setMLoading(false);
    }
  };

  const handleWipeDatabase = async () => {
    if (wipeConfirm !== "WIPE") return;
    try {
      const collections = ["stations", "bookings", "notifications", "reviews"];
      for (const coll of collections) {
        const snap = await getDocs(collection(db, coll));
        await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
      }
      toast({ title: "Database wiped successfully" });
      setShowWipeModal(false);
      setWipeConfirm("");
    } catch (e: any) {
      toast({ variant: "destructive", title: "Wipe Failed", description: e.message });
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-8 min-h-screen pb-20">
      <div>
        <h1 className="text-4xl font-black tracking-tight flex items-center gap-3">
          <Settings className="w-10 h-10 text-primary" />
          Platform Settings
        </h1>
        <p className="text-muted-foreground font-medium mt-1">Configure global parameters and lifecycle</p>
      </div>

      <div className="grid lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          {/* Section 1: Platform Fee */}
          <Card className="rounded-[30px] border-2 shadow-xl shadow-primary/5 overflow-hidden">
            <CardHeader className="bg-muted/30">
              <CardTitle className="flex items-center gap-2">
                <Percent className="w-5 h-5 text-primary" />
                Platform Commission
              </CardTitle>
              <CardDescription>Adjust the cut taken from every recharging transaction.</CardDescription>
            </CardHeader>
            <CardContent className="p-8 space-y-8">
              <div className="space-y-4">
                <div className="flex justify-between items-end">
                  <span className="text-sm font-black uppercase tracking-widest text-muted-foreground">Commission Rate</span>
                  <span className="text-4xl font-black text-primary">{platformFee}%</span>
                </div>
                <Slider 
                  value={[platformFee]} 
                  onValueChange={v => setPlatformFee(v[0])} 
                  max={15} 
                  min={1} 
                  step={0.5} 
                  className="py-4"
                />
              </div>
              
              <div className="p-4 rounded-2xl bg-primary/5 border border-primary/10 flex justify-between items-center italic text-sm font-medium">
                <span>Owner keeps ₹{(100 - platformFee).toFixed(1)} of every ₹100 earned.</span>
                <Button onClick={handleSaveFee} disabled={feeLoading || platformFee === oldFee} size="sm" className="gap-2 font-black rounded-lg">
                  {feeLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Save Changes
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Section 2: Maintenance Mode */}
          <Card className={`rounded-[30px] border-2 shadow-xl shadow-primary/5 overflow-hidden transition-all ${maintenance.mode ? 'border-red-500 ring-4 ring-red-500/10' : ''}`}>
            <CardHeader className={maintenance.mode ? 'bg-red-500/10' : 'bg-muted/30'}>
              <CardTitle className="flex items-center gap-2">
                <ShieldAlert className={`w-5 h-5 ${maintenance.mode ? 'text-red-500' : 'text-primary'}`} />
                Maintenance Mode
              </CardTitle>
              <CardDescription>Take the whole platform offline for non-admin users.</CardDescription>
            </CardHeader>
            <CardContent className="p-8 space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Maintenance Message</label>
                <Input 
                  placeholder="e.g. Upgrading network infrastructure..." 
                  value={maintenance.message}
                  onChange={e => setMaintenance(p => ({ ...p, message: e.target.value }))}
                  className="rounded-xl h-12 border-2"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Estimated End Time</label>
                <Input 
                  type="datetime-local"
                  value={maintenance.endsAt}
                  onChange={e => setMaintenance(p => ({ ...p, endsAt: e.target.value }))}
                  className="rounded-xl h-12 border-2"
                />
              </div>
              <Button 
                onClick={handleToggleMaintenance} 
                variant={maintenance.mode ? "default" : "destructive"} 
                className="w-full h-14 rounded-xl font-black uppercase tracking-widest shadow-xl shadow-primary/20"
                disabled={mLoading}
              >
                {mLoading ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : null}
                {maintenance.mode ? "Disable Maintenance Mode" : "Enable Maintenance Mode"}
              </Button>
            </CardContent>
          </Card>

          {/* Section 5: Admin Accounts */}
          <Card className="rounded-[30px] border-2 shadow-xl shadow-primary/5 overflow-hidden">
            <CardHeader className="bg-muted/30">
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5 text-primary" />
                Administrative Access
              </CardTitle>
              <CardDescription>Manage verified administrators of the EVPlugFinder platform.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Admin Name</TableHead>
                    <TableHead>Email Address</TableHead>
                    <TableHead>Last Activity</TableHead>
                    <TableHead className="text-right">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {admins.map(a => (
                    <TableRow key={a.id}>
                      <TableCell className="font-bold">{a.fullName || "System Admin"}</TableCell>
                      <TableCell className="text-muted-foreground">{a.email}</TableCell>
                      <TableCell className="text-xs font-medium">
                        {a.lastLogin ? format(a.lastLogin.toDate ? a.lastLogin.toDate() : new Date(a.lastLogin), "MMM d, p") : "Never"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant="outline" className="border-primary/30 text-primary">Active</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-8">
          {/* Section 4: Platform Statistics */}
          <Card className="rounded-[30px] border-2 shadow-xl shadow-primary/5 overflow-hidden">
            <CardHeader className="bg-primary/5 border-b-2 border-primary/10">
              <CardTitle className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
                <Activity className="w-4 h-4" />
                Live Counters
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              {[
                { label: "Stations", value: liveStats.stations, icon: Zap, color: "text-amber-500" },
                { label: "Total Users", value: liveStats.users, icon: Users, color: "text-blue-500" },
                { label: "Bookings", value: liveStats.bookings, icon: Calendar, color: "text-emerald-500" }
              ].map((stat, i) => (
                <div key={i} className="flex items-center justify-between group">
                  <div className="flex items-center gap-3">
                    <div className={`p-3 rounded-2xl bg-muted/50 group-hover:bg-white group-hover:shadow-md transition-all`}>
                      <stat.icon className={`w-5 h-5 ${stat.color}`} />
                    </div>
                    <span className="text-sm font-bold text-muted-foreground tracking-tight">{stat.label}</span>
                  </div>
                  <span className="text-2xl font-black">{stat.value}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Section 3: Database Lifecycle */}
          <Card className="rounded-[30px] border-2 shadow-xl shadow-red-500/5 border-red-500/10 overflow-hidden">
            <CardHeader className="bg-red-500/5">
              <CardTitle className="text-sm font-black uppercase tracking-widest flex items-center gap-2 text-red-500">
                <Database className="w-4 h-4" />
                Data Lifecycle
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <p className="text-xs text-muted-foreground">DANGER: These actions are destructive and recorded in audit logs.</p>
              {!showWipeModal ? (
                <>
                  <Button variant="outline" className="w-full gap-2 font-black h-12 border-2" onClick={() => toast({ title: "Seed moved to admin main page." })}>
                    <Play className="w-4 h-4" />
                    Seed Data
                  </Button>
                  <Button variant="destructive" className="w-full gap-2 font-black h-12 shadow-lg shadow-red-500/10" onClick={() => setShowWipeModal(true)}>
                    <Trash2 className="w-4 h-4" />
                    Wipe Platform
                  </Button>
                </>
              ) : (
                <div className="space-y-4 animate-in zoom-in-95 duration-200">
                  <p className="text-[10px] font-bold text-red-600 uppercase tracking-widest text-center">Type "WIPE" to confirm</p>
                  <Input 
                    placeholder="WIPE" 
                    value={wipeConfirm}
                    onChange={e => setWipeConfirm(e.target.value)}
                    className="h-12 border-red-500 border-2 text-center font-black rounded-xl"
                  />
                  <div className="flex gap-2">
                    <Button variant="ghost" className="flex-1 font-bold" onClick={() => { setShowWipeModal(false); setWipeConfirm(""); }}>Cancel</Button>
                    <Button variant="destructive" className="flex-1 font-bold" disabled={wipeConfirm !== "WIPE"} onClick={handleWipeDatabase}>Confirm</Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Admin Context Banner */}
          <div className="p-6 rounded-[30px] bg-gradient-to-br from-indigo-600 to-indigo-800 text-white shadow-2xl relative overflow-hidden">
            <ShieldAlert className="absolute -bottom-4 -right-4 w-24 h-24 opacity-10 rotate-12" />
            <h3 className="font-black text-lg mb-1 italic">Administrative Portal</h3>
            <p className="text-indigo-100 text-xs font-medium leading-relaxed opacity-80">
              You are accessing critical platform infrastructure. Every change is logged with your ID for compliance.
            </p>
          </div>
          </div>
        </div>

        <div className="lg:col-span-3 space-y-8">
           <style>{`
            .window-card { border: 2px solid hsl(var(--border) / 0.5); border-radius: 24px; padding: 24px; margin-bottom: 12px; transition: all 0.2s ease; }
            .window-active { border-color: #f97316; background: #fffaf0; }
            .window-past { opacity: 0.6; grayscale: 50%; }
            .window-upcoming { border-color: #3b82f6; }
            .system-chip { background: hsl(var(--muted)); padding: 4px 12px; border-radius: 12px; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; color: hsl(var(--muted-foreground)); }
            .ann-card { border: 2px solid hsl(var(--border) / 0.5); border-radius: 24px; padding: 20px; margin-bottom: 12px; }
            .ann-type-info { border-left: 6px solid #3b82f6; }
            .ann-type-warning { border-left: 6px solid #f97316; }
            .ann-type-success { border-left: 6px solid #22c55e; }
            .ann-type-urgent { border-left: 6px solid #ef4444; }
          `}</style>

          {/* Section: Scheduled Maintenance */}
          <div className="grid md:grid-cols-2 gap-8">
            <Card className="rounded-[40px] border-2 shadow-2xl shadow-primary/5 overflow-hidden col-span-1">
              <CardHeader className="bg-primary/5 border-b-2 border-primary/10 p-8">
                 <div className="flex justify-between items-center">
                    <div>
                      <CardTitle className="text-2xl font-black italic uppercase italic tracking-tighter flex items-center gap-2">
                        <Calendar className="w-6 h-6 text-primary" />
                        Maintenance Windows
                      </CardTitle>
                      <CardDescription className="font-medium">Plan upcoming platform downtime in advance</CardDescription>
                    </div>
                    <Button onClick={() => setShowWindowForm(!showWindowForm)} variant="outline" className="rounded-2xl font-black gap-2 border-2">
                      {showWindowForm ? "Cancel" : <Plus className="w-4 h-4" />}
                      {showWindowForm ? "Hide Form" : "Schedule New"}
                    </Button>
                 </div>
              </CardHeader>
              <CardContent className="p-8">
                {showWindowForm && (
                  <div className="bg-muted/30 p-8 rounded-[30px] border-2 border-dashed border-primary/20 mb-8 space-y-6 animate-in slide-in-from-top-4 duration-300">
                    <div className="grid gap-4">
                      <div className="space-y-2">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-2">Reason for maintenance</Label>
                        <Input placeholder="e.g. Server Migration" className="rounded-xl border-2 h-12" value={windowForm.title} onChange={e => setWindowForm(p => ({ ...p, title: e.target.value }))} />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                           <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-2">Start Date</Label>
                           <Input type="date" className="rounded-xl border-2 h-12" value={windowForm.startDate} onChange={e => setWindowForm(p => ({ ...p, startDate: e.target.value }))} />
                        </div>
                        <div className="space-y-2">
                           <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-2">Start Time</Label>
                           <Input type="time" className="rounded-xl border-2 h-12" value={windowForm.startTime} onChange={e => setWindowForm(p => ({ ...p, startTime: e.target.value }))} />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                           <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-2">End Date</Label>
                           <Input type="date" className="rounded-xl border-2 h-12" value={windowForm.endDate} onChange={e => setWindowForm(p => ({ ...p, endDate: e.target.value }))} />
                        </div>
                        <div className="space-y-2">
                           <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-2">End Time</Label>
                           <Input type="time" className="rounded-xl border-2 h-12" value={windowForm.endTime} onChange={e => setWindowForm(p => ({ ...p, endTime: e.target.value }))} />
                        </div>
                      </div>
                      <div className="flex gap-4 p-4 bg-background rounded-2xl border-2 border-primary/10">
                        <div className="flex items-center gap-2">
                          <Switch checked={windowForm.notifyOwners} onCheckedChange={v => setWindowForm(p => ({ ...p, notifyOwners: v }))} />
                          <Label className="text-xs font-bold">Notify Owners</Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <Switch checked={windowForm.notifyUsers} onCheckedChange={v => setWindowForm(p => ({ ...p, notifyUsers: v }))} />
                          <Label className="text-xs font-bold">Notify Drivers</Label>
                        </div>
                      </div>
                      <Button onClick={handleScheduleWindow} className="h-14 rounded-2xl font-black uppercase tracking-widest shadow-xl shadow-primary/20">Schedule Window</Button>
                    </div>
                  </div>
                )}

                <div className="space-y-4">
                  {maintenanceWindows.length === 0 && <p className="text-center py-10 text-muted-foreground italic">No scheduled maintenance recorded.</p>}
                  {maintenanceWindows.map(window => {
                    const start = window.startDate?.toDate ? window.startDate.toDate() : new Date(window.startDate);
                    const end = window.endDate?.toDate ? window.endDate.toDate() : new Date(window.endDate);
                    const now = new Date();
                    const isActive = start <= now && end >= now && window.status !== "completed";
                    const isPast = end < now || window.status === "completed";
                    const isUpcoming = start > now && window.status === "scheduled";

                    return (
                      <div key={window.id} className={`window-card ${isActive ? 'window-active' : isPast ? 'window-past' : 'window-upcoming'}`}>
                        <div className="flex justify-between items-start mb-4">
                           <div>
                             <h4 className="text-lg font-black tracking-tight">{window.title}</h4>
                             <p className="text-xs font-bold text-muted-foreground">{format(start, "MMM d, h:mm a")} → {format(end, "h:mm a")}</p>
                           </div>
                           <Badge variant={isActive ? "default" : isUpcoming ? "outline" : "secondary"} className="rounded-lg uppercase font-black tracking-widest text-[9px]">
                             {isActive ? "Active Now" : isUpcoming ? "Upcoming" : "Completed"}
                           </Badge>
                        </div>
                        <div className="flex gap-2 mb-4">
                          {(window.affectedSystems || ["All Systems"]).map((s: string) => <span key={s} className="system-chip">{s}</span>)}
                        </div>
                        {isUpcoming && (
                          <Button variant="outline" size="sm" onClick={() => cancelMaintenanceWindow(window.id)} className="h-10 rounded-xl font-bold border-2 text-red-500 hover:bg-red-50 hover:text-red-600 border-red-500/20">
                            Cancel Maintenance
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Section: Enhanced Announcements */}
            <Card className="rounded-[40px] border-2 shadow-2xl shadow-primary/5 overflow-hidden col-span-1">
              <CardHeader className="bg-primary/5 border-b-2 border-primary/10 p-8">
                 <div className="flex justify-between items-center">
                    <div>
                      <CardTitle className="text-2xl font-black italic uppercase italic tracking-tighter flex items-center gap-2">
                        <Megaphone className="w-6 h-6 text-primary" />
                        Announcement Engine
                      </CardTitle>
                      <CardDescription className="font-medium">Manage site-wide alerts and driver updates</CardDescription>
                    </div>
                    <Button onClick={() => setShowAnnForm(!showAnnForm)} variant="default" className="rounded-2xl font-black gap-2 shadow-xl shadow-primary/20">
                      {showAnnForm ? "Back to List" : <Plus className="w-4 h-4" />}
                      New Post
                    </Button>
                 </div>
              </CardHeader>
              <CardContent className="p-8">
                {showAnnForm ? (
                  <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-300">
                    <div className="grid gap-4">
                      <div className="space-y-2">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-2">Internal Title</Label>
                        <Input value={annForm.title} onChange={e => setAnnForm(p => ({ ...p, title: e.target.value }))} className="rounded-xl border-2 h-12" placeholder="e.g. Summer Discount Campaign" />
                      </div>
                      <div className="space-y-2">
                         <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-2">Announcement Message</Label>
                         <Textarea value={annForm.message} onChange={e => setAnnForm(p => ({ ...p, message: e.target.value }))} className="rounded-2xl border-2 min-h-[120px]" placeholder="Type what users will see in the banner..." />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                           <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-2">Type</Label>
                           <Tabs value={annForm.type} onValueChange={v => setAnnForm(p => ({ ...p, type: v as any }))}>
                             <TabsList className="grid grid-cols-4 bg-muted/50 rounded-xl p-1">
                               <TabsTrigger value="info" className="text-[10px] font-black uppercase">Info</TabsTrigger>
                               <TabsTrigger value="warning" className="text-[10px] font-black uppercase">Warn</TabsTrigger>
                               <TabsTrigger value="success" className="text-[10px] font-black uppercase">Succ</TabsTrigger>
                               <TabsTrigger value="urgent" className="text-[10px] font-black uppercase underline">Alert</TabsTrigger>
                             </TabsList>
                           </Tabs>
                        </div>
                        <div className="space-y-2">
                           <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-2">Publish After</Label>
                           <Input type="datetime-local" className="rounded-xl border-2" value={annForm.publishAt} onChange={e => setAnnForm(p => ({ ...p, publishAt: e.target.value }))} />
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-4 pt-4 border-t-2 border-dashed">
                        <Button variant="outline" className="rounded-xl font-black border-2" onClick={() => handleSaveAnnouncement("draft")}>Save Draft</Button>
                        <Button variant="outline" className="rounded-xl font-black border-2" onClick={() => handleSaveAnnouncement("scheduled")}>Schedule</Button>
                        <Button className="rounded-xl font-black shadow-lg shadow-primary/20" onClick={() => handleSaveAnnouncement("published")}>Publish Now</Button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
                    <TabsList className="bg-muted/50 p-1 rounded-2xl w-full grid grid-cols-4">
                       {["published", "draft", "scheduled", "archived"].map(tab => (
                         <TabsTrigger key={tab} value={tab} className="rounded-xl font-black uppercase text-[10px] tracking-widest py-2">
                           {tab}
                           <Badge variant="secondary" className="ml-2 text-[8px] bg-primary/10 border-primary/20 text-primary">
                             {announcements.filter(a => a.status === tab).length}
                           </Badge>
                         </TabsTrigger>
                       ))}
                    </TabsList>

                    <TabsContent value={activeTab} className="space-y-4">
                       {announcements.filter(a => a.status === activeTab).map(ann => (
                         <div key={ann.id} className={`ann-card ann-type-${ann.type} bg-muted/10`}>
                           <div className="flex justify-between items-start mb-2">
                             <h5 className="font-black tracking-tight">{ann.title || "Untitled Announcement"}</h5>
                             <Badge variant="outline" className="text-[8px] uppercase tracking-tighter opacity-60">
                               {ann.targetAudience}
                             </Badge>
                           </div>
                           <p className="text-xs font-medium text-muted-foreground italic mb-4">"{ann.message}"</p>
                           <div className="flex justify-between items-center text-[9px] font-black uppercase tracking-widest text-muted-foreground">
                             <div className="flex items-center gap-2">
                                <Clock className="w-3 h-3" />
                                {ann.publishedAt ? format(ann.publishedAt.toDate(), "MMM d, p") : "Not yet published"}
                             </div>
                             <div className="flex items-center gap-1">
                                <Activity className="w-3 h-3" />
                                {ann.viewCount} Views
                             </div>
                           </div>
                         </div>
                       ))}
                       {announcements.filter(a => a.status === activeTab).length === 0 && (
                         <div className="py-20 text-center opacity-30 italic font-medium">No items found in {activeTab}.</div>
                       )}
                    </TabsContent>
                  </Tabs>
                )}
              </CardContent>
            </Card>
          </div>
      </div>
    </div>
  );
}
