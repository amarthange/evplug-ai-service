import { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { db } from "@/lib/firebase";
import { 
  collection, query, onSnapshot, doc, getDoc,
  setDoc, updateDoc, deleteDoc, addDoc, serverTimestamp,
  collectionGroup, getDocs, runTransaction
} from "firebase/firestore";
import { 
  Building2, Users, CreditCard, Plus, Trash2, Edit2, 
  Search, ShieldCheck, Check, ArrowLeft, Loader2, DollarSign,
  TrendingUp, Percent, ArrowRightLeft, Sparkles
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

export default function AdminFleet() {
  const [location, setLocation] = useLocation();
  const { user, userRole, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const [fleets, setFleets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  // Create Fleet State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: "",
    companyId: "",
    adminId: "",
    balance: "1000",
    discountPercent: "10",
    gstNumber: "",
    upiId: "evplugfinder.fleet@okicici"
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Manage Balance State
  const [showBalanceModal, setShowBalanceModal] = useState(false);
  const [selectedFleetForBalance, setSelectedFleetForBalance] = useState<any>(null);
  const [balanceAmount, setBalanceAmount] = useState("");
  const [balanceAction, setBalanceAction] = useState<"add" | "deduct">("add");
  const [isUpdatingBalance, setIsUpdatingBalance] = useState(false);

  // Edit Discount State
  const [showDiscountModal, setShowDiscountModal] = useState(false);
  const [selectedFleetForDiscount, setSelectedFleetForDiscount] = useState<any>(null);
  const [newDiscount, setNewDiscount] = useState("");
  const [isUpdatingDiscount, setIsUpdatingDiscount] = useState(false);

  // Stats
  const [driversCount, setDriversCount] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!authLoading && userRole !== "admin") {
      setLocation("/");
      toast({
         variant: "destructive",
         title: "Unauthorized",
         description: "Only administrators can access this portal."
      });
    }
  }, [userRole, authLoading]);

  // Load Fleets
  useEffect(() => {
    if (userRole !== "admin") return;

    const unsubFleets = onSnapshot(collection(db, "fleets"), (snap) => {
      const fleetList = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setFleets(fleetList);
      setLoading(false);

      // Load drivers counts for each fleet
      fleetList.forEach(async (f) => {
         const membersSnap = await getDocs(collection(db, "fleets", f.id, "members"));
         setDriversCount(prev => ({
            ...prev,
            [f.id]: membersSnap.size
         }));
      });

    }, (err) => {
      console.error("Error loading fleets:", err);
      toast({ variant: "destructive", title: "Error", description: "Failed to load fleets." });
      setLoading(false);
    });

    return () => unsubFleets();
  }, [userRole]);

  const handleCreateFleet = async (e: React.FormEvent) => {
     e.preventDefault();
     if (!createForm.name || !createForm.adminId || !createForm.companyId) {
        toast({ variant: "destructive", title: "Missing Fields", description: "Name, Admin UID and Company Code are required." });
        return;
     }

     setIsSubmitting(true);
     try {
        const bal = parseFloat(createForm.balance) || 0;
        const disc = parseFloat(createForm.discountPercent) || 0;
        
        const docRef = doc(collection(db, "fleets"));
        await setDoc(docRef, {
           name: createForm.name,
           companyId: createForm.companyId,
           adminId: createForm.adminId,
           balance: bal,
           monthlySpend: 0,
           discountPercent: disc,
           gstNumber: createForm.gstNumber,
           upiId: createForm.upiId,
           createdAt: serverTimestamp()
        });

        // Add admin member record to the subcollection
        // Find if admin user exists in DB to get email (or just add default)
        let adminEmail = "fleet.admin@company.com";
        try {
           const userSnap = await getDoc(doc(db, "users", createForm.adminId));
           if (userSnap.exists()) {
              adminEmail = userSnap.data().email || adminEmail;
              // Update user role if needed or make sure they have a role
           }
        } catch (e) {
           console.error("Could not fetch admin user email", e);
        }

        await setDoc(doc(db, "fleets", docRef.id, "members", createForm.adminId), {
           email: adminEmail,
           uid: createForm.adminId,
           role: "manager",
           status: "active",
           addedAt: serverTimestamp()
        });

        toast({ title: "Fleet Created 🎉", description: `Successfully created fleet for ${createForm.name}.` });
        setShowCreateModal(false);
        setCreateForm({
           name: "",
           companyId: "",
           adminId: "",
           balance: "1000",
           discountPercent: "10",
           gstNumber: "",
           upiId: "evplugfinder.fleet@okicici"
        });
     } catch (error: any) {
        console.error("Error creating fleet:", error);
        toast({ variant: "destructive", title: "Creation Failed", description: error.message });
     } finally {
        setIsSubmitting(false);
     }
  };

  const handleUpdateBalance = async (e: React.FormEvent) => {
     e.preventDefault();
     if (!selectedFleetForBalance) return;
     const amount = parseFloat(balanceAmount);
     if (isNaN(amount) || amount <= 0) {
        toast({ variant: "destructive", title: "Invalid Amount", description: "Please enter a valid credit amount." });
        return;
     }

     setIsUpdatingBalance(true);
     try {
        const fleetRef = doc(db, "fleets", selectedFleetForBalance.id);
        await runTransaction(db, async (transaction) => {
           const snap = await transaction.get(fleetRef);
           if (!snap.exists()) throw new Error("Fleet account not found");
           
           const currentBalance = snap.data().balance || 0;
           const newBalance = balanceAction === "add" 
              ? currentBalance + amount 
              : Math.max(0, currentBalance - amount);
           
           transaction.update(fleetRef, { balance: newBalance });

           // Log in audit log
           const auditRef = doc(collection(db, "audit_logs"));
           transaction.set(auditRef, {
              action: `FLEET_BALANCE_${balanceAction.toUpperCase()}`,
              performedBy: user?.uid,
              targetId: selectedFleetForBalance.id,
              targetType: "fleet",
              metadata: { 
                 fleetName: selectedFleetForBalance.name,
                 amount, 
                 previousBalance: currentBalance, 
                 newBalance 
              },
              timestamp: serverTimestamp()
           });
        });

        toast({ 
           title: "Balance Updated", 
           description: `Successfully ${balanceAction === "add" ? "credited" : "debited"} ₹${amount} to ${selectedFleetForBalance.name}.` 
        });
        setShowBalanceModal(false);
        setBalanceAmount("");
     } catch (error: any) {
        console.error("Error updating balance:", error);
        toast({ variant: "destructive", title: "Action Failed", description: error.message });
     } finally {
        setIsUpdatingBalance(false);
     }
  };

  const handleUpdateDiscount = async (e: React.FormEvent) => {
     e.preventDefault();
     if (!selectedFleetForDiscount) return;
     const discount = parseFloat(newDiscount);
     if (isNaN(discount) || discount < 0 || discount > 100) {
        toast({ variant: "destructive", title: "Invalid Discount", description: "Discount percentage must be between 0% and 100%." });
        return;
     }

     setIsUpdatingDiscount(true);
     try {
        await updateDoc(doc(db, "fleets", selectedFleetForDiscount.id), {
           discountPercent: discount
        });
        toast({ title: "Discount Set ✓", description: `Discount for ${selectedFleetForDiscount.name} is now ${discount}%.` });
        setShowDiscountModal(false);
     } catch (error: any) {
        toast({ variant: "destructive", title: "Action Failed", description: error.message });
     } finally {
        setIsUpdatingDiscount(false);
     }
  };

  const handleDeleteFleet = async (fleetId: string, fleetName: string) => {
     if (!confirm(`Are you absolutely sure you want to delete ${fleetName}? This will revoke access for all members.`)) {
        return;
     }

     try {
        await deleteDoc(doc(db, "fleets", fleetId));
        toast({ title: "Fleet Deleted", description: `Deleted ${fleetName} database records.` });
     } catch (error: any) {
        toast({ variant: "destructive", title: "Deletion Failed", description: error.message });
     }
  };

  const filteredFleets = fleets.filter(f => 
     f.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
     f.companyId.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalPlatformBalance = fleets.reduce((sum, f) => sum + (f.balance || 0), 0);
  const totalMonthlySpend = fleets.reduce((sum, f) => sum + (f.monthlySpend || 0), 0);

  if (loading) {
     return (
        <div className="h-screen w-screen flex flex-col items-center justify-center bg-[var(--admin-bg)] text-[var(--admin-text-primary)] transition-colors duration-300">
           <Loader2 className="w-12 h-12 animate-spin text-primary mb-3" />
           <p className="font-black text-xs uppercase tracking-widest admin-text-muted">Loading Fleet Ledger...</p>
        </div>
     );
  }

  return (
     <div className="container mx-auto p-6 space-y-8 min-h-screen pb-20 bg-[var(--admin-bg)] text-[var(--admin-text-primary)] transition-colors duration-300">
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
           <div>
              <Link href="/admin">
                 <a className="inline-flex items-center gap-2 text-xs font-black uppercase text-primary mb-3 hover:underline">
                    <ArrowLeft className="w-4 h-4" /> Admin Console
                 </a>
              </Link>
              <h1 className="text-4xl font-black tracking-tight flex items-center gap-3">
                 <Building2 className="w-10 h-10 text-primary" />
                 Platform Fleet Registry
              </h1>
              <p className="admin-text-muted font-medium mt-1">Configure global commercial fleet profiles, balances, and corporate discounts.</p>
           </div>
           
           <Button onClick={() => setShowCreateModal(true)} className="rounded-2xl h-12 px-6 font-black gap-2 bg-primary hover:bg-primary/95 text-white">
              <Plus className="w-4 h-4" /> Register New Fleet
           </Button>
        </header>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
           <Card className="admin-glass-card p-5 border-none">
              <p className="text-[10px] font-black uppercase admin-text-muted mb-1 tracking-widest">Active Fleets</p>
              <p className="text-3xl font-black admin-text-primary">{fleets.length}</p>
           </Card>
           <Card className="admin-glass-card p-5 border-none">
              <p className="text-[10px] font-black uppercase admin-text-muted mb-1 tracking-widest">Aggregate Fleet Credits</p>
              <p className="text-3xl font-black text-emerald-400">₹{totalPlatformBalance.toLocaleString()}</p>
           </Card>
           <Card className="admin-glass-card p-5 border-none">
              <p className="text-[10px] font-black uppercase admin-text-muted mb-1 tracking-widest">Consolidated Spend (MTD)</p>
              <p className="text-3xl font-black text-primary">₹{totalMonthlySpend.toLocaleString()}</p>
           </Card>
           <Card className="admin-glass-card p-5 border-none">
              <p className="text-[10px] font-black uppercase admin-text-muted mb-1 tracking-widest">Registered Drivers</p>
              <p className="text-3xl font-black admin-text-primary">
                 {Object.values(driversCount).reduce((a, b) => a + b, 0)}
              </p>
           </Card>
        </div>

        {/* Fleet List / Registry */}
        <Card className="rounded-[32px] border-none shadow-xl admin-glass-card overflow-hidden">
           <CardHeader className="p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                 <CardTitle className="text-lg font-black uppercase tracking-wider admin-text-primary">Fleet Registry</CardTitle>
                 <CardDescription className="text-xs admin-text-muted font-medium">Verify credentials and billing limits</CardDescription>
              </div>

              {/* Search */}
              <div className="relative w-full md:w-80">
                 <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 admin-text-muted" />
                 <Input 
                    type="text" 
                    placeholder="Search company or ID..." 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 h-10 bg-[var(--admin-border-muted)] border border-[var(--admin-border)] rounded-xl admin-text-primary focus:ring-1 focus:ring-primary placeholder-[var(--admin-text-muted)] font-bold"
                 />
              </div>
           </CardHeader>
           
           <CardContent className="p-0 overflow-x-auto">
              <Table className="admin-text-primary">
                 <TableHeader className="border-b border-[var(--admin-border-muted)]">
                    <TableRow className="border-none text-[10px] font-black uppercase tracking-wider admin-text-muted">
                       <TableHead className="px-6 py-4">Company Name</TableHead>
                       <TableHead className="px-6 py-4">Company ID</TableHead>
                       <TableHead className="px-6 py-4">Admin User ID</TableHead>
                       <TableHead className="px-6 py-4">Drivers</TableHead>
                       <TableHead className="px-6 py-4">Discount Rate</TableHead>
                       <TableHead className="px-6 py-4">Credit Balance</TableHead>
                       <TableHead className="px-6 py-4 text-right">Actions</TableHead>
                    </TableRow>
                 </TableHeader>
                 <TableBody className="divide-y divide-[var(--admin-border-muted)]">
                     {filteredFleets.map((fleet) => (
                        <TableRow key={fleet.id} className="border-none hover:bg-[var(--admin-border-muted)] transition-colors">
                           <TableCell className="px-6 py-4 font-black text-sm">{fleet.name}</TableCell>
                           <TableCell className="px-6 py-4">
                              <Badge variant="outline" className="font-bold border-[var(--admin-border)] bg-[var(--admin-border-muted)] admin-text-secondary">
                                 {fleet.companyId}
                              </Badge>
                           </TableCell>
                           <TableCell className="px-6 py-4 font-bold text-xs admin-text-muted truncate max-w-[120px]" title={fleet.adminId}>
                              {fleet.adminId}
                           </TableCell>
                           <TableCell className="px-6 py-4 font-bold">{driversCount[fleet.id] || 0} drivers</TableCell>
                           <TableCell className="px-6 py-4">
                              <Badge className="bg-emerald-500/20 text-emerald-400 border-none font-black text-[10px]">
                                 {fleet.discountPercent || 0}% Off
                              </Badge>
                           </TableCell>
                           <TableCell className="px-6 py-4 font-black text-emerald-400">₹{(fleet.balance || 0).toLocaleString()}</TableCell>
                           <TableCell className="px-6 py-4 text-right space-x-2">
                              <Button 
                                 variant="outline" 
                                 size="sm" 
                                 onClick={() => {
                                    setSelectedFleetForBalance(fleet);
                                    setBalanceAction("add");
                                    setShowBalanceModal(true);
                                 }}
                                 className="rounded-xl border-[var(--admin-border)] bg-[var(--admin-border-muted)] hover:bg-[var(--admin-border)] admin-text-primary font-bold text-xs"
                              >
                                 <ArrowRightLeft className="w-3.5 h-3.5 mr-1" /> Balance
                              </Button>
                              <Button 
                                 variant="outline" 
                                 size="sm" 
                                 onClick={() => {
                                    setSelectedFleetForDiscount(fleet);
                                    setNewDiscount((fleet.discountPercent || 0).toString());
                                    setShowDiscountModal(true);
                                 }}
                                 className="rounded-xl border-[var(--admin-border)] bg-[var(--admin-border-muted)] hover:bg-[var(--admin-border)] admin-text-primary font-bold text-xs"
                              >
                                 <Percent className="w-3.5 h-3.5 mr-1" /> Discount
                              </Button>
                              <Button 
                                 variant="ghost" 
                                 size="icon" 
                                 onClick={() => handleDeleteFleet(fleet.id, fleet.name)}
                                 className="rounded-full text-destructive hover:bg-destructive/10"
                              >
                                 <Trash2 className="w-4 h-4" />
                              </Button>
                           </TableCell>
                        </TableRow>
                     ))}

                     {filteredFleets.length === 0 && (
                        <TableRow>
                           <TableCell colSpan={7} className="h-32 text-center admin-text-muted font-bold uppercase tracking-widest">
                              No Fleets Found Matching Query
                           </TableCell>
                        </TableRow>
                     )}
                  </TableBody>
              </Table>
           </CardContent>
        </Card>

        {/* Create Fleet Dialog */}
        <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
           <DialogContent className="bg-[var(--admin-bg)] border border-[var(--admin-border)] admin-text-primary rounded-[24px] max-w-md">
              <DialogHeader>
                 <DialogTitle className="text-xl font-black flex items-center gap-3">
                    <Building2 className="w-6 h-6 text-primary" /> Register Corporate Fleet
                 </DialogTitle>
                 <DialogDescription className="font-bold admin-text-muted">
                    Deploy a commercial billing portal and assign ownership.
                 </DialogDescription>
              </DialogHeader>

              <form onSubmit={handleCreateFleet} className="space-y-4 py-4">
                 <div className="space-y-1">
                    <Label className="text-[10px] font-black uppercase admin-text-muted">Company Name</Label>
                    <Input 
                       required
                       value={createForm.name}
                       onChange={(e) => setCreateForm({...createForm, name: e.target.value})}
                       placeholder="e.g. Google India" 
                       className="bg-[var(--admin-border-muted)] border border-[var(--admin-border)] h-11 admin-text-primary placeholder-[var(--admin-text-muted)] font-bold rounded-xl"
                    />
                 </div>
                 <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                       <Label className="text-[10px] font-black uppercase admin-text-muted">Company Code / ID</Label>
                       <Input 
                          required
                          value={createForm.companyId}
                          onChange={(e) => setCreateForm({...createForm, companyId: e.target.value.toUpperCase()})}
                          placeholder="e.g. CORP-GOOG" 
                          className="bg-[var(--admin-border-muted)] border border-[var(--admin-border)] h-11 admin-text-primary placeholder-[var(--admin-text-muted)] font-bold rounded-xl"
                       />
                    </div>
                    <div className="space-y-1">
                       <Label className="text-[10px] font-black uppercase admin-text-muted">Admin User UID</Label>
                       <Input 
                          required
                          value={createForm.adminId}
                          onChange={(e) => setCreateForm({...createForm, adminId: e.target.value})}
                          placeholder="Firebase User UID" 
                          className="bg-[var(--admin-border-muted)] border border-[var(--admin-border)] h-11 admin-text-primary placeholder-[var(--admin-text-muted)] font-bold rounded-xl text-xs"
                       />
                    </div>
                 </div>
                 <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                       <Label className="text-[10px] font-black uppercase admin-text-muted">Initial Balance (₹)</Label>
                       <Input 
                          type="number"
                          required
                          value={createForm.balance}
                          onChange={(e) => setCreateForm({...createForm, balance: e.target.value})}
                          className="bg-[var(--admin-border-muted)] border border-[var(--admin-border)] h-11 admin-text-primary placeholder-[var(--admin-text-muted)] font-bold rounded-xl"
                       />
                    </div>
                    <div className="space-y-1">
                       <Label className="text-[10px] font-black uppercase admin-text-muted">Platform Discount (%)</Label>
                       <Input 
                          type="number"
                          min="0"
                          max="100"
                          required
                          value={createForm.discountPercent}
                          onChange={(e) => setCreateForm({...createForm, discountPercent: e.target.value})}
                          className="bg-[var(--admin-border-muted)] border border-[var(--admin-border)] h-11 admin-text-primary placeholder-[var(--admin-text-muted)] font-bold rounded-xl"
                       />
                    </div>
                 </div>
                 <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                       <Label className="text-[10px] font-black uppercase admin-text-muted">GST Identification No.</Label>
                       <Input 
                          value={createForm.gstNumber}
                          onChange={(e) => setCreateForm({...createForm, gstNumber: e.target.value.toUpperCase()})}
                          placeholder="Optional" 
                          className="bg-[var(--admin-border-muted)] border border-[var(--admin-border)] h-11 admin-text-primary placeholder-[var(--admin-text-muted)] font-bold rounded-xl"
                       />
                    </div>
                    <div className="space-y-1">
                       <Label className="text-[10px] font-black uppercase admin-text-muted">Company UPI Billing ID</Label>
                       <Input 
                          required
                          value={createForm.upiId}
                          onChange={(e) => setCreateForm({...createForm, upiId: e.target.value})}
                          className="bg-[var(--admin-border-muted)] border border-[var(--admin-border)] h-11 admin-text-primary placeholder-[var(--admin-text-muted)] font-bold rounded-xl"
                       />
                    </div>
                 </div>

                 <DialogFooter className="pt-4">
                    <Button 
                       type="button" 
                       variant="ghost" 
                       onClick={() => setShowCreateModal(false)}
                       className="rounded-xl admin-text-secondary hover:admin-text-primary"
                    >
                       Cancel
                    </Button>
                    <Button 
                       type="submit" 
                       disabled={isSubmitting}
                       className="rounded-xl bg-primary text-white hover:bg-primary/90 font-black px-6"
                    >
                       {isSubmitting ? "Deploying..." : "Deploy Corporate Registry"}
                    </Button>
                 </DialogFooter>
              </form>
           </DialogContent>
        </Dialog>

        {/* Manage Credit Balance Dialog */}
        <Dialog open={showBalanceModal} onOpenChange={setShowBalanceModal}>
           <DialogContent className="bg-[var(--admin-bg)] border border-[var(--admin-border)] admin-text-primary rounded-[24px] max-w-sm">
              <DialogHeader>
                 <DialogTitle className="text-xl font-black">
                    Manage Fleet Credit
                 </DialogTitle>
                 <DialogDescription className="font-bold admin-text-muted">
                    Adjust current credit limits for {selectedFleetForBalance?.name}.
                 </DialogDescription>
              </DialogHeader>

              <form onSubmit={handleUpdateBalance} className="space-y-5 py-3">
                 <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase admin-text-muted">Action Type</Label>
                    <div className="grid grid-cols-2 gap-3">
                       <Button 
                          type="button" 
                          variant={balanceAction === "add" ? "default" : "outline"}
                          className="rounded-xl h-11 font-black"
                          onClick={() => setBalanceAction("add")}
                       >
                          Add Credits
                       </Button>
                       <Button 
                          type="button" 
                          variant={balanceAction === "deduct" ? "default" : "outline"}
                          className="rounded-xl h-11 font-black"
                          onClick={() => setBalanceAction("deduct")}
                       >
                          Deduct Credits
                       </Button>
                    </div>
                 </div>

                 <div className="space-y-1">
                    <Label className="text-[10px] font-black uppercase admin-text-muted">Credit Amount (₹)</Label>
                    <Input 
                       type="number"
                       min="1"
                       required
                       value={balanceAmount}
                       onChange={(e) => setBalanceAmount(e.target.value)}
                       placeholder="e.g. 5000" 
                       className="bg-[var(--admin-border-muted)] border border-[var(--admin-border)] h-12 admin-text-primary font-black rounded-xl text-lg text-center"
                    />
                 </div>

                 <DialogFooter className="pt-2">
                    <Button 
                       type="button" 
                       variant="ghost" 
                       onClick={() => setShowBalanceModal(false)}
                       className="rounded-xl admin-text-secondary hover:admin-text-primary"
                    >
                       Cancel
                    </Button>
                    <Button 
                       type="submit" 
                       disabled={isUpdatingBalance}
                       className="rounded-xl bg-primary text-white hover:bg-primary/90 font-black px-6"
                    >
                       {isUpdatingBalance ? "Updating..." : "Confirm Balance Adjustment"}
                    </Button>
                 </DialogFooter>
              </form>
           </DialogContent>
        </Dialog>

        {/* Manage Discount Dialog */}
        <Dialog open={showDiscountModal} onOpenChange={setShowDiscountModal}>
           <DialogContent className="bg-[var(--admin-bg)] border border-[var(--admin-border)] admin-text-primary rounded-[24px] max-w-sm">
              <DialogHeader>
                 <DialogTitle className="text-xl font-black">
                    Set Fleet Discount Rate
                 </DialogTitle>
                 <DialogDescription className="font-bold admin-text-muted">
                    Modify the platform-wide discount for {selectedFleetForDiscount?.name} members.
                 </DialogDescription>
              </DialogHeader>

              <form onSubmit={handleUpdateDiscount} className="space-y-5 py-3">
                 <div className="space-y-1">
                    <Label className="text-[10px] font-black uppercase admin-text-muted">Discount Rate (%)</Label>
                    <Input 
                       type="number"
                       min="0"
                       max="100"
                       required
                       value={newDiscount}
                       onChange={(e) => setNewDiscount(e.target.value)}
                       className="bg-[var(--admin-border-muted)] border border-[var(--admin-border)] h-12 admin-text-primary font-black rounded-xl text-lg text-center"
                    />
                 </div>

                 <DialogFooter className="pt-2">
                    <Button 
                       type="button" 
                       variant="ghost" 
                       onClick={() => setShowDiscountModal(false)}
                       className="rounded-xl admin-text-secondary hover:admin-text-primary"
                    >
                       Cancel
                    </Button>
                    <Button 
                       type="submit" 
                       disabled={isUpdatingDiscount}
                       className="rounded-xl bg-primary text-white hover:bg-primary/90 font-black px-6"
                    >
                       {isUpdatingDiscount ? "Saving..." : "Apply Discount Setting"}
                    </Button>
                 </DialogFooter>
              </form>
           </DialogContent>
        </Dialog>
     </div>
  );
}
