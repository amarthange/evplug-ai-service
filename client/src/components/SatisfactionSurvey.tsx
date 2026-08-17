import React, { useState, useEffect } from "react";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { db } from "@/lib/firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { Star, Smile, Frown, Meh, Sparkles, Send } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface SatisfactionSurveyProps {
  userId: string;
  bookingId: string;
  bookingCount: number;
  isOpen: boolean;
  onClose: () => void;
}

export default function SatisfactionSurvey({ userId, bookingId, bookingCount, isOpen, onClose }: SatisfactionSurveyProps) {
  const { toast } = useToast();
  const [step, setStep] = useState(1); // 1: Rating, 2: Feedback
  const [surveyType, setSurveyType] = useState<"csat" | "nps" | "ces">("csat");
  const [score, setScore] = useState<number>(0);
  const [feedback, setFeedback] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    // Determine survey type based on user history
    if (bookingCount === 3) {
      setSurveyType("nps");
    } else if (Math.random() > 0.5) {
      setSurveyType("csat");
    } else {
      setSurveyType("ces");
    }
  }, [bookingCount, isOpen]);

  const handleSubmit = async () => {
    if (score === 0) return;
    setSubmitting(true);
    try {
      await addDoc(collection(db, "satisfaction_surveys"), {
        userId,
        bookingId,
        surveyType,
        score,
        feedback,
        submittedAt: serverTimestamp()
      });
      toast({
        title: "Thank you for your feedback!",
        description: "Your input helps us improve EVPlugFinder.",
      });
      onClose();
    } catch (error) {
      toast({
        title: "Error submitting survey",
        variant: "destructive"
      });
    } finally {
      setSubmitting(false);
    }
  };

  const renderRatingUI = () => {
    if (surveyType === "nps") {
      return (
        <div className="space-y-6 py-4">
          <p className="text-sm font-medium text-center">How likely are you to recommend EVPlugFinder to a friend?</p>
          <div className="flex flex-wrap justify-center gap-2">
            {[...Array(11)].map((_, i) => (
              <Button
                key={i}
                variant={score === i ? "default" : "outline"}
                className={cn(
                  "w-9 h-9 p-0 rounded-full font-bold",
                  score === i ? "bg-primary scale-110" : "hover:bg-slate-100 dark:hover:bg-slate-800"
                )}
                onClick={() => setScore(i)}
              >
                {i}
              </Button>
            ))}
          </div>
          <div className="flex justify-between text-[10px] text-slate-500 font-bold uppercase px-2">
            <span>Not Likely</span>
            <span>Very Likely</span>
          </div>
        </div>
      );
    }

    if (surveyType === "csat") {
      return (
        <div className="space-y-6 py-4 text-center">
          <p className="text-sm font-medium">How satisfied were you with your charging experience?</p>
          <div className="flex justify-center gap-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <button
                key={i}
                onClick={() => setScore(i)}
                className={cn(
                  "transition-all duration-300 transform",
                  score === i ? "scale-125" : "grayscale opacity-50 hover:grayscale-0 hover:opacity-100"
                )}
              >
                {i <= 2 ? <Frown className="w-10 h-10 text-red-500" /> : 
                 i === 3 ? <Meh className="w-10 h-10 text-amber-500" /> : 
                 <Smile className="w-10 h-10 text-emerald-500" />}
              </button>
            ))}
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-6 py-4 text-center">
        <p className="text-sm font-medium">How easy was it to complete your booking?</p>
        <div className="flex flex-wrap justify-center gap-2">
          {[1, 2, 3, 4, 5, 6, 7].map((i) => (
            <Button
              key={i}
              variant={score === i ? "default" : "outline"}
              className={cn(
                "w-12 h-12 rounded-lg font-black text-lg",
                score === i && "bg-blue-600 ring-4 ring-blue-500/20"
              )}
              onClick={() => setScore(i)}
            >
              {i}
            </Button>
          ))}
        </div>
        <div className="flex justify-between text-[10px] text-slate-500 font-bold uppercase px-2">
          <span>Very Difficult</span>
          <span>Very Easy</span>
        </div>
      </div>
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px] overflow-hidden border-none bg-slate-50 dark:bg-slate-900 shadow-2xl">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500" />
        <DialogHeader className="pt-4">
          <DialogTitle className="flex items-center gap-2 text-2xl font-black italic tracking-tighter">
            <Sparkles className="w-6 h-6 text-amber-500 animate-pulse" />
            FEEDBACK MATTERS
          </DialogTitle>
          <DialogDescription className="font-medium">
            Help us build the future of EV charging.
          </DialogDescription>
        </DialogHeader>

        {step === 1 ? (
          <>
            {renderRatingUI()}
            <DialogFooter className="mt-4">
              <Button 
                className="w-full h-12 font-black rounded-xl gap-2 transition-all hover:scale-[1.02]"
                disabled={score === 0}
                onClick={() => setStep(2)}
              >
                Next <Send className="w-4 h-4" />
              </Button>
            </DialogFooter>
          </>
        ) : (
          <div className="space-y-4 py-4">
            <p className="text-sm font-bold uppercase text-slate-500 tracking-widest">Optional Feedback</p>
            <Textarea
              placeholder="Tell us what we could do better..."
              className="min-h-[120px] rounded-xl border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 shadow-inner"
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
            />
            <div className="flex gap-2 pt-4">
              <Button variant="ghost" className="w-1/3 h-12 rounded-xl font-bold" onClick={() => setStep(1)}>Back</Button>
              <Button 
                className="w-2/3 h-12 rounded-xl font-black gap-2 bg-gradient-to-r from-primary to-blue-600 text-white shadow-lg shadow-primary/20" 
                onClick={handleSubmit}
                disabled={submitting}
              >
                {submitting ? "Submitting..." : "Send Feedback"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
