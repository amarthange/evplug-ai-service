import { ReviewDraft } from "@/lib/review-ai-engine";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Check, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

interface ReviewDraftCardsProps {
  drafts: ReviewDraft[];
  onSelect: (draft: ReviewDraft) => void;
  isLoading: boolean;
}

export function ReviewDraftCards({ drafts, onSelect, isLoading }: ReviewDraftCardsProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 animate-in fade-in duration-500">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-32 rounded-2xl bg-white/5 animate-pulse border-2 border-dashed border-white/10" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 animate-in slide-in-from-bottom-2 duration-500">
      {drafts.map((draft, idx) => (
        <motion.div
          key={draft.style}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: idx * 0.1 }}
        >
          <Card 
            className={cn(
              "p-4 h-full flex flex-col justify-between glass-card border-none hover:ring-2 hover:ring-primary/30 transition-all cursor-pointer group",
              draft.style === 'empathetic' ? "bg-purple-500/5" : 
              draft.style === 'professional' ? "bg-blue-500/5" : "bg-emerald-500/5"
            )}
            onClick={() => onSelect(draft)}
          >
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <Badge variant="outline" className="text-[9px] font-black uppercase tracking-widest bg-white/5 border-none">
                  {draft.style}
                </Badge>
                <Sparkles className={cn(
                  "w-3 h-3 opacity-30 group-hover:opacity-100 transition-opacity",
                  draft.style === 'empathetic' ? "text-purple-400" : 
                  draft.style === 'professional' ? "text-blue-400" : "text-emerald-400"
                )} />
              </div>
              <p className="text-xs font-bold leading-relaxed text-foreground/80 italic">
                "{draft.text}"
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-white/5 flex justify-end">
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-7 text-[9px] font-black uppercase tracking-widest gap-2 hover:bg-primary hover:text-primary-foreground"
              >
                Use Draft <Check className="w-3 h-3" />
              </Button>
            </div>
          </Card>
        </motion.div>
      ))}
    </div>
  );
}
