import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, Smartphone, Map, Zap } from "lucide-react";
import { db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import { useAuth } from "@/lib/auth-context";

export function PWAInstallPrompt() {
  const { user, userRole } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  useEffect(() => {
    const handler = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      checkEligibility();
    };

    window.addEventListener("beforeinstallprompt", handler);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
    };
  }, [user]);

  const checkEligibility = async () => {
    if (!user?.uid || userRole !== "ev_user") return;

    try {
      const userDoc = await getDoc(doc(db, "users", user.uid));
      if (userDoc.exists()) {
        const userData = userDoc.data();
        // Show after 3rd completed booking
        if ((userData.completedBookingsCount || 0) >= 3) {
          const hasDismissed = localStorage.getItem("pwa_prompt_dismissed");
          if (!hasDismissed) {
            setIsOpen(true);
          }
        }
      }
    } catch (error) {
      console.error("Error checking PWA eligibility:", error);
    }
  };

  const handleInstall = async () => {
    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    
    if (outcome === "accepted") {
      setDeferredPrompt(null);
      setIsOpen(false);
    }
  };

  const handleDismiss = () => {
    setIsOpen(false);
    localStorage.setItem("pwa_prompt_dismissed", "true");
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-md bg-background/95 backdrop-blur-xl border-primary/20">
        <DialogHeader>
          <div className="mx-auto bg-primary/10 p-3 rounded-full w-fit mb-4">
            <Smartphone className="w-8 h-8 text-primary animate-bounce" />
          </div>
          <DialogTitle className="text-center text-2xl font-black">Install SeniorDevOps EV</DialogTitle>
          <DialogDescription className="text-center">
            You've completed 3+ charges! Install our app for a faster, more reliable experience.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="flex items-start gap-4 p-3 rounded-xl bg-muted/50">
            <div className="bg-primary/20 p-2 rounded-lg mt-1">
              <Zap className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="font-bold text-sm">Instant Access</p>
              <p className="text-xs text-muted-foreground">Launch directly from your home screen without typing URLs.</p>
            </div>
          </div>

          <div className="flex items-start gap-4 p-3 rounded-xl bg-muted/50">
            <div className="bg-primary/20 p-2 rounded-lg mt-1">
              <Map className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="font-bold text-sm">Offline Maps</p>
              <p className="text-xs text-muted-foreground">View your recent charging stations even when you lose signal.</p>
            </div>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={handleDismiss} className="w-full sm:w-auto">
            Maybe Later
          </Button>
          <Button onClick={handleInstall} className="w-full sm:w-auto gap-2 font-bold shadow-lg shadow-primary/20">
            <Download className="w-4 h-4" />
            Install App
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
