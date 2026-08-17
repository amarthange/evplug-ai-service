import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MapPin, Navigation, Battery, Zap, ChevronRight, Search, X, Loader2, Info } from "lucide-react";
import { calculateRoutePlan, type RoutePlan } from "@/lib/route-planner";
import type { Station } from "@shared/schema";

interface RoutePlannerProps {
  map: google.maps.Map | null;
  stations: Station[];
  userLocation: { lat: number; lon: number } | null;
  onPlanReady: (plan: RoutePlan) => void;
  onClear: () => void;
}

export function RoutePlanner({ map, stations, userLocation, onPlanReady, onClear }: RoutePlannerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [destination, setDestination] = useState("");
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [selectedDest, setSelectedDest] = useState<any | null>(null);
  const [routePlan, setRoutePlan] = useState<RoutePlan | null>(null);

  // Mock vehicle state (In real app, this comes from a hook/store)
  const [soc, setSoc] = useState(65); 
  const [fullRange, setFullRange] = useState(350); // km
  const currentRange = (fullRange * (soc / 100)) * 0.85; // 15% safety margin

  // Search autocomplete geocoding using Google Places AutocompleteSuggestion (New API)
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (destination.length < 3 || selectedDest) return;

      if (typeof google !== "undefined" && google.maps) {
        try {
          const { AutocompleteSuggestion } = await google.maps.importLibrary("places") as any;
          if (AutocompleteSuggestion) {
            const { suggestions } = await AutocompleteSuggestion.fetchAutocompleteSuggestions({
              input: destination,
            });
            
            if (suggestions && suggestions.length > 0) {
              const formattedSuggestions = await Promise.all(
                suggestions.slice(0, 5).map(async (suggestion: any) => {
                  let center = [78.9629, 20.5937]; // fallback India coordinates
                  const prediction = suggestion.placePrediction;
                  let placeId = "";
                  
                  try {
                    const place = prediction.toPlace();
                    placeId = place.id;
                    await place.fetchFields({ fields: ['location'] });
                    if (place.location) {
                      center = [place.location.lng(), place.location.lat()];
                    }
                  } catch (e) {
                    console.error("New Places API details fetch failed:", e);
                  }
                  
                  return {
                    id: placeId || Math.random().toString(),
                    text: prediction.mainText?.toString() || prediction.text?.toString() || "",
                    place_name: prediction.text?.toString() || "",
                    center,
                  };
                })
              );
              setSuggestions(formattedSuggestions);
              return; // Success, exit
            }
          }
        } catch (e) {
          console.warn("New Places API failed, falling back to legacy AutocompleteService:", e);
        }

        // Legacy Fallback
        try {
          if (google.maps.places) {
            const service = new google.maps.places.AutocompleteService();
            service.getPlacePredictions({ input: destination }, async (predictions, status) => {
              if (status === google.maps.places.PlacesServiceStatus.OK && predictions) {
                const geocoder = new google.maps.Geocoder();
                const formattedSuggestions = await Promise.all(
                  predictions.slice(0, 5).map(async (p) => {
                    let center = [78.9629, 20.5937];
                    try {
                      const geocodeResult = await geocoder.geocode({ placeId: p.place_id });
                      if (geocodeResult.results && geocodeResult.results.length > 0) {
                        const loc = geocodeResult.results[0].geometry.location;
                        center = [loc.lng(), loc.lat()];
                      }
                    } catch (e) {
                      console.error("Geocoding place suggestion failed:", e);
                    }
                    
                    return {
                      id: p.place_id,
                      text: p.structured_formatting.main_text,
                      place_name: p.description,
                      center,
                    };
                  })
                );
                setSuggestions(formattedSuggestions);
              }
            });
            return;
          }
        } catch (legacyErr) {
          console.error("Legacy AutocompleteService failed:", legacyErr);
        }
      }

      // Fallback Mock data
      const indianCities = [
        { id: "delhi", text: "Delhi", place_name: "Delhi, India", center: [77.2090, 28.6139] },
        { id: "mumbai", text: "Mumbai", place_name: "Mumbai, Maharashtra, India", center: [72.8777, 19.0760] },
        { id: "pune", text: "Pune", place_name: "Pune, Maharashtra, India", center: [73.8567, 18.5204] },
        { id: "bangalore", text: "Bangalore", place_name: "Bangalore, Karnataka, India", center: [77.5946, 12.9716] },
        { id: "chennai", text: "Chennai", place_name: "Chennai, Tamil Nadu, India", center: [80.2707, 13.0827] },
        { id: "kolkata", text: "Kolkata", place_name: "Kolkata, West Bengal, India", center: [88.3639, 22.5726] },
        { id: "hyderabad", text: "Hyderabad", place_name: "Hyderabad, Telangana, India", center: [78.4867, 17.3850] },
      ];
      const matched = indianCities.filter(c => c.text.toLowerCase().includes(destination.toLowerCase()));
      if (matched.length > 0) {
        setSuggestions(matched);
      } else {
        // Fallback hash geocoding
        let hash = 0;
        const q = destination.toLowerCase().trim();
        for (let i = 0; i < q.length; i++) {
          hash = q.charCodeAt(i) + ((hash << 5) - hash);
        }
        const lat = 20.5937 + (hash % 100) / 20;
        const lon = 78.9629 + ((hash >> 8) % 100) / 20;
        setSuggestions([{
          id: `hash-${hash}`,
          text: destination,
          place_name: `${destination}, India (Simulated)`,
          center: [lon, lat]
        }]);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [destination, selectedDest]);

  const handlePlanRoute = async (dest: any) => {
    if (!userLocation) return;
    setLoading(true);
    setSelectedDest(dest);
    setDestination(dest.place_name);
    setSuggestions([]);

    try {
      let routeGeometry: any;
      if (typeof google !== "undefined" && google.maps) {
        const directionsService = new google.maps.DirectionsService();
        const directionsResult = await directionsService.route({
          origin: new google.maps.LatLng(userLocation.lat, userLocation.lon),
          destination: new google.maps.LatLng(dest.center[1], dest.center[0]),
          travelMode: google.maps.TravelMode.DRIVING,
        });

        const routeData = directionsResult.routes[0];
        
        // Map Google LatLng to GeoJSON format [lon, lat]
        const coordinates = routeData.overview_path.map(latLng => [
          latLng.lng(),
          latLng.lat(),
        ]);

        routeGeometry = {
          type: "LineString",
          coordinates,
        };
      } else {
        const startLon = userLocation.lon;
        const startLat = userLocation.lat;
        const endLon = dest.center[0];
        const endLat = dest.center[1];
        
        const coords: [number, number][] = [];
        const steps = 15;
        for (let i = 0; i <= steps; i++) {
          const t = i / steps;
          const lon = startLon + (endLon - startLon) * t;
          const lat = startLat + (endLat - startLat) * t;
          if (i > 0 && i < steps) {
            const jitterLat = Math.sin(i * 1.5) * 0.05;
            const jitterLon = Math.cos(i * 1.5) * 0.05;
            coords.push([lon + jitterLon, lat + jitterLat]);
          } else {
            coords.push([lon, lat]);
          }
        }
        routeGeometry = {
          type: "LineString",
          coordinates: coords
        };
      }
      
      const plan = calculateRoutePlan(stations, routeGeometry, currentRange);
      
      setRoutePlan(plan);
      onPlanReady(plan);
    } catch (e) {
      console.error("Directions calculation error:", e);
    } finally {
      setLoading(false);
    }
  };

  const clearPlan = () => {
    setRoutePlan(null);
    setSelectedDest(null);
    setDestination("");
    onClear();
  };

  return (
    <div className="absolute top-4 left-4 z-50 w-[340px] pointer-events-none">
      {/* Search Bar / Header */}
      <motion.div 
        layout
        className="pointer-events-auto bg-white/90 backdrop-blur-xl border border-white/20 shadow-2xl rounded-2xl overflow-hidden"
      >
        <div className="p-3 flex items-center gap-3">
          <div className="bg-emerald-500 p-2 rounded-xl text-white">
            <Navigation className="w-5 h-5" />
          </div>
          <div className="flex-1 relative">
            <input
              type="text"
              placeholder={isOpen ? "Enter destination..." : "Smart Route Planner"}
              value={destination}
              onChange={(e) => {
                setDestination(e.target.value);
                setSelectedDest(null);
              }}
              onFocus={() => setIsOpen(true)}
              className="w-full bg-transparent border-none focus:ring-0 text-sm font-semibold placeholder:text-slate-400"
            />
            {destination && (
              <button onClick={clearPlan} className="absolute right-0 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          {loading && <Loader2 className="w-4 h-4 animate-spin text-emerald-500" />}
        </div>

        <AnimatePresence>
          {isOpen && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="border-t border-slate-100"
            >
              {/* Suggestions List */}
              {suggestions.length > 0 && !selectedDest && (
                <div className="py-1">
                  {suggestions.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => handlePlanRoute(s)}
                      className="w-full px-4 py-2.5 text-left text-sm hover:bg-slate-50 flex items-start gap-3 transition-colors"
                    >
                      <MapPin className="w-4 h-4 mt-0.5 text-slate-400" />
                      <div>
                        <p className="font-bold text-slate-800">{s.text}</p>
                        <p className="text-[10px] text-slate-400 truncate">{s.place_name}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* Stats Panel */}
              <div className="p-4 bg-slate-50/50 space-y-4">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 text-slate-500">
                    <Battery className="w-4 h-4" />
                    <span>Current Charge</span>
                  </div>
                  <span className="font-black text-slate-800">{soc}%</span>
                </div>
                <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${soc}%` }}
                    className="h-full bg-emerald-500"
                  />
                </div>
                <div className="flex justify-between items-end">
                  <div>
                    <p className="text-[10px] uppercase font-black tracking-widest text-slate-400">Est. Range</p>
                    <p className="text-xl font-black text-slate-800">{currentRange.toFixed(0)} <span className="text-xs font-normal text-slate-400">km</span></p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] uppercase font-black tracking-widest text-slate-400">Vehicle</p>
                    <p className="text-xs font-bold text-slate-600">Model 3 (Long Range)</p>
                  </div>
                </div>
              </div>

              {/* Results / Recommendation */}
              {routePlan && (
                <div className="p-4 border-t border-slate-100 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-black uppercase text-slate-400 tracking-widest">Optimal Stop</p>
                    <div className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                      <Zap className="w-3 h-3 fill-emerald-600" />
                      HIGH SCORE
                    </div>
                  </div>

                  {routePlan.optimalStation ? (
                    <div className="bg-white border border-slate-100 rounded-xl p-3 shadow-sm">
                      <div className="flex justify-between items-start mb-2">
                        <h4 className="font-bold text-sm text-slate-800">{routePlan.optimalStation.name}</h4>
                        <span className="text-[10px] font-black text-slate-400 italic">{routePlan.scoredStations[0].distanceToRoute.toFixed(1)}km off-route</span>
                      </div>
                      <div className="flex gap-2 mb-3">
                        {((routePlan.optimalStation.connectors as any) || []).slice(0, 2).map((c: any, i: number) => (
                          <span key={i} className="text-[9px] font-black px-2 py-1 bg-slate-100 rounded-md text-slate-600 uppercase">
                            {c.powerKw}kW · {c.type}
                          </span>
                        ))}
                      </div>
                      <button 
                        onClick={() => {
                          const lon = Number(routePlan.optimalStation?.lon);
                          const lat = Number(routePlan.optimalStation?.lat);
                          if (map) {
                            map.panTo({ lat, lng: lon });
                            map.setZoom(16);
                          }
                        }}
                        className="w-full py-2 bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest rounded-lg flex items-center justify-center gap-2 hover:bg-slate-800 transition-colors"
                      >
                        Add to Trip <ChevronRight className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <div className="p-4 text-center border-2 border-dashed border-slate-100 rounded-xl">
                      <Info className="w-5 h-5 mx-auto mb-2 text-slate-300" />
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter leading-tight">
                        No optimal stations found<br/>within 5km of route
                      </p>
                    </div>
                  )}

                  <div className="flex items-center gap-2 text-[10px] text-slate-400 font-bold">
                    <Navigation className="w-3 h-3" />
                    <span>Total Trip: {routePlan.totalDistanceKm.toFixed(1)} km</span>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
