import { useState, useEffect } from "react";
import { 
  collection, query, where, orderBy, limit, onSnapshot, doc, updateDoc, increment, getDocs 
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Star, ThumbsUp, CheckCircle2, MessageSquare, AlertCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { safeFormat, toJSDate } from "@/lib/date-utils";
import { ReviewModal } from "./ReviewModal";
import { cn } from "@/lib/utils";

interface StationReviewsProps {
  stationId: string;
  stationName: string;
}

export function StationReviews({ stationId, stationName }: StationReviewsProps) {
  const { user } = useAuth();
  const [reviews, setReviews] = useState<any[]>([]);
  const [aggregate, setAggregate] = useState({ avg: 0, count: 0 });
  const [loading, setLoading] = useState(true);
  const [canReview, setCanReview] = useState(false);
  const [latestBooking, setLatestBooking] = useState<any>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [helpfulVotes, setHelpfulVotes] = useState<string[]>([]);

  useEffect(() => {
    // Load helpful votes from localStorage
    const savedVotes = localStorage.getItem("helpful_votes");
    if (savedVotes) setHelpfulVotes(JSON.parse(savedVotes));

    // Fetch Reviews
    const q = query(
      collection(db, "station_reviews"),
      where("stationId", "==", stationId),
      orderBy("createdAt", "desc"),
      limit(5)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const revs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setReviews(revs);
      
      if (revs.length > 0) {
        const total = revs.reduce((acc, r: any) => acc + r.rating, 0);
        setAggregate({ 
          avg: Math.round((total / revs.length) * 10) / 10, 
          count: revs.length 
        });
      }
      setLoading(false);
    });

    // Check Eligibility
    if (user) {
      const checkEligibility = async () => {
        const bq = query(
          collection(db, "bookings"),
          where("userId", "==", user.uid),
          where("stationId", "==", stationId),
          where("status", "==", "completed"),
          limit(1)
        );
        const bSnap = await getDocs(bq);
        if (!bSnap.empty) {
          setCanReview(true);
          setLatestBooking({ id: bSnap.docs[0].id, stationId, stationName, status: "completed" });
        }
      };
      checkEligibility();
    }

    return () => unsubscribe();
  }, [stationId, user]);

  const handleHelpful = async (reviewId: string) => {
    if (helpfulVotes.includes(reviewId)) return;

    try {
      await updateDoc(doc(db, "station_reviews", reviewId), {
        helpfulCount: increment(1)
      });
      const newVotes = [...helpfulVotes, reviewId];
      setHelpfulVotes(newVotes);
      localStorage.setItem("helpful_votes", JSON.stringify(newVotes));
    } catch (e) {
      console.error("Failed to vote helpful:", e);
    }
  };

  if (loading) return null;

  return (
    <div className="space-y-6">
      {/* Aggregate Header */}
      <div className="flex items-center justify-between bg-slate-900/50 p-6 rounded-[2rem] border border-white/5">
        <div className="flex items-center gap-4">
          <div className="bg-yellow-400/10 p-4 rounded-3xl border border-yellow-400/20">
            <span className="text-3xl font-black text-yellow-400">{aggregate.avg || "0.0"}</span>
          </div>
          <div>
            <div className="flex gap-0.5 mb-1">
              {[1, 2, 3, 4, 5].map((s) => (
                <Star key={s} className={cn("w-4 h-4", s <= aggregate.avg ? "fill-yellow-400 text-yellow-400" : "text-slate-700")} />
              ))}
            </div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">{aggregate.count} Verified Reviews</p>
          </div>
        </div>

        {canReview ? (
          <Button 
            onClick={() => setIsModalOpen(true)}
            className="h-12 rounded-2xl font-black bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-600/20 px-6"
          >
            Review Station
          </Button>
        ) : (
          <div className="flex items-center gap-2 text-[10px] font-black text-slate-500 uppercase tracking-tighter bg-slate-800/50 px-4 py-3 rounded-2xl border border-white/5">
            <AlertCircle className="w-3.5 h-3.5" />
            Complete a session to review
          </div>
        )}
      </div>

      {/* Review List */}
      <div className="space-y-4">
        <AnimatePresence mode="popLayout">
          {reviews.map((review, idx) => (
            <motion.div
              key={review.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.1 }}
              className="bg-slate-950 p-6 rounded-[2.5rem] border border-white/5 relative group"
            >
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-500 font-black text-sm">
                    {review.userName?.[0] || "D"}
                  </div>
                  <div>
                    <h4 className="text-sm font-black text-white flex items-center gap-2">
                      {review.userName}
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                    </h4>
                    <span className="text-[10px] font-bold text-slate-500 uppercase">
                      {safeFormat(toJSDate(review.createdAt), "MMM d, yyyy")}
                    </span>
                  </div>
                </div>
                <div className="flex gap-0.5">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <Star key={s} className={cn("w-3.5 h-3.5", s <= review.rating ? "fill-yellow-400 text-yellow-400" : "text-slate-800")} />
                  ))}
                </div>
              </div>

              {review.comment && (
                <p className="text-sm font-medium text-slate-300 leading-relaxed italic mb-6">
                  "{review.comment}"
                </p>
              )}

              <div className="flex items-center justify-between border-t border-white/5 pt-4">
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => handleHelpful(review.id)}
                  disabled={helpfulVotes.includes(review.id)}
                  className={cn(
                    "h-9 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all",
                    helpfulVotes.includes(review.id) 
                      ? "bg-emerald-500/10 text-emerald-500" 
                      : "text-slate-500 hover:text-white hover:bg-white/5"
                  )}
                >
                  <ThumbsUp className="w-3.5 h-3.5 mr-2" />
                  Helpful {review.helpfulCount > 0 && `(${review.helpfulCount})`}
                </Button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {reviews.length === 0 && (
          <div className="py-12 text-center space-y-4">
            <div className="w-16 h-16 bg-slate-900 rounded-3xl border border-white/5 flex items-center justify-center mx-auto">
              <MessageSquare className="w-8 h-8 text-slate-700" />
            </div>
            <p className="text-sm font-black text-slate-500 uppercase tracking-widest">No reviews yet. Be the first!</p>
          </div>
        )}
      </div>

      <ReviewModal 
        booking={latestBooking} 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
      />
    </div>
  );
}
