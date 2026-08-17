import { useState, useEffect, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Car, Zap } from "lucide-react";
import { db } from "@/lib/firebase";
import { doc, getDoc, getDocs, collection, query, where } from "firebase/firestore";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import type { Station } from "@shared/schema";

interface ConnectorFilterProps {
  map: google.maps.Map | null;
  stations: Station[];
  onFilterChange?: (type: string) => void;
  className?: string;
}

const CONNECTOR_TYPES = ["All", "CCS2", "Type 2", "CHAdeMO", "GB/T"];

export function ConnectorFilter({ map, stations, onFilterChange, className }: ConnectorFilterProps) {
  const { user } = useAuth();
  const [selectedType, setSelectedType] = useState<string>("All");
  const [userVehicleConnector, setUserVehicleConnector] = useState<string | null>(null);
  const [isMyVehicleActive, setIsMyVehicleActive] = useState(false);

  // Calculate counts per connector type
  const counts = useMemo(() => {
    const countsMap: Record<string, number> = { All: stations.length };
    stations.forEach((station) => {
      const types = (station.connectors || []).map((c: any) => c.type);
      CONNECTOR_TYPES.forEach(chipType => {
        if (chipType === "All") return;
        if (types.some(t => t.toLowerCase().includes(chipType.toLowerCase()) || chipType.toLowerCase().includes(t.toLowerCase()))) {
          countsMap[chipType] = (countsMap[chipType] || 0) + 1;
        }
      });
    });
    return countsMap;
  }, [stations]);

  // Fetch user's primary vehicle connector type
  useEffect(() => {
    if (!user?.uid) return;

    const fetchUserVehicle = async () => {
      try {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          const primaryId = userData.primaryVehicleId;
          
          if (primaryId) {
            const vehicleDoc = await getDoc(doc(db, "users", user.uid, "ev_vehicles", primaryId));
            if (vehicleDoc.exists()) {
              const vehicleData = vehicleDoc.data();
              setUserVehicleConnector(vehicleData.chargeType);
              
              // Load persisted selection or auto-select vehicle if it's the first time
              const persisted = localStorage.getItem("selectedConnectorFilter");
              if (persisted) {
                setSelectedType(persisted);
                if (persisted === vehicleData.chargeType) setIsMyVehicleActive(true);
              } else {
                setSelectedType(vehicleData.chargeType);
                setIsMyVehicleActive(true);
              }
            }
          }
        }
      } catch (error) {
        console.error("Error fetching user vehicle:", error);
      }
    };

    fetchUserVehicle();
  }, [user?.uid]);

  // Handle filter selection
  const handleSelect = (type: string) => {
    setSelectedType(type);
    setIsMyVehicleActive(type === userVehicleConnector);
    localStorage.setItem("selectedConnectorFilter", type);
    if (onFilterChange) onFilterChange(type);

    // Reactive updates are handled via onFilterChange on parent component
  };

  const toggleMyVehicle = () => {
    if (userVehicleConnector) {
      if (isMyVehicleActive) {
        handleSelect("All");
      } else {
        handleSelect(userVehicleConnector);
      }
    }
  };

  return (
    <div className={cn("flex items-center gap-1.5 overflow-x-auto pb-1.5 scrollbar-hide px-4", className)}>
      {userVehicleConnector && (
        <button
          onClick={toggleMyVehicle}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-black transition-all border shadow-md whitespace-nowrap",
            isMyVehicleActive
              ? "bg-[#00E676] text-black border-[#00E676] shadow-[0_0_12px_rgba(0,230,118,0.45)]"
              : "bg-[rgba(20,20,20,0.75)] backdrop-blur-xl border-[rgba(255,255,255,0.08)] text-white/70 hover:border-[#00E676]/40 hover:text-[#00E676]"
          )}
        >
          <Car className={cn("w-3.5 h-3.5", isMyVehicleActive && "animate-bounce")} />
          My Vehicle
        </button>
      )}

      <div className="flex gap-1.5">
        {CONNECTOR_TYPES.map((type) => (
          <button
            key={type}
            onClick={() => handleSelect(type)}
            className={cn(
              "px-3 py-1.5 whitespace-nowrap rounded-full text-[11px] font-black transition-all border shadow-sm flex items-center gap-1.5",
              selectedType === type
                ? "bg-[#00E676] text-black border-[#00E676] shadow-[0_0_12px_rgba(0,230,118,0.45)] scale-105"
                : "bg-[rgba(20,20,20,0.75)] backdrop-blur-xl border-[rgba(255,255,255,0.08)] text-white/70 hover:border-white/20 hover:text-white"
            )}
          >
            {type === "All" ? <Zap className="w-3 h-3" /> : null}
            {type}
            <span className={cn(
              "text-[9px] opacity-60 font-mono",
              selectedType === type ? "text-black/80" : "text-white/40"
            )}>
              ({counts[type] || 0})
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
