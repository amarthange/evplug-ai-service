import { useEffect, useRef, useState, useMemo } from "react";
import { googleMapsLoader } from "@/lib/google-maps-loader";
import * as turf from "@turf/turf";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { useAuth } from "@/lib/auth-context";
import { db } from "@/lib/firebase";
import { collection, query, getDocs, addDoc } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { 
  MapPin, 
  Navigation, 
  Battery, 
  Clock, 
  Zap, 
  Search, 
  Save, 
  Loader2,
  Info,
  Map
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";

// BATTERY PLANNER — imports
import BatteryPlannerOverlay from '@/components/BatteryPlannerOverlay';
import { simulateBatteryPlan } from '@/lib/battery-planner';

interface Station {
  id: string;
  name: string;
  lat: number;
  lon: number;
  connectors: any[];
  rating?: number;
  status: string;
}

interface RouteStop {
  stationId: string;
  stationName: string;
  lat: number;
  lon: number;
  estimatedArrival: string;
  chargingDuration: number;
}

const darkMapStyle = [
  { elementType: "geometry", stylers: [{ color: "#0f172a" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#0f172a" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#94a3b8" }] },
  {
    featureType: "administrative.locality",
    elementType: "labels.text.fill",
    stylers: [{ color: "#cbd5e1" }],
  },
  {
    featureType: "poi",
    elementType: "labels.text.fill",
    stylers: [{ color: "#94a3b8" }],
  },
  {
    featureType: "poi.park",
    elementType: "geometry",
    stylers: [{ color: "#1e293b" }],
  },
  {
    featureType: "poi.park",
    elementType: "labels.text.fill",
    stylers: [{ color: "#475569" }],
  },
  {
    featureType: "road",
    elementType: "geometry",
    stylers: [{ color: "#1e293b" }],
  },
  {
    featureType: "road",
    elementType: "geometry.stroke",
    stylers: [{ color: "#334155" }],
  },
  {
    featureType: "road",
    elementType: "labels.text.fill",
    stylers: [{ color: "#94a3b8" }],
  },
  {
    featureType: "road.highway",
    elementType: "geometry",
    stylers: [{ color: "#334155" }],
  },
  {
    featureType: "road.highway",
    elementType: "geometry.stroke",
    stylers: [{ color: "#475569" }],
  },
  {
    featureType: "road.highway",
    elementType: "labels.text.fill",
    stylers: [{ color: "#cbd5e1" }],
  },
  {
    featureType: "transit",
    elementType: "geometry",
    stylers: [{ color: "#1e293b" }],
  },
  {
    featureType: "transit.station",
    elementType: "labels.text.fill",
    stylers: [{ color: "#cbd5e1" }],
  },
  {
    featureType: "water",
    elementType: "geometry",
    stylers: [{ color: "#020617" }],
  },
  {
    featureType: "water",
    elementType: "labels.text.fill",
    stylers: [{ color: "#475569" }],
  },
  {
    featureType: "water",
    elementType: "labels.text.stroke",
    stylers: [{ color: "#020617" }],
  },
];

export default function RoutePlanner() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<google.maps.Map | null>(null);
  const polylineRef = useRef<google.maps.Polyline | null>(null);
  const stopMarkersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  const activePopupRef = useRef<google.maps.InfoWindow | null>(null);
  
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);

  // Inputs
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [currentSoC, setCurrentSoC] = useState(80);
  const [targetSoC, setTargetSoC] = useState(20);
  const [routeName, setRouteName] = useState("");

  // Results
  const [routeInfo, setRouteInfo] = useState<{
    distance: number;
    duration: number;
    stops: RouteStop[];
    geometry: any;
    originCoords: [number, number];
    destCoords: [number, number];
  } | null>(null);

  // Vehicle data
  const [vehicle, setVehicle] = useState<any>(null);

  // BATTERY PLANNER — compute battery plan when route changes
  const [startSocPct, setStartSocPct] = useState(50);
  
  // Update starting SoC when vehicle is loaded
  useEffect(() => {
    if (vehicle?.currentSoC) {
      setStartSocPct(vehicle.currentSoC);
    }
  }, [vehicle]);

  const activeVehicle = vehicle;
  const batteryCapacity = activeVehicle?.batteryCapacity ?? 60;

  // Build waypoints for simulation
  const routeWaypoints = useMemo(() => {
    if (!routeInfo || !routeInfo.geometry) return [];
    
    const routeLine = turf.lineString(routeInfo.geometry.coordinates);
    const waypoints = [];
    
    // Origin
    waypoints.push({
      name: origin || "Origin",
      distanceFromPreviousKm: 0,
      isChargingStop: false,
      targetSocAfterCharge: 0
    });
    
    let lastDistance = 0;
    routeInfo.stops.forEach((stop) => {
      const stopPoint = turf.point([stop.lon, stop.lat]);
      const distanceToStop = turf.length(turf.lineSlice(turf.point(routeInfo.originCoords), stopPoint, routeLine));
      const segmentDist = Math.max(0, distanceToStop - lastDistance);
      
      waypoints.push({
        name: stop.stationName,
        distanceFromPreviousKm: segmentDist,
        isChargingStop: true,
        targetSocAfterCharge: 80
      });
      
      lastDistance = distanceToStop;
    });
    
    // Destination
    const destDist = Math.max(0, routeInfo.distance - lastDistance);
    waypoints.push({
      name: destination || "Destination",
      distanceFromPreviousKm: destDist,
      isChargingStop: false,
      targetSocAfterCharge: 0
    });
    
    return waypoints;
  }, [routeInfo, origin, destination]);

  const batteryPlanResult = useMemo(() => {
    if (!routeWaypoints || routeWaypoints.length === 0) return null;
    const vehicleEfficiency = activeVehicle?.efficiency_wh_km ?? undefined;
    return simulateBatteryPlan(
      startSocPct, 
      batteryCapacity, 
      routeWaypoints,
      vehicleEfficiency
    );
  }, [routeWaypoints, startSocPct, batteryCapacity, activeVehicle?.efficiency_wh_km]);

  useEffect(() => {
    if (!user) return;
    const fetchVehicle = async () => {
      const q = query(collection(db, "users", user.uid, "ev_vehicles"));
      const snap = await getDocs(q);
      if (!snap.empty) {
        setVehicle(snap.docs[0].data());
      }
    };
    fetchVehicle();
  }, [user]);

  const isKeyConfigured = import.meta.env.VITE_GOOGLE_MAPS_API_KEY &&
    import.meta.env.VITE_GOOGLE_MAPS_API_KEY !== "your_google_maps_api_key_here" &&
    import.meta.env.VITE_GOOGLE_MAPS_API_KEY.trim() !== "";

  // Load Google Maps SDK
  useEffect(() => {
    if (!isKeyConfigured) return;
    if (!mapContainer.current) return;

    (googleMapsLoader as any).load().then(() => {
      if (!mapContainer.current) return;

      map.current = new google.maps.Map(mapContainer.current, {
        center: { lat: 20.5937, lng: 78.9629 }, // India Center
        zoom: 4.5,
        styles: darkMapStyle,
        mapId: "route_planner_map",
        disableDefaultUI: true,
        zoomControl: true,
      });

      setMapLoaded(true);
    }).catch((err: any) => {
      console.error("Failed to load Google Maps SDK:", err);
    });

    return () => {
      stopMarkersRef.current.forEach(m => m.map = null);
      stopMarkersRef.current = [];
      if (polylineRef.current) {
        polylineRef.current.setMap(null);
      }
      if (activePopupRef.current) {
        activePopupRef.current.close();
      }
      map.current = null;
    };
  }, []);

  const geocode = async (query: string): Promise<[number, number] | null> => {
    if (typeof google === "undefined" || !google.maps) {
      // Offline / Unloaded Mock Fallback
      const q = query.toLowerCase().trim();
      if (q.includes("delhi")) return [77.2090, 28.6139];
      if (q.includes("mumbai")) return [72.8777, 19.0760];
      if (q.includes("bangalore") || q.includes("bengaluru")) return [77.5946, 12.9716];
      if (q.includes("pune")) return [73.8567, 18.5204];
      if (q.includes("chennai")) return [80.2707, 13.0827];
      if (q.includes("kolkata")) return [88.3639, 22.5726];
      if (q.includes("hyderabad")) return [78.4867, 17.3850];
      
      let hash = 0;
      for (let i = 0; i < q.length; i++) {
        hash = q.charCodeAt(i) + ((hash << 5) - hash);
      }
      const lat = 20.5937 + (hash % 100) / 20;
      const lon = 78.9629 + ((hash >> 8) % 100) / 20;
      return [lon, lat];
    }

    try {
      const geocoder = new google.maps.Geocoder();
      const response = await geocoder.geocode({ address: query });
      if (response.results && response.results.length > 0) {
        const loc = response.results[0].geometry.location;
        return [loc.lng(), loc.lat()]; // Returns [lon, lat]
      }
      return null;
    } catch (err) {
      console.error("Geocoding error:", err);
      return null;
    }
  };

  const calculateRoute = async () => {
    if (!origin || !destination) {
      toast({ title: "Error", description: "Please enter origin and destination", variant: "destructive" });
      return;
    }

    console.log("Destination:", destination);

    if (!vehicle) {
      toast({ title: "Error", description: "No vehicle found in your profile. Please add one first.", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const originCoords = await geocode(origin);
      const destCoords = await geocode(destination);

      if (!originCoords || !destCoords) {
        toast({ title: "Error", description: "Could not find locations", variant: "destructive" });
        return;
      }

      // 1. Get initial route (using Google Maps Directions API or mock fallback)
      let route: any;
      if (typeof google !== "undefined" && google.maps && mapLoaded) {
        const directionsService = new google.maps.DirectionsService();
        
        const directionsResult = await directionsService.route({
          origin: new google.maps.LatLng(originCoords[1], originCoords[0]),
          destination: new google.maps.LatLng(destCoords[1], destCoords[0]),
          travelMode: google.maps.TravelMode.DRIVING,
        });

        console.log("Directions Response:", directionsResult);
        const routeData = directionsResult.routes[0];
        
        // Map Google coordinates (LatLng) to GeoJSON coordinates [lon, lat] for Turf compatibility
        const coordinates = routeData.overview_path.map((latLng: any) => [
          latLng.lng(),
          latLng.lat(),
        ]);

        // Accumulate distance and duration from route legs
        const distanceMeters = routeData.legs.reduce((acc: number, leg: any) => acc + (leg.distance?.value || 0), 0);
        const durationSeconds = routeData.legs.reduce((acc: number, leg: any) => acc + (leg.duration?.value || 0), 0);

        route = {
          distance: distanceMeters,
          duration: durationSeconds,
          geometry: {
            type: "LineString",
            coordinates,
          },
        };
      } else {
        // Mock fallback if offline/no API
        const distanceMeters = turf.distance(turf.point(originCoords), turf.point(destCoords)) * 1000;
        const durationSeconds = distanceMeters / 16.67; // average 60km/h
        
        const coords: [number, number][] = [];
        const steps = 15;
        for (let i = 0; i <= steps; i++) {
          const t = i / steps;
          const lon = originCoords[0] + (destCoords[0] - originCoords[0]) * t;
          const lat = originCoords[1] + (destCoords[1] - originCoords[1]) * t;
          if (i > 0 && i < steps) {
            const jitterLat = Math.sin(i * 1.5) * 0.05;
            const jitterLon = Math.cos(i * 1.5) * 0.05;
            coords.push([lon + jitterLon, lat + jitterLat]);
          } else {
            coords.push([lon, lat]);
          }
        }
        
        route = {
          distance: distanceMeters,
          duration: durationSeconds,
          geometry: {
            type: "LineString",
            coordinates: coords
          }
        };
      }

      const totalDistanceKm = route.distance / 1000;
      const totalDurationMin = route.duration / 60;
      console.log("Route Distance:", totalDistanceKm);

      // 2. Calculate range
      const efficiency = 15; // kWh/100km
      const batteryCapacity = vehicle.batteryCapacity || 60; // kWh
      const availableEnergy = batteryCapacity * (currentSoC / 100);
      const bufferEnergy = batteryCapacity * (targetSoC / 100);
      const usableEnergy = Math.max(0, availableEnergy - bufferEnergy);
      const vehicleRange = (usableEnergy / efficiency) * 100; // km

      let stops: RouteStop[] = [];

      if (totalDistanceKm > vehicleRange) {
        // Need charging stops
        const stationsSnap = await getDocs(collection(db, "stations"));
        const allStations: Station[] = stationsSnap.docs.map(doc => {
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
        }).filter(s => s.status === "active");
        console.log("Stations Along Route:", allStations.length);

        const routeLine = turf.lineString(route.geometry.coordinates);
        
        // Planning charging stops
        const numSegments = Math.ceil(totalDistanceKm / (vehicleRange * 0.8));
        for (let i = 1; i < numSegments; i++) {
          const pointAtDistance = turf.along(routeLine, i * vehicleRange * 0.8);
          const stopCoords = pointAtDistance.geometry.coordinates;

          const nearbyStations = allStations.filter(s => {
            const distance = turf.distance(stopCoords, [s.lon, s.lat]);
            return distance < 10;
          });

          if (nearbyStations.length > 0) {
            const bestStation = nearbyStations.sort((a, b) => (b.rating || 0) - (a.rating || 0))[0];
            
            const distanceToStop = turf.length(turf.lineSlice(turf.point(originCoords), turf.point([bestStation.lon, bestStation.lat]), routeLine));
            const travelTimeMin = (distanceToStop / totalDistanceKm) * totalDurationMin;
            const arrivalTime = new Date(Date.now() + travelTimeMin * 60 * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            stops.push({
              stationId: bestStation.id,
              stationName: bestStation.name,
              lat: bestStation.lat,
              lon: bestStation.lon,
              estimatedArrival: arrivalTime,
              chargingDuration: 45
            });
          }
        }
      }
      
      console.log("Recommended Stops:", stops);

      setRouteInfo({
        distance: totalDistanceKm,
        duration: totalDurationMin,
        stops,
        geometry: route.geometry,
        originCoords,
        destCoords
      });

      // Update Google Map Rendering
      if (map.current && mapLoaded) {
        // Clear previous route polylines
        if (polylineRef.current) {
          polylineRef.current.setMap(null);
        }

        // Draw new route polyline
        const path = route.geometry.coordinates.map((coord: [number, number]) => ({
          lat: coord[1],
          lng: coord[0],
        }));

        polylineRef.current = new google.maps.Polyline({
          path,
          geodesic: true,
          strokeColor: "#22c55e",
          strokeOpacity: 0.75,
          strokeWeight: 5,
          map: map.current,
        });

        // Clear stop markers
        stopMarkersRef.current.forEach((m) => (m.map = null));
        stopMarkersRef.current = [];

        // Draw stops markers
        stops.forEach((stop, index) => {
          const el = document.createElement("div");
          el.className = "stop-marker";
          el.innerHTML = `<div class="bg-orange-500 text-white rounded-full w-8 h-8 flex items-center justify-center font-bold border-2 border-white shadow-lg">⚡</div>`;

          const marker = new google.maps.marker.AdvancedMarkerElement({
            map: map.current,
            position: { lat: stop.lat, lng: stop.lon },
            content: el,
            title: `Stop ${index + 1}: ${stop.stationName}`,
          });

          marker.addListener("gmp-click", () => {
            if (activePopupRef.current) activePopupRef.current.close();

            const infoWindow = new google.maps.InfoWindow({
              content: `
                <div class="p-2 text-white font-sans" style="color: white; font-family: sans-serif;">
                  <b style="font-weight: bold; font-size: 13px;">Stop ${index + 1}: ${stop.stationName}</b>
                  <p style="margin: 4px 0 0 0; font-size: 11px; opacity: 0.7;">Arrive: ${stop.estimatedArrival} • Charge: ${stop.chargingDuration} mins</p>
                </div>
              `,
              maxWidth: 240,
            });

            infoWindow.open({
              anchor: marker,
              map: map.current,
            });

            activePopupRef.current = infoWindow;
          });

          stopMarkersRef.current.push(marker);
        });

        // Fit Bounds
        const bounds = new google.maps.LatLngBounds();
        route.geometry.coordinates.forEach((coord: [number, number]) => {
          bounds.extend({ lat: coord[1], lng: coord[0] });
        });
        map.current.fitBounds(bounds, 50);
      }

    } catch (err) {
      console.error("Route calculation error:", err);
      toast({ title: "Error", description: "Failed to calculate route", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const saveRoute = async () => {
    if (!user || !routeInfo || !routeName) {
      toast({ title: "Error", description: "Please enter a route name", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      await addDoc(collection(db, "saved_routes"), {
        userId: user.uid,
        name: routeName,
        origin: { lat: routeInfo.originCoords[1], lon: routeInfo.originCoords[0], address: origin },
        destination: { lat: routeInfo.destCoords[1], lon: routeInfo.destCoords[0], address: destination },
        chargingStops: routeInfo.stops,
        createdAt: new Date(),
        totalDistance: routeInfo.distance,
        totalDuration: routeInfo.duration
      });
      toast({ title: "Success", description: "Route saved successfully" });
      setLocation("/my-routes");
    } catch (err) {
      console.error("Error saving route:", err);
      toast({ title: "Error", description: "Failed to save route", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col md:flex-row h-screen bg-[#0f172a] text-white">
      {/* Sidebar Controls */}
      <div className="w-full md:w-[400px] p-6 space-y-6 overflow-y-auto bg-[#1e293b]/50 backdrop-blur-xl border-r border-white/10 z-10 shadow-2xl">
        <div className="space-y-2">
          <h1 className="text-3xl font-black bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
            Route Planner
          </h1>
          <p className="text-sm text-white/40">AI-optimized charging itinerary</p>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase text-white/40 tracking-widest">Starting Point</Label>
            <div className="relative">
              <Input 
                placeholder="Enter origin city or address" 
                value={origin}
                onChange={e => setOrigin(e.target.value)}
                className="bg-white/5 border-white/10 h-12 pl-10 rounded-xl"
              />
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-500" />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase text-white/40 tracking-widest">Destination</Label>
            <div className="relative">
              <Input 
                placeholder="Enter destination" 
                value={destination}
                onChange={e => setDestination(e.target.value)}
                className="bg-white/5 border-white/10 h-12 pl-10 rounded-xl"
              />
              <Navigation className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-red-500" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-3 p-4 bg-white/5 rounded-2xl border border-white/10">
              <div className="flex justify-between items-center">
                <Label className="text-[10px] font-black uppercase text-white/40">Current SoC</Label>
                <span className="text-sm font-black text-emerald-400">{currentSoC}%</span>
              </div>
              <Slider 
                value={[currentSoC]} 
                onValueChange={v => setCurrentSoC(v[0])} 
                max={100} 
                step={1} 
              />
            </div>
            <div className="space-y-3 p-4 bg-white/5 rounded-2xl border border-white/10">
              <div className="flex justify-between items-center">
                <Label className="text-[10px] font-black uppercase text-white/40">Target SoC</Label>
                <span className="text-sm font-black text-cyan-400">{targetSoC}%</span>
              </div>
              <Slider 
                value={[targetSoC]} 
                onValueChange={v => setTargetSoC(v[0])} 
                max={50} 
                step={1} 
              />
            </div>
          </div>

          <Button 
            onClick={calculateRoute} 
            disabled={loading}
            className="w-full h-14 rounded-2xl font-black text-lg bg-emerald-500 hover:bg-emerald-600 shadow-lg shadow-emerald-500/20"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Search className="w-5 h-5 mr-2" />}
            Calculate Route
          </Button>
        </div>

        <AnimatePresence>
          {routeInfo && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6 pt-4"
            >
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-white/5 rounded-2xl border border-white/10">
                  <p className="text-[10px] font-black uppercase text-white/40 mb-1">Distance</p>
                  <div className="flex items-center gap-2">
                    <Navigation className="w-4 h-4 text-emerald-400" />
                    <span className="text-xl font-black">{Math.round(routeInfo.distance)} km</span>
                  </div>
                </div>
                <div className="p-4 bg-white/5 rounded-2xl border border-white/10">
                  <p className="text-[10px] font-black uppercase text-white/40 mb-1">Duration</p>
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-cyan-400" />
                    <span className="text-xl font-black">{Math.round(routeInfo.duration / 60)}h {Math.round(routeInfo.duration % 60)}m</span>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-xs font-black uppercase tracking-widest text-white/40 flex items-center gap-2">
                  <Zap className="w-4 h-4 text-orange-400" /> Recommended Stops ({routeInfo.stops.length})
                </h3>
                
                {routeInfo.stops.length === 0 ? (
                  <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex gap-3">
                    <Info className="w-5 h-5 text-emerald-400 shrink-0" />
                    <p className="text-xs font-bold text-emerald-400/80">No charging stops required for this trip. You have enough range!</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {routeInfo.stops.map((stop, i) => (
                      <div key={i} className="p-4 bg-white/5 rounded-2xl border border-white/10 flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-orange-500/20 flex items-center justify-center shrink-0">
                          <Zap className="w-5 h-5 text-orange-500" />
                        </div>
                        <div className="flex-1">
                          <p className="font-black text-sm">{stop.stationName}</p>
                          <p className="text-[10px] font-bold text-white/40">Arrive @ {stop.estimatedArrival} • {stop.chargingDuration}m charge</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-4 pt-4">
                <Label className="text-[10px] font-black uppercase text-white/40 tracking-widest">Save this trip</Label>
                <div className="flex gap-2">
                  <Input 
                    placeholder="E.g. Weekend Gateway" 
                    value={routeName}
                    onChange={e => setRouteName(e.target.value)}
                    className="bg-white/5 border-white/10 h-12 rounded-xl"
                  />
                  <Button 
                    onClick={saveRoute} 
                    disabled={saving}
                    className="h-12 w-12 rounded-xl bg-white text-black hover:bg-white/90"
                  >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Map View */}
      <div className="flex-1 relative">
        {isKeyConfigured ? (
          <div ref={mapContainer} className="w-full h-full" />
        ) : (
          <div className="w-full h-full min-h-[400px] flex flex-col items-center justify-center bg-slate-950 text-center p-6 space-y-4">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 bg-emerald-500/5 rounded-full blur-[80px] pointer-events-none" />
            <div className="w-12 h-12 bg-slate-900 border border-slate-800 rounded-xl flex items-center justify-center shadow-lg z-10">
              <Map className="w-6 h-6 text-emerald-400 animate-pulse" />
            </div>
            <div className="max-w-xs space-y-1.5 z-10">
              <h4 className="text-sm font-bold text-slate-200">Google Maps Not Configured</h4>
              <p className="text-xs text-slate-400">
                Please configure `VITE_GOOGLE_MAPS_API_KEY` in your `.env` file to render the interactive route planner.
              </p>
            </div>
          </div>
        )}
        
        {/* Overlay Badges */}
        <div className="absolute top-6 left-6 flex gap-2 pointer-events-none">
          {vehicle && (
            <Badge className="bg-white/10 backdrop-blur-md border-white/20 text-white font-black px-4 py-2 text-xs uppercase tracking-widest">
              🚗 {vehicle.brand} {vehicle.model}
            </Badge>
          )}
          <Badge className="bg-emerald-500 text-white font-black px-4 py-2 text-xs uppercase tracking-widest shadow-lg shadow-emerald-500/20">
            AI Planner Active
          </Badge>
        </div>

        {/* BATTERY PLANNER — overlay below route map */}
        {routeWaypoints && routeWaypoints.length > 0 && (
          <BatteryPlannerOverlay
            planResult={batteryPlanResult}
            startSocPct={startSocPct}
            onStartSocChange={setStartSocPct}
            vehicleName={activeVehicle
              ? `${activeVehicle.brand} ${activeVehicle.model}` : 'Your vehicle'}
            vehicleEfficiencyWhKm={activeVehicle?.efficiency_wh_km}
            isLoading={false}
          />
        )}
      </div>

      <style>{`
        /* Google Maps InfoWindow customization in Route Planner */
        .gm-style-iw.gm-style-iw-c {
          background: rgba(10, 10, 10, 0.8) !important;
          backdrop-filter: blur(20px) !important;
          border: 1px solid rgba(255, 255, 255, 0.1) !important;
          border-radius: 12px !important;
          padding: 8px !important;
          box-shadow: 0 5px 15px rgba(0, 0, 0, 0.5) !important;
        }
        .gm-style-iw-d {
          overflow: hidden !important;
        }
        .gm-style-iw-tc::after {
          background: rgba(10, 10, 10, 0.8) !important;
        }
        .gm-ui-hover-effect {
          top: 6px !important;
          right: 6px !important;
          color: white !important;
        }
        
        .stop-marker {
          cursor: pointer;
        }
      `}</style>
    </div>
  );
}
