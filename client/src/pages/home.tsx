import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { MapComponent } from "@/components/map-component";
import { FavouriteAvailabilityBanner } from "@/components/FavouriteAvailabilityBanner";
import { type RoutePlan, calculateRoutePlan, haversineDistance } from "@/lib/route-planner";
import { StationCard } from "@/components/station-card";
import { FilterPanel } from "@/components/filter-panel";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Search, Filter, MapIcon, X, Megaphone, Navigation, Crosshair, ChevronUp, ChevronDown, List, Heart, ArrowUpDown, Bell, UserCircle, Mic, RotateCw, Info, Battery, ExternalLink } from "lucide-react";
import { StationListRow } from "@/components/StationListRow";
import type { Station } from "@shared/schema";
import { useLocation, Link } from "wouter";
import { collection, onSnapshot, query, doc, getDoc, getDocs, where, documentId } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { motion, AnimatePresence, useDragControls, useMotionValue, useTransform } from "framer-motion";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";
import { Zap, MapPin, BarChart3 } from "lucide-react";
import { BOOKING_STATUS } from "@/constants/bookingStatus";
import UserChatbot from "@/components/UserChatbot";
import { UserContext } from "@/utils/geminiChatbot";
import { ConnectorFilter } from "@/components/ConnectorFilter";
// PRICE COMPARISON — imports
import PriceComparisonDrawer from '@/components/PriceComparisonDrawer';
import { buildPriceSummaries, sortStations, type PriceSortMode } from '@/lib/price-sorter';

// WEEKLY REPORT — imports
import WeeklyReportCard from '@/components/WeeklyReportCard';
import { buildWeeklyReport, type WeeklyReport } from '@/lib/weekly-report-engine';
import { loadCachedSessions } from '@/lib/session-cache';

// ACTIVE SESSION WIDGET — import
import ActiveSessionWidget from '@/components/ActiveSessionWidget';

interface EnrichedStation extends Station {
  distance?: number;
  availableConnectors: number;
  totalConnectors: number;
  isOpen: boolean;
  connectors: any[]; // Using any for enriched connectors array for simplicity
}

export default function Home() {
  const [, setLocation] = useLocation();
  const { user, userRole, loading: authLoading } = useAuth();
  const [stations, setStations] = useState<Station[]>([]);
  const [selectedStation, setSelectedStation] = useState<Station | null>(null);
  const [userLocation, setUserLocation] = useState<{ lat: number; lon: number } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  
  // Filter States
  const [showFilters, setShowFilters] = useState(false);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [userFavorites, setUserFavorites] = useState<string[]>([]);
  const [filters, setFilters] = useState(() => {
    let initialConnectors: string[] = [];
    try {
      const saved = localStorage.getItem('evplugfinder_connector_filter') || localStorage.getItem('volthub_connector_filter');
      if (saved) initialConnectors = [saved];
    } catch {}
    
    return {
      connectors: initialConnectors,
      minPower: 0,
      maxPrice: 50,
      onlyOpen: false
    };
  });

  // FILTER PERSISTENCE — save to localStorage on change
  useEffect(() => {
    try {
      if (filters.connectors.length > 0) {
        localStorage.setItem('evplugfinder_connector_filter', filters.connectors[0]);
      } else {
        localStorage.removeItem('evplugfinder_connector_filter');
      }
    } catch {
      // silent — localStorage unavailable
    }
  }, [filters.connectors]);


  // Bottom Sheet State
  const [sheetState, setSheetState] = useState<"peek" | "half" | "full">("peek");
  const [activePlan, setActivePlan] = useState<RoutePlan | null>(null);
  const [routeDurationText, setRouteDurationText] = useState("");
  const mapRef = useRef<google.maps.Map | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const stopMarkerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);
  const polylineRef = useRef<google.maps.Polyline | null>(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  const [bookings, setBookings] = useState<any[]>([]);
  const [owners, setOwners] = useState<Record<string, any>>({});
  const [announcement, setAnnouncement] = useState<{message: string, active: boolean} | null>(null);
  const [showBanner, setShowBanner] = useState(true);
  const [proximityAlert, setProximityAlert] = useState<EnrichedStation | null>(null);
  
  // PRICE COMPARISON — state
  const [priceCompareOpen, setPriceCompareOpen] = useState(false);
  const [priceSortMode, setPriceSortMode] = useState<PriceSortMode>('price_asc');

  // WEEKLY REPORT — state
  const [weeklyReport, setWeeklyReport] = useState<WeeklyReport | null>(null);
  const [reportDismissed, setReportDismissed] = useState(false);
  const [weeklyReportEnabled, setWeeklyReportEnabled] = useState(false);

  const { toast } = useToast();
  const lastVibratedStation = useRef<string | null>(null);

  const [isRouteMode, setIsRouteMode] = useState(false);
  const [destinationQuery, setDestinationQuery] = useState("");
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [selectedDest, setSelectedDest] = useState<any | null>(null);
  const [loadingRoute, setLoadingRoute] = useState(false);
  const [soc, setSoc] = useState(65);
  const [fullRange, setFullRange] = useState(350); // km
  const currentRange = useMemo(() => (fullRange * (soc / 100)) * 0.85, [fullRange, soc]);
  const [showLegend, setShowLegend] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [nearbyPage, setNearbyPage] = useState(1);
  const [directionsInfo, setDirectionsInfo] = useState<{
    distance: string;
    duration: string;
    stationId: string;
  } | null>(null);

  const toggleRoutePlanner = () => {
    if (isRouteMode) {
      handleClearPlan();
      setIsRouteMode(false);
      setDestinationQuery("");
      setSelectedDest(null);
      setSuggestions([]);
    } else {
      setIsRouteMode(true);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    setTimeout(() => {
      setIsRefreshing(false);
      toast({
        title: "Stations Refreshed",
        description: "Displaying updated availability for all charging terminals.",
      });
    }, 1000);
  };

  const handlePlanRoute = async (dest: any) => {
    if (!userLocation) return;
    setLoadingRoute(true);
    setSelectedDest(dest);
    setDestinationQuery(dest.place_name);
    setSuggestions([]);

    console.log("Destination:", dest.place_name, dest.center);

    try {
      let routeGeometry: any;
      let usedFallback = false;

      const runFallback = () => {
        usedFallback = true;
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
        const distKm = haversineDistance(startLat, startLon, endLat, endLon);
        const avgSpeed = distKm < 50 ? 60 : 80;
        const totalDurationSec = (distKm / avgSpeed) * 3600;
        const hours = Math.floor(totalDurationSec / 3600);
        const minutes = Math.floor((totalDurationSec % 3600) / 60);
        setRouteDurationText(hours > 0 ? `${hours} hr ${minutes} min` : `${minutes} min`);
      };

      if (typeof google !== "undefined" && google.maps) {
        try {
          const directionsService = new google.maps.DirectionsService();
          const directionsResult = await directionsService.route({
            origin: new google.maps.LatLng(userLocation.lat, userLocation.lon),
            destination: new google.maps.LatLng(dest.center[1], dest.center[0]),
            travelMode: google.maps.TravelMode.DRIVING,
          });

          console.log("Directions Response:", directionsResult);

          const routeData = directionsResult.routes[0];
          
          let totalDistance = 0;
          let totalDurationSec = 0;
          routeData.legs.forEach(leg => {
            totalDistance += leg.distance?.value || 0;
            totalDurationSec += leg.duration?.value || 0;
          });
          console.log("Route Distance (meters):", totalDistance);
          
          const hours = Math.floor(totalDurationSec / 3600);
          const minutes = Math.floor((totalDurationSec % 3600) / 60);
          const durationText = hours > 0 ? `${hours} hr ${minutes} min` : `${minutes} min`;
          setRouteDurationText(durationText);

          const coordinates = routeData.overview_path.map(latLng => [
            latLng.lng(),
            latLng.lat(),
          ]);

          routeGeometry = {
            type: "LineString",
            coordinates,
          };
        } catch (apiError: any) {
          console.warn("Directions API failed, falling back to estimated route:", apiError);
          runFallback();
        }
      } else {
        runFallback();
      }
      
      console.log("Route Geometry Generated, length:", routeGeometry.coordinates.length);
      const plan = calculateRoutePlan(stations, routeGeometry, currentRange);
      console.log("Route Plan Result:", plan);
      console.log("Optimal Station Found:", plan.optimalStation ? plan.optimalStation.name : "None");
      console.log("Scored Stations Count:", plan.scoredStations.length);
      console.log("Stations checked for route matching:", stations.length);
      
      if (usedFallback) {
        toast({
          title: "Estimated Route Mode",
          description: "Using estimated route because live Directions API is unavailable.",
          duration: 5000,
        });
      }

      handlePlanReady(plan);
    } catch (e) {
      console.error("Directions calculation error:", e);
    } finally {
      setLoadingRoute(false);
    }
  };

  const calculateDirections = async (origin: { lat: number; lon: number } | null | undefined, station: any) => {
    const startLoc = origin || userLocation;
    const stationLat = station ? (station.lat ?? station.latitude ?? station.location?.lat) : undefined;
    const stationLon = station ? (station.lon ?? station.longitude ?? station.location?.lon) : undefined;

    // Validation: check that user location and station coordinates exist
    if (
      !startLoc || 
      startLoc.lat === undefined || 
      startLoc.lon === undefined || 
      stationLat === undefined || 
      stationLon === undefined ||
      isNaN(Number(stationLat)) ||
      isNaN(Number(stationLon))
    ) {
      toast({
        title: "Routing Error",
        description: "Location unavailable.",
        variant: "destructive",
      });
      return;
    }

    if (typeof google === "undefined" || !google.maps) {
      toast({
        title: "Maps API Loading",
        description: "Google Maps API is still loading. Please try again.",
        variant: "destructive",
      });
      return;
    }

    try {
      const directionsService = new google.maps.DirectionsService();
      
      const originLatLng = new google.maps.LatLng(startLoc.lat, startLoc.lon);
      const destinationLatLng = new google.maps.LatLng(Number(stationLat), Number(stationLon));

      directionsService.route(
        {
          origin: originLatLng,
          destination: destinationLatLng,
          travelMode: google.maps.TravelMode.DRIVING,
        },
        (directionsResult, status) => {
          // Debug Logging
          console.log("Origin:", startLoc);
          console.log("Destination:", { lat: Number(stationLat), lon: Number(stationLon) });
          console.log("Directions Status:", status);

          if (status === google.maps.DirectionsStatus.OK && directionsResult) {
            const routeData = directionsResult.routes[0];
            const leg = routeData.legs[0];

            if (mapRef.current) {
              const map = mapRef.current;
              if (polylineRef.current) {
                polylineRef.current.setMap(null);
                polylineRef.current = null;
              }

              const path = routeData.overview_path.map((latLng) => ({
                lat: latLng.lat(),
                lng: latLng.lng(),
              }));

              polylineRef.current = new google.maps.Polyline({
                path,
                geodesic: true,
                strokeColor: "#10b981",
                strokeOpacity: 0.8,
                strokeWeight: 5,
                map: map,
              });

              const bounds = new google.maps.LatLngBounds();
              bounds.extend(originLatLng);
              bounds.extend(destinationLatLng);
              map.fitBounds(bounds, { top: 100, bottom: 100, left: 100, right: 100 });
            }

            setDirectionsInfo({
              distance: leg.distance?.text || `${(leg.distance?.value || 0) / 1000} km`,
              duration: leg.duration?.text || `${Math.round((leg.duration?.value || 0) / 60)} mins`,
              stationId: station.id,
            });
          } else {
            console.error("Google Maps Directions Routing failed with status:", status);
            toast({
              title: "Routing Error",
              description: `Could not calculate driving directions: ${status}`,
              variant: "destructive",
            });
          }
        }
      );
    } catch (error) {
      console.error("Directions routing exception:", error);
      toast({
        title: "Routing Error",
        description: "An unexpected error occurred while routing.",
        variant: "destructive",
      });
    }
  };

  const handleGetDirections = (station: any) => {
    if (!navigator.geolocation) {
      toast({
        title: "Geolocation Unsupported",
        description: "Your browser does not support geolocation.",
        variant: "destructive",
      });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const origin = { lat: pos.coords.latitude, lon: pos.coords.longitude };
        setUserLocation({ lat: origin.lat, lon: origin.lon });
        calculateDirections(origin, station);
      },
      (error) => {
        console.error("Geolocation error:", error);
        toast({
          title: "Location Access Denied",
          description: "Enable location access to get directions.",
          variant: "destructive",
        });
      }
    );
  };

  useEffect(() => {
    setDirectionsInfo(null);
    if (polylineRef.current) {
      polylineRef.current.setMap(null);
      polylineRef.current = null;
    }
  }, [selectedStation?.id]);

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (!isRouteMode || destinationQuery.length < 3 || selectedDest) return;

      if (typeof google !== "undefined" && google.maps) {
        try {
          const { AutocompleteSuggestion } = await google.maps.importLibrary("places") as any;
          if (AutocompleteSuggestion) {
            const { suggestions } = await AutocompleteSuggestion.fetchAutocompleteSuggestions({
              input: destinationQuery,
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
              return;
            }
          }
        } catch (e) {
          console.warn("New Places API failed, falling back to legacy AutocompleteService:", e);
        }

        // Legacy Fallback
        try {
          if (google.maps.places) {
            const service = new google.maps.places.AutocompleteService();
            service.getPlacePredictions({ input: destinationQuery }, async (predictions, status) => {
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

      // Local mock fallback for testing / offline
      const indianCities = [
        { id: "delhi", text: "Delhi", place_name: "Delhi, India", center: [77.2090, 28.6139] },
        { id: "mumbai", text: "Mumbai", place_name: "Mumbai, Maharashtra, India", center: [72.8777, 19.0760] },
        { id: "pune", text: "Pune", place_name: "Pune, Maharashtra, India", center: [73.8567, 18.5204] },
        { id: "bangalore", text: "Bangalore", place_name: "Bangalore, Karnataka, India", center: [77.5946, 12.9716] },
        { id: "chennai", text: "Chennai", place_name: "Chennai, Tamil Nadu, India", center: [80.2707, 13.0827] },
        { id: "kolkata", text: "Kolkata", place_name: "Kolkata, West Bengal, India", center: [88.3639, 22.5726] },
        { id: "hyderabad", text: "Hyderabad", place_name: "Hyderabad, Telangana, India", center: [78.4867, 17.3850] },
      ];
      const matched = indianCities.filter(c => c.text.toLowerCase().includes(destinationQuery.toLowerCase()));
      if (matched.length > 0) {
        setSuggestions(matched);
      } else {
        let hash = 0;
        const q = destinationQuery.toLowerCase().trim();
        for (let i = 0; i < q.length; i++) {
          hash = q.charCodeAt(i) + ((hash << 5) - hash);
        }
        const lat = 20.5937 + (hash % 100) / 20;
        const lon = 78.9629 + ((hash >> 8) % 100) / 20;
        setSuggestions([{
          id: `hash-${hash}`,
          text: destinationQuery,
          place_name: `${destinationQuery}, India (Simulated)`,
          center: [lon, lat]
        }]);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [destinationQuery, selectedDest, isRouteMode]);

  // ──────────────────────────────────────────────────────────────
  // NEW USER ONBOARDING GUARD
  // Redirect ev_users who have not yet completed their profile
  // ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (authLoading) return;                        // wait for auth
    if (!user) return;                              // not logged in – no redirect needed here
    if (userRole && userRole !== "ev_user") return; // owners / admins skip onboarding

    const checkOnboarding = async () => {
      try {
        const userSnap = await getDoc(doc(db, "users", user.uid));
        if (userSnap.exists()) {
          const data = userSnap.data();
          if (!data.hasCompletedProfile) {
            setLocation("/complete-profile");
          }
        } else {
          // Document doesn't exist yet → new signup, send to onboarding
          setLocation("/complete-profile");
        }
      } catch (err) {
        console.error("[Home] Error checking onboarding status:", err);
      }
    };

    checkOnboarding();
  }, [user, userRole, authLoading]);

  // Voice search voice input handling
  const startVoiceSearch = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast({
        title: "Voice Search Unsupported",
        description: "Your browser does not support Speech Recognition.",
        variant: "destructive",
      });
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = 'en-US';
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      toast({
        title: "Listening...",
        description: "Speak your destination or station name.",
      });

      recognition.onresult = (event: any) => {
        const speechToText = event.results[0][0].transcript;
        if (isRouteMode) {
          setDestinationQuery(speechToText);
        } else {
          setSearchQuery(speechToText);
        }
        toast({
          title: "Voice Input Received",
          description: `Searching for: "${speechToText}"`,
        });
      };

      recognition.onerror = (event: any) => {
        console.error("Speech recognition error:", event.error);
        toast({
          title: "Voice Search Error",
          description: event.error === 'not-allowed' ? "Microphone permission denied." : "Could not process speech.",
          variant: "destructive",
        });
      };

      recognition.start();
    } catch (err) {
      console.error("Speech recognition initialization error:", err);
      toast({
        title: "Voice Search Error",
        description: "Failed to initialize speech recognition.",
        variant: "destructive",
      });
    }
  };

  // Fetch unread notifications count
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, "notifications"),
      where("userId", "==", user.uid),
      where("read", "==", false)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setUnreadCount(snapshot.size);
    }, (err) => console.error("Error fetching notifications:", err));

    return () => {
      try {
        if (typeof unsubscribe === "function") {
          unsubscribe();
        }
      } catch (err) {
        console.warn("⚠️ Safe notifications unsubscribe failed:", err);
      }
    };
  }, [user]);
  const [userContext, setUserContext] = useState<UserContext>({
    role: (userRole as any) || "ev_user",
    uid: user?.uid || "",
    fullName: user?.displayName || "",
    upcomingBookings: [],
    chargingStats: { totalSessions: 0, kwhCharged: 0, co2Saved: 0 }
  });

  const selectedStationDetails = useMemo(() => {
    if (!selectedStation) return null;
    const connectors = selectedStation.connectors || [];
    const minPrice = connectors.length > 0 
      ? Math.min(...connectors.map((c: any) => c.pricePerKwh || 12)) 
      : 12;
    const maxPower = connectors.length > 0
      ? Math.max(...connectors.map((c: any) => c.powerKw || 22))
      : 22;
    
    const batteryCapacity = userContext?.primaryCar?.batteryCapacity || 60;
    const chargeKwhNeeded = batteryCapacity * 0.5;
    const estSessionCost = minPrice * chargeKwhNeeded;

    return {
      minPrice,
      maxPower,
      estSessionCost,
      operatingHours: selectedStation.operatingHours || "24/7 (Always Open)",
    };
  }, [selectedStation, userContext]);

  const renderStationPreviewCard = (station: any, isForMobile: boolean = false) => {
    if (!station) return null;
    const details = selectedStationDetails;
    const minPrice = details?.minPrice ?? 12;
    const maxPower = details?.maxPower ?? 22;
    const estSessionCost = details?.estSessionCost ?? 480;
    const operatingHours = details?.operatingHours ?? "24/7 (Always Open)";
    const etaMinutes = station.distance ? Math.max(1, Math.round(station.distance * 1.5)) : null;

    // Fallback Image Priority Sequence
    const stationImage = (station.images && station.images[0]) || station.coverImage || station.imageUrl || "https://images.unsplash.com/photo-1593941707882-a5bba14938c7?auto=format&fit=crop&w=600&q=80";

    // Driving Directions overrides if calculated
    const isRoutingThisStation = directionsInfo && directionsInfo.stationId === station.id;
    const displayDistance = isRoutingThisStation ? directionsInfo.distance : (station.distance ? `${station.distance.toFixed(1)} km` : "N/A");
    const displayEta = isRoutingThisStation ? directionsInfo.duration : (etaMinutes ? `${etaMinutes} mins` : "N/A");

    return (
      <div className={cn(
        "p-5 flex flex-col gap-4 text-white",
        isForMobile ? "bg-transparent" : "bg-[rgba(20,20,20,0.75)] backdrop-blur-xl border border-[rgba(255,255,255,0.08)] shadow-[0_8px_32px_rgba(0,0,0,0.35)] rounded-[24px]"
      )}>
        {/* Station Image Card Header */}
        <div className="relative w-full h-36 rounded-2xl overflow-hidden shrink-0">
          <img 
            src={stationImage} 
            alt={station.name} 
            className="w-full h-full object-cover transition-transform duration-500 hover:scale-105" 
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent" />
          
          {/* Top Close Button (for desktop popup) */}
          {!isForMobile && (
            <button 
              onClick={() => setSelectedStation(null)}
              className="absolute top-3 right-3 p-1.5 bg-black/60 backdrop-blur-md hover:bg-black/80 rounded-full transition-colors text-white/70 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          
          {/* Bottom overlays: Connector Badges or Status */}
          <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between">
            <span className="text-[10px] font-black uppercase text-black bg-[#00E676] shadow-[0_0_12px_rgba(0,230,118,0.4)] px-2.5 py-0.5 rounded-full">
              {station.availableConnectors} / {station.totalConnectors || station.connectors?.length || 0} Available
            </span>
            {station.rating && (
              <div className="bg-black/60 backdrop-blur-md px-2 py-0.5 rounded-lg flex items-center gap-1 text-yellow-400 text-[10px] font-black">
                ★ {station.rating.toFixed(1)}
              </div>
            )}
          </div>
        </div>

        {/* Station Name & Details */}
        <div className="px-1 space-y-1">
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] font-black uppercase text-[#00E676] tracking-widest leading-none bg-[#00E676]/10 border border-[#00E676]/20 px-2 py-0.5 rounded-full inline-block">
              Selected Charger
            </span>
          </div>
          <h3 className="text-base font-black text-white leading-tight mt-1">{station.name}</h3>
          <p className="text-xs text-white/50 truncate flex items-center gap-1">
            <MapPin className="w-3.5 h-3.5 text-[#00E676] shrink-0" />
            {station.address}
          </p>
          {operatingHours && (
            <p className="text-[10px] text-white/40">
              Hours: {operatingHours}
            </p>
          )}
        </div>

        {/* Connector Badge Types */}
        {station.connectors && station.connectors.length > 0 && (
          <div className="flex flex-wrap gap-1 px-1">
            {Array.from(new Set(station.connectors.map((c: any) => c.type))).map((type: any) => (
              <span key={type} className="text-[9px] font-bold bg-white/5 border border-white/10 px-2 py-0.5 rounded text-white/70">
                {type}
              </span>
            ))}
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="bg-white/5 border border-white/5 rounded-xl p-2 flex flex-col justify-center items-center text-center">
            <span className="text-[8px] uppercase font-black tracking-widest text-white/40 leading-none">Distance</span>
            <span className="text-xs font-black mt-1 text-white">
              {displayDistance}
            </span>
          </div>

          <div className="bg-white/5 border border-white/5 rounded-xl p-2 flex flex-col justify-center items-center text-center">
            <span className="text-[8px] uppercase font-black tracking-widest text-white/40 leading-none">ETA</span>
            <span className="text-xs font-black mt-1 text-[#00E676]">
              {displayEta}
            </span>
          </div>

          <div className="bg-white/5 border border-white/5 rounded-xl p-2 flex flex-col justify-center items-center text-center">
            <span className="text-[8px] uppercase font-black tracking-widest text-white/40 leading-none">Price/kWh</span>
            <span className="text-xs font-black mt-1 text-white">
              ₹{minPrice}
            </span>
          </div>
        </div>

        {/* Estimated Session Cost */}
        <div className="bg-[#00E676]/10 border border-[#00E676]/20 rounded-xl p-3 flex justify-between items-center text-xs">
          <div>
            <p className="text-[8px] uppercase font-black tracking-widest text-white/40 leading-none">Est. Session Cost</p>
            <p className="text-[10px] text-white/70 mt-1">Based on 50% charge</p>
          </div>
          <span className="text-sm font-black text-[#00E676]">
            ~₹{estSessionCost.toFixed(0)}
          </span>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col gap-2 mt-1">
          <div className="flex gap-2">
            <button
              onClick={() => {
                if (mapRef.current) {
                  mapRef.current.panTo({ lat: Number(station.lat), lng: Number(station.lon) });
                  mapRef.current.setZoom(16);
                }
                handleGetDirections(station);
              }}
              className="flex-1 py-2.5 bg-white/10 hover:bg-white/15 text-white border border-white/10 text-[10px] font-black uppercase tracking-widest rounded-xl flex items-center justify-center gap-1.5 transition-all active:scale-95"
            >
              <Navigation className="w-3.5 h-3.5 text-[#00E676]" />
              Get Directions
            </button>

            <button
              onClick={() => {
                window.open(`https://www.google.com/maps/search/?api=1&query=${station.lat},${station.lon}`, '_blank');
              }}
              className="flex-1 py-2.5 bg-white/10 hover:bg-white/15 text-white border border-white/10 text-[10px] font-black uppercase tracking-widest rounded-xl flex items-center justify-center gap-1.5 transition-all active:scale-95"
            >
              <ExternalLink className="w-3.5 h-3.5 text-[#00E676]" />
              Open Maps
            </button>
          </div>

          <button
            onClick={() => setLocation(`/station/${station.id}`)}
            className="w-full py-2.5 bg-[#00E676] hover:bg-[#00c868] text-black text-[10px] font-black uppercase tracking-widest rounded-xl flex items-center justify-center gap-1.5 transition-all active:scale-95 shadow-[0_4px_12px_rgba(0,230,118,0.25)]"
          >
            <Zap className="w-3.5 h-3.5 fill-black" />
            Reserve Slot
          </button>
        </div>
      </div>
    );
  };

  // Resize listener
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Real-time listeners (Stations, Bookings, Announcement)
  useEffect(() => {
    const q = query(collection(db, "stations"));
    const unsubscribeSt = onSnapshot(q, (snapshot) => {
      setStations(snapshot.docs.map(doc => {
        const data = doc.data();
        const connectors = (data.connectors || []).map((c: any, index: number) => ({
          ...c,
          id: c.id || `conn-${index}-${c.type || 'unknown'}`
        }));
        return {
          id: doc.id,
          ...data,
          status: data.status || "active",
          connectors
        } as Station;
      }));
    }, (err) => console.error("Error fetching stations:", err));

    const qBookings = query(
      collection(db, "bookings"),
      where("status", "in", [BOOKING_STATUS.CONFIRMED, BOOKING_STATUS.ACTIVE, BOOKING_STATUS.PENDING])
    );
    const unsubscribeBk = onSnapshot(qBookings, (snapshot) => {
      setBookings(snapshot.docs.map(d => d.data()));
    }, (err) => console.error("Error fetching bookings:", err));

    const isDismissed = sessionStorage.getItem('bannerDismissed') === 'true';
    const unsubscribeAn = onSnapshot(doc(db, "settings", "global"), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data.announcementActive) {
          setAnnouncement({ message: data.announcementMessage || "", active: !isDismissed });
          setShowBanner(!isDismissed);
        } else {
          setAnnouncement(null);
          setShowBanner(false);
        }
      }
    }, (err) => console.error("Error fetching announcement:", err));

    return () => {
      unsubscribeSt();
      unsubscribeBk();
      unsubscribeAn();
    };
  }, []);

  // Fetch owners
  useEffect(() => {
    if (stations.length === 0) return;
    const fetchOwners = async () => {
      try {
        const ids = Array.from(new Set(stations.map(s => s.ownerId).filter(Boolean)));
        if (ids.length === 0) return;
        const ownersMap: Record<string, any> = {};
        const chunks = [];
        for (let i = 0; i < ids.length; i += 10) chunks.push(ids.slice(i, i + 10));
        await Promise.all(chunks.map(async (chunk) => {
          const q = query(collection(db, "owners"), where(documentId(), "in", chunk));
          const snap = await getDocs(q);
          snap.forEach(d => { ownersMap[d.id] = d.data(); });
        }));
        setOwners(ownersMap);
      } catch (err) {
        console.error("Error fetching owners:", err);
      }
    };
    fetchOwners();
  }, [stations]);

  // Geolocation
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setUserLocation({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
        () => setUserLocation({ lat: 18.5204, lon: 73.8567 }) // Default Pune
      );
    }
  }, []);

  // Monitor User Settings for Weekly Report
  useEffect(() => {
    if (!user?.uid) return;
    const unsub = onSnapshot(doc(db, "users", user.uid), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setUserFavorites(data.favouriteStationIds || data.favoriteStations || []);
        
        // Check preference: either it's Monday OR the preference is explicitly true
        const isMonday = new Date().getDay() === 1;
        const preference = data.settings?.notifications?.weeklyReport ?? false;
        setWeeklyReportEnabled(isMonday || preference);
      }
    }, (err) => console.error("Error fetching user settings:", err));
    return () => unsub();
  }, [user?.uid]);

  // WEEKLY REPORT — load from IDB and compute
  useEffect(() => {
    if (!weeklyReportEnabled) return;
    
    const loadReport = async () => {
      const sessions = await loadCachedSessions();
      const report = buildWeeklyReport(sessions);
      if (report.hasData) {
        setWeeklyReport(report);
      }
    };
    
    loadReport();
  }, [weeklyReportEnabled]);

  // Fetch User Context for Chatbot
  useEffect(() => {
    if (!user?.uid) return;

    const fetchUserContext = async () => {
      try {
        // 1. Fetch Primary Car
        const carQ = query(collection(db, "users", user.uid, "ev_vehicles"), where("isPrimary", "==", true));
        const carSnap = await getDocs(carQ);
        let primaryCar = undefined;
        if (!carSnap.empty) {
          const carData = carSnap.docs[0].data();
          primaryCar = {
            brand: carData.brand,
            model: carData.model,
            batteryCapacity: carData.batteryCapacity,
            chargeType: carData.chargeType
          };
        }

        // 2. Fetch Personal Bookings & Stats
        const bookingQ = query(collection(db, "bookings"), where("userId", "==", user.uid));
        const bookingSnap = await getDocs(bookingQ);
        const userBookings = bookingSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        
        const now = Date.now();
        const upcoming = userBookings.filter((b: any) => 
          b.startTime > now && (b.status === BOOKING_STATUS.CONFIRMED || b.status === BOOKING_STATUS.PENDING)
        );

        const completed = userBookings.filter((b: any) => b.status === BOOKING_STATUS.COMPLETED);
        const totalKwh = completed.reduce((acc: number, b: any) => acc + (Number(b.energyDeliveredKwh) || 0), 0);
        const totalCo2 = (totalKwh * 0.4).toFixed(1); // 0.4kg per kWh saved vs ICE

        setUserContext({
          role: (userRole as any) || "ev_user",
          uid: user.uid,
          fullName: user.displayName || user.email?.split('@')[0] || "User",
          upcomingBookings: upcoming,
          chargingStats: {
            totalSessions: completed.length,
            kwhCharged: totalKwh,
            co2Saved: Number(totalCo2)
          },
          primaryCar,
          currentLocation: userLocation || undefined
        });
      } catch (err) {
        console.error("Error fetching user context:", err);
      }
    };

    fetchUserContext();
  }, [user?.uid, userLocation]);

  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
  };

  const filteredStations = stations
    .map(station => {
      const now = Date.now();
      let totalAvailable = 0;
      let totalCount = 0;
      const enrichedConnectors = (station.connectors || [])
        .filter((conn: any) => conn.enabled !== false)
        .map(conn => {
          const activeCount = bookings.filter(b => b.stationId === station.id && b.connectorId === conn.id).length;
          const count = Number(conn.count) || 1;
          totalCount += count;
          const remaining = Math.max(0, count - activeCount);
          totalAvailable += remaining;
          return { ...conn, available: remaining > 0, count };
        });

      const owner = owners[station.ownerId];
      const isOpen = owner?.vacationMode?.enabled ? false : true; // Simplified for now

      return {
        ...station,
        connectors: enrichedConnectors,
        availableConnectors: totalAvailable,
        totalConnectors: totalCount,
        isOpen,
        distance: userLocation ? calculateDistance(
          userLocation.lat, 
          userLocation.lon, 
          Number(station.lat || (station as any).location?.lat), 
          Number(station.lon || (station as any).location?.lon)
        ) : undefined,
      };
    })
    .filter(s => {
      // 1. Text Search (Name/Address)
      const matchesSearch = !searchQuery || 
        (s.name || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
        (s.address || "").toLowerCase().includes(searchQuery.toLowerCase());
      
      // 2. Status Filter (Simplified to always active for discoverability)
      const matchesStatus = true; // Status is now handled by advanced "Only Open" and hardcoded "active" filter below
      
      if (!matchesSearch || !matchesStatus) return false;

      // 3. Advanced Filters
      // 3.1 Availability (Only Open)
      if (filters.onlyOpen && !s.isOpen) return false;

      // 3.2 Connector Type
      if (filters.connectors.length > 0) {
        const hasConnector = s.connectors?.some(c => 
          filters.connectors.some(f => 
            c.type.toLowerCase().includes(f.toLowerCase()) ||
            f.toLowerCase().includes(c.type.toLowerCase())
          )
        );
        if (!hasConnector) return false;
      }

      // 3.3 Min Power
      if (filters.minPower > 0) {
        const hasPower = s.connectors?.some(c => (c.powerKw || 0) >= filters.minPower);
        if (!hasPower) return false;
      }

      // 3.4 Max Price
      if (filters.maxPrice < 50) {
        const hasPrice = s.connectors?.some(c => (c.pricePerKwh || 0) <= filters.maxPrice);
        if (!hasPrice) return false;
      }

      if (favoritesOnly && !userFavorites.includes(s.id)) return false;
      return true;
    });

  const bookableStations = filteredStations.filter(s => {
    const rawStatus = ((s as any).status || "pending").toLowerCase();
    return rawStatus === 'active';
  }).sort((a, b) => (a.distance || 0) - (b.distance || 0));

  // --- NEARBY STATIONS: strict radius filtering ---
  const NEARBY_RADIUS_KM = 25;
  const MAX_RADIUS_KM = 50;
  const PAGE_SIZE = 20;

  const nearbyStations = bookableStations.filter(s => {
    // Reject stations with invalid/missing coordinates
    const lat = Number(s.lat || (s as any).location?.lat);
    const lon = Number(s.lon || (s as any).location?.lon);
    if (!lat || !lon || isNaN(lat) || isNaN(lon)) {
      console.warn(`[NearbyFilter] Skipping station "${s.name}" — invalid coordinates (lat=${lat}, lon=${lon})`);
      return false;
    }
    // If user location unknown, show all active stations
    if (!userLocation) return true;
    // Reject anything beyond MAX_RADIUS_KM
    const dist = s.distance ?? 0;
    if (dist > MAX_RADIUS_KM) {
      console.warn(`[NearbyFilter] Excluding "${s.name}" — ${dist.toFixed(1)} km exceeds ${MAX_RADIUS_KM} km radius`);
      return false;
    }
    return true;
  }); // already sorted ASC by bookableStations

  const hasMoreNearby = nearbyStations.length > nearbyPage * PAGE_SIZE;
  const pagedNearbyStations = nearbyStations.slice(0, nearbyPage * PAGE_SIZE);

  // PRICE COMPARISON — build from already-loaded stations
  const priceSummaries = useMemo(() =>
    buildPriceSummaries(
      stations ?? [],
      userLocation?.lat ?? null,
      userLocation?.lon ?? null
    ),
  [stations, userLocation]);

  const sortedStations = useMemo(() =>
    sortStations(priceSummaries, priceSortMode),
  [priceSummaries, priceSortMode]);

  // Scroll to selected station in list
  useEffect(() => {
    if (selectedStation) {
      // Small timeout to ensure the list/sheet is rendered
      setTimeout(() => {
        const el = document.getElementById(`station-card-${selectedStation.id}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }, 100);
    }
  }, [selectedStation?.id]);

  // Proximity Alert Logic
  useEffect(() => {
    if (!userLocation || filteredStations.length === 0) return;
    
    const nearest = filteredStations[0];
    if (nearest.distance && nearest.distance < 0.5) { // 500 meters
      if (proximityAlert?.id !== nearest.id) {
        setProximityAlert(nearest);
        
        // Haptic Feedback for premium feel
        if (nearest.id !== lastVibratedStation.current) {
          if ('vibrate' in navigator) navigator.vibrate([100, 50, 100]);
          lastVibratedStation.current = nearest.id;
        }
      }
    } else {
      setProximityAlert(null);
    }
  }, [userLocation, filteredStations, proximityAlert]);

  const handlePlanReady = (plan: RoutePlan) => {
    if (!mapRef.current) return;
    const map = mapRef.current;
    setActivePlan(plan);

    // Remove existing polyline if any
    if (polylineRef.current) {
      polylineRef.current.setMap(null);
      polylineRef.current = null;
    }

    // Clear existing marker
    if (stopMarkerRef.current) {
      stopMarkerRef.current.map = null;
      stopMarkerRef.current = null;
    }

    // Draw new route polyline
    const path = plan.routePoints.map((coord: [number, number]) => ({
      lat: coord[1],
      lng: coord[0],
    }));

    polylineRef.current = new google.maps.Polyline({
      path,
      geodesic: true,
      strokeColor: "#10b981",
      strokeOpacity: 0.8,
      strokeWeight: 5,
      map: map,
    });

    // Add Optimal Stop Marker if exists
    if (plan.optimalStation) {
      const el = document.createElement("div");
      el.className = "optimal-stop-marker";
      el.innerHTML = `
        <div class="marker-pulse"></div>
        <div class="marker-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill="currentColor"/>
          </svg>
        </div>
      `;

      stopMarkerRef.current = new google.maps.marker.AdvancedMarkerElement({
        map: map,
        position: { lat: Number(plan.optimalStation.lat), lng: Number(plan.optimalStation.lon) },
        content: el,
        title: "Optimal Charging Stop",
      });
    }

    // Fit bounds to show route
    const bounds = new google.maps.LatLngBounds();
    plan.routePoints.forEach((p) => bounds.extend({ lat: p[1], lng: p[0] }));
    map.fitBounds(bounds, { top: 100, bottom: 100, left: 100, right: 100 });
  };

  const handleClearPlan = () => {
    setActivePlan(null);
    setDirectionsInfo(null);

    if (polylineRef.current) {
      polylineRef.current.setMap(null);
      polylineRef.current = null;
    }

    if (stopMarkerRef.current) {
      stopMarkerRef.current.map = null;
      stopMarkerRef.current = null;
    }
  };

  return (
    <div className="h-full w-full relative flex flex-col md:flex-row overflow-hidden bg-background">
      {/* Glassmorphic Header (Universal) */}
      <div className="absolute top-0 left-0 right-0 z-30 pointer-events-none p-4 md:p-6 md:left-[400px]">
        <div className="max-w-xl mx-auto space-y-2.5 pointer-events-auto">
          {/* Main Top Bar */}
          <div className="flex items-center gap-2">
            {/* Unified Glassmorphic Search Bar */}
            <div className="flex-1 flex items-center gap-2 bg-[rgba(20,20,20,0.75)] backdrop-blur-xl rounded-[20px] shadow-[0_8px_32px_rgba(0,0,0,0.35)] border border-[rgba(255,255,255,0.08)] px-3 h-[52px] focus-within:ring-1 focus-within:ring-[#00E676]/50 transition-all">
              {/* Brand Logo & Name */}
              <div className="flex items-center gap-1.5 px-2 shrink-0 border-r border-white/10 mr-1">
                <Zap className="w-4 h-4 text-[#00E676] fill-[#00E676]" />
                <span className="font-black text-xs text-white tracking-tight hidden sm:block">EVPlugFinder</span>
              </div>

              {/* Search Icon */}
              <Search className="w-3.5 h-3.5 text-white/40 shrink-0 ml-1" />

              {/* Input Field */}
              <input 
                type="text"
                placeholder={isRouteMode ? "Route destination..." : "Find a fast charger..."}
                className="flex-1 bg-transparent border-none outline-none focus:ring-0 text-xs font-semibold px-1 py-1 text-white placeholder-white/30"
                value={isRouteMode ? destinationQuery : searchQuery}
                onChange={(e) => isRouteMode ? setDestinationQuery(e.target.value) : setSearchQuery(e.target.value)}
              />

              {/* Clear button */}
              {(isRouteMode ? destinationQuery : searchQuery) && (
                <button 
                  onClick={() => isRouteMode ? setDestinationQuery("") : setSearchQuery("")}
                  className="p-1 hover:bg-white/10 rounded-full transition-colors text-white/50"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}

              {/* Voice Search Button */}
              <button 
                onClick={startVoiceSearch}
                className="p-1.5 hover:bg-white/10 rounded-full transition-colors text-white/40 hover:text-white"
              >
                <Mic className="w-4 h-4" />
              </button>

              {/* Filter Button */}
              <button 
                onClick={() => setShowFilters(!showFilters)}
                className={cn(
                  "p-1.5 rounded-lg flex items-center justify-center transition-all",
                  showFilters 
                    ? "bg-[#00E676] text-black" 
                    : "bg-white/5 text-white hover:bg-white/10"
                )}
              >
                <Filter className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Profile & Notifications */}
            <div className="flex items-center gap-1.5 shrink-0 md:hidden">
              <button 
                onClick={() => setLocation('/notifications')}
                className="relative p-2.5 rounded-[14px] bg-[rgba(20,20,20,0.75)] backdrop-blur-xl border border-[rgba(255,255,255,0.08)] text-white hover:bg-white/5 transition-colors shadow-lg"
              >
                <Bell className="w-4 h-4 text-white/80" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[16px] h-4 bg-[#00E676] text-black text-[9px] font-black px-1 rounded-full flex items-center justify-center border border-[#0a0a0a]">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </button>
              <button onClick={() => setLocation('/user-profile')} className="p-0.5 rounded-full bg-[rgba(20,20,20,0.75)] backdrop-blur-xl border border-[rgba(255,255,255,0.08)] hover:bg-white/5 transition-colors shadow-lg">
                {user?.photoURL ? (
                  <img src={user.photoURL} alt="Profile" className="w-8 h-8 rounded-full" />
                ) : (
                  <UserCircle className="w-8 h-8 text-white/70" />
                )}
              </button>
            </div>
          </div>

          {/* Autocomplete Suggestions */}
          {isRouteMode && suggestions.length > 0 && !selectedDest && (
            <div className="bg-[rgba(20,20,20,0.95)] backdrop-blur-2xl border border-[rgba(255,255,255,0.08)] rounded-[20px] shadow-2xl overflow-hidden pointer-events-auto">
              <div className="py-1">
                {suggestions.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => handlePlanRoute(s)}
                    className="w-full px-4 py-3 text-left text-xs hover:bg-white/5 flex items-start gap-3 transition-colors text-white"
                  >
                    <MapPin className="w-4 h-4 mt-0.5 text-white/40" />
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-white truncate">{s.text}</p>
                      <p className="text-[10px] text-white/40 truncate">{s.place_name}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Battery Status Widget */}
          {isRouteMode && (
            <div className="bg-[rgba(20,20,20,0.75)] backdrop-blur-xl border border-[rgba(255,255,255,0.08)] shadow-[0_8px_32px_rgba(0,0,0,0.35)] rounded-[20px] p-3 flex items-center justify-between gap-4 pointer-events-auto h-[56px] text-white">
              {/* Battery Icon & SOC bar */}
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <Battery className="w-4 h-4 shrink-0 text-[#00E676]" />
                <span className="text-xs font-black shrink-0">{soc}%</span>
                <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden min-w-[60px]">
                  <div className="h-full bg-[#00E676] rounded-full" style={{ width: `${soc}%` }} />
                </div>
              </div>
              
              {/* Est Range */}
              <div className="flex flex-col justify-center shrink-0 border-l border-white/10 pl-3">
                <span className="text-[8px] uppercase font-black tracking-widest text-white/40 leading-none">Est. Range</span>
                <span className="text-sm font-black text-white leading-tight mt-0.5">{currentRange.toFixed(0)} <span className="text-[10px] font-normal text-white/50">km</span></span>
              </div>

              {/* Vehicle Name */}
              <div className="flex flex-col justify-center shrink-0 border-l border-white/10 pl-3 min-w-[100px] text-right">
                <span className="text-[8px] uppercase font-black tracking-widest text-white/40 leading-none">Vehicle</span>
                <span className="text-xs font-bold text-white/80 truncate leading-tight mt-0.5 text-right">Model 3 (Long Range)</span>
              </div>
            </div>
          )}

          {/* Route Summary & Optimal Stop info */}
          {isRouteMode && activePlan && (
            <div className="bg-[rgba(20,20,20,0.75)] backdrop-blur-xl border border-[rgba(255,255,255,0.08)] shadow-[0_8px_32px_rgba(0,0,0,0.35)] rounded-[20px] p-4 pointer-events-auto text-white flex flex-col gap-4">
              {/* Core Metrics */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white/5 border border-white/10 rounded-xl p-3 flex flex-col justify-center">
                  <span className="text-[10px] uppercase font-black tracking-widest text-white/50 leading-none mb-1">Distance</span>
                  <span className="text-base font-black text-white">{activePlan.totalDistanceKm.toFixed(1)} km</span>
                </div>
                <div className="bg-white/5 border border-white/10 rounded-xl p-3 flex flex-col justify-center">
                  <span className="text-[10px] uppercase font-black tracking-widest text-white/50 leading-none mb-1">Travel Time</span>
                  <span className="text-base font-black text-white">{routeDurationText || "N/A"}</span>
                </div>
                <div className="bg-white/5 border border-white/10 rounded-xl p-3 flex flex-col justify-center">
                  <span className="text-[10px] uppercase font-black tracking-widest text-white/50 leading-none mb-1">Battery Required</span>
                  <span className="text-base font-black text-[#00E676]">{((activePlan.totalDistanceKm / 500) * 100).toFixed(0)}%</span>
                </div>
                <div className="bg-white/5 border border-white/10 rounded-xl p-3 flex flex-col justify-center">
                  <span className="text-[10px] uppercase font-black tracking-widest text-white/50 leading-none mb-1">Current Battery</span>
                  <span className="text-base font-black text-white">{soc}%</span>
                </div>
              </div>

              {/* Recommended Stop */}
              {activePlan.optimalStation ? (
                <div className="bg-[#00E676]/10 border border-[#00E676]/20 rounded-xl p-3">
                  <p className="text-[10px] font-black uppercase text-[#00E676] tracking-widest leading-none mb-2">Recommended Stop</p>
                  <h4 className="font-black text-sm text-white truncate">{activePlan.optimalStation.name}</h4>
                  <p className="text-[11px] text-white/60 truncate mt-0.5 mb-3">{activePlan.optimalStation.address}</p>
                  
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[#00E676]/10">
                    <div>
                      <span className="text-[9px] uppercase font-bold text-white/50 block">Charge Duration</span>
                      <span className="text-sm font-black text-white">18 minutes</span>
                    </div>
                    <div>
                      <span className="text-[9px] uppercase font-bold text-white/50 block">Arrival Battery</span>
                      <span className="text-sm font-black text-white">
                        {Math.max(2, Math.floor(soc - ((activePlan.totalDistanceKm / 500) * 100)))}%
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      const lon = Number(activePlan.optimalStation?.lon);
                      const lat = Number(activePlan.optimalStation?.lat);
                      if (mapRef.current) {
                        mapRef.current.panTo({ lat, lng: lon });
                        mapRef.current.setZoom(16);
                      }
                    }}
                    className="w-full mt-3 py-2 bg-[#00E676] text-black text-[10px] font-black uppercase tracking-widest rounded-lg hover:bg-[#00c868] transition-colors shadow-lg"
                  >
                    View On Map
                  </button>
                </div>
              ) : (
                <div className="bg-white/5 border border-white/10 rounded-xl p-3">
                  <p className="text-[10px] font-black uppercase text-white/50 tracking-widest leading-none mb-1">Recommended Stop</p>
                  <h4 className="font-black text-sm text-white">No stops required</h4>
                  <p className="text-[11px] text-white/60 mt-0.5">Your current range is sufficient for this trip.</p>
                  
                  <div className="mt-2 pt-2 border-t border-white/10">
                    <span className="text-[9px] uppercase font-bold text-white/50 block">Expected Arrival Battery</span>
                    <span className="text-sm font-black text-[#00E676]">
                      {Math.max(0, Math.floor(soc - ((activePlan.totalDistanceKm / 500) * 100)))}%
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Announcement Banner */}
          <AnimatePresence>
            {announcement?.active && showBanner && (
              <motion.div 
                initial={{ y: -20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -20, opacity: 0 }}
                className="bg-[#00E676] text-black px-4 py-2.5 rounded-[20px] shadow-[0_4px_20px_rgba(0,230,118,0.3)] flex items-center justify-between border border-[#00E676]/30 backdrop-blur-xl"
              >
                <div className="flex items-center gap-3 truncate">
                  <div className="bg-black/10 p-1.5 rounded-full">
                    <Megaphone className="w-4 h-4 shrink-0" />
                  </div>
                  <p className="text-[11px] font-black uppercase tracking-wider truncate">{announcement.message}</p>
                </div>
                <button onClick={() => setShowBanner(false)} className="p-1.5 hover:bg-black/10 rounded-full transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </motion.div>
            )}

            {/* Proximity Alert Premium Banner */}
            {proximityAlert && (
              <motion.div 
                initial={{ scale: 0.9, opacity: 0, y: -20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                className="bg-[rgba(20,20,20,0.85)] text-white px-4 py-3 rounded-[20px] shadow-2xl flex items-center justify-between border border-[rgba(255,255,255,0.08)] backdrop-blur-2xl ring-1 ring-[#00E676]/30 cursor-pointer hover:bg-[rgba(255,255,255,0.05)] transition-colors"
                onClick={() => {
                  setLocation(`/station/${proximityAlert.id}`);
                }}
              >
                <div className="flex items-center gap-3">
                  <div className="bg-[#00E676]/20 p-2 rounded-full border border-[#00E676]/30">
                    <Zap className="w-4 h-4 text-[#00E676] fill-[#00E676] animate-pulse" />
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-[#00E676]">Nearby Station</p>
                    <p className="text-sm font-bold truncate max-w-[180px]">{proximityAlert.name}</p>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                   <div className="bg-white/10 px-2 py-0.5 rounded text-[10px] font-black text-white/80">
                     {(proximityAlert.distance! * 1000).toFixed(0)}m
                   </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* WEEKLY REPORT — show below search */}
          <AnimatePresence>
            {weeklyReport && !reportDismissed && (
              <div className="pointer-events-auto">
                <WeeklyReportCard
                  report={weeklyReport}
                  onDismiss={() => setReportDismissed(true)}
                />
              </div>
            )}
          </AnimatePresence>

          {/* Horizontal Scrollable Filter Pills */}
          <div className="flex gap-1.5 items-center overflow-x-auto pb-1.5 scrollbar-hide pointer-events-auto w-full">
            <button
              onClick={() => {
                setFavoritesOnly(!favoritesOnly);
              }}
              className={cn(
                "px-3 py-1.5 whitespace-nowrap rounded-full text-[11px] font-black transition-all border shadow-md flex items-center gap-1.5",
                favoritesOnly 
                  ? "bg-red-500/20 text-red-400 border-red-500/50 shadow-[0_0_12px_rgba(239,68,68,0.25)]" 
                  : "bg-[rgba(20,20,20,0.75)] backdrop-blur-xl border-[rgba(255,255,255,0.08)] text-white/70 hover:border-white/20 hover:text-white"
                )}
            >
              <Heart className={cn("w-3.5 h-3.5", favoritesOnly && "fill-red-400 text-red-400")} />
              Favorites
            </button>
            <ConnectorFilter 
              map={mapRef.current} 
              stations={stations} 
              onFilterChange={(type) => {
                if (type === "All") {
                  setFilters({...filters, connectors: []});
                } else {
                  setFilters({...filters, connectors: [type]});
                }
                setFavoritesOnly(false);
              }}
              className="px-0 py-0 pb-0 gap-1.5"
            />
          </div>

          {/* Favourite Availability Banner */}
          <div className="w-full">
            <FavouriteAvailabilityBanner favouriteStations={filteredStations} />
          </div>
        </div>
      </div>

      {/* Advanced Filter Panel */}
      <FilterPanel 
        isOpen={showFilters}
        onClose={() => setShowFilters(false)}
        filters={filters}
        setFilters={setFilters}
        onReset={() => setFilters({ connectors: [], minPower: 0, maxPrice: 50, onlyOpen: false })}
      />

      {/* Main Content Area */}
      <div className="flex-1 relative h-full">
        {/* ACTIVE SESSION WIDGET — persistent widget */}
        <AnimatePresence>
          {user?.uid && <ActiveSessionWidget userId={user.uid} db={db} />}
        </AnimatePresence>

        {/* Map view elements */}

        <MapComponent
          stations={filteredStations}
          onStationClick={(station) => {
            setSelectedStation(station);
            setSheetState("half");
          }}
          selectedStationId={selectedStation?.id}
          userLocation={userLocation || undefined}
          favouriteIds={userFavorites}
          onMapLoad={(map) => {
            mapRef.current = map;
            setMapReady(true);
          }}
        />

        {/* Floating Actions Stack (Bottom-Right) */}
        <div className="absolute bottom-[72px] right-4 z-40 flex flex-col gap-2 pointer-events-auto">
          {/* Refresh Stations FAB */}
          <Button
            variant="secondary"
            size="icon"
            onClick={handleRefresh}
            className="rounded-full w-11 h-11 bg-[rgba(20,20,20,0.75)] backdrop-blur-xl border border-[rgba(255,255,255,0.08)] text-white hover:bg-white/5 hover:scale-105 active:scale-95 transition-all shadow-[0_8px_32px_rgba(0,0,0,0.35)]"
          >
            <RotateCw className={cn("w-4 h-4", isRefreshing && "animate-spin text-[#00E676]")} />
          </Button>

          {/* Route Planner Toggle FAB */}
          <Button
            variant="secondary"
            size="icon"
            onClick={toggleRoutePlanner}
            className={cn(
              "rounded-full w-11 h-11 border transition-all shadow-[0_8px_32px_rgba(0,0,0,0.35)]",
              isRouteMode 
                ? "bg-[#00E676] border-[#00E676] text-black hover:bg-[#00c868]" 
                : "bg-[rgba(20,20,20,0.75)] backdrop-blur-xl border-[rgba(255,255,255,0.08)] text-white hover:bg-white/5 hover:scale-105 active:scale-95"
            )}
          >
            <Navigation className="w-4 h-4" />
          </Button>

          {/* Locate Me FAB */}
          <Button 
            variant="secondary"
            size="icon"
            className="rounded-full w-11 h-11 bg-[rgba(20,20,20,0.75)] backdrop-blur-xl border border-[rgba(255,255,255,0.08)] text-white hover:bg-white/5 hover:scale-105 active:scale-95 transition-all shadow-[0_8px_32px_rgba(0,0,0,0.35)]"
            onClick={() => {
              if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(p => {
                  const loc = { lat: p.coords.latitude, lon: p.coords.longitude };
                  setUserLocation(loc);
                  if (mapRef.current) {
                    mapRef.current.panTo({ lat: loc.lat, lng: loc.lon });
                    mapRef.current.setZoom(14);
                  }
                });
              }
            }}
          >
            <Crosshair className="w-4 h-4" />
          </Button>
        </div>

        {/* Floating Legend (Bottom-Left) */}
        <div className="absolute bottom-[72px] left-4 z-40 pointer-events-auto">
          <div className="relative">
            <Button
              variant="secondary"
              size="icon"
              onClick={() => setShowLegend(!showLegend)}
              className={cn(
                "rounded-full w-9 h-9 border shadow-lg transition-all",
                showLegend 
                  ? "bg-[#00E676] border-[#00E676] text-black" 
                  : "bg-[rgba(20,20,20,0.75)] backdrop-blur-xl border-[rgba(255,255,255,0.08)] text-white/80 hover:bg-white/5"
              )}
            >
              <Info className="w-4 h-4" />
            </Button>

            <AnimatePresence>
              {showLegend && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 10 }}
                  className="absolute bottom-12 left-0 bg-[rgba(20,20,20,0.9)] backdrop-blur-xl border border-[rgba(255,255,255,0.08)] p-3 rounded-[16px] shadow-[0_8px_32px_rgba(0,0,0,0.35)] space-y-2 min-w-[140px]"
                >
                  <div className="text-[10px] font-black uppercase tracking-wider text-white/40 border-b border-white/10 pb-1">Legend</div>
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                    <span className="text-white/70 font-bold text-[10px]">Available</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]" />
                    <span className="text-white/70 font-bold text-[10px]">Maintenance</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
                    <span className="text-white/70 font-bold text-[10px]">Offline</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse" />
                    <span className="text-white/70 font-bold text-[10px]">Your Location</span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* PRICE COMPARISON — trigger button */}
        <button
          onClick={() => setPriceCompareOpen(true)}
          className="absolute bottom-[72px] left-16 z-20 h-9 px-4 rounded-full bg-[rgba(20,20,20,0.75)] backdrop-blur-xl text-white border border-[rgba(255,255,255,0.08)] hover:bg-white/5 font-black text-[10px] uppercase tracking-widest flex items-center gap-1.5 hover:scale-105 active:scale-95 transition-all shadow-[0_8px_32px_rgba(0,0,0,0.35)]"
        >
          <ArrowUpDown className="w-3.5 h-3.5" />
          Compare Prices
        </button>

        <AnimatePresence>
          {priceCompareOpen && (
            <PriceComparisonDrawer
              stations={sortedStations}
              sortMode={priceSortMode}
              onSortChange={setPriceSortMode}
              onStationSelect={(id) => {
                setPriceCompareOpen(false);
                setLocation(`/station/${id}`);
              }}
              onClose={() => setPriceCompareOpen(false)}
            />
          )}
        </AnimatePresence>

        {/* Desktop Sidebar (Left side for driver map) */}
        {!isMobile && (
          <div className="absolute top-4 left-4 h-[calc(100%-2rem)] w-[400px] z-20 pointer-events-none">
            <div className="bg-background/95 backdrop-blur-xl border rounded-3xl shadow-2xl h-full flex flex-col pointer-events-auto overflow-hidden">
              <div className="p-6 border-b">
                <h1 className="text-2xl font-black tracking-tighter">Nearby Stations</h1>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <p className="text-sm text-muted-foreground">
                    Showing {pagedNearbyStations.length} nearby stations
                  </p>
                  {userLocation && (
                    <span className="text-xs bg-primary/10 text-primary font-bold px-2 py-0.5 rounded-full border border-primary/20">
                      📍 Within {MAX_RADIUS_KM} km
                    </span>
                  )}
                </div>
              </div>

              {/* WEEKLY REPORT — Desktop */}
              <AnimatePresence>
                {weeklyReport && !reportDismissed && (
                  <div className="px-4 pt-4">
                    <WeeklyReportCard
                      report={weeklyReport}
                      onDismiss={() => setReportDismissed(true)}
                    />
                  </div>
                )}
              </AnimatePresence>

              <div className="flex-1 overflow-y-auto p-4 space-y-2 scrollbar-hide">
                {pagedNearbyStations.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full gap-4 text-center py-12">
                    <div className="text-4xl">📍</div>
                    <p className="font-bold text-muted-foreground">
                      No charging stations found within {NEARBY_RADIUS_KM} km.
                    </p>
                    <div className="space-y-2 w-full">
                      <button onClick={handleRefresh} className="w-full text-xs font-bold text-primary underline">🔄 Refresh location</button>
                    </div>
                  </div>
                ) : (
                  pagedNearbyStations.map(station => (
                    <div key={station.id} onClick={() => {
                      setSelectedStation(station);
                      setLocation(`/station/${station.id}`);
                    }}>
                      <StationListRow
                        id={`station-card-${station.id}`}
                        station={station as any}
                        distanceKm={station.distance || null}
                      />
                    </div>
                  ))
                )}
                {hasMoreNearby && (
                  <button
                    onClick={() => setNearbyPage(p => p + 1)}
                    className="w-full mt-2 py-3 text-xs font-black uppercase tracking-widest text-primary border border-primary/30 rounded-xl hover:bg-primary/5 transition-colors"
                  >
                    Load More ({nearbyStations.length - nearbyPage * PAGE_SIZE} more)
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Desktop Selected Station Preview (Top-Right) */}
        {!isMobile && selectedStation && (
          <div className="absolute top-4 right-4 w-[360px] z-40 pointer-events-auto">
            {renderStationPreviewCard(selectedStation)}
          </div>
        )}
      </div>

      {/* Mobile Bottom Sheet */}
      {isMobile && (
        <motion.div
          initial="peek"
          animate={sheetState}
          variants={{
            peek: { y: "calc(100% - 130px)" }, // adjusted for taller sheet handle
            half: { y: "45%" },
            full: { y: "15%" }
          }}
          transition={{ type: "spring", damping: 25, stiffness: 200 }}
          className="fixed inset-0 z-40 pointer-events-none"
        >
          <div className="absolute inset-x-0 bottom-0 h-full pointer-events-auto">
            <div className="h-full bg-[rgba(15,15,15,0.85)] backdrop-blur-3xl rounded-t-[32px] border-t border-[rgba(255,255,255,0.1)] shadow-[0_-10px_40px_rgba(0,0,0,0.5)] flex flex-col">
              {/* Drag Handle */}
              <div 
                className="w-full flex flex-col items-center pt-3 pb-5 cursor-grab active:cursor-grabbing"
                onClick={() => setSheetState(sheetState === "peek" ? "half" : sheetState === "half" ? "full" : "peek")}
              >
                <div className="w-12 h-1.5 bg-[rgba(255,255,255,0.2)] rounded-full mb-3" />
                {sheetState === "peek" && (
                  <div className="flex items-center gap-2 px-6">
                    <div className="bg-primary/20 p-1.5 rounded-full">
                      <List className="w-4 h-4 text-primary" />
                    </div>
                    <p className="text-sm font-bold text-white">
                      {nearbyStations.length} nearby stations
                    </p>
                    {userLocation && (
                      <span className="text-[10px] bg-primary/20 text-primary font-bold px-2 py-0.5 rounded-full">
                        📍 {MAX_RADIUS_KM} km
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Sheet Content */}
              <div className="flex-1 overflow-y-auto px-4 pb-24">
                {selectedStation ? (
                  <div className="space-y-4">
                    {renderStationPreviewCard(selectedStation, true)}
                    
                    {sheetState !== "peek" && (
                      <div className="border-t border-white/10 pt-4 mt-2">
                        <h4 className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-3 px-2">Other Nearby Stations</h4>
                        <div className="space-y-1">
                          {nearbyStations.filter(s => s.id !== selectedStation.id).map(station => (
                            <div key={station.id} onClick={() => {
                              setSelectedStation(station);
                            }}>
                              <StationListRow 
                                station={station as any} 
                                distanceKm={station.distance || null}
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  sheetState === "peek" ? (
                    /* Horizontal swipe cards in peek mode */
                    <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide snap-x">
                      {pagedNearbyStations.slice(0, 5).map(station => (
                        <div key={station.id} className="min-w-[300px] snap-center" onClick={() => {
                          setSelectedStation(station);
                          setSheetState("half");
                        }}>
                          <StationListRow 
                            station={station as any} 
                            distanceKm={station.distance || null}
                          />
                        </div>
                      ))}
                    </div>
                  ) : (
                    /* Full list in half/full mode */
                    <div className="space-y-1">
                      <div className="mb-4 px-2">
                        <h3 className="text-lg font-black text-white">Nearby Charging Stations</h3>
                        <div className="flex items-center gap-2 mt-1">
                          <p className="text-xs text-[rgba(255,255,255,0.5)]">Showing {pagedNearbyStations.length} of {nearbyStations.length} nearby stations</p>
                          {userLocation && (
                            <span className="text-[10px] bg-primary/20 text-primary font-bold px-2 py-0.5 rounded-full">
                              📍 Within {MAX_RADIUS_KM} km
                            </span>
                          )}
                        </div>
                      </div>
                      {nearbyStations.length === 0 ? (
                        <div className="flex flex-col items-center gap-3 py-10 text-center">
                          <div className="text-4xl">📍</div>
                          <p className="text-white/70 font-bold text-sm">No charging stations found within {NEARBY_RADIUS_KM} km.</p>
                          <button onClick={handleRefresh} className="text-xs font-bold text-primary underline">🔄 Refresh location</button>
                        </div>
                      ) : (
                        pagedNearbyStations.map(station => (
                          <div key={station.id} onClick={() => {
                            setSelectedStation(station);
                          }}>
                            <StationListRow 
                              station={station as any} 
                              distanceKm={station.distance || null}
                            />
                          </div>
                        ))
                      )}
                      {hasMoreNearby && (
                        <button
                          onClick={() => setNearbyPage(p => p + 1)}
                          className="w-full mt-3 py-3 text-xs font-black uppercase tracking-widest text-primary border border-primary/30 rounded-xl"
                        >
                          Load More ({nearbyStations.length - nearbyPage * PAGE_SIZE} more)
                        </button>
                      )}
                    </div>
                  )
                )}
              </div>
            </div>
          </div>
        </motion.div>
      )}
      <UserChatbot chatContext={userContext} hideFab={isMobile && sheetState !== "peek"} />
      <style>{`
        .optimal-stop-marker {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 40px;
          height: 40px;
          cursor: pointer;
          z-index: 100;
        }
        .marker-icon {
          width: 24px;
          height: 24px;
          background: #10b981;
          color: white;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 0 15px rgba(16, 185, 129, 0.5);
          border: 2px solid white;
          z-index: 2;
        }
        .marker-pulse {
          position: absolute;
          width: 40px;
          height: 40px;
          background: rgba(16, 185, 129, 0.3);
          border-radius: 50%;
          animation: pulse-ring 1.5s cubic-bezier(0.24, 0, 0.38, 1) infinite;
          z-index: 1;
        }
        @keyframes pulse-ring {
          0% { transform: scale(0.3); opacity: 0.8; }
          80%, 100% { transform: scale(1.5); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
