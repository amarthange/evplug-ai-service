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
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Building2, Camera, ArrowRight, ArrowLeft, Check, Upload, QrCode } from "lucide-react";
import { doc, updateDoc, getDoc, serverTimestamp } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "@/lib/firebase";

const TOTAL_STEPS = 2;

export default function OwnerCompleteBusinessProfile() {
  const [, setLocation] = useLocation();
  const { user, userRole, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [currentStep, setCurrentStep] = useState(1);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingQR, setUploadingQR] = useState(false);

  const [formData, setFormData] = useState({
    businessName: "",
    supportPhone: "",
    businessAddress: "",
    businessType: "Proprietorship",
    upiId: "",
    logoURL: "",
    qrCodeURL: "",
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    const checkProfile = async () => {
      if (authLoading) return;
      if (!user) {
        setLocation("/owner/login");
        return;
      }
      if (userRole !== "owner") {
        setLocation("/");
        return;
      }

      try {
        const ownerDoc = await getDoc(doc(db, "owners", user.uid));
        if (ownerDoc.exists()) {
          const data = ownerDoc.data();
          if (data.hasCompletedBusinessProfile) {
            setLocation("/owner/dashboard");
          } else {
            setFormData(prev => ({
              ...prev,
              businessName: data.businessName || "",
              supportPhone: data.phone || "",
              businessAddress: data.address || "",
            }));
          }
        }
      } catch (error) {
        console.error("Error checking owner profile:", error);
      } finally {
        setPageLoading(false);
      }
    };
    checkProfile();
  }, [user, userRole, authLoading, setLocation]);

  const validateStep = () => {
    const newErrors: Record<string, string> = {};
    if (currentStep === 1) {
      if (!formData.businessName.trim()) newErrors.businessName = "Business name is required";
      if (!formData.supportPhone.trim()) {
        newErrors.supportPhone = "Support phone is required";
      } else if (!/^[6-9]\d{9}$/.test(formData.supportPhone)) {
        newErrors.supportPhone = "Invalid Indian phone number";
      }
      if (!formData.businessAddress.trim()) newErrors.businessAddress = "Business address is required";
    } else if (currentStep === 2) {
      if (!formData.upiId.trim()) {
        newErrors.upiId = "UPI ID is required for payments";
      } else if (!/^[\w.-]+@[\w.-]+$/.test(formData.upiId)) {
        newErrors.upiId = "Invalid UPI ID format (e.g. name@bank)";
      }
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'logo' | 'qr') => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if (type === 'logo') setUploadingLogo(true);
    else setUploadingQR(true);

    try {
      const storageRef = ref(storage, `owners/${user.uid}/${type === 'logo' ? 'business_logo' : 'payment_qr'}.jpg`);
      await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(storageRef);
      setFormData(prev => ({ ...prev, [type === 'logo' ? 'logoURL' : 'qrCodeURL']: downloadURL }));
      toast({ title: `${type === 'logo' ? 'Logo' : 'QR Code'} uploaded!` });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Upload failed", description: error.message });
    } finally {
      if (type === 'logo') setUploadingLogo(false);
      else setUploadingQR(false);
    }
  };

  const handleNext = () => {
    if (validateStep()) {
      setCurrentStep(2);
    }
  };

  const handleComplete = async () => {
    if (!validateStep() || !user) return;
    setLoading(true);
    try {
      await updateDoc(doc(db, "owners", user.uid), {
        businessName: formData.businessName,
        phone: formData.supportPhone,
        address: formData.businessAddress,
        businessType: formData.businessType,
        upiId: formData.upiId,
        logoURL: formData.logoURL,
        qrCodeURL: formData.qrCodeURL,
        hasCompletedBusinessProfile: true,
        completedAt: serverTimestamp(),
      });

      toast({
        title: "Profile Completed!",
        description: "Welcome to the EVPlugFinder Partner Program.",
      });
      setLocation("/owner/dashboard");
    } catch (error: any) {
      toast({ variant: "destructive", title: "Update Failed", description: error.message });
    } finally {
      setLoading(false);
    }
  };

  if (authLoading || pageLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <p className="text-slate-400 animate-pulse uppercase tracking-widest font-bold">Loading Business Profile...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-emerald-500/5 rounded-full blur-[100px] pointer-events-none" />

      <Card className="w-full max-w-xl p-8 bg-slate-900 border-slate-800 text-white relative z-10 shadow-2xl rounded-[2rem]">
        {/* Progress Tracker */}
        <div className="flex items-center justify-center gap-4 mb-8">
          {[1, 2].map(step => (
            <div key={step} className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm transition-all ${
                currentStep >= step ? "bg-emerald-500 text-white" : "bg-slate-800 text-slate-500"
              }`}>
                {currentStep > step ? <Check className="w-4 h-4" /> : step}
              </div>
              <span className={`text-xs uppercase font-black tracking-widest ${
                currentStep >= step ? "text-emerald-500" : "text-slate-500"
              }`}>
                {step === 1 ? "Business" : "Payment"}
              </span>
              {step === 1 && <div className={`w-12 h-0.5 rounded-full ${currentStep > 1 ? "bg-emerald-500" : "bg-slate-800"}`} />}
            </div>
          ))}
        </div>

        {currentStep === 1 ? (
          <div className="space-y-6">
            <div className="text-center">
              <h1 className="text-3xl font-black uppercase tracking-tight">Business Details</h1>
              <p className="text-slate-400 text-sm">Tell us about your organization</p>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-xs uppercase font-bold text-slate-400">Legal Business Name</Label>
                <Input 
                  placeholder="e.g. GreenCharge Solutions Ltd" 
                  value={formData.businessName}
                  onChange={e => setFormData({...formData, businessName: e.target.value})}
                  className="bg-slate-800 border-slate-700 h-12"
                />
                {errors.businessName && <p className="text-[10px] text-red-500 font-bold uppercase">{errors.businessName}</p>}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs uppercase font-bold text-slate-400">Support Phone</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-bold text-sm">+91</span>
                    <Input 
                      placeholder="9876543210" 
                      value={formData.supportPhone}
                      onChange={e => setFormData({...formData, supportPhone: e.target.value})}
                      className="bg-slate-800 border-slate-700 h-12 pl-12"
                    />
                  </div>
                  {errors.supportPhone && <p className="text-[10px] text-red-500 font-bold uppercase">{errors.supportPhone}</p>}
                </div>
                <div className="space-y-2">
                  <Label className="text-xs uppercase font-bold text-slate-400">Business Type</Label>
                  <Select value={formData.businessType} onValueChange={v => setFormData({...formData, businessType: v})}>
                    <SelectTrigger className="bg-slate-800 border-slate-700 h-12">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-900 border-slate-800 text-white">
                      <SelectItem value="Proprietorship">Proprietorship</SelectItem>
                      <SelectItem value="Partnership">Partnership</SelectItem>
                      <SelectItem value="Private Ltd">Private Ltd</SelectItem>
                      <SelectItem value="LLP">LLP</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs uppercase font-bold text-slate-400">Business Address</Label>
                <Input 
                  placeholder="Street, City, State, ZIP" 
                  value={formData.businessAddress}
                  onChange={e => setFormData({...formData, businessAddress: e.target.value})}
                  className="bg-slate-800 border-slate-700 h-12"
                />
                {errors.businessAddress && <p className="text-[10px] text-red-500 font-bold uppercase">{errors.businessAddress}</p>}
              </div>
            </div>

            <Button onClick={handleNext} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white h-14 font-black uppercase tracking-widest gap-2">
              Next Step <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="text-center">
              <h1 className="text-3xl font-black uppercase tracking-tight">Payment Setup</h1>
              <p className="text-slate-400 text-sm">Configure how you receive earnings</p>
            </div>

            <div className="space-y-6">
              <div className="space-y-2">
                <Label className="text-xs uppercase font-bold text-slate-400">UPI ID for Settlements</Label>
                <Input 
                  placeholder="business@upi" 
                  value={formData.upiId}
                  onChange={e => setFormData({...formData, upiId: e.target.value})}
                  className="bg-slate-800 border-slate-700 h-12 text-center text-lg font-mono tracking-tighter"
                />
                {errors.upiId && <p className="text-[10px] text-red-500 font-bold uppercase text-center">{errors.upiId}</p>}
                <p className="text-[10px] text-slate-500 text-center uppercase tracking-widest">Earnings will be settled monthly to this ID</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col items-center gap-3 p-4 border border-slate-800 rounded-2xl bg-slate-800/30">
                  <div className="relative group">
                    <Avatar className="w-20 h-20 border-2 border-slate-700">
                      <AvatarImage src={formData.logoURL} />
                      <AvatarFallback className="bg-slate-800 text-slate-400">
                        <Building2 className="w-8 h-8" />
                      </AvatarFallback>
                    </Avatar>
                    <label className="absolute -bottom-1 -right-1 w-7 h-7 bg-emerald-500 rounded-full flex items-center justify-center cursor-pointer hover:scale-110 transition-transform">
                      <Camera className="w-3.5 h-3.5 text-white" />
                      <input type="file" className="hidden" accept="image/*" onChange={e => handleFileUpload(e, 'logo')} disabled={uploadingLogo} />
                    </label>
                  </div>
                  <span className="text-[10px] uppercase font-bold text-slate-500">Business Logo</span>
                </div>

                <div className="flex flex-col items-center gap-3 p-4 border border-slate-800 rounded-2xl bg-slate-800/30">
                  <div className="relative group">
                    <div className="w-20 h-20 border-2 border-slate-700 rounded-lg flex items-center justify-center bg-slate-800 overflow-hidden">
                      {formData.qrCodeURL ? (
                        <img src={formData.qrCodeURL} alt="QR Code" className="w-full h-full object-cover" />
                      ) : (
                        <QrCode className="w-8 h-8 text-slate-400" />
                      )}
                    </div>
                    <label className="absolute -bottom-1 -right-1 w-7 h-7 bg-emerald-500 rounded-full flex items-center justify-center cursor-pointer hover:scale-110 transition-transform">
                      <Upload className="w-3.5 h-3.5 text-white" />
                      <input type="file" className="hidden" accept="image/*" onChange={e => handleFileUpload(e, 'qr')} disabled={uploadingQR} />
                    </label>
                  </div>
                  <span className="text-[10px] uppercase font-bold text-slate-500">Payment QR</span>
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <Button variant="ghost" onClick={() => setCurrentStep(1)} className="h-14 px-6 text-slate-400 hover:text-white uppercase font-black tracking-widest">
                <ArrowLeft className="w-4 h-4 mr-2" /> Back
              </Button>
              <Button onClick={handleComplete} disabled={loading} className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white h-14 font-black uppercase tracking-widest gap-2 shadow-lg shadow-emerald-500/20">
                {loading ? "Finalizing..." : "Complete Setup"} <Check className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
