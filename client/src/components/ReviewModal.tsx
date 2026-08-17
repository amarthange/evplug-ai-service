import { useState, useEffect } from "react";
import { 
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter 
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Star, Loader2, MessageSquare, Send } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { db } from "@/lib/firebase";
import { collection, addDoc, doc, updateDoc, increment, getDocs, query, where } from "firebase/firestore";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";

interface ReviewModalProps {
  booking: any;
  isOpen?: boolean;
  onClose?: () => void;
}

export function ReviewModal({ booking, isOpen: forcedOpen, onClose }: ReviewModalProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (forcedOpen !== undefined) {
      setIsOpen(forcedOpen);
      return;
    }

    if (!booking || booking.status !== "completed") return;

    const shownKey = `review_modal_shown_${booking.id}`;
    const alreadyShown = localStorage.getItem(shownKey);
    
    if (!alreadyShown) {
      setIsOpen(true);
      localStorage.setItem(shownKey, "true");
    }
  }, [booking, forcedOpen]);

  const handleSubmit = async () => {
    if (rating === 0) {
      toast({ title: "Please select a rating", variant: "destructive" });
      return;
    }

    setIsSubmitting(true);
    try {
      // 1. Create Review
      await addDoc(collection(db, "station_reviews"), {
        stationId: booking.stationId,
        userId: user?.uid,
        userName: user?.displayName || "EV Driver",
        rating,
        comment: comment.trim(),
        bookingId: booking.id,
        createdAt: new Date(),
        helpfulCount: 0
      });

      // 2. Update Station Average Rating (Optimistic / Simple update)
      // Note: Real-world apps use Cloud Functions for this to prevent race conditions
      await updateDoc(doc(db, "stations", booking.stationId), {
        rating: increment(0) // Logic for updating avg rating usually handled in backend
      });

      toast({ 
        title: "Thank you for your feedback! 🌟",
        description: "Your review helps other drivers find the best charging spots."
      });
      
      setIsOpen(false);
      onClose?.();
    } catch (error: any) {
      toast({ title: "Submission failed", description: error.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setIsOpen(false);
    onClose?.();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[425px] rounded-[40px] border-none bg-slate-950 p-0 overflow-hidden">
        <DialogHeader className="p-8 pb-4 text-center">
          <div className="mx-auto w-16 h-16 bg-emerald-500/10 rounded-3xl flex items-center justify-center mb-4 border border-emerald-500/20">
            <Star className="w-8 h-8 text-emerald-500 fill-emerald-500" />
          </div>
          <DialogTitle className="text-2xl font-black text-white">How was your session?</DialogTitle>
          <DialogDescription className="text-slate-400 font-bold">
            Rate your experience at {booking?.stationName || "this station"}
          </DialogDescription>
        </DialogHeader>

        <div className="px-8 pb-8 space-y-8">
          {/* Star Rating Component */}
          <div className="flex justify-center gap-3">
            {[1, 2, 3, 4, 5].map((star) => (
              <motion.button
                key={star}
                whileHover={{ scale: 1.2 }}
                whileTap={{ scale: 0.9 }}
                onMouseEnter={() => setHoverRating(star)}
                onMouseLeave={() => setHoverRating(0)}
                onClick={() => setRating(star)}
                className="relative"
              >
                <Star 
                  className={`w-10 h-10 transition-colors ${
                    (hoverRating || rating) >= star 
                      ? "fill-yellow-400 text-yellow-400" 
                      : "text-slate-700"
                  }`}
                />
                {(hoverRating || rating) >= star && (
                   <motion.div 
                    layoutId="star-glow"
                    className="absolute inset-0 bg-yellow-400/20 blur-xl rounded-full"
                   />
                )}
              </motion.button>
            ))}
          </div>

          <div className="space-y-3">
            <div className="flex justify-between items-center px-1">
              <label className="text-xs font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
                <MessageSquare className="w-3 h-3" /> Optional Comment
              </label>
              <span className={`text-[10px] font-black ${comment.length > 180 ? 'text-red-500' : 'text-slate-600'}`}>
                {comment.length}/200
              </span>
            </div>
            <Textarea
              placeholder="Tell others about the speed, ease of use, or facilities..."
              value={comment}
              onChange={(e) => setComment(e.target.value.slice(0, 200))}
              className="min-h-[100px] rounded-3xl bg-slate-900 border-white/5 text-white placeholder:text-slate-600 focus:ring-emerald-500/20 resize-none font-medium"
            />
          </div>
        </div>

        <DialogFooter className="p-8 bg-slate-900/50 flex gap-3">
          <Button 
            variant="ghost" 
            onClick={handleClose}
            className="flex-1 h-14 rounded-2xl font-black text-slate-400 hover:text-white hover:bg-white/5"
          >
            Skip
          </Button>
          <Button 
            onClick={handleSubmit}
            disabled={isSubmitting || rating === 0}
            className="flex-1 h-14 rounded-2xl font-black bg-emerald-600 hover:bg-emerald-700 shadow-xl shadow-emerald-600/20"
          >
            {isSubmitting ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>Submit <Send className="w-4 h-4 ml-2" /></>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
