import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { 
  CheckCircle2, MapPin, Zap, Clock, Calendar, Leaf, 
  Printer, Share2, Repeat, ArrowLeft, Receipt as ReceiptIcon,
  ChevronRight, ExternalLink
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth-context";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { differenceInMinutes } from "date-fns";
import { safeFormat, toJSDate } from "@/lib/date-utils";
import { useToast } from "@/hooks/use-toast";
import { SessionShareCard } from "@/components/SessionShareCard";
import { ReviewModal } from "@/components/ReviewModal";
import { ReceiptButton } from "@/components/ReceiptButton";
import { Sparkles } from "lucide-react";
import SatisfactionSurvey from "@/components/SatisfactionSurvey";
import { collection, query, where, getCountFromServer } from "firebase/firestore";

export default function ReceiptPage() {
  const [, params] = useRoute("/receipt/:id");
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [booking, setBooking] = useState<any>(null);
  const [station, setStation] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isShareCardOpen, setIsShareCardOpen] = useState(false);
  const [isSurveyOpen, setIsSurveyOpen] = useState(false);
  const [bookingCount, setBookingCount] = useState(0);

  useEffect(() => {
    if (!params?.id || !user) return;

    async function fetchReceipt() {
      try {
        const bookingRef = doc(db, "bookings", params!.id);
        const bookingSnap = await getDoc(bookingRef);

        if (!bookingSnap.exists()) {
          setError("not_found");
          setLoading(false);
          return;
        }

        const data = { id: bookingSnap.id, ...bookingSnap.data() } as any;
        
        // Security Guard
        if (data.userId !== user?.uid) {
          toast({
            variant: "destructive",
            title: "Access Denied",
            description: "You don't have access to this receipt",
          });
          setLocation("/bookings");
          return;
        }

        // Status Guard
        if (data.status !== "completed") {
          setError("in_progress");
          setBooking(data);
          setLoading(false);
          return;
        }

        setBooking(data);

        // Fetch station address if not denormalized
        if (data.stationId) {
          const sRef = doc(db, "stations", data.stationId);
          const sSnap = await getDoc(sRef);
          if (sSnap.exists()) {
            setStation(sSnap.data());
          }
        }
        
        setLoading(false);
      } catch (err) {
        console.error("Error fetching receipt:", err);
        setError("network");
        setLoading(false);
      }
    }

    fetchReceipt();
  }, [params?.id, user, setLocation, toast]);

  useEffect(() => {
    if (!booking || !user) return;

    // Check if survey already shown for this booking
    const surveyKey = `survey_shown_${booking.id}`;
    if (localStorage.getItem(surveyKey)) return;

    async function checkBookingCount() {
      const q = query(collection(db, "bookings"), where("userId", "==", user!.uid), where("status", "==", "completed"));
      const snapshot = await getCountFromServer(q);
      setBookingCount(snapshot.data().count);
      
      // Delay survey slightly for better UX
      setTimeout(() => {
        setIsSurveyOpen(true);
        localStorage.setItem(surveyKey, "true");
      }, 3000);
    }

    checkBookingCount();
  }, [booking, user]);

  const handlePrint = () => {
    window.print();
  };

  const handleShare = async () => {
    if (!booking) return;
    
    const formattedDate = safeFormat(toJSDate(booking.startTime), "PPP");
    const startTimeStr = safeFormat(toJSDate(booking.startTime), "HH:mm");
    const endTimeStr = booking.actualEndTime ? safeFormat(toJSDate(booking.actualEndTime), "HH:mm") : "N/A";
    const duration = booking.duration || 0;
    const co2Saved = (booking.energyDeliveredKwh * 0.82).toFixed(1);

    const receiptText = `
⚡ EV Charging Receipt
─────────────────────
Station: ${booking.stationName}
Date: ${formattedDate}
Time: ${startTimeStr} - ${endTimeStr}
Duration: ${duration} mins
─────────────────────
Energy: ${booking.energyDeliveredKwh?.toFixed(1)} kWh
CO₂ Saved: ${co2Saved} kg 🌱
─────────────────────
Total Paid: ₹${booking.totalPrice}
Payment: UPI ✅
─────────────────────
Charged with EV Charging Platform
    `;

    if (navigator.share) {
      try {
        await navigator.share({
          title: 'My EV Charging Receipt',
          text: receiptText,
        });
        toast({ title: "Receipt shared! ✅" });
      } catch (e) {
        console.error("Share failed:", e);
      }
    } else {
      await navigator.clipboard.writeText(receiptText);
      toast({ title: "Receipt copied to clipboard! 📋" });
    }
  };

  const handleBookAgain = () => {
    if (!booking) return;
    // Using URL params for wouter compatibility
    setLocation(`/station/${booking.stationId}?rebook=true&type=${encodeURIComponent(booking.connectorType || "")}`);
  };

  if (loading) {
    return <ReceiptSkeleton />;
  }

  if (error === "not_found") {
    return (
      <div className="container max-w-md mx-auto p-6 text-center space-y-6 pt-20">
        <div className="w-20 h-20 bg-destructive/10 rounded-full flex items-center justify-center mx-auto">
          <ReceiptIcon className="w-10 h-10 text-destructive" />
        </div>
        <h1 className="text-2xl font-bold">Receipt Not Found</h1>
        <p className="text-muted-foreground">This receipt does not exist or was deleted.</p>
        <Button onClick={() => setLocation("/bookings")} className="w-full">
          Back to My Bookings
        </Button>
      </div>
    );
  }

  if (error === "in_progress") {
    return (
      <div className="container max-w-md mx-auto p-6 text-center space-y-6 pt-20">
        <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
          <Clock className="w-10 h-10 text-primary animate-pulse" />
        </div>
        <h1 className="text-2xl font-bold">Session In Progress</h1>
        <p className="text-muted-foreground">Your session is still active. Your receipt will be available here after charging completes.</p>
        <Button onClick={() => setLocation(`/charge/${booking.id}`)} className="w-full">
          View Live Session
        </Button>
      </div>
    );
  }

  if (error === "network") {
    return (
      <div className="container max-w-md mx-auto p-6 text-center space-y-6 pt-20">
        <h1 className="text-2xl font-bold">Network Error</h1>
        <p className="text-muted-foreground">Failed to load receipt. Please check your connection.</p>
        <Button onClick={() => window.location.reload()} className="w-full">Tap to Retry</Button>
      </div>
    );
  }

  const kwh = booking.energyDeliveredKwh || 0;
  const rangeAdded = (kwh * 6.5).toFixed(0);
  const co2Saved = (kwh * 0.82).toFixed(1);
  const energyCost = kwh * 8;
  const serviceFee = 38;
  const txnId = booking.id ? `TXN-${booking.id.slice(0, 8).toUpperCase()}` : "N/A";

  return (
    <div className="min-h-screen bg-background pb-32">
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          body * { visibility: hidden; }
          #receipt-print, #receipt-print * { visibility: visible; }
          #receipt-print { 
            position: absolute; 
            left: 0; top: 0;
            width: 100%;
            padding: 20px;
            color: black !important;
            background: white !important;
          }
          .no-print { display: none !important; }
        }
      `}} />

      {/* Action Header */}
      <div className="sticky top-0 bg-background/80 backdrop-blur-md z-10 border-b no-print">
        <div className="container max-w-2xl mx-auto px-4 h-16 flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => setLocation("/bookings")}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleShare}>
              <Share2 className="w-4 h-4 mr-2" />
              Share
            </Button>
            <Button variant="outline" size="sm" onClick={handlePrint}>
              <Printer className="w-4 h-4 mr-2" />
              Print
            </Button>
          </div>
        </div>
      </div>

      <div className="container max-w-2xl mx-auto p-4 space-y-6 pt-8" id="receipt-print">
        {/* Header section */}
        <div className="text-center space-y-3 pb-4">
          <div className="w-20 h-20 bg-emerald-500 rounded-full flex items-center justify-center mx-auto text-white shadow-lg shadow-emerald-500/20 no-print">
            <CheckCircle2 className="w-12 h-12" />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight">Charging Complete!</h1>
          <p className="text-muted-foreground font-medium">Your session has ended successfully</p>
        </div>

        {/* Thermal Print Header (Hidden normally) */}
        <div className="hidden print:block text-center border-b-2 border-dashed pb-4 mb-4">
          <h2 className="text-2xl font-bold uppercase tracking-widest">⚡ EV Charging</h2>
          <p className="text-sm font-bold">OFFICIAL TAX RECEIPT</p>
          <div className="flex justify-between text-xs mt-4">
            <span>{txnId}</span>
            <span>{safeFormat(new Date(), "PPpp")}</span>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Station Card */}
          <Card className="p-5 space-y-4 border-emerald-500/10 bg-emerald-500/[0.02]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-emerald-500/10 rounded-lg flex items-center justify-center">
                <MapPin className="w-5 h-5 text-emerald-600" />
              </div>
              <h3 className="font-bold text-lg">Station Info</h3>
            </div>
            <div className="space-y-1">
              <p className="font-semibold text-foreground">{booking.stationName}</p>
              <p className="text-sm text-muted-foreground">{station?.address || "Address available on map"}</p>
            </div>
            <div className="flex gap-3">
              <Badge variant="outline" className="bg-background text-emerald-700 border-emerald-200">
                <Zap className="w-3 h-3 mr-1" /> {booking.connectorType}
              </Badge>
              <Badge variant="outline" className="bg-background text-muted-foreground border-muted-foreground/20">
                ID: {booking.connectorId}
              </Badge>
            </div>
          </Card>

          {/* Timeline Card */}
          <Card className="p-5 space-y-4 bg-muted/30 border-muted">
             <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                <Clock className="w-5 h-5 text-primary" />
              </div>
              <h3 className="font-bold text-lg">Timeline</h3>
            </div>
            <div className="space-y-3">
               <div className="flex justify-between items-center text-sm">
                  <span className="flex items-center text-muted-foreground"><Calendar className="w-4 h-4 mr-1.5" /> Date</span>
                  <span className="font-semibold">{safeFormat(toJSDate(booking.startTime), "MMMM do, yyyy")}</span>
               </div>
               <div className="flex justify-between items-center text-sm">
                  <span className="flex items-center text-muted-foreground"><Clock className="w-4 h-4 mr-1.5" /> Started</span>
                  <span className="font-mono font-bold">{safeFormat(toJSDate(booking.startTime), "HH:mm")}</span>
               </div>
               <div className="flex justify-between items-center text-sm">
                  <span className="flex items-center text-muted-foreground"><Clock className="w-4 h-4 mr-1.5" /> Ended</span>
                  <span className="font-mono font-bold text-emerald-600">
                    {booking.actualEndTime ? safeFormat(toJSDate(booking.actualEndTime), "HH:mm") : "15:59"}
                  </span>
               </div>
               <Separator />
               <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Duration</span>
                  <span className="font-bold text-lg">{booking.duration} minutes</span>
               </div>
            </div>
          </Card>
        </div>

        {/* Energy Impact Section */}
        <Card className="p-6 relative overflow-hidden bg-primary/5 hover:bg-primary/10 transition-colors">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <Zap className="w-20 h-20" />
          </div>
          <h3 className="font-bold text-lg mb-4">Energy Summary</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground uppercase tracking-wider font-bold">Delivered</p>
              <p className="text-3xl font-black text-primary">{kwh.toFixed(1)} <span className="text-sm font-normal">kWh</span></p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground uppercase tracking-wider font-bold">Est. Range</p>
              <p className="text-3xl font-black text-emerald-600">~{rangeAdded} <span className="text-sm font-normal">km added</span></p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground uppercase tracking-wider font-bold">Environment</p>
              <p className="text-3xl font-black text-emerald-500 flex items-center">
                {co2Saved} <span className="text-sm font-normal ml-1">kg CO₂ saved 🌱</span>
              </p>
            </div>
          </div>
        </Card>

        {/* Billing Section */}
        <Card className="p-6 space-y-4">
           <h3 className="font-bold text-lg">Billing Breakdown</h3>
           <div className="space-y-3 font-mono">
              <div className="flex justify-between items-center text-sm">
                <span>Energy Charges ({kwh.toFixed(1)} kWh × ₹8/kWh)</span>
                <span>₹{energyCost.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span>Service Fee</span>
                <span>₹{serviceFee.toFixed(2)}</span>
              </div>
              <Separator className="my-2" />
              <div className="flex justify-between items-center text-xl font-black">
                <span>Total Paid</span>
                <span className="text-emerald-600">₹{booking.totalPrice?.toFixed(2)}</span>
              </div>
           </div>
        </Card>

        {/* Payment Info */}
        <div className="flex flex-col md:flex-row gap-4 items-center justify-between p-4 bg-muted/20 border-2 border-dashed border-muted rounded-xl">
           <div className="flex items-center gap-4">
              <div className="w-12 h-8 bg-background border rounded flex items-center justify-center font-bold text-xs uppercase text-muted-foreground">
                {booking.paymentMethod || "UPI"}
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase font-bold">Transaction ID</p>
                <p className="font-mono text-sm font-bold">{txnId}</p>
              </div>
           </div>
           <Badge className="bg-emerald-500 hover:bg-emerald-600 h-8 font-bold px-4">
              <CheckCircle2 className="w-4 h-4 mr-2" /> Paid
           </Badge>
        </div>

        {/* Summary (Thermal Print Footer) */}
        <div className="hidden print:block text-center space-y-1 pt-8 border-t-2 border-dashed">
            <p className="font-bold">Thank you for charging!</p>
            <p className="text-xs">Powering a Greener Future with EV Platform</p>
        </div>

        {/* Action Buttons */}
        <div className="grid gap-3 pt-4 no-print">
           <div className="grid grid-cols-1 gap-3">
              <ReceiptButton booking={booking} station={station} />
              <div className="grid grid-cols-2 gap-3">
                <Button variant="outline" className="h-12 font-bold" onClick={handlePrint}>
                  <Printer className="w-4 h-4 mr-2" /> Print Page
                </Button>
                <Button variant="outline" className="h-12 font-bold" onClick={handleShare}>
                  <Share2 className="w-4 h-4 mr-2" /> Share Info
                </Button>
              </div>
           </div>
           <Button className="h-14 font-black bg-emerald-600 hover:bg-emerald-700 shadow-xl shadow-emerald-500/10 text-lg" onClick={handleBookAgain}>
              <Repeat className="w-5 h-5 mr-2" /> Book Again
           </Button>
           <Button 
              className="h-14 font-black bg-gradient-to-r from-emerald-600 to-teal-500 hover:opacity-90 shadow-xl shadow-emerald-500/20 text-lg" 
              onClick={() => setIsShareCardOpen(true)}
            >
              <Sparkles className="w-5 h-5 mr-2" /> Share Session Summary
           </Button>
           <Button variant="ghost" className="h-12 font-medium text-muted-foreground" onClick={() => setLocation("/bookings")}>
              Back to My Bookings
           </Button>
        </div>
      </div>

      <Dialog open={isShareCardOpen} onOpenChange={setIsShareCardOpen}>
        <DialogContent className="sm:max-w-md bg-slate-950 border-slate-800 p-0 overflow-hidden rounded-3xl">
           <DialogTitle className="sr-only">Session Summary</DialogTitle>
           <DialogDescription className="sr-only">Shareable session summary card.</DialogDescription>
           <div className="p-8 pb-4 flex justify-center">
             {booking && (
               <SessionShareCard data={{
                  stationName: station?.name || booking.stationName || "Unknown Station",
                  sessionDate: booking.createdAt ? toJSDate(booking.createdAt) : new Date(),
                  energyDelivered: booking.energyDeliveredKwh || 0,
                  durationMinutes: booking.duration || 0,
                  totalCost: booking.totalPrice || 0,
                  connectorType: booking.connectorType || "Unknown"
               }} />
             )}
           </div>
           <div className="p-4 pt-0 text-center">
             <Button variant="outline" className="w-full bg-slate-900 border-slate-800" onClick={() => setIsShareCardOpen(false)}>
               Close
             </Button>
           </div>
        </DialogContent>
      </Dialog>

      <ReviewModal 
        booking={booking} 
      />

      <SatisfactionSurvey 
        userId={user?.uid || ""}
        bookingId={booking.id}
        bookingCount={bookingCount}
        isOpen={isSurveyOpen}
        onClose={() => setIsSurveyOpen(false)}
      />
    </div>
  );
}

function ReceiptSkeleton() {
  return (
    <div className="container max-w-2xl mx-auto p-4 space-y-8 pt-20 animate-pulse">
       <div className="text-center space-y-4">
          <div className="w-20 h-20 bg-muted rounded-full mx-auto" />
          <div className="h-8 bg-muted w-48 mx-auto rounded" />
          <div className="h-4 bg-muted w-64 mx-auto rounded" />
       </div>
       <div className="grid md:grid-cols-2 gap-6">
          <div className="h-40 bg-muted rounded-xl" />
          <div className="h-40 bg-muted rounded-xl" />
       </div>
       <div className="h-32 bg-muted rounded-xl" />
       <div className="h-48 bg-muted rounded-xl" />
       <div className="h-14 bg-muted rounded-xl" />
    </div>
  );
}
