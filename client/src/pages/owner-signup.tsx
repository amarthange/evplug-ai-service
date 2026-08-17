import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Building2, Mail, Lock, Phone, MapPin, CheckCircle2, Gift } from "lucide-react";
import { SiGoogle } from "react-icons/si";
import {
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
} from "firebase/auth";
import { setDoc, doc, getDoc, serverTimestamp } from "firebase/firestore";
import { auth, googleProvider, db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";

export default function OwnerSignup() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [showReferral, setShowReferral] = useState(false);
  
  const [formData, setFormData] = useState({
    fullName: "",
    businessName: "",
    phone: "",
    address: "",
    email: "",
    password: "",
    confirmPassword: "",
    referralCode: "",
  });

  const validateBusinessName = (name: string) =>
    /^[a-zA-Z0-9\s\-&]{3,}$/.test(name);

  const validatePhone = (phone: string) =>
    /^[6-9]\d{9}$/.test(phone);

  useEffect(() => {
    if (user) setLocation("/owner/dashboard");
  }, [user, setLocation]);

  const handleGoogleOwnerSignup = async () => {
    setLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const uid = result.user.uid;
      
      const existingOwner = await getDoc(doc(db, "owners", uid));
      
      if (existingOwner.exists()) {
        toast({
          title: "Welcome Back!",
          description: "Signing you into your owner dashboard.",
        });
        setLocation("/owner/dashboard");
        return;
      }
      
      // Create owner profile with incomplete business profile
      await setDoc(doc(db, "owners", uid), {
        uid,
        email: result.user.email,
        fullName: result.user.displayName || "Station Owner",
        photoURL: result.user.photoURL,
        role: "owner",
        businessName: "",
        phone: "",
        address: "",
        createdAt: serverTimestamp(),
        hasCompletedBusinessProfile: false
      });
      
      toast({
        title: "Account Created!",
        description: "Please complete your business profile.",
      });
      setLocation("/owner/complete-business-profile");
      
    } catch (error: any) {
      console.error("Google sign-up error:", error);
      toast({
        variant: "destructive",
        title: "Sign Up Failed",
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.fullName || !formData.businessName || !formData.phone || !formData.address) {
      toast({ variant: "destructive", title: "Error", description: "Please fill in all fields" });
      return;
    }

    if (!validateBusinessName(formData.businessName)) {
      toast({
        variant: "destructive",
        title: "Invalid Business Name",
        description: "Min 3 characters. Only letters, numbers, spaces, -, & allowed.",
      });
      return;
    }

    if (!validatePhone(formData.phone)) {
      toast({
        variant: "destructive",
        title: "Invalid Phone",
        description: "Enter 10-digit mobile number starting with 6-9.",
      });
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      toast({ variant: "destructive", title: "Error", description: "Passwords do not match" });
      return;
    }

    setLoading(true);
    try {
      // Referral code validation
      if (formData.referralCode) {
        const refDoc = await getDoc(doc(db, "settings", "referralCodes"));
        const codes = refDoc.exists() ? refDoc.data().codes || [] : [];
        if (!codes.includes(formData.referralCode)) {
          toast({ variant: "destructive", title: "Invalid Referral", description: "This referral code is not active." });
          setLoading(false);
          return;
        }
      }

      const userCredential = await createUserWithEmailAndPassword(
        auth,
        formData.email,
        formData.password
      );

      // Create owner profile in Firestore
      const ownerData = {
        uid: userCredential.user.uid,
        email: formData.email,
        fullName: formData.fullName,
        businessName: formData.businessName,
        phone: formData.phone,
        address: formData.address,
        referralCode: formData.referralCode || null,
        role: "owner",
        hasCompletedBusinessProfile: false, // Force them to complete profile
        createdAt: serverTimestamp(),
      };

      await setDoc(doc(db, "owners", userCredential.user.uid), ownerData);

      toast({
        title: "Success!",
        description: "Account created. Let's finish your business profile.",
      });

      setLocation("/owner/complete-business-profile");
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Sign Up Failed",
        description: error.message || "Could not create account",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <Card className="w-full max-w-md p-8 bg-slate-900 border-slate-800 text-white shadow-2xl">
        <div className="text-center mb-6">
          <div className="flex items-center justify-center gap-2 mb-2">
            <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
              <Building2 className="w-6 h-6 text-emerald-500" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Become a Partner</h1>
          </div>
          
          <div className="owner-benefits mt-4 text-left">
            <div className="benefit-item flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              <span>Manage your charging stations</span>
            </div>
            <div className="benefit-item flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              <span>Track revenue in real-time</span>
            </div>
            <div className="benefit-item flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              <span>Get paid via UPI monthly</span>
            </div>
            <div className="benefit-item flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              <span>Access driver reviews</span>
            </div>
            <div className="benefit-item flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              <span>Free to join</span>
            </div>
          </div>
        </div>

        <Button
          variant="outline"
          className="w-full gap-2 bg-white text-black hover:bg-slate-100 border-none h-11"
          onClick={handleGoogleOwnerSignup}
          disabled={loading}
        >
          <SiGoogle className="w-4 h-4" />
          Continue with Google
        </Button>

        <div className="relative my-6">
          <Separator className="bg-slate-800" />
          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-slate-900 px-2 text-xs text-slate-500 uppercase">
            or sign up with email
          </span>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="fullName" className="text-slate-400 text-xs uppercase font-bold">Full Name</Label>
              <Input
                id="fullName"
                placeholder="John Doe"
                className="bg-slate-800/50 border-slate-700 h-11"
                value={formData.fullName}
                onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="businessName" className="text-slate-400 text-xs uppercase font-bold">Business Name</Label>
              <Input
                id="businessName"
                placeholder="EVPlugFinder Stations"
                className="bg-slate-800/50 border-slate-700 h-11"
                value={formData.businessName}
                onChange={(e) => setFormData({ ...formData, businessName: e.target.value })}
                disabled={loading}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="phone" className="text-slate-400 text-xs uppercase font-bold">Phone</Label>
              <Input
                id="phone"
                placeholder="9876543210"
                className="bg-slate-800/50 border-slate-700 h-11"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="address" className="text-slate-400 text-xs uppercase font-bold">Address</Label>
              <Input
                id="address"
                placeholder="Mumbai, Maharashtra"
                className="bg-slate-800/50 border-slate-700 h-11"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                disabled={loading}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email" className="text-slate-400 text-xs uppercase font-bold">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="owner@business.com"
              className="bg-slate-800/50 border-slate-700 h-11"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              disabled={loading}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="password" className="text-slate-400 text-xs uppercase font-bold">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                className="bg-slate-800/50 border-slate-700 h-11"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword" className="text-slate-400 text-xs uppercase font-bold">Confirm</Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="••••••••"
                className="bg-slate-800/50 border-slate-700 h-11"
                value={formData.confirmPassword}
                onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                disabled={loading}
              />
            </div>
          </div>

          {!showReferral ? (
            <button
              type="button"
              onClick={() => setShowReferral(true)}
              className="text-xs text-emerald-500 flex items-center gap-1 hover:underline"
            >
              <Gift className="w-3 h-3" />
              I have a referral code
            </button>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="referralCode" className="text-slate-400 text-xs uppercase font-bold">Referral Code</Label>
              <Input
                id="referralCode"
                placeholder="REF123"
                className="bg-slate-800/50 border-slate-700 h-11"
                value={formData.referralCode}
                onChange={(e) => setFormData({ ...formData, referralCode: e.target.value })}
                disabled={loading}
              />
            </div>
          )}

          <Button
            type="submit"
            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white h-12 font-bold text-lg"
            disabled={loading}
          >
            {loading ? "Joining..." : "Become a Partner"}
          </Button>
        </form>

        <p className="text-center text-sm text-slate-400 mt-6">
          Ready to manage your stations?{" "}
          <button
            onClick={() => setLocation("/owner/login")}
            className="text-emerald-500 font-bold hover:underline"
          >
            Sign In
          </button>
        </p>
      </Card>
    </div>
  );
}
