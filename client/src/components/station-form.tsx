import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Plus, X, Upload, QrCode, Zap, Info, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import {
  createStation,
  updateStation,
  type Station,
  type Connector,
} from "@/lib/owner-service";
import { cn } from "@/lib/utils";
import { googleMapsLoader } from "@/lib/google-maps-loader";

interface StationFormProps {
  initialData?: Station;
  onClose: () => void;
}

const AMENITIES = [
  { id: "wifi", label: "WiFi", icon: "📶" },
  { id: "parking", label: "Parking", icon: "🅿️" },
  { id: "restrooms", label: "Restrooms", icon: "🚻" },
  { id: "cafe", label: "Cafe/Food", icon: "☕" },
  { id: "cctv", label: "CCTV", icon: "📹" },
  { id: "covered", label: "Covered", icon: "🏠" },
  { id: "ev_shop", label: "EV Shop", icon: "🔧" },
  { id: "waiting", label: "Waiting Area", icon: "🪑" },
  { id: "accessible", label: "Accessible", icon: "♿" },
];

const DEFAULT_PRICING = { 
  baseRate: 10, 
  peakRate: 15, 
  peakStart: "18:00", 
  peakEnd: "21:00", 
  weekendRate: 12 
};

export default function StationForm({ initialData, onClose }: StationFormProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [qrUploading, setQrUploading] = useState(false);

  const [formData, setFormData] = useState({
    name: initialData?.name || "",
    description: initialData?.description || "",
    address: initialData?.address || "",
    lat: initialData?.lat || (initialData as any)?.location?.lat || 37.7749,
    lon: initialData?.lon || (initialData as any)?.location?.lon || -122.4194,
    openHours: initialData?.operatingHours?.open || "08:00",
    closeHours: initialData?.operatingHours?.close || "20:00",
    connectors: (initialData?.connectors?.map(c => ({
      ...c,
      pricing: c.pricing || { baseRate: 10, peakRate: 15, peakStart: "18:00", peakEnd: "21:00", weekendRate: 12 }
    })) || [
      { 
        id: `conn-${Date.now()}`,
        type: "CCS", 
        powerKw: 150, 
        count: 2, 
        available: true,
        pricePerKwh: 12.0, 
        pricing: { baseRate: 12, peakRate: 18, peakStart: "18:00", peakEnd: "21:00", weekendRate: 15 } 
      },
    ]) as Connector[],
    images: initialData?.images || [] as string[],
    upiId: (initialData as any)?.upiId || "",
    upiQrUrl: (initialData as any)?.upiQrUrl || "",
    amenities: initialData?.amenities || [] as string[],
  });

  const addressInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (googleMapsLoader as any).load().then(() => {
      if (!addressInputRef.current) return;
      
      const autocomplete = new google.maps.places.Autocomplete(addressInputRef.current, {
        fields: ["formatted_address", "geometry"],
      });

      autocomplete.addListener("place_changed", () => {
        const place = autocomplete.getPlace();
        const lat = place.geometry?.location?.lat();
        const lon = place.geometry?.location?.lng();
        if (lat !== undefined && lon !== undefined) {
          setFormData((prev) => ({
            ...prev,
            address: place.formatted_address || prev.address,
            lat,
            lon,
          }));
        }
      });
    }).catch((err: any) => {
      console.error("Failed to load Google Maps SDK for Places Autocomplete:", err);
    });
  }, []);

  const getLivePricePreview = (pricing: any) => {
    if (!pricing) return "Configure pricing below";
    const now = new Date();
    const currentHour = now.getHours() + ":" + String(now.getMinutes()).padStart(2, "0");
    const isWeekend = [0, 6].includes(now.getDay());
    const isPeak = currentHour >= pricing.peakStart && currentHour <= pricing.peakEnd;

    let rate = pricing.baseRate;
    let label = "off-peak";

    if (isPeak) {
      rate = pricing.peakRate;
      label = "peak hours";
    } else if (isWeekend) {
      rate = pricing.weekendRate;
      label = "weekend rate";
    }

    return `Now: ₹${rate.toFixed(2)}/kWh (${label})`;
  };

  const toggleAmenity = (id: string) => {
    setFormData(prev => ({
      ...prev,
      amenities: prev.amenities.includes(id)
        ? prev.amenities.filter(a => a !== id)
        : [...prev.amenities, id]
    }));
  };

  const handleAddConnector = () => {
    setFormData({
      ...formData,
      connectors: [
        ...formData.connectors,
        { 
          id: `conn-${Date.now()}`,
          type: "Type 2", 
          powerKw: 50, 
          count: 1, 
          available: true,
          pricePerKwh: 10.0,
          pricing: { baseRate: 10, peakRate: 15, peakStart: "18:00", peakEnd: "21:00", weekendRate: 12 }
        },
      ],
    });
  };

  const handleRemoveConnector = (index: number) => {
    setFormData({
      ...formData,
      connectors: formData.connectors.filter((_, i) => i !== index),
    });
  };

  const readAsDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const handleUploadImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const dataUrl = await readAsDataUrl(file);
      setFormData(prev => ({ ...prev, images: [...prev.images, dataUrl] }));
      toast({ title: "✅ Image added!" });
    } catch {
      toast({ variant: "destructive", title: "Failed to read image" });
    } finally {
      setUploading(false);
    }
  };

  const handleQrUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setQrUploading(true);
    try {
      const dataUrl = await readAsDataUrl(file);
      setFormData(prev => ({ ...prev, upiQrUrl: dataUrl }));
      toast({ title: "✅ UPI QR Code added!" });
    } catch {
      toast({ variant: "destructive", title: "Failed to read QR image" });
    } finally {
      setQrUploading(false);
    }
  };

  const handleRemoveImage = (index: number) => {
    setFormData({
      ...formData,
      images: formData.images.filter((_, i) => i !== index),
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user || !formData.name || !formData.address) {
      toast({ variant: "destructive", title: "Error", description: "Please fill in required fields" });
      return;
    }

    if (isNaN(formData.lat) || isNaN(formData.lon)) {
      toast({ variant: "destructive", title: "Validation Error", description: "Latitude and longitude must be valid numbers" });
      return;
    }

    // Validation
    for (const conn of formData.connectors) {
      if (conn.pricing) {
        if (conn.pricing.peakRate < conn.pricing.baseRate) {
          toast({ variant: "destructive", title: "Validation Error", description: `Connector ${conn.type}: Peak rate must be >= base rate.` });
          return;
        }
        if (conn.pricing.weekendRate <= 0) {
          toast({ variant: "destructive", title: "Validation Error", description: `Connector ${conn.type}: Weekend rate must be > 0.` });
          return;
        }
      }
    }

    setLoading(true);
    try {
      const stationData = {
        name: formData.name,
        description: formData.description,
        address: formData.address,
        lat: formData.lat,
        lon: formData.lon,
        connectors: formData.connectors,
        images: formData.images,
        operatingHours: { open: formData.openHours, close: formData.closeHours },
        upiId: formData.upiId,
        upiQrUrl: formData.upiQrUrl,
        amenities: formData.amenities,
      };

      if (initialData) {
        await updateStation(initialData.id, stationData);
        toast({ title: "Success", description: "Station updated successfully" });
      } else {
        await createStation(user.uid, stationData);
        toast({ title: "Success", description: "Station created successfully" });
      }
      onClose();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">
          {initialData ? "Edit Station" : "Add New Station"}
        </h2>
        <Button type="button" variant="ghost" size="icon" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* Basic Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label>Station Name *</Label>
          <Input
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="Downtown Charging Hub"
            disabled={loading}
          />
        </div>
        <div>
          <Label>Address *</Label>
          <Input
            ref={addressInputRef}
            value={formData.address}
            onChange={(e) => setFormData({ ...formData, address: e.target.value })}
            placeholder="123 Main St, City"
            disabled={loading}
          />
        </div>
      </div>

      <div>
        <Label>Description</Label>
        <Textarea
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          placeholder="Describe your charging station..."
          disabled={loading}
        />
      </div>

      {/* Amenities Section */}
      <div className="space-y-3">
        <Label className="text-base font-semibold">Available Amenities at this Station</Label>
        <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-9 gap-2">
          {AMENITIES.map((amenity) => {
            const isSelected = formData.amenities.includes(amenity.id);
            return (
              <button
                key={amenity.id}
                type="button"
                onClick={() => toggleAmenity(amenity.id)}
                className={cn(
                  "flex flex-col items-center justify-center p-2 rounded-xl border transition-all gap-1",
                  isSelected 
                    ? "bg-primary border-primary text-white shadow-lg shadow-primary/20 scale-105" 
                    : "bg-background border-border text-muted-foreground hover:bg-muted"
                )}
              >
                <span className="text-lg">{amenity.icon}</span>
                <span className="text-[10px] font-bold uppercase tracking-tighter">{amenity.label}</span>
                {isSelected && <Check className="w-2 h-2 absolute top-1 right-1" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* Location */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Latitude</Label>
          <Input
            type="number"
            step="0.0001"
            value={formData.lat}
            onChange={(e) => setFormData({ ...formData, lat: parseFloat(e.target.value) })}
            disabled={loading}
          />
        </div>
        <div>
          <Label>Longitude</Label>
          <Input
            type="number"
            step="0.0001"
            value={formData.lon}
            onChange={(e) => setFormData({ ...formData, lon: parseFloat(e.target.value) })}
            disabled={loading}
          />
        </div>
      </div>

      {/* Hours */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Opening Time</Label>
          <Input
            type="time"
            value={formData.openHours}
            onChange={(e) => setFormData({ ...formData, openHours: e.target.value })}
            disabled={loading}
          />
        </div>
        <div>
          <Label>Closing Time</Label>
          <Input
            type="time"
            value={formData.closeHours}
            onChange={(e) => setFormData({ ...formData, closeHours: e.target.value })}
            disabled={loading}
          />
        </div>
      </div>

      {/* Connectors */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Label className="text-base font-semibold">Connectors & Infrastructure</Label>
          <Button type="button" variant="outline" size="sm" onClick={handleAddConnector} className="gap-2">
            <Plus className="w-4 h-4" /> Add Connector
          </Button>
        </div>
        <div className="space-y-4">
          {formData.connectors.map((connector, idx) => (
            <Card key={idx} className="p-5 border-2 border-muted hover:border-primary/20 transition-all">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                <div>
                  <Label className="text-xs font-bold uppercase text-muted-foreground">Type</Label>
                  <select
                    value={connector.type}
                    onChange={(e) => {
                      const newConnectors = [...formData.connectors];
                      newConnectors[idx] = { ...newConnectors[idx], type: e.target.value as any };
                      setFormData({ ...formData, connectors: newConnectors });
                    }}
                    className="w-full text-sm h-10 px-3 border rounded-lg bg-background"
                    disabled={loading}
                  >
                    <option>CCS</option>
                    <option>Type 2</option>
                    <option>CHAdeMO</option>
                    <option>Tesla Supercharger</option>
                  </select>
                </div>
                <div>
                  <Label className="text-xs font-bold uppercase text-muted-foreground">Power (kW)</Label>
                  <Input
                    type="number"
                    value={connector.powerKw}
                    onChange={(e) => {
                      const newConnectors = [...formData.connectors];
                      newConnectors[idx] = { ...newConnectors[idx], powerKw: parseFloat(e.target.value) };
                      setFormData({ ...formData, connectors: newConnectors });
                    }}
                    disabled={loading}
                  />
                </div>
                <div>
                  <Label className="text-xs font-bold uppercase text-muted-foreground">Total Units</Label>
                  <Input
                    type="number"
                    value={connector.count}
                    onChange={(e) => {
                      const newConnectors = [...formData.connectors];
                      newConnectors[idx] = { ...newConnectors[idx], count: parseInt(e.target.value) };
                      setFormData({ ...formData, connectors: newConnectors });
                    }}
                    disabled={loading}
                  />
                </div>
                <div className="flex items-end">
                  <Button type="button" variant="destructive" size="icon" onClick={() => handleRemoveConnector(idx)} disabled={loading} className="mb-0.5">
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* Detailed Pricing Expansion */}
              <div className="bg-primary/5 rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2 text-primary">
                   <Zap className="w-4 h-4" />
                   <Label className="font-bold text-sm">💰 Pricing for {connector.type} Connector #{idx + 1}</Label>
                </div>
                
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                   <div className="space-y-1">
                      <Label className="text-[10px] font-black uppercase opacity-60">Base (₹/kWh)</Label>
                      <Input type="number" step="0.1" value={connector.pricing?.baseRate ?? DEFAULT_PRICING.baseRate} onChange={e => {
                        const newConnectors = [...formData.connectors];
                        newConnectors[idx].pricing = { ...(newConnectors[idx].pricing || DEFAULT_PRICING), baseRate: parseFloat(e.target.value) };
                        setFormData({ ...formData, connectors: newConnectors });
                      }} />
                   </div>
                   <div className="space-y-1">
                      <Label className="text-[10px] font-black uppercase opacity-60">Peak (₹/kWh)</Label>
                      <Input type="number" step="0.1" value={connector.pricing?.peakRate ?? DEFAULT_PRICING.peakRate} onChange={e => {
                        const newConnectors = [...formData.connectors];
                        newConnectors[idx].pricing = { ...(newConnectors[idx].pricing || DEFAULT_PRICING), peakRate: parseFloat(e.target.value) };
                        setFormData({ ...formData, connectors: newConnectors });
                      }} />
                   </div>
                   <div className="space-y-1">
                      <Label className="text-[10px] font-black uppercase opacity-60">Peak Start</Label>
                      <Input type="time" value={connector.pricing?.peakStart ?? DEFAULT_PRICING.peakStart} onChange={e => {
                        const newConnectors = [...formData.connectors];
                        newConnectors[idx].pricing = { ...(newConnectors[idx].pricing || DEFAULT_PRICING), peakStart: e.target.value };
                        setFormData({ ...formData, connectors: newConnectors });
                      }} />
                   </div>
                   <div className="space-y-1">
                      <Label className="text-[10px] font-black uppercase opacity-60">Peak End</Label>
                      <Input type="time" value={connector.pricing?.peakEnd ?? DEFAULT_PRICING.peakEnd} onChange={e => {
                        const newConnectors = [...formData.connectors];
                        newConnectors[idx].pricing = { ...(newConnectors[idx].pricing || DEFAULT_PRICING), peakEnd: e.target.value };
                        setFormData({ ...formData, connectors: newConnectors });
                      }} />
                   </div>
                   <div className="space-y-1">
                      <Label className="text-[10px] font-black uppercase opacity-60">Weekend (₹/kWh)</Label>
                      <Input type="number" step="0.1" value={connector.pricing?.weekendRate ?? DEFAULT_PRICING.weekendRate} onChange={e => {
                        const newConnectors = [...formData.connectors];
                        newConnectors[idx].pricing = { ...(newConnectors[idx].pricing || DEFAULT_PRICING), weekendRate: parseFloat(e.target.value) };
                        setFormData({ ...formData, connectors: newConnectors });
                      }} />
                   </div>
                </div>

                <div className="flex items-center gap-2 pt-2 text-xs font-medium text-primary bg-background/50 rounded px-2 py-1">
                   <Info className="w-3 h-3" />
                   <span>Live Preview: </span>
                   <span className="font-bold">{getLivePricePreview(connector.pricing)}</span>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* UPI Payment Section */}
      <div className="border border-dashed rounded-xl p-5 space-y-4 bg-muted/20">
        <div className="flex items-center gap-2">
          <QrCode className="w-5 h-5 text-primary" />
          <Label className="text-base font-bold">UPI Payment QR (Optional)</Label>
        </div>
        <div className="flex flex-col sm:flex-row gap-6 items-start">
          <div className="w-40 h-40 border-2 border-dashed rounded-2xl flex items-center justify-center bg-background overflow-hidden relative group">
            {formData.upiQrUrl ? (
              <img src={formData.upiQrUrl} alt="UPI QR" className="w-full h-full object-contain p-2" />
            ) : (
              <div className="text-center opacity-40">
                <QrCode className="w-8 h-8 mx-auto mb-2" />
                <span className="text-[10px] font-bold uppercase tracking-widest">No QR Image</span>
              </div>
            )}
            {qrUploading && (
              <div className="absolute inset-0 bg-background/80 flex items-center justify-center">
                <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </div>
          <div className="flex-1 space-y-4">
            <div className="space-y-1">
              <Label className="text-xs font-bold uppercase opacity-60">Virtual Payment Address (VPA)</Label>
              <Input
                placeholder="yourbusiness@upi"
                value={formData.upiId}
                onChange={e => setFormData(prev => ({ ...prev, upiId: e.target.value }))}
              />
            </div>
            <label className="flex items-center gap-2 px-4 py-2 border rounded-xl cursor-pointer text-sm font-bold bg-background hover:bg-muted transition-all w-fit">
              <Upload className="w-4 h-4" />
              <span>{formData.upiQrUrl ? "Replace QR" : "Upload QR"}</span>
              <input type="file" accept="image/*" className="hidden" onChange={handleQrUpload} disabled={qrUploading} />
            </label>
          </div>
        </div>
      </div>

      {/* Images */}
      <div>
        <Label className="text-base font-bold">Station Showcase Images</Label>
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-3">
          {formData.images.map((image, idx) => (
            <div key={idx} className="relative aspect-square rounded-xl overflow-hidden border group">
              <img src={image} alt="Station" className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => handleRemoveImage(idx)}
                className="absolute top-1 right-1 p-1 bg-destructive text-destructive-foreground rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
          <label className="flex flex-col items-center justify-center aspect-square border-2 border-dashed rounded-xl cursor-pointer hover:bg-muted transition-all">
            <Upload className="w-6 h-6 mb-2 text-muted-foreground opacity-40" />
            <span className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest text-center px-2">Add Cover Photo</span>
            <input type="file" accept="image/*" onChange={handleUploadImage} disabled={loading || uploading} className="hidden" />
          </label>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-4 pt-6 border-t font-bold uppercase tracking-widest text-xs">
        <Button
          type="submit"
          className="flex-1 h-12 rounded-2xl shadow-xl shadow-primary/20"
          disabled={loading || uploading}
        >
          {loading ? "Syncing..." : "Save Station Profile"}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="flex-1 h-12 rounded-2xl"
          onClick={onClose}
          disabled={loading}
        >
          Abort Changes
        </Button>
      </div>
    </form>
  );
}
