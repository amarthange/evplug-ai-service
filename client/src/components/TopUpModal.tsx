import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Zap, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import type { GraceFlowState } from "@/pages/active-charge";

interface TopUpModalProps {
  isOpen: boolean;
  graceFlowState: GraceFlowState;
  displayCountdown: number; // seconds remaining, 0–120
  walletBalance: number; // current wallet balance in ₹
  currentCost: number; // cost accrued so far in ₹
  prePaidAmount: number; // current session budget in ₹
  onTopUp: (amount: number) => Promise<void>; // async — handles Firestore write
  onEndSession: () => void; // user voluntarily ends session
  topUpError: string | null; // shown inside modal if Firestore write failed
  isProcessing: boolean; // true while Firestore write is in flight
}

const TOP_UP_AMOUNTS = [50, 100, 200];

const TopUpModal: React.FC<TopUpModalProps> = ({
  isOpen,
  graceFlowState,
  displayCountdown,
  walletBalance,
  currentCost,
  prePaidAmount,
  onTopUp,
  onEndSession,
  topUpError,
  isProcessing,
}) => {
  const affordableAmounts = TOP_UP_AMOUNTS.filter((a) => a <= walletBalance);
  const remainingInSession = Math.max(0, prePaidAmount - currentCost);

  const mins = Math.floor(displayCountdown / 60);
  const secs = displayCountdown % 60;
  const countdownText = `${String(mins).padStart(2, "0")}:${String(secs).padStart(
    2,
    "0"
  )}`;

  // SVG Circle Progress math
  const circumference = 2 * Math.PI * 18; // r=18
  const progress = displayCountdown / 120;
  const strokeDashoffset = circumference * (1 - progress);

  const getThemeColor = () => {
    if (displayCountdown > 60) return "emerald";
    if (displayCountdown > 30) return "amber";
    return "red";
  };

  const themeColor = getThemeColor();

  const bannerColors = {
    emerald: "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400",
    amber: "bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400",
    red: "bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400",
  };

  const ringColors = {
    emerald: "text-emerald-500",
    amber: "text-amber-500",
    red: "text-red-500",
  };

  return (
    <Dialog open={isOpen} onOpenChange={() => {}}>
      <DialogContent 
        className="sm:max-w-md p-0 overflow-hidden border-none bg-background/95 backdrop-blur-xl shadow-2xl"
        onInteractOutside={(e) => e.preventDefault()}
      >
        <AnimatePresence mode="wait">
          {graceFlowState === "topped_up" ? (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
              className="p-8 flex flex-col items-center justify-center text-center space-y-4"
            >
              <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center">
                <CheckCircle2 className="w-10 h-10 text-emerald-500" />
              </div>
              <div className="space-y-1">
                <h3 className="text-xl font-bold">Top-up successful!</h3>
                <p className="text-sm text-muted-foreground">
                  Session budget updated · Charging continues
                </p>
              </div>
              <div className="w-full max-w-[200px] h-1 bg-muted rounded-full overflow-hidden mt-4">
                <motion.div
                  className="h-full bg-emerald-500"
                  initial={{ width: "0%" }}
                  animate={{ width: "100%" }}
                  transition={{ duration: 2, ease: "linear" }}
                />
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="prompt"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col"
            >
              {/* Header */}
              <div className="p-6 flex items-start gap-4">
                <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center shrink-0">
                  <Zap className="w-6 h-6 text-amber-500 fill-amber-500" />
                </div>
                <div className="space-y-1">
                  <DialogTitle className="text-lg font-bold">Balance running low</DialogTitle>
                  <DialogDescription className="text-sm">
                    Add funds to your session budget to continue charging.
                  </DialogDescription>
                </div>
              </div>

              {/* Countdown Banner */}
              <div className={cn("px-6 py-3 flex items-center justify-between transition-colors duration-500", bannerColors[themeColor])}>
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold uppercase tracking-wider opacity-70">Session ends in</span>
                  <span className="text-2xl font-black font-mono tracking-tight">{countdownText}</span>
                </div>
                <div className="relative w-12 h-12">
                  <svg className="w-full h-full -rotate-90">
                    <circle
                      cx="24" cy="24" r="18"
                      fill="transparent"
                      stroke="currentColor"
                      strokeWidth="3"
                      className="opacity-10"
                    />
                    <circle
                      cx="24" cy="24" r="18"
                      fill="transparent"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeDasharray={circumference}
                      style={{ 
                        strokeDashoffset,
                        transition: 'stroke-dashoffset 0.9s linear'
                      }}
                      className={cn("transition-colors duration-500", ringColors[themeColor])}
                      strokeLinecap="round"
                    />
                  </svg>
                </div>
              </div>

              <div className="p-6 space-y-6">
                {/* Balance Summary Row */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Wallet Balance</p>
                    <p className="text-lg font-bold">₹{walletBalance.toFixed(2)}</p>
                  </div>
                  <div className="space-y-1 text-right">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Remaining Budget</p>
                    <p className={cn(
                      "text-lg font-bold",
                      remainingInSession > 10 ? "text-emerald-500" :
                      remainingInSession > 5 ? "text-amber-500" : "text-red-500"
                    )}>
                      ₹{remainingInSession.toFixed(2)}
                    </p>
                  </div>
                </div>

                {/* Top-up Options */}
                <div className="space-y-3">
                  <p className="text-[12px] font-medium text-muted-foreground">Add to session budget</p>
                  
                  {walletBalance < 50 ? (
                    <div className="p-4 rounded-xl border border-red-500/20 bg-red-500/5 flex gap-3">
                      <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
                      <p className="text-xs text-red-600 dark:text-red-400 leading-relaxed">
                        Your wallet balance (₹{walletBalance.toFixed(2)}) is insufficient for a top-up. 
                        Please add funds to your wallet from the Profile section.
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 gap-2">
                      <TooltipProvider>
                        {TOP_UP_AMOUNTS.map((amount) => {
                          const isAffordable = walletBalance >= amount;
                          const moreRange = ((amount / prePaidAmount) * 100).toFixed(0);

                          if (!isAffordable) {
                            return (
                              <Tooltip key={amount}>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="outline"
                                    disabled
                                    className="h-auto py-3 px-2 flex flex-col gap-0.5 border-dashed opacity-50"
                                  >
                                    <span className="text-base font-bold">₹{amount}</span>
                                    <span className="text-[9px] text-red-500 font-medium">Insufficient</span>
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p className="text-xs">You need ₹{(amount - walletBalance).toFixed(2)} more in your wallet</p>
                                </TooltipContent>
                              </Tooltip>
                            );
                          }

                          return (
                            <Button
                              key={amount}
                              variant="outline"
                              className={cn(
                                "h-auto py-3 px-2 flex flex-col gap-0.5 hover:bg-emerald-500/5 hover:border-emerald-500/30 transition-all",
                                isProcessing && "opacity-50 pointer-events-none"
                              )}
                              onClick={() => onTopUp(amount)}
                            >
                              {isProcessing ? (
                                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                              ) : (
                                <>
                                  <span className="text-base font-bold">₹{amount}</span>
                                  <span className="text-[9px] text-muted-foreground font-medium">+{moreRange}% budget</span>
                                </>
                              )}
                            </Button>
                          );
                        })}
                      </TooltipProvider>
                    </div>
                  )}
                </div>

                {/* Error Message */}
                <AnimatePresence>
                  {topUpError && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="p-3 rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-800 text-red-700 dark:text-red-400 text-xs flex gap-2 items-center"
                    >
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{topUpError}</span>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Footer */}
                <div className="flex justify-end pt-2">
                  <Button
                    variant="ghost"
                    className="text-red-500 hover:text-red-600 hover:bg-red-500/5 font-bold"
                    onClick={onEndSession}
                    disabled={isProcessing}
                  >
                    End session now
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
};

export default TopUpModal;
