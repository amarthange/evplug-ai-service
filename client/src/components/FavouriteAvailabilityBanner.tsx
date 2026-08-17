import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Star, X, Zap } from "lucide-react";

interface Station {
  id: string;
  name: string;
  availableConnectors: number;
}

interface FavouriteAvailabilityBannerProps {
  favouriteStations: Station[];
}

export function FavouriteAvailabilityBanner({ favouriteStations }: FavouriteAvailabilityBannerProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isDismissed, setIsDismissed] = useState(
    sessionStorage.getItem("fav_banner_dismissed") === "true"
  );

  const availableFavs = favouriteStations.filter(s => s.availableConnectors > 0);

  useEffect(() => {
    // Show banner only if there are available favorites and it hasn't been dismissed in this session
    if (availableFavs.length > 0 && !isDismissed) {
      setIsVisible(true);
    } else {
      setIsVisible(false);
    }
  }, [availableFavs.length, isDismissed]);

  const handleDismiss = () => {
    setIsVisible(false);
    setIsDismissed(true);
    sessionStorage.setItem("fav_banner_dismissed", "true");
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ height: 0, opacity: 0, marginTop: 0 }}
          animate={{ height: "auto", opacity: 1, marginTop: 8 }}
          exit={{ height: 0, opacity: 0, marginTop: 0 }}
          className="w-full overflow-hidden"
        >
          <div className="mx-4 mb-2 flex justify-center">
            <div className="w-full max-w-sm bg-emerald-500/90 backdrop-blur-xl animate-gradient rounded-3xl p-2.5 pl-3.5 shadow-2xl shadow-emerald-900/40 flex items-center justify-between border border-white/20">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
                  <Star className="w-3.5 h-3.5 text-yellow-300 fill-yellow-300 animate-pulse" />
                </div>
                <div>
                  <p className="text-white text-[12px] font-black uppercase tracking-tight leading-none">
                    {availableFavs.length === 1 
                      ? `"${availableFavs[0].name}" is live!`
                      : `${availableFavs.length} Favourites Ready`}
                  </p>
                  <div className="flex items-center gap-1 mt-0.5 opacity-80">
                    <Zap className="w-2 h-2 text-emerald-100 fill-emerald-100" />
                    <span className="text-[8px] text-emerald-50 font-bold uppercase tracking-widest">Available Now</span>
                  </div>
                </div>
              </div>
              
              <button 
                onClick={handleDismiss}
                className="p-1.5 hover:bg-white/10 rounded-full transition-colors flex-shrink-0 ml-4 group"
              >
                <X className="w-3.5 h-3.5 text-white/50 group-hover:text-white transition-colors" />
              </button>
            </div>
          </div>
          <style>{`
            @keyframes gradient {
              0% { background-position: 0% 50%; }
              50% { background-position: 100% 50%; }
              100% { background-position: 0% 50%; }
            }
            .animate-gradient {
              animation: gradient 3s ease infinite;
            }
          `}</style>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
