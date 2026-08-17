import { useState, useEffect } from "react";
import { collection, query, where, orderBy, onSnapshot, addDoc, doc, updateDoc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Star, Bot } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Review } from "@shared/schema";
import { toJSDate, safeFormatDistanceToNow } from "@/lib/date-utils";

interface ReviewSectionProps {
  stationId: string;
}

export function ReviewSection({ stationId }: ReviewSectionProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!stationId) return;
    const q = query(
      collection(db, "reviews"),
      where("stationId", "==", stationId),
      orderBy("createdAt", "desc")
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const revs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Review[];
      
      // Sorting: Pinned first, then by date
      revs.sort((a: any, b: any) => {
        if (a.isPinned && !b.isPinned) return -1;
        if (!a.isPinned && b.isPinned) return 1;
        return toJSDate(b.createdAt).getTime() - toJSDate(a.createdAt).getTime();
      });

      setReviews(revs);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching reviews:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [stationId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      toast({ title: "Authentication Required", description: "You must be logged in to leave a review.", variant: "destructive" });
      return;
    }
    if (!comment.trim()) {
      toast({ title: "Comment required", variant: "destructive" });
      return;
    }
    
    setIsSubmitting(true);
    try {
      // 1. Add the review
      await addDoc(collection(db, "reviews"), {
        stationId,
        userId: user.uid,
        userName: user.displayName || user.email?.split("@")[0] || "EV Driver",
        rating,
        comment: comment.trim(),
        createdAt: Date.now()
      });
      
      // 2. Update the station average rating
      const newTotal = reviews.reduce((sum, r) => sum + r.rating, 0) + rating;
      const newAvg = newTotal / (reviews.length + 1);
      await updateDoc(doc(db, "stations", stationId), {
        rating: Math.round(newAvg * 10) / 10
      });
      
      // 3. Optional: Emit Notification if rating is low (<= 3)
      if (rating <= 3) {
        try {
          const stationDoc = await getDoc(doc(db, "stations", stationId));
          if (stationDoc.exists()) {
            const ownerId = stationDoc.data().ownerId;
            if (ownerId) {
              await addDoc(collection(db, "notifications"), {
                ownerId,
                type: "LOW_RATING",
                title: "Action Required: Low Rating ⚠️",
                message: `${user.displayName || "A driver"} left a ${rating}-star review on ${stationDoc.data().name}.`,
                rating: rating,
                read: false,
                createdAt: Date.now()
              });
            }
          }
        } catch (e) { console.error("Failed to emit low rating notification:", e); }
      }
      
      toast({ title: "Review submitted successfully!" });
      setComment("");
      setRating(5);
    } catch (error: any) {
      toast({ title: "Failed to submit review", description: error.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) return <div className="p-4 text-center text-muted-foreground">Loading reviews...</div>;

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold tracking-tight">Community Reviews</h2>
      
      {/* Review Form */}
      {user ? (
        <Card className="rounded-3xl border-2 shadow-sm bg-primary/[0.01]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-black uppercase tracking-widest text-primary">Post Feedback</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="flex gap-1" data-testid="star-rating-selector">
                {[1, 2, 3, 4, 5].map((star) => (
                  <Star 
                    key={star} 
                    className={`w-6 h-6 cursor-pointer transition-colors ${rating >= star ? 'fill-primary text-primary' : 'text-muted-foreground'}`}
                    onClick={() => setRating(star)}
                  />
                ))}
              </div>
              <Textarea 
                placeholder="Share your experience (charging speed, parking, cleanliness)..." 
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
                className="rounded-2xl border-2 focus-visible:ring-primary/20 text-sm font-medium"
                required
              />
              <Button type="submit" disabled={isSubmitting} className="w-full h-12 rounded-2xl font-black uppercase tracking-widest shadow-xl shadow-primary/20">
                {isSubmitting ? "Submitting..." : "Post Review"}
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : (
        <Card className="rounded-3xl border-2 border-dashed">
          <CardContent className="p-6 text-center text-muted-foreground font-bold">
            Please log in to leave a review.
          </CardContent>
        </Card>
      )}

      {/* Reviews List */}
      <div className="space-y-4">
        {reviews.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">No reviews yet. Be the first to share your experience!</p>
        ) : (
          reviews.map((review: any) => (
            <Card 
              key={review.id} 
              className={cn(
                "rounded-[2rem] border-2 transition-all p-1 overflow-hidden",
                review.isPinned ? "border-amber-400 bg-amber-400/[0.02]" : "bg-card"
              )}
            >
              <CardContent className="p-5 flex flex-col gap-3">
                <div className="flex justify-between items-start">
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-2">
                      <div className="font-black text-sm">{review.userName || "EV Driver"}</div>
                      {review.isPinned && (
                        <Badge className="bg-amber-400 text-amber-900 border-none font-black text-[9px] uppercase h-4 px-1.5 leading-none">
                          Featured
                        </Badge>
                      )}
                    </div>
                    <div className="text-[10px] text-muted-foreground font-bold">
                      {safeFormatDistanceToNow(review.createdAt, { addSuffix: true })}
                    </div>
                  </div>
                  <div className="flex items-center gap-0.5 mt-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Star 
                        key={star} 
                        className={`w-3.5 h-3.5 ${review.rating >= star ? 'fill-primary text-primary' : 'text-muted-foreground/30'}`}
                      />
                    ))}
                  </div>
                </div>
                
                <p className="text-sm font-medium leading-relaxed italic opacity-80">"{review.comment}"</p>

                {review.ownerResponse && (
                  <div className="mt-2 p-4 bg-primary/5 rounded-2xl border-l-4 border-primary space-y-2">
                    <div className="flex items-center gap-2 text-[10px] font-black uppercase text-primary tracking-widest">
                       <Bot className="w-3.5 h-3.5" /> Station Owner Response
                       <span className="opacity-40 font-bold ml-1">• {safeFormatDistanceToNow(review.ownerResponse.postedAt)} ago</span>
                    </div>
                    <p className="text-xs font-bold text-foreground/80 leading-relaxed">
                      {review.ownerResponse.text}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
