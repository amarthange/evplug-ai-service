import { useState, useRef } from "react";
import { db } from "@/lib/firebase";
import { doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { 
  Bot, Sparkles, X, Send, 
  RefreshCw, Reply, Edit2, 
  MessageSquare, Loader2
} from "lucide-react";
import { generateReviewDrafts, ReviewDraft } from "@/lib/review-ai-engine";
import { ReviewDraftCards } from "./ReviewDraftCards";
import { cn } from "@/lib/utils";

interface ReviewReplyPanelProps {
  review: {
    id: string;
    comment: string;
    rating: number;
    stationName?: string;
    ownerReply?: string;
  };
  onClose: () => void;
  onPublished: () => void;
}

type PanelState = 'idle' | 'generating' | 'draft_ready' | 'editing' | 'publishing';

export function ReviewReplyPanel({ review, onClose, onPublished }: ReviewReplyPanelProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [state, setState] = useState<PanelState>('idle');
  const [drafts, setDrafts] = useState<ReviewDraft[]>([]);
  const [responseText, setResponseText] = useState(review.ownerReply || "");
  const [aiUsed, setAiUsed] = useState(false);
  
  // Rate limiting ref: 3-second cooldown
  const lastCallAt = useRef<number>(0);

  const handleGenerateAI = async () => {
    const now = Date.now();
    if (now - lastCallAt.current < 3000) {
      toast({ 
        title: "Slow down", 
        description: "Please wait a few seconds between AI requests.",
        variant: "destructive" 
      });
      return;
    }

    setState('generating');
    lastCallAt.current = now;

    try {
      const results = await generateReviewDrafts(
        review.comment, 
        review.rating, 
        review.stationName || "your station"
      );
      setDrafts(results);
      setState('draft_ready');
    } catch (err: any) {
      console.error("AI Generation Error:", err);
      toast({ 
        title: "AI Generation Failed", 
        description: err.message || "Failed to connect to AI engine.",
        variant: "destructive" 
      });
      setState('idle');
    }
  };

  const handleSelectDraft = (draft: ReviewDraft) => {
    setResponseText(draft.text);
    setAiUsed(true);
    setState('editing');
  };

  const handlePublish = async () => {
    if (!responseText.trim()) {
      toast({ title: "Response cannot be empty", variant: "destructive" });
      return;
    }

    setState('publishing');
    try {
      await updateDoc(doc(db, "reviews", review.id), {
        ownerReply: responseText.trim(),
        repliedAt: serverTimestamp(),
        replyEditedAt: review.ownerReply ? serverTimestamp() : null,
        aiDraftsUsed: aiUsed,
        ownerUid: user?.uid
      });
      
      toast({ title: "Response Published!", description: "Drivers can now see your reply." });
      onPublished();
      onClose();
    } catch (err) {
      console.error("Publish Error:", err);
      toast({ title: "Failed to publish", variant: "destructive" });
      setState('editing');
    }
  };

  return (
    <div className="space-y-4 pt-6 border-t-2 border-dashed border-white/5 animate-in slide-in-from-top-2 duration-300">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <div className={cn(
            "w-8 h-8 rounded-lg flex items-center justify-center transition-colors",
            state === 'generating' ? "bg-primary/20 text-primary animate-pulse" : "bg-primary/10 text-primary"
          )}>
            <Bot className="w-4 h-4" />
          </div>
          <div className="space-y-0.5">
            <Label className="text-[10px] font-black uppercase text-primary tracking-widest block">
              {review.ownerReply ? 'Edit Response' : 'Reply to Driver'}
            </Label>
            <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-tighter opacity-60">
              {state === 'generating' ? 'AI is drafting options...' : 
               state === 'draft_ready' ? 'Choose an AI-suggested style' : 
               state === 'editing' ? 'Personalize your message' : 'Select a starting point'}
            </p>
          </div>
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full hover:bg-white/5" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </div>

      {state === 'idle' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Button 
            variant="outline" 
            className="h-12 rounded-xl bg-primary/5 border-primary/20 hover:bg-primary/10 text-primary gap-2 font-black uppercase tracking-widest text-[10px]"
            onClick={handleGenerateAI}
          >
            <Sparkles className="w-3.5 h-3.5" /> Use AI Assistant
          </Button>
          <Button 
            variant="outline" 
            className="h-12 rounded-xl bg-white/5 border-white/10 hover:bg-white/10 gap-2 font-black uppercase tracking-widest text-[10px]"
            onClick={() => setState('editing')}
          >
            <Edit2 className="w-3.5 h-3.5" /> Manual Reply
          </Button>
        </div>
      )}

      {(state === 'generating' || state === 'draft_ready') && (
        <ReviewDraftCards 
          drafts={drafts} 
          isLoading={state === 'generating'} 
          onSelect={handleSelectDraft} 
        />
      )}

      {(state === 'editing' || state === 'publishing') && (
        <div className="space-y-3 animate-in fade-in duration-300">
          <Textarea 
            value={responseText}
            onChange={(e) => setResponseText(e.target.value)}
            placeholder="Type your response here..."
            className="min-h-[100px] rounded-2xl glass-card border-none text-sm font-bold focus-visible:ring-primary/20 shadow-inner p-4"
            disabled={state === 'publishing'}
          />
          <div className="flex gap-2">
            <Button 
              className="flex-1 h-11 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-black uppercase text-[10px] tracking-widest shadow-xl shadow-primary/20 gap-2"
              onClick={handlePublish}
              disabled={state === 'publishing'}
            >
              {state === 'publishing' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Publish Response
            </Button>
            {aiUsed && state !== 'publishing' && (
              <Button 
                variant="outline" 
                className="h-11 px-4 rounded-xl border-white/10 bg-white/5 hover:bg-white/10 gap-2"
                onClick={handleGenerateAI}
              >
                <RefreshCw className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>
      )}

      {state === 'draft_ready' && (
        <div className="flex justify-center">
          <Button 
            variant="link" 
            className="text-[9px] font-black uppercase tracking-widest text-muted-foreground hover:text-primary"
            onClick={() => setState('editing')}
          >
            Or start from scratch
          </Button>
        </div>
      )}
    </div>
  );
}
