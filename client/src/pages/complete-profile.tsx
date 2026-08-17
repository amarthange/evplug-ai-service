import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Zap, Camera, ArrowRight, ArrowLeft, Check, Plus, Upload } from "lucide-react";
import { doc, updateDoc, getDoc, collection, addDoc, serverTimestamp } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { updateProfile } from "firebase/auth";
import { db, storage, auth } from "@/lib/firebase";

const TOTAL_STEPS = 3;

interface OnboardingData {
  fullName: string;
  phoneNumber: string;
  photoURL: string | null;
  vehicleBrand: string;
  vehicleModel: string;
  vehicleRegistrationNumber: string;
  preferredConnectorType: string;
  batteryCapacityKWh: number;
  defaultCity: string;
  searchRadius: number;
  notifications: {
    bookingConfirmations: boolean;
    sessionReminders: boolean;
    weeklySummary: boolean;
    priceDropAlerts: boolean;
  };
}

export default function CompleteProfile() {
  const [, setLocation] = useLocation();
  const { user, userRole, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [currentStep, setCurrentStep] = useState(1);
  const [showWelcome, setShowWelcome] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const [formData, setFormData] = useState<OnboardingData>({
    fullName: "",
    phoneNumber: "",
    photoURL: null,
    vehicleBrand: "",
    vehicleModel: "",
    vehicleRegistrationNumber: "",
    preferredConnectorType: "CCS",
    batteryCapacityKWh: 60,
    defaultCity: "",
    searchRadius: 10,
    notifications: {
      bookingConfirmations: true,
      sessionReminders: true,
      weeklySummary: false,
      priceDropAlerts: false,
    },
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    const checkProfile = async () => {
      if (authLoading) return;
      if (!user) {
        setLocation("/auth");
        return;
      }
      if (userRole === "admin") {
        setLocation("/admin");
        return;
      }
      if (userRole === "owner") {
        setLocation("/owner/dashboard");
        return;
      }

      try {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (userDoc.exists()) {
          const data = userDoc.data();
          if (data.hasCompletedProfile) {
            setLocation("/");
          } else {
            // Pre-fill some data if available
            setFormData(prev => ({
              ...prev,
              fullName: data.displayName || user.displayName || "",
              photoURL: data.photoURL || user.photoURL || null,
              phoneNumber: data.phoneNumber || "",
            }));
          }
        }
      } catch (error) {
        console.error("Error checking profile:", error);
      } finally {
        setPageLoading(false);
      }
    };
    checkProfile();
  }, [user, userRole, authLoading, setLocation]);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setUploadingPhoto(true);
    try {
      const storageRef = ref(storage, `users/${user.uid}/avatar.jpg`);
      await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(storageRef);
      setFormData(prev => ({ ...prev, photoURL: downloadURL }));
      toast({ title: "Photo uploaded!" });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Upload failed", description: error.message });
    } finally {
      setUploadingPhoto(false);
    }
  };

  const validateStep = () => {
    const newErrors: Record<string, string> = {};
    if (currentStep === 1) {
      if (!formData.fullName.trim()) newErrors.fullName = "Full name is required";
      if (!formData.phoneNumber.trim()) {
        newErrors.phoneNumber = "Phone number is required";
      } else if (!/^[6-9]\d{9}$/.test(formData.phoneNumber)) {
        newErrors.phoneNumber = "Invalid Indian phone number";
      }
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = async () => {
    if (!validateStep() || !user) return;

    setLoading(true);
    try {
      if (currentStep === 1) {
        await updateDoc(doc(db, "users", user.uid), {
          displayName: formData.fullName,
          phoneNumber: formData.phoneNumber,
          photoURL: formData.photoURL,
          onboardingStep: 2,
        });
        if (auth.currentUser) {
          await updateProfile(auth.currentUser, {
            displayName: formData.fullName,
            photoURL: formData.photoURL,
          });
        }
        setCurrentStep(2);
      } else if (currentStep === 2) {
        if (formData.vehicleBrand) {
          await addDoc(collection(db, "users", user.uid, "ev_vehicles"), {
            brand: formData.vehicleBrand,
            model: formData.vehicleModel,
            registrationNumber: formData.vehicleRegistrationNumber,
            connectorType: formData.preferredConnectorType,
            batteryCapacity: formData.batteryCapacityKWh,
            isPrimary: true,
            addedAt: serverTimestamp(),
          });
        }
        await updateDoc(doc(db, "users", user.uid), {
          onboardingStep: 3,
        });
        setCurrentStep(3);
      }
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setLoading(false);
    }
  };

  const handleComplete = async () => {
    if (!user) return;
    setLoading(true);
    try {
      await updateDoc(doc(db, "users", user.uid), {
        "settings.defaultCity": formData.defaultCity,
        "settings.searchRadius": formData.searchRadius,
        "settings.notifications": formData.notifications,
        hasCompletedProfile: true,
        completedProfileAt: serverTimestamp(),
      });
      setShowWelcome(true);
      setTimeout(() => {
        setShowWelcome(false);
        setLocation("/");
      }, 2500);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setLoading(false);
    }
  };

  if (authLoading || pageLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground animate-pulse">Loading...</p>
      </div>
    );
  }

  const firstName = formData.fullName.split(" ")[0];

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4 relative overflow-hidden">
      {/* Background Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-primary/5 rounded-full blur-[100px] pointer-events-none" />

      <Card className="w-full max-w-xl p-8 relative z-10 border-none shadow-2xl bg-card/50 backdrop-blur-xl rounded-[2rem]">
        {/* Progress Indicator */}
        <div className="onboarding-progress">
          <div className="progress-steps">
            {[1, 2, 3].map(step => (
              <div key={step} className={`progress-step ${step < currentStep ? "completed" : step === currentStep ? "active" : "pending"}`}>
                <div className="step-circle">
                  {step < currentStep ? <Check className="w-4 h-4" /> : step}
                </div>
                <span className="step-label">
                  {step === 1 ? "Personal" : step === 2 ? "Your EV" : "Preferences"}
                </span>
              </div>
            ))}
            {[1, 2].map(i => (
              <div key={i} className={`progress-line ${currentStep > i ? "line-completed" : ""}`} />
            ))}
          </div>
          <div className="progress-bar-track">
            <div className="progress-bar-fill" style={{ width: `${((currentStep - 1) / (TOTAL_STEPS - 1)) * 100}%` }} />
          </div>
        </div>

        {/* Step Content */}
        <div className="mt-8">
          {currentStep === 1 && (
            <div className="space-y-6">
              <div className="text-center mb-6">
                <h1 className="text-2xl font-black uppercase tracking-tight">Personal Info</h1>
                <p className="text-sm text-muted-foreground">Let's start with the basics</p>
              </div>

              <div className="flex flex-col items-center gap-4 mb-6">
                <div className="relative group">
                  <Avatar className="w-24 h-24 border-4 border-background shadow-lg">
                    <AvatarImage src={formData.photoURL || ""} />
                    <AvatarFallback className="bg-primary/10 text-primary text-2xl font-black">
                      {formData.fullName.charAt(0) || <Zap />}
                    </AvatarFallback>
                  </Avatar>
                  <label className="absolute bottom-0 right-0 w-8 h-8 bg-primary rounded-full flex items-center justify-center cursor-pointer shadow-lg hover:scale-110 transition-transform">
                    <Camera className="w-4 h-4 text-white" />
                    <input type="file" className="hidden" accept="image/*" onChange={handlePhotoUpload} disabled={uploadingPhoto} />
                  </label>
                  {uploadingPhoto && (
                    <div className="absolute inset-0 bg-background/60 rounded-full flex items-center justify-center">
                      <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    </div>
                  )}
                </div>
                <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">
                  {formData.photoURL ? "Change Photo" : "Upload Photo"}
                </p>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-xs uppercase font-black tracking-widest text-muted-foreground">Full Name</Label>
                  <Input 
                    placeholder="Enter your name" 
                    value={formData.fullName} 
                    onChange={e => setFormData({...formData, fullName: e.target.value})}
                    className={`h-12 rounded-2xl bg-muted/30 ${errors.fullName ? "border-destructive" : ""}`}
                  />
                  {errors.fullName && <p className="text-[10px] text-destructive font-bold uppercase">{errors.fullName}</p>}
                </div>

                <div className="space-y-2">
                  <Label className="text-xs uppercase font-black tracking-widest text-muted-foreground">Phone Number</Label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-muted-foreground">+91</span>
                    <Input 
                      placeholder="9876543210" 
                      value={formData.phoneNumber} 
                      onChange={e => setFormData({...formData, phoneNumber: e.target.value})}
                      className={`h-12 pl-12 rounded-2xl bg-muted/30 ${errors.phoneNumber ? "border-destructive" : ""}`}
                    />
                  </div>
                  {errors.phoneNumber && <p className="text-[10px] text-destructive font-bold uppercase">{errors.phoneNumber}</p>}
                </div>
              </div>

              <Button onClick={handleNext} disabled={loading || !formData.fullName || !formData.phoneNumber} className="w-full h-14 rounded-2xl font-black uppercase tracking-widest gap-2">
                {loading ? "Saving..." : "Continue"} <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          )}

          {currentStep === 2 && (
            <div className="space-y-6">
              <div className="text-center mb-6">
                <h1 className="text-2xl font-black uppercase tracking-tight">Your EV</h1>
                <p className="text-sm text-muted-foreground">Optional — helps us show compatible stations</p>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs uppercase font-black tracking-widest text-muted-foreground">Brand</Label>
                    <Select value={formData.vehicleBrand} onValueChange={v => setFormData({...formData, vehicleBrand: v})}>
                      <SelectTrigger className="h-12 rounded-2xl bg-muted/30">
                        <SelectValue placeholder="Select Brand" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="tata">Tata Motors</SelectItem>
                        <SelectItem value="mahindra">Mahindra</SelectItem>
                        <SelectItem value="mg">MG Motor</SelectItem>
                        <SelectItem value="hyundai">Hyundai</SelectItem>
                        <SelectItem value="kia">Kia</SelectItem>
                        <SelectItem value="tesla">Tesla</SelectItem>
                        <SelectItem value="byd">BYD</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs uppercase font-black tracking-widest text-muted-foreground">Model</Label>
                    <Input 
                      placeholder="e.g. Nexon EV" 
                      value={formData.vehicleModel} 
                      onChange={e => setFormData({...formData, vehicleModel: e.target.value})}
                      className="h-12 rounded-2xl bg-muted/30"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs uppercase font-black tracking-widest text-muted-foreground">Registration Number</Label>
                  <Input 
                    placeholder="MH01AA1234" 
                    value={formData.vehicleRegistrationNumber} 
                    onChange={e => setFormData({...formData, vehicleRegistrationNumber: e.target.value.toUpperCase()})}
                    className="h-12 rounded-2xl bg-muted/30 font-mono"
                  />
                </div>

                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <Label className="text-xs uppercase font-black tracking-widest text-muted-foreground">Battery Capacity</Label>
                    <Badge variant="secondary" className="font-black">{formData.batteryCapacityKWh} kWh</Badge>
                  </div>
                  <Slider 
                    value={[formData.batteryCapacityKWh]} 
                    onValueChange={v => setFormData({...formData, batteryCapacityKWh: v[0]})}
                    max={150} min={10} step={1}
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs uppercase font-black tracking-widest text-muted-foreground">Connector Type</Label>
                  <Select value={formData.preferredConnectorType} onValueChange={v => setFormData({...formData, preferredConnectorType: v})}>
                    <SelectTrigger className="h-12 rounded-2xl bg-muted/30">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="CCS">CCS (Standard)</SelectItem>
                      <SelectItem value="CHAdeMO">CHAdeMO</SelectItem>
                      <SelectItem value="Type 2">Type 2</SelectItem>
                      <SelectItem value="Tesla">Tesla Supercharger</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex gap-4 pt-4">
                <Button variant="ghost" onClick={() => setCurrentStep(1)} className="h-14 rounded-2xl font-black uppercase tracking-widest">
                  <ArrowLeft className="w-4 h-4 mr-2" /> Back
                </Button>
                <Button variant="outline" onClick={() => setCurrentStep(3)} className="flex-1 h-14 rounded-2xl font-black uppercase tracking-widest text-primary border-primary/20">
                  Skip for now
                </Button>
                <Button onClick={handleNext} disabled={loading} className="flex-1 h-14 rounded-2xl font-black uppercase tracking-widest gap-2">
                  {loading ? "Saving..." : "Continue"} <ArrowRight className="w-4 h-4" />
                </Button>
              </div>

              <button className="w-full text-center text-[10px] uppercase font-black tracking-widest text-primary/60 hover:text-primary transition-colors py-2 flex items-center justify-center gap-1">
                <Plus className="w-3 h-3" /> Add Another Vehicle
              </button>
            </div>
          )}

          {currentStep === 3 && (
            <div className="space-y-6">
              <div className="text-center mb-6">
                <h1 className="text-2xl font-black uppercase tracking-tight">Preferences</h1>
                <p className="text-sm text-muted-foreground">Tailor your charging experience</p>
              </div>

              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs uppercase font-black tracking-widest text-muted-foreground">Default City</Label>
                    <Input 
                      placeholder="e.g. Mumbai" 
                      value={formData.defaultCity} 
                      onChange={e => setFormData({...formData, defaultCity: e.target.value})}
                      className="h-12 rounded-2xl bg-muted/30"
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center mb-2">
                      <Label className="text-xs uppercase font-black tracking-widest text-muted-foreground">Search Radius</Label>
                      <Badge variant="secondary" className="font-black">{formData.searchRadius} km</Badge>
                    </div>
                    <Slider 
                      value={[formData.searchRadius]} 
                      onValueChange={v => setFormData({...formData, searchRadius: v[0]})}
                      max={50} min={5} step={5}
                      className="py-4"
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <Label className="text-xs uppercase font-black tracking-widest text-muted-foreground">Notification Settings</Label>
                  <div className="grid grid-cols-1 gap-3">
                    <div className="flex items-center justify-between p-4 rounded-2xl bg-muted/30 border border-transparent hover:border-primary/20 transition-all">
                      <div className="space-y-0.5">
                        <p className="text-sm font-bold">Booking Confirmations</p>
                        <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Instant alerts when you book a slot</p>
                      </div>
                      <Switch 
                        checked={formData.notifications.bookingConfirmations} 
                        onCheckedChange={c => setFormData({...formData, notifications: {...formData.notifications, bookingConfirmations: c}})}
                      />
                    </div>
                    <div className="flex items-center justify-between p-4 rounded-2xl bg-muted/30 border border-transparent hover:border-primary/20 transition-all">
                      <div className="space-y-0.5">
                        <p className="text-sm font-bold">Session Reminders</p>
                        <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Reminders before your session starts</p>
                      </div>
                      <Switch 
                        checked={formData.notifications.sessionReminders} 
                        onCheckedChange={c => setFormData({...formData, notifications: {...formData.notifications, sessionReminders: c}})}
                      />
                    </div>
                    <div className="flex items-center justify-between p-4 rounded-2xl bg-muted/30 border border-transparent hover:border-primary/20 transition-all">
                      <div className="space-y-0.5">
                        <p className="text-sm font-bold">Weekly Summary</p>
                        <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Usage reports and savings overview</p>
                      </div>
                      <Switch 
                        checked={formData.notifications.weeklySummary} 
                        onCheckedChange={c => setFormData({...formData, notifications: {...formData.notifications, weeklySummary: c}})}
                      />
                    </div>
                    <div className="flex items-center justify-between p-4 rounded-2xl bg-muted/30 border border-transparent hover:border-primary/20 transition-all">
                      <div className="space-y-0.5">
                        <p className="text-sm font-bold">Price Drop Alerts</p>
                        <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Get notified when rates decrease</p>
                      </div>
                      <Switch 
                        checked={formData.notifications.priceDropAlerts} 
                        onCheckedChange={c => setFormData({...formData, notifications: {...formData.notifications, priceDropAlerts: c}})}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex gap-4 pt-4">
                <Button variant="ghost" onClick={() => setCurrentStep(2)} className="h-14 rounded-2xl font-black uppercase tracking-widest">
                  <ArrowLeft className="w-4 h-4 mr-2" /> Back
                </Button>
                <Button onClick={handleComplete} disabled={loading} className="flex-1 h-14 rounded-2xl font-black uppercase tracking-widest gap-2 bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/20">
                  {loading ? "Finishing..." : "Complete Setup"} <Check className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Welcome Celebration Overlay */}
      {showWelcome && (
        <div className="welcome-overlay">
          <div className="welcome-content">
            <div className="welcome-icon">⚡</div>
            <h2 className="text-3xl font-black text-white uppercase tracking-tighter mb-2">You're all set, {firstName}!</h2>
            <p className="text-emerald-400 font-bold uppercase tracking-widest text-xs mb-8">Find and book EV charging stations near you.</p>
            <div className="welcome-dots">
              {[0, 1, 2].map(i => (
                <div key={i} className="welcome-dot" style={{ animationDelay: `${i * 0.2}s` }} />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
