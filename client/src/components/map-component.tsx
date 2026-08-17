import { useEffect, useRef, useState, useMemo } from "react";
import { googleMapsLoader } from "@/lib/google-maps-loader";
import { MarkerClusterer } from "@googlemaps/markerclusterer";
import type { Station } from "@shared/schema";
import { useLocation } from "wouter";
import { 
  Map as MapIcon, 
  Search, 
  Plus, 
  Minus, 
  RotateCcw, 
  AlertTriangle, 
  Battery, 
  Star,
  Info
} from "lucide-react";

interface EnrichedStation extends Station {
  distance?: number;
  isOpen?: boolean;
}

interface MapComponentProps {
  stations: EnrichedStation[];
  onStationClick?: (station: EnrichedStation) => void;
  selectedStationId?: string;
  userLocation?: { lat: number; lon: number } | null;
  onMapLoad?: (map: google.maps.Map) => void;
  favouriteIds?: string[];
}

export function MapComponent({
  stations,
  onStationClick,
  selectedStationId,
  userLocation,
  onMapLoad,
  favouriteIds = [],
}: MapComponentProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<google.maps.Map | null>(null);
  const userMarkerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);
  const markersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  const activePopupRef = useRef<google.maps.InfoWindow | null>(null);
  const clustererRef = useRef<MarkerClusterer | null>(null);
  const hasZoomedToStations = useRef(false);
  
  const [mapLoaded, setMapLoaded] = useState(false);
  const [, setLocation] = useLocation();

  // Authentication and fallback state
  const isKeyConfigured = import.meta.env.VITE_GOOGLE_MAPS_API_KEY &&
    import.meta.env.VITE_GOOGLE_MAPS_API_KEY !== "your_google_maps_api_key_here" &&
    import.meta.env.VITE_GOOGLE_MAPS_API_KEY.trim() !== "";
  
  const [authFailed, setAuthFailed] = useState(googleMapsLoader.hasAuthFailed());

  useEffect(() => {
    const unsubscribe = googleMapsLoader.onAuthFailure(() => {
      setAuthFailed(true);
    });
    return unsubscribe;
  }, []);

  // -------------------------------------------------------------
  // Simulated Interactive Network Map States & Computations
  // -------------------------------------------------------------
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [searchQuery, setSearchQuery] = useState("");
  const [hoveredStation, setHoveredStation] = useState<EnrichedStation | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  // Get boundaries of stations for SVG projection mapping
  const bounds = useMemo(() => {
    const latitudes = stations.map(s => Number(s.lat || (s as any).location?.lat)).filter(l => !isNaN(l));
    const longitudes = stations.map(s => Number(s.lon || (s as any).location?.lon)).filter(l => !isNaN(l));

    return {
      minLat: latitudes.length > 0 ? Math.min(...latitudes) : 8,
      maxLat: latitudes.length > 0 ? Math.max(...latitudes) : 36,
      minLon: longitudes.length > 0 ? Math.min(...longitudes) : 68,
      maxLon: longitudes.length > 0 ? Math.max(...longitudes) : 97,
    };
  }, [stations]);

  // Project latitude/longitude onto a 1000x1000 viewBox coordinate system
  const getCoordinates = (lat: number, lon: number) => {
    const latRange = bounds.maxLat - bounds.minLat || 1;
    const lonRange = bounds.maxLon - bounds.minLon || 1;
    
    // Map to 150 to 850 range to leave padding around the SVG borders
    const x = ((lon - bounds.minLon) / lonRange) * 700 + 150;
    const y = (1 - (lat - bounds.minLat) / latRange) * 700 + 150;
    return { x, y };
  };

  const getStationColor = (station: EnrichedStation) => {
    const rawStatus = (station.status || "active").toLowerCase();
    if (rawStatus === "active") {
      return station.isOpen !== false ? "#22c55e" : "#94a3b8";
    }
    if (rawStatus === "maintenance") {
      return "#f59e0b";
    }
    return "#ef4444";
  };

  // Build grid network connection lines (mesh)
  const networkLines = useMemo(() => {
    if (!stations.length) return [];
    
    const coords = stations.map(s => {
      const lat = Number(s.lat || (s as any).location?.lat);
      const lon = Number(s.lon || (s as any).location?.lon);
      return { station: s, ...getCoordinates(lat, lon) };
    });

    const lines: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
    
    // Connect each station to its nearest 2 neighbor stations to simulate grid lines
    for (let i = 0; i < coords.length; i++) {
      const c1 = coords[i];
      if (isNaN(c1.x) || isNaN(c1.y)) continue;
      
      const targets = coords
        .map((c2, idx) => ({ idx, dist: Math.hypot(c2.x - c1.x, c2.y - c1.y) }))
        .filter(t => t.idx !== i)
        .sort((a, b) => a.dist - b.dist)
        .slice(0, 2);

      targets.forEach(t => {
        if (i < t.idx) {
          lines.push({
            x1: c1.x,
            y1: c1.y,
            x2: coords[t.idx].x,
            y2: coords[t.idx].y
          });
        }
      });
    }
    return lines;
  }, [stations, bounds]);

  // Center simulated map on selection changes
  useEffect(() => {
    if (selectedStationId && (authFailed || !isKeyConfigured)) {
      const selected = stations.find(s => s.id === selectedStationId);
      if (selected) {
        const lat = Number(selected.lat || (selected as any).location?.lat);
        const lon = Number(selected.lon || (selected as any).location?.lon);
        if (!isNaN(lat) && !isNaN(lon)) {
          const { x, y } = getCoordinates(lat, lon);
          setPan({ x: 500 - x * scale, y: 500 - y * scale });
        }
      }
    }
  }, [selectedStationId, authFailed, isKeyConfigured]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const zoomIn = () => setScale(prev => Math.min(prev + 0.25, 4));
  const zoomOut = () => setScale(prev => Math.max(prev - 0.25, 0.5));
  const resetZoom = () => {
    setScale(1);
    setPan({ x: 0, y: 0 });
  };

  const filteredSearchStations = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const query = searchQuery.toLowerCase();
    return stations.filter(s => 
      s.name.toLowerCase().includes(query) || 
      (s.address && s.address.toLowerCase().includes(query))
    ).slice(0, 5);
  }, [searchQuery, stations]);

  const handleSearchSelect = (station: EnrichedStation) => {
    onStationClick?.(station);
    const lat = Number(station.lat || (station as any).location?.lat);
    const lon = Number(station.lon || (station as any).location?.lon);
    if (!isNaN(lat) && !isNaN(lon)) {
      const { x, y } = getCoordinates(lat, lon);
      setScale(1.5);
      setPan({ x: 500 - x * 1.5, y: 500 - y * 1.5 });
    }
    setSearchQuery("");
  };

  // User location node coordinates for simulated map
  const userCoords = useMemo(() => {
    if (userLocation && userLocation.lat && userLocation.lon) {
      return getCoordinates(Number(userLocation.lat), Number(userLocation.lon));
    }
    return null;
  }, [userLocation, bounds]);

  // -------------------------------------------------------------
  // Google Maps SDK Initialization & Setup
  // -------------------------------------------------------------
  useEffect(() => {
    if (!isKeyConfigured || authFailed || !mapContainer.current) return;

    let isMounted = true;

    googleMapsLoader
      .load()
      .then(() => {
        if (!isMounted || !mapContainer.current || authFailed) return;

        // Default map options (Centered in India)
        const defaultCenter = { lat: 20.5937, lng: 78.9629 };
        const mapOptions: google.maps.MapOptions = {
          center: defaultCenter,
          zoom: 5,
          mapId: "e4a5d89fb6a4cf8", // Custom dark mode styled map
          disableDefaultUI: false,
          zoomControl: true,
          mapTypeControl: false,
          scaleControl: true,
          streetViewControl: false,
          rotateControl: false,
          fullscreenControl: true,
          gestureHandling: "cooperative",
        };

        map.current = new google.maps.Map(mapContainer.current, mapOptions);
        setMapLoaded(true);

        if (onMapLoad) {
          onMapLoad(map.current);
        }
      })
      .catch((err) => {
        console.error("Failed to load Google Maps SDK:", err);
      });

    return () => {
      isMounted = false;
    };
  }, [isKeyConfigured, authFailed]);

  // Handle Google Maps markers updating
  useEffect(() => {
    if (!map.current || !mapLoaded || authFailed) return;

    // 1. Clear old markers & clusters
    if (clustererRef.current) {
      clustererRef.current.clearMarkers();
    }
    markersRef.current.forEach((m) => (m.map = null));
    markersRef.current = [];

    if (activePopupRef.current) {
      activePopupRef.current.close();
    }

    const validStations = stations.filter((s) => {
      const lat = Number(s.lat || (s as any).location?.lat);
      const lon = Number(s.lon || (s as any).location?.lon);
      return !isNaN(lat) && !isNaN(lon);
    });

    const newMarkers: google.maps.marker.AdvancedMarkerElement[] = [];

    validStations.forEach((station) => {
      const lat = Number(station.lat || (station as any).location?.lat);
      const lon = Number(station.lon || (station as any).location?.lon);

      // Create Custom Glassmorphic DOM element for Marker pin
      const markerElement = document.createElement("div");
      markerElement.className = "station-marker-outer relative flex items-center justify-center w-8 h-8";

      const rawStatus = (station.status || "active").toLowerCase();
      const color = getStationColor(station);

      // Add pulsating ring behind marker if selected
      if (selectedStationId === station.id) {
        const pulse = document.createElement("div");
        pulse.className = "station-marker-pulse absolute rounded-full opacity-60";
        pulse.style.backgroundColor = color;
        markerElement.appendChild(pulse);
      }

      const pin = document.createElement("div");
      pin.className = "w-6 h-6 rounded-full border-2 border-slate-900 shadow-lg flex items-center justify-center relative z-10 transition-transform duration-300 hover:scale-125";
      pin.style.backgroundColor = color;
      
      // Mini lightning bolt icon inside the pin
      pin.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="w-3.5 h-3.5 text-slate-950">
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
        </svg>
      `;

      markerElement.appendChild(pin);

      const marker = new google.maps.marker.AdvancedMarkerElement({
        map: map.current,
        position: { lat, lng: lon },
        content: markerElement,
        title: station.name,
      });

      marker.addListener("gmp-click", () => {
        if (activePopupRef.current) {
          activePopupRef.current.close();
        }

        if (onStationClick) {
          onStationClick(station);
        }

        // Build HTML for connectors count inside info window
        let connectorsHtml = "";
        try {
          const connectorsList = station.connectors || [];
          connectorsHtml = connectorsList
            .map(
              (c: any) => `
              <span style="display: inline-flex; align-items: center; gap: 4px; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.1); padding: 2px 6px; border-radius: 6px; font-size: 10px;">
                ⚡ ${c.type || "Type 2"} (${c.power || "7.4"}kW)
              </span>
            `
            )
            .join(" ");
        } catch (e) {}

        const popupHtml = `
          <div class="p-2 space-y-2 min-w-[200px]" style="color: white; font-family: inherit;">
            <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px;">
              <h3 style="font-weight: 800; font-size: 14px; margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 140px;">${
                station.name
              }</h3>
              <span style="font-size: 12px; font-weight: bold; flex-shrink: 0;">⭐ ${
                station.rating || 0
              }</span>
            </div>
            <div style="display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px;">
              ${connectorsHtml}
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center; font-size: 11px; color: rgba(255,255,255,0.6); margin-top: 6px;">
              <span>📍 ${Number(station.distance || 0).toFixed(1)} km away</span>
            </div>
            <div style="margin-top: 6px;">
              ${
                station.isOpen
                  ? '<span style="display: inline-block; background: rgba(34,197,94,0.15); border: 1px solid rgba(34,197,94,0.3); color: #4ade80; font-size: 9px; font-weight: 800; text-transform: uppercase; padding: 2px 6px; border-radius: 9999px;">🟢 Open Now</span>'
                  : '<span style="display: inline-block; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: rgba(255,255,255,0.5); font-size: 9px; font-weight: 800; text-transform: uppercase; padding: 2px 6px; border-radius: 9999px;">🔴 Closed</span>'
              }
            </div>
            <button id="book-btn-${
              station.id
            }" style="width: 100%; margin-top: 8px; background: #6366f1; border: none; color: white; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; padding: 8px 12px; border-radius: 8px; cursor: pointer; transition: background 0.2s;">
              View & Book →
            </button>
          </div>
        `;

        const infoWindow = new google.maps.InfoWindow({
          content: popupHtml,
          maxWidth: 280,
        });

        infoWindow.open({
          anchor: marker,
          map: map.current,
        });

        activePopupRef.current = infoWindow;

        google.maps.event.addListener(infoWindow, "domready", () => {
          const btn = document.getElementById(`book-btn-${station.id}`);
          if (btn) {
            btn.addEventListener("click", () => {
              setLocation(`/station/${station.id}`);
            });
          }
        });

        map.current?.panTo({ lat, lng: lon });
        map.current?.setZoom(15);
      });

      newMarkers.push(marker);
    });

    markersRef.current = newMarkers;

    clustererRef.current = new MarkerClusterer({
      map: map.current,
      markers: newMarkers,
    });

    if (validStations.length > 0 && !hasZoomedToStations.current) {
      const boundsObj = new google.maps.LatLngBounds();
      validStations.forEach((s) => {
        const lat = Number(s.lat || (s as any).location?.lat);
        const lon = Number(s.lon || (s as any).location?.lon);
        boundsObj.extend({ lat, lng: lon });
      });
      map.current?.fitBounds(boundsObj);
      hasZoomedToStations.current = true;
    }
  }, [stations, mapLoaded, favouriteIds, authFailed]);

  // Update center when user location changes
  useEffect(() => {
    if (map.current && userLocation && mapLoaded && !authFailed) {
      const lat = Number(userLocation.lat);
      const lon = Number(userLocation.lon);

      if (!isNaN(lat) && !isNaN(lon)) {
        map.current.panTo({ lat, lng: lon });
        map.current.setZoom(13);

        if (userMarkerRef.current) {
          userMarkerRef.current.position = { lat, lng: lon };
        } else {
          const el = document.createElement("div");
          el.innerHTML =
            '<div class="w-4 h-4 bg-blue-500 rounded-full border-2 border-white shadow-[0_0_15px_rgba(59,130,246,0.5)] animate-pulse"></div>';

          userMarkerRef.current = new google.maps.marker.AdvancedMarkerElement({
            map: map.current,
            position: { lat, lng: lon },
            content: el,
            title: "Your Location",
          });
        }
      }
    }
  }, [userLocation, mapLoaded, authFailed]);

  // -------------------------------------------------------------
  // Render Simulated Fallback Map
  // -------------------------------------------------------------
  if (!isKeyConfigured || authFailed) {
    return (
      <div 
        className="w-full h-full min-h-[450px] relative flex flex-col bg-slate-950 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden" 
        data-testid="map-placeholder"
      >
        <style>{`
          @keyframes ripple {
            0% { r: 12px; opacity: 0.8; }
            100% { r: 35px; opacity: 0; }
          }
          .pulsing-ring {
            animation: ripple 2s infinite ease-out;
          }
          .grid-dot {
            transition: all 0.2s ease-in-out;
            cursor: pointer;
          }
          .grid-dot:hover {
            filter: drop-shadow(0 0 8px currentColor);
            r: 12px;
          }
        `}</style>

        {/* Top Header warning & info */}
        <div className="absolute top-4 left-4 z-20 flex flex-col gap-2 max-w-[80%] pointer-events-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900/95 backdrop-blur border border-amber-500/30 text-xs font-semibold text-slate-200 shadow-xl">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
            <span>{authFailed ? "Simulated Offline Map (API Restriction Active)" : "Simulated Network Grid (API Key Missing)"}</span>
          </div>
          <div className="text-[10px] text-slate-400 bg-slate-900/95 backdrop-blur px-3 py-2.5 rounded-xl border border-slate-800 shadow-lg leading-relaxed max-w-sm">
            {authFailed ? (
              <>
                <div className="font-semibold text-slate-200 mb-1">RefererNotAllowedMapError Detected</div>
                To restore Google Maps, authorize your local referrer URL <code>http://localhost:5000/*</code> under API Key restrictions in the Google Cloud Console. All administration controls below remain 100% functional.
              </>
            ) : (
              <>
                <div className="font-semibold text-slate-200 mb-1">Google Maps Missing</div>
                Configure a valid <code>VITE_GOOGLE_MAPS_API_KEY</code> in your <code>.env</code> file. Showing simulated node visualization in the meantime.
              </>
            )}
          </div>
        </div>

        {/* Search Panel overlay */}
        <div className="absolute top-4 right-4 z-20 w-72 pointer-events-auto">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
            <input
              type="text"
              placeholder="Search station in simulated grid..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-900/95 backdrop-blur border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 shadow-xl transition-all"
            />
            {filteredSearchStations.length > 0 && (
              <div className="absolute top-full mt-1 w-full bg-slate-900 border border-slate-800 rounded-xl shadow-2xl py-1 z-30 overflow-hidden">
                {filteredSearchStations.map((station) => (
                  <button
                    key={station.id}
                    onClick={() => handleSearchSelect(station)}
                    className="w-full text-left px-3 py-2 text-xs text-slate-300 hover:bg-slate-800 hover:text-white flex items-center justify-between border-b border-slate-800/50 last:border-0"
                  >
                    <span className="font-medium truncate mr-2">{station.name}</span>
                    <span 
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: getStationColor(station) }}
                    />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Canvas / SVG Map area */}
        <div className="flex-1 w-full h-full relative bg-slate-950/80">
          {/* Neon background grid decoration */}
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b_1px,transparent_1px),linear-gradient(to_bottom,#1e293b_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] opacity-35 pointer-events-none" />

          <svg 
            className={`w-full h-full ${isDragging ? "cursor-grabbing" : "cursor-grab"}`}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            viewBox="0 0 1000 1000"
          >
            <g transform={`translate(${pan.x}, ${pan.y}) scale(${scale})`}>
              {/* Grid Reference Lines */}
              <defs>
                <pattern id="grid" width="100" height="100" patternUnits="userSpaceOnUse">
                  <path d="M 100 0 L 0 0 0 100" fill="none" stroke="rgba(99,102,241,0.03)" strokeWidth="1" />
                </pattern>
              </defs>
              <rect width="2000" height="2000" x="-500" y="-500" fill="url(#grid)" pointerEvents="none" />

              {/* Station Network Connection Lines */}
              {networkLines.map((line, idx) => (
                <line
                  key={idx}
                  x1={line.x1}
                  y1={line.y1}
                  x2={line.x2}
                  y2={line.y2}
                  stroke="rgba(99,102,241,0.15)"
                  strokeWidth="1.5"
                  strokeDasharray="5 5"
                  pointerEvents="none"
                />
              ))}

              {/* User Location indicator */}
              {userCoords && !isNaN(userCoords.x) && !isNaN(userCoords.y) && (
                <g>
                  <circle
                    cx={userCoords.x}
                    cy={userCoords.y}
                    r={30}
                    fill="#3b82f6"
                    opacity={0.15}
                    className="animate-pulse"
                  />
                  <circle
                    cx={userCoords.x}
                    cy={userCoords.y}
                    r={8}
                    fill="#3b82f6"
                    stroke="#ffffff"
                    strokeWidth={2}
                  />
                  <text 
                    x={userCoords.x} 
                    y={userCoords.y - 14} 
                    fill="#3b82f6" 
                    fontSize="11" 
                    fontWeight="bold" 
                    textAnchor="middle"
                  >
                    You
                  </text>
                </g>
              )}

              {/* Station Nodes */}
              {stations.map((station) => {
                const lat = Number(station.lat || (station as any).location?.lat);
                const lon = Number(station.lon || (station as any).location?.lon);
                if (isNaN(lat) || isNaN(lon)) return null;

                const { x, y } = getCoordinates(lat, lon);
                const color = getStationColor(station);
                const isSelected = selectedStationId === station.id;

                return (
                  <g key={station.id}>
                    {/* Glowing outer pulse for selected station */}
                    {isSelected && (
                      <circle
                        cx={x}
                        cy={y}
                        className="pulsing-ring"
                        fill="none"
                        stroke={color}
                        strokeWidth={2}
                        style={{ transformOrigin: `${x}px ${y}px` }}
                      />
                    )}

                    {/* Active interactive station node */}
                    <circle
                      cx={x}
                      cy={y}
                      r={isSelected ? 10 : 7}
                      fill={color}
                      stroke="#0f172a"
                      strokeWidth={isSelected ? 2.5 : 1.5}
                      color={color}
                      className="grid-dot"
                      onClick={() => onStationClick?.(station)}
                      onMouseEnter={(e) => {
                        const rect = e.currentTarget.ownerSVGElement?.getBoundingClientRect();
                        if (rect) {
                          setTooltipPos({
                            x: e.clientX - rect.left + 15,
                            y: e.clientY - rect.top - 10
                          });
                        }
                        setHoveredStation(station);
                      }}
                      onMouseLeave={() => setHoveredStation(null)}
                    />

                    {/* Label tags for selected or hovered nodes */}
                    {(isSelected || hoveredStation?.id === station.id) && (
                      <text
                        x={x}
                        y={y - 16}
                        fill="#f8fafc"
                        fontSize="12"
                        fontWeight="semibold"
                        textAnchor="middle"
                        className="pointer-events-none"
                        style={{ filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.8))" }}
                      >
                        {station.name}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          </svg>

          {/* Floating dynamic tooltip */}
          {hoveredStation && (
            <div 
              className="absolute z-30 pointer-events-none bg-slate-900/95 border border-slate-800 rounded-xl p-3 shadow-2xl text-left max-w-[240px] backdrop-blur animate-in fade-in zoom-in-95 duration-100"
              style={{ left: `${tooltipPos.x}px`, top: `${tooltipPos.y}px` }}
            >
              <div className="flex justify-between items-start gap-2 mb-1.5">
                <span className="font-bold text-xs text-white truncate max-w-[150px]">{hoveredStation.name}</span>
                <span className="flex items-center gap-0.5 text-[10px] text-amber-400 font-semibold flex-shrink-0">
                  <Star className="w-2.5 h-2.5 fill-current" /> {hoveredStation.rating || "0"}
                </span>
              </div>
              
              <div className="space-y-1 text-[10px] text-slate-400">
                <p className="line-clamp-1">{hoveredStation.address}</p>
                <div className="flex items-center gap-1.5 mt-2">
                  <span 
                    className="w-1.5 h-1.5 rounded-full" 
                    style={{ backgroundColor: getStationColor(hoveredStation) }}
                  />
                  <span className="capitalize font-medium text-slate-300">
                    {(hoveredStation.status || "active").toLowerCase()} • {hoveredStation.isOpen ? "Open" : "Closed"}
                  </span>
                </div>
                {hoveredStation.connectors && hoveredStation.connectors.length > 0 && (
                  <div className="pt-1.5 border-t border-slate-800/80 flex flex-wrap gap-1 mt-1">
                    {hoveredStation.connectors.slice(0, 2).map((c: any, index) => (
                      <span key={index} className="px-1.5 py-0.5 rounded bg-slate-800/80 border border-slate-700/50 text-[9px] text-slate-300">
                        ⚡ {c.type || "Type 2"} ({c.power || "7.4"}kW)
                      </span>
                    ))}
                    {hoveredStation.connectors.length > 2 && (
                      <span className="px-1 py-0.5 rounded bg-indigo-950/50 border border-indigo-900/30 text-[8px] text-indigo-400">
                        +{hoveredStation.connectors.length - 2} more
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Legend Overlay at the bottom */}
        <div className="absolute bottom-4 left-4 z-20 flex gap-4 px-3 py-1.5 rounded-full bg-slate-900/90 backdrop-blur border border-slate-800/80 text-[10px] font-medium text-slate-300 shadow-xl pointer-events-none">
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-green-500" />
            <span>Open</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-slate-400" />
            <span>Closed</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            <span>Service</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-red-500" />
            <span>Offline</span>
          </div>
        </div>

        {/* Zoom Controls Overlay */}
        <div className="absolute bottom-4 right-4 z-20 flex flex-col gap-1 pointer-events-auto">
          <button 
            onClick={zoomIn}
            className="w-8 h-8 rounded-lg bg-slate-900/95 backdrop-blur border border-slate-800 flex items-center justify-center text-slate-300 hover:bg-slate-800 hover:text-white shadow-xl transition-all"
            title="Zoom In"
          >
            <Plus className="w-4 h-4" />
          </button>
          <button 
            onClick={zoomOut}
            className="w-8 h-8 rounded-lg bg-slate-900/95 backdrop-blur border border-slate-800 flex items-center justify-center text-slate-300 hover:bg-slate-800 hover:text-white shadow-xl transition-all"
            title="Zoom Out"
          >
            <Minus className="w-4 h-4" />
          </button>
          <button 
            onClick={resetZoom}
            className="w-8 h-8 rounded-lg bg-slate-900/95 backdrop-blur border border-slate-800 flex items-center justify-center text-slate-300 hover:bg-slate-800 hover:text-white shadow-xl transition-all"
            title="Reset Pan & Zoom"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div ref={mapContainer} className="w-full h-full relative" data-testid="map-container">
      <style>{`
        /* Google Maps custom styled info window */
        .gm-style-iw.gm-style-iw-c {
          background: rgba(10, 10, 10, 0.8) !important;
          backdrop-filter: blur(20px) !important;
          border: 1px solid rgba(255, 255, 255, 0.1) !important;
          border-radius: 16px !important;
          padding: 12px !important;
          box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5) !important;
        }
        .gm-style-iw-d {
          overflow: hidden !important;
        }
        .gm-style-iw-tc::after {
          background: rgba(10, 10, 10, 0.8) !important;
        }
        .gm-ui-hover-effect {
          top: 8px !important;
          right: 8px !important;
          color: white !important;
        }
        
        .station-marker-outer {
          cursor: pointer;
          transition: transform 0.2s;
        }
        .station-marker-outer:hover {
          transform: scale(1.1);
        }
        .station-marker-pulse {
          position: absolute;
          left: 50%;
          top: 50%;
          width: 40px;
          height: 40px;
          margin-left: -20px;
          margin-top: -20px;
          border-radius: 50%;
          opacity: 0;
          animation: marker-pulse 2s infinite cubic-bezier(0.4, 0, 0.6, 1);
          z-index: 1;
        }
        @keyframes marker-pulse {
          0% { transform: scale(0.5); opacity: 0.8; }
          100% { transform: scale(1.5); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
