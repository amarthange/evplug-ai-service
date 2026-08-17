import { useState, useEffect } from "react";
import { collection, query, where, onSnapshot, addDoc, updateDoc, doc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Tag, Sparkles, Percent, Calendar, Plus, Megaphone } from "lucide-react";
import { safeFormatDistanceToNow } from '@/lib/date-utils';

interface Promotion {
  id: string;
  ownerId: string;
  title: string;
  description: string;
  discountRate: number; // e.g. 10 for 10%
  promoCode: string;
  isActive: boolean;
  createdAt: number;
}

export default function OwnerPromotions() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [loading, setLoading] = useState(true);

  // Form State
  const [isCreating, setIsCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [discountRate, setDiscountRate] = useState(10);
  const [promoCode, setPromoCode] = useState("");

  useEffect(() => {
    if (!user?.uid) return;

    const q = query(collection(db, "promotions"), where("ownerId", "==", user.uid));
    const unsubscribe = onSnapshot(q, (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as Promotion));
      data.sort((a, b) => b.createdAt - a.createdAt);
      setPromotions(data);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user?.uid]);

  const handleCreateOffer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    setIsCreating(true);
    try {
      await addDoc(collection(db, "promotions"), {
        ownerId: user.uid,
        title,
        description,
        discountRate: Number(discountRate),
        promoCode: promoCode.toUpperCase(),
        isActive: true,
        createdAt: Date.now()
      });
      
      toast({
        title: "Promotion Launched! 🚀",
        description: "Your drivers will now see this offer on your stations.",
      });
      
      setTitle("");
      setDescription("");
      setDiscountRate(10);
      setPromoCode("");
    } catch (e: any) {
      toast({ variant: "destructive", title: "Failed to create", description: e.message });
    } finally {
      setIsCreating(false);
    }
  };

  const togglePromotion = async (id: string, currentStatus: boolean) => {
    try {
      await updateDoc(doc(db, "promotions", id), { isActive: !currentStatus });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Failed to update", description: e.message });
    }
  };

  if (loading) {
    return <div className="h-full flex items-center justify-center animate-pulse font-black text-slate-400">Loading Promotions...</div>;
  }

  const activeCount = promotions.filter(p => p.isActive).length;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-4xl font-black tracking-tight text-slate-900 dark:text-white">Marketing & Offers</h1>
          <p className="text-muted-foreground font-medium">Create targeted campaigns to increase station utilization.</p>
        </div>
        <div className="flex items-center gap-2 bg-primary/10 text-primary px-4 py-2 rounded-full font-black text-sm uppercase tracking-widest border border-primary/20">
          <Sparkles className="w-4 h-4" />
          {activeCount} Active Offer{activeCount !== 1 && "s"}
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-8">
        
        {/* CREATE OFFER COLUMN */}
        <div className="space-y-6">
           <Card className="rounded-[30px] border-2 shadow-xl shadow-primary/5 bg-gradient-to-b from-card to-muted/20 relative overflow-hidden">
             <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-2xl -mt-10 -mr-10" />
             <CardHeader>
               <CardTitle className="text-xl font-black flex items-center gap-2">
                 <Plus className="w-5 h-5 text-primary" /> Create Campaign
               </CardTitle>
               <CardDescription className="font-medium text-sm">Issue a new discount for your stations.</CardDescription>
             </CardHeader>
             <CardContent>
               <form onSubmit={handleCreateOffer} className="space-y-4">
                 <div className="space-y-2">
                   <label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Campaign Title</label>
                   <Input 
                      required 
                      placeholder="e.g. Weekend Special ⚡" 
                      value={title} 
                      onChange={e => setTitle(e.target.value)}
                      className="rounded-xl bg-background/50"
                   />
                 </div>
                 
                 <div className="grid grid-cols-2 gap-4">
                   <div className="space-y-2">
                     <label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Discount (%)</label>
                     <div className="relative">
                       <Percent className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                       <Input 
                          type="number" required min="1" max="100"
                          value={discountRate} 
                          onChange={e => setDiscountRate(Number(e.target.value))}
                          className="pl-9 rounded-xl font-black text-primary bg-background/50"
                       />
                     </div>
                   </div>
                   <div className="space-y-2">
                     <label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Code (Optional)</label>
                     <div className="relative">
                       <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                       <Input 
                          placeholder="FREEDAY"
                          value={promoCode} 
                          onChange={e => setPromoCode(e.target.value)}
                          className="pl-9 rounded-xl uppercase font-bold bg-background/50 placeholder:normal-case placeholder:font-normal"
                       />
                     </div>
                   </div>
                 </div>

                 <div className="space-y-2">
                   <label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Description</label>
                   <Input 
                      required 
                      placeholder="Valid for all charging sessions this weekend..." 
                      value={description} 
                      onChange={e => setDescription(e.target.value)}
                      className="rounded-xl bg-background/50"
                   />
                 </div>

                 <Button type="submit" disabled={isCreating} className="w-full h-12 rounded-xl font-black shadow-xl shadow-primary/20 uppercase tracking-widest mt-4">
                   {isCreating ? "Launching..." : "Launch Campaign"}
                 </Button>
               </form>
             </CardContent>
           </Card>

           {/* Best Practices Note */}
           <div className="bg-amber-500/10 border border-amber-500/20 rounded-3xl p-5 flex gap-4">
              <Megaphone className="w-6 h-6 text-amber-500 shrink-0" />
              <div>
                 <p className="text-sm font-bold text-amber-900 dark:text-amber-200">Pro Tip</p>
                 <p className="text-xs text-amber-800/80 dark:text-amber-300/80 mt-1 font-medium leading-relaxed">
                   Active campaigns will automatically appear as banner alerts on all your station booking pages, capturing driver attention right before they reserve a slot.
                 </p>
              </div>
           </div>
        </div>

        {/* OFFERS LIST COLUMN */}
        <div className="lg:col-span-2 space-y-4">
           {promotions.length === 0 ? (
             <div className="h-64 rounded-[30px] border-2 border-dashed border-muted-foreground/20 flex flex-col items-center justify-center text-muted-foreground space-y-4">
               <div className="w-16 h-16 rounded-full bg-muted/40 flex items-center justify-center">
                 <Tag className="w-8 h-8 opacity-50" />
               </div>
               <p className="font-bold">No active promotional campaigns.</p>
             </div>
           ) : (
             promotions.map((promo) => (
               <Card 
                 key={promo.id} 
                 className={`rounded-[24px] transition-all overflow-hidden border-2 ${promo.isActive ? 'border-primary/20 shadow-lg shadow-primary/5 bg-card' : 'border-border/40 opacity-70 bg-muted/30'}`}
               >
                 <div className="flex flex-col sm:flex-row p-6 gap-6">
                    {/* Discount Badge */}
                    <div className={`w-24 h-24 shrink-0 rounded-[20px] flex flex-col items-center justify-center border-b-4 ${promo.isActive ? 'bg-primary text-primary-foreground border-primary-foreground/20' : 'bg-muted-foreground/20 text-muted-foreground border-transparent'}`}>
                       <span className="text-3xl font-black">{promo.discountRate}%</span>
                       <span className="text-[10px] font-black uppercase tracking-widest opacity-80 scale-90 -mt-1">Off</span>
                    </div>

                    {/* Content */}
                    <div className="flex-1 flex flex-col justify-between">
                       <div className="flex justify-between items-start">
                          <div>
                            <h3 className="font-black text-xl text-slate-900 dark:text-white">{promo.title}</h3>
                            <p className="text-sm font-medium text-muted-foreground mt-1">{promo.description}</p>
                          </div>
                          <Switch 
                            checked={promo.isActive} 
                            onCheckedChange={() => togglePromotion(promo.id, promo.isActive)} 
                            className="shrink-0 data-[state=checked]:bg-green-500"
                          />
                       </div>
                       
                       <div className="flex items-center gap-4 mt-4 text-xs font-bold text-muted-foreground uppercase tracking-widest">
                          <div className="flex items-center gap-1.5 bg-background border px-3 py-1.5 rounded-lg">
                            <Tag className="w-3.5 h-3.5" />
                            {promo.promoCode || "Auto-apply"}
                          </div>
                          <div className="flex items-center gap-1.5 opacity-60">
                            <Calendar className="w-3.5 h-3.5" />
                            Started {safeFormatDistanceToNow(promo.createdAt)} ago
                          </div>
                       </div>
                    </div>
                 </div>
               </Card>
             ))
           )}
        </div>
      </div>
    </div>
  );
}
