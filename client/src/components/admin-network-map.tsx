import React, { useEffect, useRef, useState, useMemo } from "react";
import { googleMapsLoader } from "@/lib/google-maps-loader";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Zap, 
  Layers, 
  Activity,
  Plus,
  Minus,
  RotateCcw,
  Search,
  Wrench,
  Eye,
  Info
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Station, Booking } from "@shared/schema";

interface AdminNetworkMapProps {
  stations: Station[];
  bookings: Booking[];
  onForceMaintenance: (stationId: string) => void;
  onViewStation: (stationId: string) => void;
}

const STATUS_COLORS: Record<string, string> = {
  active: "#22c55e",      // Green
  pending: "#fbbf24",     // Yellow
  maintenance: "#f97316", // Orange
  rejected: "#ef4444",    // Red
};

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

export function AdminNetworkMap({
  stations,
  bookings,
  onForceMaintenance,
  onViewStation,
}: AdminNetworkMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<google.maps.Map | null>(null);
  const markers = useRef<Record<string, google.maps.marker.AdvancedMarkerElement>>({});
  const heatmapRef = useRef<any>(null);
  const activePopupRef = useRef<google.maps.InfoWindow | null>(null);
  
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);

  // Authentication configuration and subscription
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
  // Simulated Interactive Fallback States & Calculations
  // -------------------------------------------------------------
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [selectedStation, setSelectedStation] = useState<Station | null>(null);
  const [hoveredStation, setHoveredStation] = useState<Station | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  // Bounding box boundary calculations
  const bounds = useMemo(() => {
    const latitudes = stations.map(s => Number(s.lat)).filter(l => !isNaN(l));
    const longitudes = stations.map(s => Number(s.lon)).filter(l => !isNaN(l));

    return {
      minLat: latitudes.length > 0 ? Math.min(...latitudes) : 8,
      maxLat: latitudes.length > 0 ? Math.max(...latitudes) : 36,
      minLon: longitudes.length > 0 ? Math.min(...longitudes) : 68,
      maxLon: longitudes.length > 0 ? Math.max(...longitudes) : 97,
    };
  }, [stations]);

  // Project latitude/longitude onto 1000x1000 coordinate space
  const getCoordinates = (lat: number, lon: number) => {
    const latRange = bounds.maxLat - bounds.minLat || 1;
    const lonRange = bounds.maxLon - bounds.minLon || 1;
    const x = ((lon - bounds.minLon) / lonRange) * 700 + 150;
    const y = (1 - (lat - bounds.minLat) / latRange) * 700 + 150;
    return { x, y };
  };

  // Build grid network connection lines
  const networkLines = useMemo(() => {
    if (!stations.length) return [];
    
    const coords = stations.map(s => {
      const lat = Number(s.lat);
      const lon = Number(s.lon);
      return { station: s, ...getCoordinates(lat, lon) };
    });

    const lines: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
    
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

  // Filtering stations based on map filter status
  const visibleStations = useMemo(() => {
    return filterStatus 
      ? stations.filter(s => s.status === filterStatus)
      : stations;
  }, [stations, filterStatus]);

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
    setSelectedStation(null);
  };

  const handleNodeClick = (station: Station) => {
    setSelectedStation(station);
    const lat = Number(station.lat);
    const lon = Number(station.lon);
    if (!isNaN(lat) && !isNaN(lon)) {
      const { x, y } = getCoordinates(lat, lon);
      setScale(1.5);
      setPan({ x: 500 - x * 1.5, y: 500 - y * 1.5 });
    }
  };

  // -------------------------------------------------------------
  // Live Google Maps SDK Logic
  // -------------------------------------------------------------
  useEffect(() => {
    if (!isKeyConfigured || authFailed) return;
    if (!mapContainer.current || map.current) return;

    googleMapsLoader.load().then(() => {
      if (!mapContainer.current) return;

      map.current = new google.maps.Map(mapContainer.current, {
        center: { lat: 20.5937, lng: 78.9629 }, // India center
        zoom: 4.5,
        styles: darkMapStyle,
        mapId: "admin_network_map",
        disableDefaultUI: true,
        zoomControl: true,
      });

      setMapLoaded(true);
    }).catch((err) => {
      console.error("Failed to load Google Maps SDK:", err);
    });

    return () => {
      Object.values(markers.current).forEach((m) => (m.map = null));
      markers.current = {};
      if (heatmapRef.current) {
        heatmapRef.current.setMap(null);
      }
      if (activePopupRef.current) {
        activePopupRef.current.close();
      }
      map.current = null;
    };
  }, [isKeyConfigured, authFailed]);

  // Update Heatmap layer
  useEffect(() => {
    if (!map.current || !mapLoaded || authFailed) return;

    if (heatmapRef.current) {
      heatmapRef.current.setMap(null);
      heatmapRef.current = null;
    }

    if (showHeatmap) {
      const data = stations
        .filter(s => {
          const lat = Number(s.lat);
          const lon = Number(s.lon);
          return !isNaN(lat) && !isNaN(lon);
        })
        .map(station => {
          const stationBookings = bookings.filter(b => b.stationId === station.id).length;
          return {
            location: new google.maps.LatLng(Number(station.lat), Number(station.lon)),
            weight: stationBookings || 1
          };
        });

      heatmapRef.current = new (google.maps.visualization as any).HeatmapLayer({
        data,
        map: map.current,
        radius: 30,
        opacity: 0.8,
      });
    }
  }, [stations, bookings, showHeatmap, mapLoaded, authFailed]);

  // Update Markers
  useEffect(() => {
    if (!map.current || !mapLoaded || authFailed) return;

    const visibleIds = new Set(visibleStations.map(s => s.id));

    // Remove hidden markers
    Object.keys(markers.current).forEach(id => {
      if (!visibleIds.has(id)) {
        markers.current[id].map = null;
        delete markers.current[id];
      }
    });

    // Add/Update markers
    visibleStations.forEach(station => {
      if (markers.current[station.id]) return;

      const lat = Number(station.lat);
      const lon = Number(station.lon);
      if (isNaN(lat) || isNaN(lon)) return;

      const el = document.createElement("div");
      el.className = "group relative cursor-pointer";
      el.innerHTML = `
        <div class="flex items-center justify-center w-8 h-8 rounded-full border-2 border-white shadow-lg transform transition-transform hover:scale-125" style="background-color: ${STATUS_COLORS[station.status] || "#64748b"}">
          <svg viewBox="0 0 24 24" width="16" height="16" stroke="white" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round">
            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"></path>
          </svg>
        </div>
      `;

      const popupHtml = `
        <div class="p-3 min-w-[200px] bg-slate-900 text-white rounded-lg border border-slate-800 shadow-2xl" style="color: white; font-family: sans-serif;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <span style="font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; color: #94a3b8;">${station.status}</span>
            <div style="width: 8px; height: 8px; border-radius: 50%; background-color: ${STATUS_COLORS[station.status] || "#64748b"}"></div>
          </div>
          <h4 style="font-weight: 900; font-size: 14px; margin: 0 0 4px 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${station.name}</h4>
          <p style="font-size: 10px; color: #94a3b8; margin: 0 0 12px 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${station.address}</p>
          <div style="display: flex; gap: 8px; margin-top: 12px;">
            <button id="view-${station.id}" style="flex: 1; height: 32px; background: #1e293b; border: 1px solid rgba(255,255,255,0.1); color: white; border-radius: 6px; font-size: 9px; font-weight: bold; cursor: pointer; transition: background 0.2s;">VIEW FULL</button>
            <button id="maint-${station.id}" style="flex: 1; height: 32px; background: #ea580c; border: none; color: white; border-radius: 6px; font-size: 9px; font-weight: bold; cursor: pointer; transition: background 0.2s;">MAINTENANCE</button>
          </div>
        </div>
      `;

      const marker = new google.maps.marker.AdvancedMarkerElement({
        map: map.current,
        position: { lat, lng: lon },
        content: el,
        title: station.name,
      });

      marker.addListener("gmp-click", () => {
        if (activePopupRef.current) activePopupRef.current.close();

        const infoWindow = new google.maps.InfoWindow({
          content: popupHtml,
          maxWidth: 240,
        });

        infoWindow.open({
          anchor: marker,
          map: map.current,
        });

        activePopupRef.current = infoWindow;

        google.maps.event.addListener(infoWindow, "domready", () => {
          document.getElementById(`view-${station.id}`)?.addEventListener("click", () => {
            onViewStation(station.id);
            infoWindow.close();
          });
          document.getElementById(`maint-${station.id}`)?.addEventListener("click", () => {
            onForceMaintenance(station.id);
            infoWindow.close();
          });
        });
      });

      markers.current[station.id] = marker;
    });
  }, [stations, visibleStations, mapLoaded, authFailed]);

  return (
    <div className="relative w-full h-[600px] rounded-2xl overflow-hidden shadow-inner border border-slate-800 bg-slate-950">
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

      {/* Render google maps or simulated map */}
      {isKeyConfigured && !authFailed ? (
        <div ref={mapContainer} className="absolute inset-0" />
      ) : (
        <div className="absolute inset-0 w-full h-full bg-slate-950/80">
          {/* Simulated grid lines */}
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b_1px,transparent_1px),linear-gradient(to_bottom,#1e293b_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] opacity-35 pointer-events-none" />

          {/* Alert Header warning */}
          <div className="absolute top-4 left-[280px] z-20 flex flex-col gap-1 max-w-[50%] pointer-events-none">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900/95 backdrop-blur border border-amber-500/30 text-[10px] font-semibold text-slate-200 shadow-xl">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              <span>{authFailed ? "Simulated Grid Active (API Restriction)" : "Simulated Grid (API Key Missing)"}</span>
            </div>
          </div>

          <svg
            className={cn("w-full h-full", isDragging ? "cursor-grabbing" : "cursor-grab")}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            viewBox="0 0 1000 1000"
          >
            <g transform={`translate(${pan.x}, ${pan.y}) scale(${scale})`}>
              {/* Mesh background grid pattern */}
              <defs>
                <pattern id="admin-grid" width="100" height="100" patternUnits="userSpaceOnUse">
                  <path d="M 100 0 L 0 0 0 100" fill="none" stroke="rgba(99,102,241,0.03)" strokeWidth="1" />
                </pattern>
              </defs>
              <rect width="2000" height="2000" x="-500" y="-500" fill="url(#admin-grid)" pointerEvents="none" />

              {/* simulated physical connections */}
              {networkLines.map((line, idx) => (
                <line
                  key={idx}
                  x1={line.x1}
                  y1={line.y1}
                  x2={line.x2}
                  y2={line.y2}
                  stroke="rgba(99,102,241,0.12)"
                  strokeWidth="1.5"
                  strokeDasharray="4 4"
                  pointerEvents="none"
                />
              ))}

              {/* Density heat maps underneath nodes */}
              {showHeatmap && visibleStations.map((station) => {
                const lat = Number(station.lat);
                const lon = Number(station.lon);
                if (isNaN(lat) || isNaN(lon)) return null;

                const { x, y } = getCoordinates(lat, lon);
                const stationBookings = bookings.filter(b => b.stationId === station.id).length;
                const weightRadius = 15 + Math.min(stationBookings * 5, 45);

                return (
                  <circle
                    key={`heat-${station.id}`}
                    cx={x}
                    cy={y}
                    r={weightRadius}
                    fill="url(#heatGradient)"
                    opacity={0.3}
                    pointerEvents="none"
                  />
                );
              })}

              <defs>
                <radialGradient id="heatGradient">
                  <stop offset="0%" stopColor="#818cf8" stopOpacity="1" />
                  <stop offset="100%" stopColor="#818cf8" stopOpacity="0" />
                </radialGradient>
              </defs>

              {/* Station Nodes */}
              {visibleStations.map((station) => {
                const lat = Number(station.lat);
                const lon = Number(station.lon);
                if (isNaN(lat) || isNaN(lon)) return null;

                const { x, y } = getCoordinates(lat, lon);
                const color = STATUS_COLORS[station.status] || "#64748b";
                const isSelected = selectedStation?.id === station.id;

                return (
                  <g key={station.id}>
                    {isSelected && (
                      <circle
                        cx={x}
                        cy={y}
                        className="pulsing-ring"
                        fill="none"
                        stroke={color}
                        strokeWidth={2.5}
                        style={{ transformOrigin: `${x}px ${y}px` }}
                      />
                    )}

                    <circle
                      cx={x}
                      cy={y}
                      r={isSelected ? 10 : 7}
                      fill={color}
                      stroke="#0f172a"
                      strokeWidth={isSelected ? 2.5 : 1.5}
                      color={color}
                      className="grid-dot"
                      onClick={() => handleNodeClick(station)}
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

                    {(isSelected || hoveredStation?.id === station.id) && (
                      <text
                        x={x}
                        y={y - 16}
                        fill="#f8fafc"
                        fontSize="11"
                        fontWeight="semibold"
                        textAnchor="middle"
                        className="pointer-events-none"
                        style={{ filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.85))" }}
                      >
                        {station.name}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          </svg>

          {/* Simulated node popover / card */}
          {selectedStation && (
            <div className="absolute top-4 right-4 z-20 w-64 bg-slate-900 border border-slate-800 rounded-xl p-3 shadow-2xl animate-in fade-in slide-in-from-top-4 duration-200">
              <div className="flex justify-between items-center mb-1">
                <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">
                  {selectedStation.status}
                </span>
                <button 
                  onClick={() => setSelectedStation(null)}
                  className="text-slate-500 hover:text-slate-300 text-xs px-1.5 py-0.5 rounded bg-slate-800"
                >
                  ✕
                </button>
              </div>
              <h4 className="font-bold text-xs text-white truncate mb-1">{selectedStation.name}</h4>
              <p className="text-[10px] text-slate-400 truncate mb-3">{selectedStation.address}</p>
              
              <div className="flex gap-2">
                <Button 
                  size="sm" 
                  variant="outline"
                  className="flex-1 h-7 text-[10px] font-bold border-slate-700 bg-slate-800 text-slate-300 hover:text-white"
                  onClick={() => {
                    onViewStation(selectedStation.id);
                    setSelectedStation(null);
                  }}
                >
                  <Eye className="w-3 h-3 mr-1" /> View Full
                </Button>
                <Button 
                  size="sm" 
                  className="flex-1 h-7 text-[10px] font-bold bg-orange-600 hover:bg-orange-700 text-white border-0"
                  onClick={() => {
                    onForceMaintenance(selectedStation.id);
                    setSelectedStation(null);
                  }}
                >
                  <Wrench className="w-3 h-3 mr-1" /> Maintenance
                </Button>
              </div>
            </div>
          )}

          {/* Node Hover Tooltip */}
          {hoveredStation && !selectedStation && (
            <div 
              className="absolute z-30 pointer-events-none bg-slate-900/95 border border-slate-800 rounded-xl p-2.5 shadow-2xl text-left max-w-[200px] backdrop-blur animate-in fade-in duration-100"
              style={{ left: `${tooltipPos.x}px`, top: `${tooltipPos.y}px` }}
            >
              <span className="font-bold text-xs text-white truncate block">{hoveredStation.name}</span>
              <span className="text-[9px] text-slate-400 truncate block mt-0.5">{hoveredStation.address}</span>
              <div className="flex items-center gap-1.5 mt-2">
                <span 
                  className="w-1.5 h-1.5 rounded-full" 
                  style={{ backgroundColor: STATUS_COLORS[hoveredStation.status] || "#64748b" }}
                />
                <span className="capitalize text-[9px] text-slate-300 font-medium">
                  {hoveredStation.status} • {bookings.filter(b => b.stationId === hoveredStation.id).length} bookings
                </span>
              </div>
            </div>
          )}

          {/* Zoom controls for simulated map */}
          <div className="absolute bottom-4 right-4 z-20 flex flex-col gap-1 pointer-events-auto">
            <button 
              onClick={zoomIn}
              className="w-7 h-7 rounded bg-slate-900/95 border border-slate-800 flex items-center justify-center text-slate-300 hover:bg-slate-800 hover:text-white shadow-xl transition-all"
              title="Zoom In"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
            <button 
              onClick={zoomOut}
              className="w-7 h-7 rounded bg-slate-900/95 border border-slate-800 flex items-center justify-center text-slate-300 hover:bg-slate-800 hover:text-white shadow-xl transition-all"
              title="Zoom Out"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <button 
              onClick={resetZoom}
              className="w-7 h-7 rounded bg-slate-900/95 border border-slate-800 flex items-center justify-center text-slate-300 hover:bg-slate-800 hover:text-white shadow-xl transition-all"
              title="Reset"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Floating Control Panel */}
      <div className="absolute top-4 left-4 z-10 flex flex-col gap-2 pointer-events-auto">
        <Card className="w-64 glass-card border-none shadow-2xl overflow-hidden p-0">
          <div className="bg-slate-900/80 p-3 px-4 flex items-center justify-between">
             <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-primary" />
                <h3 className="text-xs font-black text-white uppercase tracking-wider">Map Controls</h3>
             </div>
             <Badge variant="outline" className="bg-slate-800 text-[9px] border-slate-700 text-slate-400">v1.2</Badge>
          </div>
          <CardContent className="p-4 space-y-4">
             <div className="space-y-2">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Visibility Layers</p>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className={cn(
                    "w-full justify-between h-9 rounded-xl px-3 transition-all",
                    showHeatmap ? "bg-primary/10 text-primary hover:bg-primary/20" : "hover:bg-slate-100"
                  )}
                  onClick={() => setShowHeatmap(!showHeatmap)}
                >
                  <span className="flex items-center gap-2 text-xs font-bold">
                    <Activity className="w-3.5 h-3.5" /> Booking Density
                  </span>
                  <Badge variant={showHeatmap ? "default" : "outline"} className="text-[8px] h-4">
                    {showHeatmap ? "ON" : "OFF"}
                  </Badge>
                </Button>
             </div>

             <div className="space-y-2">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Network Filter</p>
                <div className="grid grid-cols-2 gap-1.5">
                   {[
                     { id: 'active', label: 'Active', color: 'bg-emerald-500' },
                     { id: 'pending', label: 'Pending', color: 'bg-amber-500' },
                     { id: 'maintenance', label: 'Maint.', color: 'bg-orange-500' },
                     { id: null, label: 'All', color: 'bg-slate-400' }
                   ].map(status => (
                     <button
                       key={status.id ?? 'all'}
                       onClick={() => setFilterStatus(status.id)}
                       className={cn(
                         "flex items-center gap-2 p-2 px-3 rounded-lg border text-[10px] font-bold transition-all",
                         filterStatus === status.id 
                           ? "bg-slate-900 text-white border-slate-900 shadow-lg" 
                           : "bg-white border-slate-100 hover:border-slate-300"
                       )}
                     >
                       <div className={cn("w-1.5 h-1.5 rounded-full", status.color)}></div>
                       {status.label}
                     </button>
                   ))}
                </div>
             </div>
          </CardContent>
        </Card>

        {/* Stats Overlay */}
        <div className="flex gap-2">
          <div className="bg-slate-900/90 text-white p-2 px-4 rounded-xl flex items-center gap-3 backdrop-blur-md shadow-xl border border-slate-800">
            <Zap className="w-3.5 h-3.5 text-primary" />
            <div className="border-l border-slate-700 pl-3">
              <p className="text-[9px] font-black text-slate-400 uppercase leading-none">Fleet Size</p>
              <p className="text-sm font-black">{stations.length} Units</p>
            </div>
          </div>
          <div className="bg-slate-900/90 text-white p-2 px-4 rounded-xl flex items-center gap-3 backdrop-blur-md shadow-xl border border-slate-800">
            <Activity className="w-3.5 h-3.5 text-emerald-400" />
            <div className="border-l border-slate-700 pl-3">
              <p className="text-[9px] font-black text-slate-400 uppercase leading-none">Utilization</p>
              <p className="text-sm font-black">24.2%</p>
            </div>
          </div>
        </div>
      </div>

      {/* Legend & Info Tooltip */}
      <div className="absolute bottom-4 right-[140px] z-10">
        <div className="bg-slate-900/80 p-2 px-3 rounded-lg backdrop-blur-md border border-slate-800 text-[9px] font-bold text-slate-400 flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-emerald-500"></div> Active
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-amber-500"></div> Pending
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-orange-500"></div> Maint.
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-rose-500"></div> Rejected
          </div>
        </div>
      </div>

      <style>{`
        /* Google Maps InfoWindow customization in Admin Map */
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
      `}</style>
    </div>
  );
}
