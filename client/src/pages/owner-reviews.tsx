import { useState, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { db } from "@/lib/firebase";
import { 
  doc, getDoc, collection, query, where, getDocs, 
  updateDoc, serverTimestamp, setDoc, Timestamp,
  writeBatch, addDoc
} from "firebase/firestore";
import { subscribeToOwnerStations, type Station } from "@/lib/owner-service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { Label } from "@/components/ui/label";
import { 
  Star, MessageCircle, Pin, Bot, ThumbsUp, 
  CheckCircle, AlertTriangle, Sparkles, RefreshCw, 
  ChevronRight, Reply, X, Edit2, Clock, Send
} from "lucide-react";
import { ReviewReplyPanel } from "@/components/owner/ReviewReplyPanel";
import { analyzeReviewSentiment } from "@/lib/review-ai-engine";
import { startOfWeek, subWeeks, endOfWeek, isSameMonth, subMonths } from "date-fns";
import { ResponsiveContainer, LineChart, CartesianGrid, XAxis, YAxis, Tooltip, ReferenceLine, Line } from "recharts";
import { cn } from "@/lib/utils";
import { toJSDate, safeFormat, safeFormatDistanceToNow } from "@/lib/date-utils";
import { BOOKING_STATUS } from "@/constants/bookingStatus";

const REPLY_TEMPLATES = {
  thank_you: "Thank you for your kind feedback! We look forward to serving you again. ⚡",
  well_fix: "We sincerely apologize for the inconvenience. Our team has been notified and will address this immediately.",
  resolved: "We're happy to inform you that this issue has been resolved. Thank you for bringing it to our attention!"
};

export default function OwnerReviews() {
  const [, setLocation] = useLocation();
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  
  const [reviews, setReviews] = useState<any[]>([]);
  const [stations, setStations] = useState<Station[]>([]);
  const [completedBookings, setCompletedBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSummary, setAiSummary] = useState<any>(null);
  const [starFilter, setStarFilter] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | "unanswered" | "answered">("all");
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");

  useEffect(() => {
    if (authLoading) return;
    if (!user) { setLocation("/owner/login"); return; }
    let isMounted = true;

    const load = async () => {
      const ownerSnap = await getDoc(doc(db, "owners", user.uid));
      if (!ownerSnap.exists()) { setLocation("/owner/login"); return; }
      const ownerData = ownerSnap.data();
      if (ownerData.reviewSummary) setAiSummary(ownerData.reviewSummary);

      subscribeToOwnerStations(user.uid, async (stationsList) => {
        if (!isMounted) return;
        setStations(stationsList);
        if (stationsList.length === 0) { setLoading(false); return; }

        const ids = stationsList.map((s) => s.id);
        const all: any[] = [];
        for (let i = 0; i < ids.length; i += 10) {
          const chunk = ids.slice(i, i + 10);
          
          // Fetch Reviews from the new verified collection
          const revSnap = await getDocs(query(collection(db, "station_reviews"), where("stationId", "in", chunk)));
          revSnap.forEach((d) => all.push({ id: d.id, ...d.data() }));
        }

        // Fetch all Bookings for this owner directly (by ownerId and by stationId to catch seeded/older bookings)
        const bookingsMap = new Map<string, any>();
        const bookSnapOwner = await getDocs(query(collection(db, "bookings"), where("ownerId", "==", user.uid)));
        bookSnapOwner.forEach((d) => bookingsMap.set(d.id, d.data()));

        for (let i = 0; i < ids.length; i += 10) {
          const chunk = ids.slice(i, i + 10);
          const bookSnapStation = await getDocs(query(collection(db, "bookings"), where("stationId", "in", chunk)));
          bookSnapStation.forEach((d) => bookingsMap.set(d.id, d.data()));
        }

        const allBookings: any[] = [];
        bookingsMap.forEach((data, id) => {
          const isSuccessful = data.status === BOOKING_STATUS.CONFIRMED || 
                               data.status === BOOKING_STATUS.COMPLETED ||
                               ["paid", "completed", "success"].includes(data.paymentStatus);
          if (isSuccessful) {
            allBookings.push({ id, ...data });
          }
        });

        // Pinning Sort: Pinned first, then by date
        all.sort((a, b) => {
          if (a.isPinned && !b.isPinned) return -1;
          if (!a.isPinned && b.isPinned) return 1;
          return (b.createdAt || 0) - (a.createdAt || 0);
        });

        if (isMounted) {
          setReviews(all);
          setCompletedBookings(allBookings);
          setLoading(false);
          // Check if AI summary needs refresh
          if (ownerData.reviewSummary && ownerData.reviewSummary.reviewCount !== all.length) {
            // Recommendation: User manually refreshes or auto-trigger? Let's keep manual refresh prominent.
          }
        }
      });
    };

    load().catch(console.error);
    return () => { isMounted = false; };
  }, [user, authLoading, setLocation]);

  // Distribution Calculation
  const distribution = useMemo(() => {
    if (reviews.length === 0) return [];
    return [5, 4, 3, 2, 1].map(star => {
      const count = reviews.filter(r => r.rating === star).length;
      return {
        star,
        count,
        percent: Math.round((count / reviews.length) * 100)
      };
    });
  }, [reviews]);

  const stats = useMemo(() => {
    if (reviews.length === 0) return { avg: 0, positive: 0, neutral: 0, negative: 0 };
    const avg = reviews.reduce((s, r) => s + r.rating, 0) / reviews.length;
    const positive = Math.round((reviews.filter(r => r.rating >= 4).length / reviews.length) * 100);
    const neutral = Math.round((reviews.filter(r => r.rating === 3).length / reviews.length) * 100);
    const negative = Math.round((reviews.filter(r => r.rating <= 2).length / reviews.length) * 100);
    return { avg: avg.toFixed(1), positive, neutral, negative };
  }, [reviews]);

  const { unansweredReviews, answeredReviews } = useMemo(() => {
    const unanswered = reviews.filter(r => (!r.ownerResponse?.text && !r.ownerReply) || r.ownerResponse?.text === "" || r.ownerReply === "");
    const answered = reviews.filter(r => (r.ownerResponse?.text?.length > 0) || (r.ownerReply?.length > 0));
    return { unansweredReviews: unanswered, answeredReviews: answered };
  }, [reviews]);

  const responseRateData = useMemo(() => {
    const responseRate = reviews.length > 0 ? Math.round((answeredReviews.length / reviews.length) * 100) : 0;
    const thisMonthReviews = reviews.filter(r => r.createdAt && isSameMonth(toJSDate(r.createdAt), new Date()));
    const thisMonthAnswered = thisMonthReviews.filter(r => (r.ownerResponse?.text?.length > 0) || (r.ownerReply?.length > 0));
    const thisMonthRate = thisMonthReviews.length > 0 ? Math.round((thisMonthAnswered.length / thisMonthReviews.length) * 100) : 0;
    
    const lastMonthReviews = reviews.filter(r => r.createdAt && isSameMonth(toJSDate(r.createdAt), subMonths(new Date(), 1)));
    const lastMonthAnswered = lastMonthReviews.filter(r => (r.ownerResponse?.text?.length > 0) || (r.ownerReply?.length > 0));
    const lastMonthRate = lastMonthReviews.length > 0 ? Math.round((lastMonthAnswered.length / lastMonthReviews.length) * 100) : 0;
    
    return {
      responseRate,
      thisMonthRate,
      lastMonthRate,
      rateChange: thisMonthRate - lastMonthRate
    };
  }, [reviews, answeredReviews]);

  const ratingTrendData = useMemo(() => {
    const weeks = [];
    for (let i = 7; i >= 0; i--) {
      const weekStart = startOfWeek(subWeeks(new Date(), i));
      const weekEnd = endOfWeek(subWeeks(new Date(), i));
      const weekReviews = reviews.filter(r => {
        const d = r.createdAt?.toDate ? r.createdAt.toDate() : new Date(r.createdAt);
        return d && d >= weekStart && d <= weekEnd;
      });
      const avgRating = weekReviews.length > 0 ? (weekReviews.reduce((s,r) => s + r.rating, 0) / weekReviews.length).toFixed(2) : null;
      weeks.push({ week: safeFormat(weekStart, "MMM d"), avgRating: avgRating ? parseFloat(avgRating) : null, reviewCount: weekReviews.length });
    }
    return weeks;
  }, [reviews]);

  const sessionsWithoutReview = useMemo(() => {
    const ownerStationIds = stations.map(s => s.id);
    return completedBookings
      .filter(b => ownerStationIds.includes(b.stationId))
      .filter(b => !reviews.some(
        r => r.stationId === b.stationId && r.userId === b.userId &&
             Math.abs(new Date(r.createdAt?.toDate ? r.createdAt.toDate() : r.createdAt).getTime() - new Date(b.endedAt?.toDate ? b.endedAt.toDate() : b.endedAt).getTime()) < 7*86400000
      ))
      .slice(0, 5);
  }, [completedBookings, stations, reviews]);

  const filteredReviews = useMemo(() => {
    let result = reviews;
    if (statusFilter === "unanswered") {
      result = [...unansweredReviews].sort((a,b) => a.rating - b.rating);
    } else if (statusFilter === "answered") {
      result = answeredReviews;
    }
    if (starFilter !== null) {
      result = result.filter(r => r.rating === starFilter);
    }
    return result;
  }, [reviews, starFilter, statusFilter, unansweredReviews, answeredReviews]);

  const handleSendReviewRequest = async (booking: any) => {
    try {
      await addDoc(collection(db, "notifications"), {
        userId: booking.userId,
        type: "REVIEW_REQUEST",
        title: "How was your charging session? ⚡",
        message: `Your session at ${booking.stationName} is complete. Tap to share your feedback!`,
        stationId: booking.stationId,
        bookingId: booking.id,
        read: false,
        createdAt: serverTimestamp()
      });
      await updateDoc(doc(db, "bookings", booking.id), { reviewRequestSent: true, reviewRequestSentAt: serverTimestamp() });
      setCompletedBookings(prev => prev.map(b => b.id === booking.id ? { ...b, reviewRequestSent: true } : b));
      toast({ title: "Review Request Sent!", description: "The driver has been notified." });
    } catch (err) {
      console.error(err);
      toast({ title: "Failed to send request", variant: "destructive" });
    }
  };

  // AI Sentiment Analysis (Claude Integration)
  const handleAiAnalysis = async () => {
    if (reviews.length < 3) {
      toast({ title: "Insufficient Data", description: "At least 3 reviews are required for AI analysis.", variant: "destructive" });
      return;
    }
    setAiLoading(true);
    try {
      const eligibleReviews = reviews
        .filter(r => r.comment && r.comment.length > 5)
        .slice(0, 20)
        .map(r => ({ rating: r.rating, text: r.comment }));

      if (eligibleReviews.length === 0) {
        toast({ title: "No data", description: "At least one review with a comment is required for AI analysis." });
        return;
      }

      const parsed = await analyzeReviewSentiment(eligibleReviews);
      
      const summary = {
        positives: parsed.positives,
        negatives: parsed.negatives,
        overallSentiment: parsed.sentiment,
        recommendationScore: parsed.recommendation.length > 0 ? 85 : 0, // Mock score logic
        recommendation: parsed.recommendation,
        generatedAt: Date.now(),
        reviewCount: reviews.length
      };

      await updateDoc(doc(db, "owners", user!.uid), { reviewSummary: summary });
      setAiSummary(summary);
      toast({ title: "Analysis Complete!", description: "Review insights updated with Gemini 1.5 Flash." });
    } catch (err) {
      console.error(err);
      toast({ title: "AI Analysis Failed", description: "Check your Gemini API key configuration.", variant: "destructive" });
    } finally {
      setAiLoading(false);
    }
  };


  // Review Interactions
  const handlePinReview = async (review: any) => {
    try {
      const currentlyPinned = reviews.find(r => r.stationId === review.stationId && r.isPinned);
      const batch = writeBatch(db);

      if (currentlyPinned) {
        if (currentlyPinned.id === review.id) {
          batch.update(doc(db, "station_reviews", review.id), { isPinned: false });
        } else {
          batch.update(doc(db, "station_reviews", currentlyPinned.id), { isPinned: false });
          batch.update(doc(db, "station_reviews", review.id), { isPinned: true });
        }
      } else {
        batch.update(doc(db, "station_reviews", review.id), { isPinned: true });
      }

      await batch.commit();
      toast({ title: review.isPinned ? "Review Unpinned" : "Featured Review Updated! ⭐" });
    } catch (err) {
      console.error(err);
    }
  };

  const handlePostReply = async (reviewId: string) => {
    if (!replyText.trim() || replyText.length > 300) {
      toast({ title: "Invalid Response", description: "Response must be between 1 and 300 characters.", variant: "destructive" });
      return;
    }

    try {
      await updateDoc(doc(db, "station_reviews", reviewId), {
        ownerResponse: {
          text: replyText.trim(),
          postedAt: Date.now(),
          ownerUid: user!.uid
        }
      });
      setReplyingTo(null);
      setReplyText("");
      toast({ title: "Response Posted!", description: "The driver will see your message on the station page." });
    } catch (err) {
      console.error(err);
    }
  };

  if (loading || authLoading) return <div className="flex items-center justify-center h-64 text-muted-foreground animate-pulse font-black uppercase tracking-widest text-xs">Syncing community feedback...</div>;

  return (
    <div className="space-y-6 pb-20 skeleton-fade-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight flex items-center gap-2">Reviews & Ratings <Sparkles className="w-5 h-5 text-amber-500" /></h1>
          <p className="text-sm text-muted-foreground font-medium">Monitoring site reputation across {stations.length} locations</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* AI Review Insights */}
        <Card className="relative overflow-hidden glass-card shadow-xl shadow-primary/5 border-none">
          <div className="absolute top-0 right-0 p-6 opacity-[0.03] pointer-events-none">
             <Bot className="w-32 h-32" />
          </div>
          <CardHeader className="pb-2">
             <div className="flex justify-between items-start">
                <div className="flex items-center gap-2">
                   <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                      <Bot className="w-4 h-4" />
                   </div>
                   <CardTitle className="text-lg font-black uppercase tracking-tight">AI Review Insights</CardTitle>
                </div>
                <Button 
                  size="sm" 
                  variant="ghost" 
                  onClick={handleAiAnalysis} 
                  disabled={aiLoading}
                  className="rounded-xl h-8 font-black uppercase tracking-widest text-[10px] bg-white/5 hover:bg-white/10 gap-2 px-4"
                >
                  {aiLoading ? <RefreshCw className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                  {aiSummary ? "Refresh Analysis" : "Analyze Now"}
                </Button>
             </div>
             {aiSummary ? (
               <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest mt-1">Based on {aiSummary.reviewCount} reviews · Sentiment: {aiSummary.overallSentiment === 'positive' ? '😊 Positive' : aiSummary.overallSentiment === 'negative' ? '😞 Critical' : '😐 Neutral'}</p>
             ) : (
               <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest mt-1 text-primary animate-pulse">Request AI analysis to extract key driver pain points</p>
             )}
          </CardHeader>
          <CardContent className="space-y-6">
             {aiSummary ? (
               <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <p className="text-xs font-black uppercase tracking-widest text-emerald-500 flex items-center gap-2">😊 Drivers appreciate</p>
                    <ul className="space-y-2">
                       {aiSummary.positives.map((p: string, i: number) => (
                         <li key={i} className="text-sm font-bold flex items-start gap-2">
                            <CheckCircle className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                            <span className="text-muted-foreground">{p}</span>
                         </li>
                       ))}
                    </ul>
                  </div>
                  <div className="space-y-3">
                    <p className="text-xs font-black uppercase tracking-widest text-amber-500 flex items-center gap-2">😞 Common concerns</p>
                    <ul className="space-y-2">
                       {aiSummary.negatives.map((n: string, i: number) => (
                         <li key={i} className="text-sm font-bold flex items-start gap-2">
                            <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                            <span className="text-muted-foreground">{n}</span>
                         </li>
                       ))}
                    </ul>
                  </div>
                  <div className="md:col-span-2 pt-4 border-t-2 border-white/5 border-dashed flex items-center justify-between">
                     <div className="space-y-1">
                        <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Recommendation Score</Label>
                        <div className="flex items-center gap-2">
                           <p className="text-3xl font-black">{aiSummary.recommendationScore}/100</p>
                           <Star className="w-6 h-6 fill-amber-400 text-amber-400" />
                        </div>
                     </div>
                     <div className="text-right">
                        <p className="text-[10px] font-bold text-muted-foreground">LAST UPDATED</p>
                        <p className="text-xs font-black uppercase tracking-widest">{safeFormatDistanceToNow(aiSummary.generatedAt)} ago</p>
                     </div>
                  </div>
               </div>
             ) : (
               <div className="py-12 text-center space-y-4">
                  <Bot className="w-12 h-12 text-muted-foreground/20 mx-auto" />
                  <div className="space-y-1">
                    <p className="text-sm font-black tracking-tight text-muted-foreground">Unlock Site Intelligence</p>
                    <p className="text-xs text-muted-foreground/60">Gemini will analyze driver comments to find hidden operational issues.</p>
                  </div>
               </div>
             )}
          </CardContent>
        </Card>

        {/* Rating Overview Chart */}
        <Card className="glass-card shadow-xl shadow-primary/5 p-8 flex flex-col justify-between border-none">
           <div className="flex items-start justify-between mb-8">
              <div className="space-y-1">
                 <h2 className="text-xl font-black uppercase tracking-tight">Rating Overview</h2>
                 <p className="text-xs text-muted-foreground font-medium">Driver satisfaction breakdown across stations</p>
              </div>
              <div className="text-right">
                 <div className="text-4xl font-black tracking-tighter flex items-center justify-end gap-2">
                   {stats.avg} 
                   <div className="flex mb-1">
                     {[1,2,3,4,5].map(s => <Star key={s} className="w-4 h-4 fill-amber-400 text-amber-400 shrink-0" />)}
                   </div>
                 </div>
                 <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Based on {reviews.length} reviews</p>
              </div>
           </div>

           <div className="space-y-4 flex-1">
              {distribution.map(d => (
                <div key={d.star} className="flex items-center gap-4 text-[10px] font-black uppercase tracking-widest">
                   <div className="w-6 flex items-center gap-1">
                      {d.star} <Star className="w-3 h-3 fill-muted-foreground/40 text-muted-foreground/40" />
                   </div>
                   <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
                      <div 
                        className={cn("h-full transition-all duration-1000", 
                          d.star >= 4 ? "bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.4)]" : d.star === 3 ? "bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.4)]" : "bg-destructive shadow-[0_0_10px_rgba(239,68,68,0.4)]"
                        )}
                        style={{ width: `${d.percent}%` }}
                      />
                   </div>
                   <div className="w-16 text-right tabular-nums opacity-60">
                      {d.percent}% ({d.count})
                   </div>
                </div>
              ))}
           </div>

           <div className="mt-8 grid grid-cols-3 gap-2 p-1 bg-white/5 rounded-2xl">
              <div className="text-center p-2 rounded-xl bg-emerald-500/10 text-emerald-500">
                 <p className="text-lg font-black">{stats.positive}%</p>
                 <p className="text-[10px] font-black uppercase tracking-tighter">😊 Positive</p>
              </div>
              <div className="text-center p-2">
                 <p className="text-lg font-black text-amber-500">{stats.neutral}%</p>
                 <p className="text-[10px] font-black uppercase tracking-tighter text-muted-foreground">😐 Neutral</p>
              </div>
              <div className="text-center p-2">
                 <p className="text-lg font-black text-destructive">{stats.negative}%</p>
                 <p className="text-[10px] font-black uppercase tracking-tighter text-muted-foreground">😞 Negative</p>
              </div>
           </div>

           <div className="mt-8">
             <h3 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-4 flex justify-between">
               <span>⭐ Rating Trend — Last 8 Weeks</span>
             </h3>
             <ResponsiveContainer width="100%" height={150}>
               <LineChart data={ratingTrendData}>
                 <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)"/>
                 <XAxis dataKey="week" tick={{fontSize:10, fill: "rgba(255,255,255,0.4)"}} axisLine={false} tickLine={false} />
                 <YAxis domain={[1,5]} ticks={[1,2,3,4,5]} tick={{fontSize:10, fill: "rgba(255,255,255,0.4)"}} axisLine={false} tickLine={false} width={20} />
                 <Tooltip 
                   contentStyle={{ backgroundColor: "#1e1e24", border: "none", borderRadius: "12px", fontSize: "12px", fontWeight: "bold" }}
                   formatter={(v: any) => [v ? `${v}★` : "No reviews", "Avg Rating"]}
                 />
                 <ReferenceLine y={4} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: "Target", position: "insideTopLeft", fill: "#f59e0b", fontSize: 10 }} />
                 <Line 
                   type="monotone"
                   dataKey="avgRating"
                   stroke="#22c55e"
                   strokeWidth={3}
                   dot={{ fill:"#22c55e", r:4, strokeWidth: 2, stroke: "#000" }}
                   activeDot={{ r: 6 }}
                   connectNulls={false}
                   isAnimationActive={true}
                 />
               </LineChart>
             </ResponsiveContainer>
           </div>
        </Card>

        {/* Response Rate Metric Card */}
        <Card className="glass-card shadow-xl shadow-primary/5 p-8 flex flex-col justify-between border-none">
           <div className="flex items-start justify-between mb-8">
              <div className="space-y-1">
                 <h2 className="text-xl font-black uppercase tracking-tight text-white flex items-center gap-2"><MessageCircle className="w-5 h-5 text-blue-500"/> Response Rate</h2>
                 <p className="text-xs text-muted-foreground font-medium">Your engagement with drivers</p>
              </div>
              <div className="text-right">
                 <div className={cn("text-4xl font-black tracking-tighter flex items-center justify-end gap-2", 
                   responseRateData.responseRate >= 80 ? "text-emerald-500" :
                   responseRateData.responseRate >= 60 ? "text-blue-500" :
                   responseRateData.responseRate >= 40 ? "text-amber-500" : "text-destructive"
                 )}>
                   {responseRateData.responseRate}%
                 </div>
                 <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest leading-tight mt-1">
                   {answeredReviews.length} OF {reviews.length} REVIEW{reviews.length !== 1 ? 'S' : ''} ANSWERED
                 </p>
              </div>
           </div>
           
           <div className="space-y-4 flex-1 flex flex-col justify-end">
              <div className="flex items-center gap-2">
                  <span className={cn(
                    "text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-md",
                    responseRateData.rateChange > 0 ? "bg-emerald-500/10 text-emerald-500" : 
                    responseRateData.rateChange < 0 ? "bg-destructive/10 text-destructive" :
                    "bg-white/5 text-muted-foreground"
                  )}>
                    {responseRateData.rateChange > 0 ? `↑ +${responseRateData.rateChange}%` : 
                     responseRateData.rateChange < 0 ? `↓ ${Math.abs(responseRateData.rateChange)}%` : 
                     `— 0%`} vs last month
                  </span>
               </div>
               <div className="pt-4 border-t-2 border-white/5 border-dashed">
                  <p className={cn("text-xs font-black uppercase tracking-widest flex items-center gap-2", 
                    responseRateData.responseRate >= 80 ? "text-emerald-500" :
                    responseRateData.responseRate >= 60 ? "text-blue-500" :
                    responseRateData.responseRate >= 40 ? "text-amber-500" : "text-destructive"
                  )}>
                    {responseRateData.responseRate >= 80 ? "⭐ Great engagement with drivers!" :
                     responseRateData.responseRate >= 60 ? "💬 Keep responding to build trust" :
                     "⚠️ Low response rate may hurt ranking"}
                  </p>
               </div>
           </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 mb-6">
        {/* Request Reviews Widget */}
        <Card className="glass-card shadow-xl shadow-primary/5 p-6 border-none text-sm">
           <div className="flex items-center gap-2 mb-4">
              <Send className="w-5 h-5 text-blue-500" />
              <h3 className="font-black uppercase tracking-wide">Request Reviews <span className="text-muted-foreground font-bold">({sessionsWithoutReview.length} pending requests)</span></h3>
           </div>
           {sessionsWithoutReview.length === 0 ? (
             <div className="bg-white/5 rounded-xl p-4 text-center">
               <p className="font-black uppercase tracking-widest text-[10px] text-muted-foreground flex items-center justify-center gap-2">
                 <CheckCircle className="w-4 h-4 text-emerald-500" /> All recent sessions have been requested for review
               </p>
             </div>
           ) : (
             <div className="grid gap-3 grid-cols-1 md:grid-cols-2 xl:grid-cols-5">
               {sessionsWithoutReview.map(session => (
                 <div key={session.id} className="bg-white/5 rounded-xl p-4 flex flex-col justify-between">
                   <div className="space-y-1 mb-4">
                      <p className="font-black tracking-tight text-white">{session.userName?.split(' ')[0] || "Driver"} <span className="text-muted-foreground font-medium text-xs">· ₹{session.totalPrice}</span></p>
                      <p className="text-[10px] font-bold tracking-widest uppercase text-muted-foreground">{session.stationName} <br/> {session.endedAt || session.startTime ? safeFormat(session.endedAt || session.startTime, 'MMM d') : 'N/A'}</p>
                   </div>
                   {session.reviewRequestSent ? (
                     <Button variant="outline" disabled className="w-full h-8 text-[10px] font-black uppercase tracking-widest border-white/10 opacity-50">
                       <CheckCircle className="w-3 h-3 mr-2 text-emerald-500" /> Sent
                     </Button>
                   ) : (
                     <Button onClick={() => handleSendReviewRequest(session)} className="w-full h-8 text-[10px] font-black uppercase tracking-widest bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/20">
                       Send Request
                     </Button>
                   )}
                 </div>
               ))}
             </div>
           )}
        </Card>
      </div>

      {/* Review Filters */}
      {statusFilter === "unanswered" && unansweredReviews.length > 0 && (
         <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-4 flex items-start gap-4 mb-4">
            <div className="bg-destructive/20 p-2 rounded-full shrink-0 mt-0.5">
               <AlertTriangle className="w-5 h-5 text-destructive" />
            </div>
            <div>
               <p className="font-black text-destructive tracking-tight">📝 {unansweredReviews.length} review{unansweredReviews.length !== 1 ? 's' : ''} need your response.</p>
               <p className="text-sm font-medium text-destructive/80 mt-1">Responding within 24 hours improves your ranking and driver trust.</p>
            </div>
         </div>
      )}

      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
         <Badge 
           variant={starFilter === null && statusFilter === "all" ? "default" : "outline"} 
           className={cn(
            "px-4 py-1.5 rounded-xl cursor-pointer uppercase font-black tracking-widest text-[10px]",
            (starFilter === null && statusFilter === "all") ? "shadow-lg shadow-primary/20" : "bg-white/5 border-none hover:bg-white/10"
           )}
           onClick={() => { setStarFilter(null); setStatusFilter("all"); }}
         >
           All ({reviews.length})
         </Badge>
         <Badge 
           variant={statusFilter === "unanswered" ? "default" : "outline"} 
           className={cn(
            "px-4 py-1.5 rounded-xl cursor-pointer uppercase font-black tracking-widest text-[10px] flex items-center gap-1.5",
            statusFilter === "unanswered" ? "bg-destructive text-destructive-foreground shadow-lg shadow-destructive/20" : "bg-white/5 border-none hover:bg-white/10 text-foreground"
           )}
           onClick={() => setStatusFilter(prev => prev === "unanswered" ? "all" : "unanswered")}
         >
           Unanswered
           {unansweredReviews.length > 0 && (
             <span className="w-4 h-4 rounded-full bg-red-500 text-white flex items-center justify-center text-[8px]">{unansweredReviews.length}</span>
           )}
         </Badge>
         <Badge 
           variant={statusFilter === "answered" ? "default" : "outline"} 
           className={cn(
            "px-4 py-1.5 rounded-xl cursor-pointer uppercase font-black tracking-widest text-[10px] flex items-center gap-1.5",
            statusFilter === "answered" ? "bg-emerald-500 text-emerald-950 shadow-lg shadow-emerald-500/20" : "bg-white/5 border-none hover:bg-white/10 text-foreground"
           )}
           onClick={() => setStatusFilter(prev => prev === "answered" ? "all" : "answered")}
         >
           Answered ✅ ({answeredReviews.length})
         </Badge>
         {[5, 4, 3, 2, 1].map(s => (
           <Badge 
             key={s}
             variant={starFilter === s ? "default" : "outline"} 
             className={cn(
              "px-4 py-1.5 rounded-xl cursor-pointer uppercase font-black tracking-widest text-[10px] gap-1 shrink-0",
              starFilter === s ? "shadow-lg shadow-primary/20" : "bg-white/5 border-none hover:bg-white/10"
             )}
             onClick={() => setStarFilter(s)}
           >
             {s} <Star className="w-3 h-3 fill-current" />
           </Badge>
         ))}
      </div>

      {/* Reviews List */}
      {filteredReviews.length === 0 ? (
        <div className="text-center py-24 glass-card border-none rounded-3xl space-y-4">
           <MessageCircle className="w-12 h-12 text-muted-foreground/20 mx-auto" />
           <p className="font-black text-muted-foreground">No reviews found for this filter level.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {filteredReviews.map((review) => {
            const station = stations.find((s) => s.id === review.stationId);
            const isReplying = replyingTo === review.id;

            return (
              <Card 
                key={review.id} 
                className={cn(
                  "p-6 glass-card interactive-card border-none transition-all flex flex-col h-full relative",
                  review.isPinned && "ring-2 ring-amber-400"
                )}
              >
                {review.isPinned && (
                  <div className="absolute top-0 right-8 -translate-y-1/2 bg-amber-400 text-amber-950 text-[8px] font-black uppercase tracking-widest px-3 py-1 rounded-full shadow-lg">
                    Featured Review
                  </div>
                )}
                <div className="flex items-start justify-between mb-4">
                  <div className="space-y-1">
                     <p className="text-[10px] text-primary font-black uppercase tracking-widest">{station?.name || "Station"}</p>
                     <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-tighter opacity-60">DRIVER ID: {review.userId.slice(-6)}</p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                     <span className="text-[10px] font-black tabular-nums opacity-60">
                       {review.createdAt ? safeFormatDistanceToNow(review.createdAt, { addSuffix: true }) : ""}
                     </span>
                     <Button 
                       size="icon" 
                       variant="ghost" 
                       onClick={() => handlePinReview(review)}
                       className={cn("h-7 w-7 rounded-lg", review.isPinned ? "text-amber-500 bg-amber-500/10" : "text-muted-foreground opacity-30 hover:opacity-100")}
                     >
                       <Pin className={cn("w-3.5 h-3.5", review.isPinned && "fill-current")} />
                     </Button>
                  </div>
                </div>

                <div className="flex items-center gap-0.5 mb-4">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <Star key={s} className={`w-4 h-4 ${s <= review.rating ? "text-amber-400 fill-amber-400" : "text-muted-foreground opacity-20"}`} />
                  ))}
                  <span className="ml-2 text-sm font-black">{review.rating}.0</span>
                </div>

                <div className="flex-1 bg-white/5 p-4 rounded-2xl border-none relative group">
                   <p className="text-sm font-medium leading-relaxed italic text-foreground/80">"{review.comment}"</p>
                </div>

                {/* Owner Response Area */}
                <div className="mt-6 pt-4 border-t-2 border-dashed border-white/5">
                   {(review.ownerReply || review.ownerResponse?.text) && !isReplying ? (
                      <div className="space-y-3">
                         <div className="flex justify-between items-center">
                            <div className="flex items-center gap-2 text-[10px] font-black uppercase text-primary tracking-widest">
                               <Bot className="w-3.5 h-3.5" /> Owner Response
                               <span className="opacity-40 ml-1 font-bold">― {safeFormatDistanceToNow(review.repliedAt || review.ownerResponse?.postedAt)} ago</span>
                            </div>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="h-6 px-2 text-[10px] font-black uppercase text-muted-foreground hover:text-primary"
                              onClick={() => setReplyingTo(review.id)}
                            >
                              <Edit2 className="w-2.5 h-2.5 mr-1" /> Edit
                            </Button>
                         </div>
                         <p className="text-xs font-bold bg-primary/10 p-3 rounded-xl border-l-4 border-primary">
                            {review.ownerReply || review.ownerResponse?.text}
                         </p>
                      </div>
                   ) : isReplying ? (
                     <ReviewReplyPanel 
                       review={{
                         id: review.id,
                         comment: review.comment,
                         rating: review.rating,
                         stationName: station?.name,
                         ownerReply: review.ownerReply || review.ownerResponse?.text
                       }}
                       onClose={() => setReplyingTo(null)}
                       onPublished={() => {
                         // Real-time update logic: The page re-fetches or we update state
                         // For now, we'll rely on the user refreshing or the next fetch cycle
                       }}
                     />
                   ) : (
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => setReplyingTo(review.id)}
                        className="w-full h-10 rounded-xl text-[10px] font-black uppercase tracking-widest border-2 border-dashed border-white/10 text-muted-foreground hover:bg-primary/10 hover:text-primary hover:border-primary/20"
                      >
                         <Reply className="w-3.5 h-3.5 mr-2" /> AI Response Drafts
                      </Button>
                   )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
