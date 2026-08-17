import { useState } from "react";
import { useLocation } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Zap, Mail, Lock } from "lucide-react";
import { SiGoogle } from "react-icons/si";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithRedirect,
  getRedirectResult,
  fetchSignInMethodsForEmail,
  sendPasswordResetEmail,
  browserLocalPersistence,
  browserSessionPersistence,
  setPersistence,
} from "firebase/auth";
import { setDoc, doc, collection, addDoc, serverTimestamp, updateDoc } from "firebase/firestore";
import { auth, googleProvider, db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";
import { useEffect } from "react";

export default function Auth() {
  const [, setLocation] = useLocation();
  const searchParams = new URLSearchParams(window.location.search);
  const refCode = searchParams.get("ref");
  const { user, userRole, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedRole, setSelectedRole] = useState<"ev_user" | "owner" | "admin" | null>(null);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [authError, setAuthError] = useState<{ code: string } | null>(null);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [checkingEmail, setCheckingEmail] = useState(false);
  const [emailHint, setEmailHint] = useState<string | null>(null);

  // Forgot Password State
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetSent, setResetSent] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState("");

  const [rememberMe, setRememberMe] = useState(() => {
    return localStorage.getItem("rememberMe") === "true";
  });

  const savedEmail = localStorage.getItem("lastLoginEmail") || "";
  const lastLoginTime = localStorage.getItem("lastLoginTime") || "";

  // Login Attempt Security
  const MAX_ATTEMPTS = 5;
  const LOCKOUT_DURATION = 5 * 60 * 1000; // 5 minutes

  const [lockoutRemaining, setLockoutRemaining] = useState(0);

  const getLoginAttempts = () => {
    const data = localStorage.getItem("loginAttempts");
    if (!data) return { count: 0, lastAttempt: 0 };
    try {
      return JSON.parse(data);
    } catch {
      return { count: 0, lastAttempt: 0 };
    }
  };

  const incrementAttempts = () => {
    const attempts = getLoginAttempts();
    const newData = {
      count: attempts.count + 1,
      lastAttempt: Date.now(),
    };
    localStorage.setItem("loginAttempts", JSON.stringify(newData));
    return newData;
  };

  const resetAttempts = () => {
    localStorage.removeItem("loginAttempts");
    setLockoutRemaining(0);
  };

  const isLockedOut = () => {
    const { count, lastAttempt } = getLoginAttempts();
    if (count < MAX_ATTEMPTS) return false;
    const timeSinceLast = Date.now() - lastAttempt;
    return timeSinceLast < LOCKOUT_DURATION;
  };

  useEffect(() => {
    if (!isLockedOut()) return;

    const interval = setInterval(() => {
      const { lastAttempt } = getLoginAttempts();
      const remaining = Math.max(0, LOCKOUT_DURATION - (Date.now() - lastAttempt));

      setLockoutRemaining(Math.ceil(remaining / 1000));

      if (remaining <= 0) {
        resetAttempts();
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Redirect if already authenticated
  useEffect(() => {
    if (user && !authLoading) {
      if (userRole === "admin") {
        setLocation("/admin");
      } else if (userRole === "owner") {
        setLocation("/owner/dashboard");
      } else {
        setLocation("/");
      }
    }
  }, [user, userRole, authLoading, setLocation]);

  // Handle redirect result from Google sign-in
  useEffect(() => {
    const handleRedirect = async () => {
      try {
        const result = await getRedirectResult(auth);
        if (result) {
          toast({
            title: "Welcome!",
            description: "You have successfully signed in.",
          });
          setLocation("/");
        }
      } catch (error: any) {
        console.error("Redirect error:", error);
        toast({
          variant: "destructive",
          title: "Sign In Failed",
          description: error.message || "Could not sign in with Google",
        });
      }
    };

    handleRedirect();
  }, [toast, setLocation]);

  const getPasswordStrength = (password: string) => {
    let score = 0;
    const checks = {
      length: password.length >= 8,
      uppercase: /[A-Z]/.test(password),
      lowercase: /[a-z]/.test(password),
      number: /[0-9]/.test(password),
      special: /[^A-Za-z0-9]/.test(password),
    };
    score = Object.values(checks).filter(Boolean).length;

    return {
      score,
      checks,
      label:
        score <= 1
          ? "Very Weak"
          : score === 2
          ? "Weak"
          : score === 3
          ? "Fair"
          : score === 4
          ? "Strong"
          : "Very Strong",
      color:
        score <= 1
          ? "#ef4444"
          : score === 2
          ? "#f97316"
          : score === 3
          ? "#f59e0b"
          : score === 4
          ? "#22c55e"
          : "#16a34a",
    };
  };

  const getFriendlyError = (code: string) => {
    const errors: Record<string, string> = {
      "auth/email-already-in-use": "This email is already registered. Try signing in instead.",
      "auth/weak-password": "Password is too weak. Use at least 8 characters.",
      "auth/invalid-email": "Please enter a valid email address.",
      "auth/user-not-found": "No account found with this email. Want to sign up?",
      "auth/wrong-password": "Incorrect password. Forgot your password?",
      "auth/too-many-requests": "Too many attempts. Please wait 5 minutes and try again.",
      "auth/network-request-failed": "No internet connection. Please check your network.",
      "auth/popup-closed-by-user": "Google sign-in was cancelled. Please try again.",
      "auth/account-exists-with-different-credential":
        "An account already exists with this email using a different sign-in method.",
      "custom-lockout": "Account locked for 5 minutes due to too many failed attempts.",
    };
    return errors[code] || "Something went wrong. Please try again.";
    return errors[code] || "Something went wrong. Please try again.";
  };

  const checkEmailExists = async (email: string) => {
    try {
      const methods = await fetchSignInMethodsForEmail(auth, email);
      return methods.length > 0;
    } catch (error: any) {
      // Some Firebase configs block this method for security
      console.warn("fetchSignInMethodsForEmail not available or blocked:", error);
      return false;
    }
  };

  const handleEmailBlur = async () => {
    if (!email || !email.includes("@")) return;
    setCheckingEmail(true);
    const exists = await checkEmailExists(email);
    if (exists) {
      setEmailHint("Account exists. Sign in instead?");
    } else {
      setEmailHint(null);
    }
    setCheckingEmail(false);
  };

  const strength = getPasswordStrength(password);

  const handleSendReset = async () => {
    if (!resetEmail.trim()) return;
    setResetLoading(true);
    setResetError("");

    try {
      await sendPasswordResetEmail(auth, resetEmail, {
        url: window.location.origin + "/auth",
        handleCodeInApp: false,
      });
      setResetSent(true);

      // Log the reset request in audit logs
      await addDoc(collection(db, "audit_logs"), {
        action: "PASSWORD_RESET_REQUESTED",
        severity: "LOW",
        performedBy: "anonymous",
        targetId: resetEmail,
        targetType: "user",
        timestamp: serverTimestamp(),
      });
    } catch (err: any) {
      setResetError(getFriendlyError(err.code));
    }
    setResetLoading(false);
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Check for lockout
    if (!isSignUp && isLockedOut()) {
      const { lastAttempt } = getLoginAttempts();
      const remaining = Math.ceil((LOCKOUT_DURATION - (Date.now() - lastAttempt)) / 60000);
      setAuthError({ 
        code: "custom-lockout"
      });
      toast({
        variant: "destructive",
        title: "Account Locked",
        description: `Too many failed attempts. Try again in ${remaining} minute(s).`,
      });
      return;
    }

    setLoading(true);

    try {
      if (isSignUp) {
        if (!selectedRole) {
          toast({
            variant: "destructive",
            title: "Error",
            description: "Please select your account type",
          });
          setLoading(false);
          return;
        }

        // If Station Manager, redirect to owner signup page
        if (selectedRole === "owner") {
          console.log("🔄 Redirecting to owner signup for station manager");
          // Store credentials in session storage to pre-fill owner form
          sessionStorage.setItem("pendingOwnerEmail", email);
          sessionStorage.setItem("pendingOwnerPassword", password);
          setLocation("/owner/signup");
          setLoading(false);
          return;
        }

        // Regular user or admin signup flow
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        
        // Import user service
        const { createUserProfile } = await import("@/lib/user-service");
        
        // Create user profile with appropriate role
        await createUserProfile(userCredential.user.uid, {
          fullName: "",
          email: userCredential.user.email || email,
          phoneNumber: "",
          role: selectedRole === "admin" ? "admin" : "ev_user"
        });

        // Apply referral if present
        if (refCode) {
          try {
            const { updateDoc, doc } = await import("firebase/firestore");
            await updateDoc(doc(db, "users", userCredential.user.uid), {
              referredBy: refCode
            });
            console.log("✅ Referral applied successfully");
          } catch (err) {
            console.error("❌ Error applying referral:", err);
          }
        }

        toast({
          title: "Welcome!",
          description: selectedRole === "admin" ? "Admin account created." : "Account created. Explore nearby stations.",
        });
        
        // Redirect to home page or admin dashboard
        setTimeout(() => setLocation(selectedRole === "admin" ? "/admin" : "/"), 500);
      } else {
        // Set persistence based on Remember Me preference
        await setPersistence(
          auth,
          rememberMe ? browserLocalPersistence : browserSessionPersistence
        );

        // Regular user login
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        resetAttempts();
        const { uid } = userCredential.user;

        // Save last login info to Firestore
        const deviceType = navigator.userAgent.includes("Mobile") ? "Mobile" : "Desktop";
        const browser = (() => {
          const ua = navigator.userAgent;
          if (ua.includes("Chrome")) return "Chrome";
          if (ua.includes("Firefox")) return "Firefox";
          if (ua.includes("Safari")) return "Safari";
          if (ua.includes("Edge")) return "Edge";
          return "Browser";
        })();

        await updateDoc(doc(db, "users", uid), {
          lastLoginAt: serverTimestamp(),
          lastLoginDevice: deviceType,
          currentDevice: {
            type: deviceType,
            browser: browser,
            lastSeen: serverTimestamp(),
            ipHint: "saved for security",
          },
        });

        // Save to localStorage for returning user hint
        localStorage.setItem("lastLoginEmail", email);
        localStorage.setItem("lastLoginTime", new Date().toISOString());

        // Check if user has completed profile
        const { getUserProfile } = await import("@/lib/user-service");
        const profile = await getUserProfile(userCredential.user.uid);
        
        if (!profile) {
          // Create minimal profile if missing
          const { createUserProfile } = await import("@/lib/user-service");
          await createUserProfile(userCredential.user.uid, {
            fullName: userCredential.user.displayName || "",
            email: userCredential.user.email || email,
            phoneNumber: "",
          });
          setLocation("/complete-profile");
        } else if (!profile.hasCompletedProfile) {
          // Redirect to complete profile
          console.log("Profile not complete, redirecting to complete-profile");
          setLocation("/complete-profile");
        } else {
          // Profile complete, go to appropriate dashboard based on role
          toast({
            title: "Welcome Back!",
            description: "You have successfully signed in.",
          });
          
          if (profile.role === "admin") {
            setLocation("/admin");
          } else if (profile.role === "owner") {
            setLocation("/owner/dashboard");
          } else {
            setLocation("/");
          }
        }
      }
    } catch (error: any) {
      console.error("Auth error:", error);
      
      if (!isSignUp && (error.code === "auth/wrong-password" || error.code === "auth/user-not-found")) {
        const { count } = incrementAttempts();
        const remaining = MAX_ATTEMPTS - count;
        
        if (remaining > 0) {
          toast({
            variant: "destructive",
            title: "Sign In Failed",
            description: remaining <= 2 
              ? `Incorrect credentials. ${remaining} attempt(s) remaining before lockout.`
              : getFriendlyError(error.code),
          });
        } else {
          // Log suspicious activity to Firestore
          await addDoc(collection(db, "audit_logs"), {
            action: "SUSPICIOUS_LOGIN_ACTIVITY",
            severity: "HIGH",
            performedBy: "anonymous",
            targetId: email,
            targetType: "user",
            metadata: {
              attemptCount: MAX_ATTEMPTS,
              userAgent: navigator.userAgent,
              timestamp: new Date().toISOString()
            },
            timestamp: serverTimestamp()
          });

          setAuthError({ code: "custom-lockout" });
          toast({
            variant: "destructive",
            title: "Security Lockout",
            description: "Account locked for 5 minutes due to too many failed attempts.",
          });
        }
      } else {
        setAuthError({ code: error.code });
        toast({
          variant: "destructive",
          title: isSignUp ? "Sign Up Failed" : "Sign In Failed",
          description: getFriendlyError(error.code),
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      await signInWithRedirect(auth, googleProvider);
    } catch (error: any) {
      console.error("Google sign-in error:", error);
      toast({
        variant: "destructive",
        title: "Sign In Failed",
        description: error.message || "Could not sign in with Google",
      });
    }
  };

  if (user) {
    return null;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md p-8">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
            <Zap className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-semibold">EV Charging Locator</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isSignUp ? "Create your account" : "Welcome back"}
          </p>
        </div>

        {lockoutRemaining > 0 && (
          <div className="lockout-banner">
            🔒 Too many attempts. Try again in {Math.floor(lockoutRemaining / 60)}:
            {String(lockoutRemaining % 60).padStart(2, "0")}
          </div>
        )}

        {/* Google Sign In */}
        <Button
          variant="outline"
          className="w-full mb-6"
          onClick={handleGoogleSignIn}
          data-testid="button-google-signin"
        >
          <SiGoogle className="w-5 h-5 mr-2" />
          Continue with Google
        </Button>

        <div className="relative mb-6">
          <Separator />
          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-2 text-xs text-muted-foreground">
            or
          </span>
        </div>

        {authError && (
          <div className="auth-error-banner mb-6">
            <span>⚠️</span>
            <span>{getFriendlyError(authError.code)}</span>
          </div>
        )}

        {/* Role Selection for Sign Up */}
        {isSignUp && (
          <div className="mb-4">
            <Label className="text-sm font-medium mb-3 block">Select Account Type</Label>
            <div className="space-y-2">
              <Button
                type="button"
                variant={selectedRole === "ev_user" ? "default" : "outline"}
                className="w-full justify-start"
                onClick={() => setSelectedRole("ev_user")}
                data-testid="button-role-user"
              >
                <span className="mr-2">👤</span>
                Regular User
                <span className="text-xs text-muted-foreground ml-auto">Browse & Book</span>
              </Button>
              <Button
                type="button"
                variant={selectedRole === "owner" ? "default" : "outline"}
                className="w-full justify-start"
                onClick={() => setSelectedRole("owner")}
                data-testid="button-role-manager"
              >
                <span className="mr-2">⚡</span>
                Station Manager
                <span className="text-xs text-muted-foreground ml-auto">Manage Station</span>
              </Button>
              <Button
                type="button"
                variant={selectedRole === "admin" ? "default" : "outline"}
                className="w-full justify-start"
                onClick={() => setSelectedRole("admin")}
                data-testid="button-role-admin"
              >
                <span className="mr-2">🛡️</span>
                Admin
                <span className="text-xs text-muted-foreground ml-auto">Manage Platform</span>
              </Button>
            </div>
          </div>
        )}

        {!isSignUp && savedEmail && lastLoginTime && (
          <div className="returning-user-hint">
            Welcome back! Last signed in {
              (() => {
                try {
                  const { safeFormatDistanceToNow } = require("@/lib/date-utils");
                  return safeFormatDistanceToNow(lastLoginTime);
                } catch (e) {
                  return "recently";
                }
              })()
            }
          </div>
        )}

        {/* Email/Password Form */}
        <form onSubmit={handleEmailAuth} className="space-y-4">
          <div>
            <Label htmlFor="email">Email</Label>
            <div className="relative mt-2">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={handleEmailBlur}
                className="pl-10"
                required
                data-testid="input-email"
              />
            </div>
            {checkingEmail && <p className="text-xs text-muted-foreground mt-1 animate-pulse">Checking email...</p>}
            {emailHint && (
              <div className="email-hint mt-2">
                {emailHint}
                <button 
                  type="button"
                  onClick={() => {
                    setIsSignUp(false);
                    setEmailHint(null);
                  }}
                  className="ml-2 text-primary hover:underline font-medium"
                >
                  Go to Sign In
                </button>
              </div>
            )}
          </div>

          {!isSignUp && (
            <div className="remember-row">
              <label className="remember-label">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => {
                    setRememberMe(e.target.checked);
                    localStorage.setItem("rememberMe", e.target.checked.toString());
                  }}
                />
                <span>Remember me on this device</span>
              </label>
            </div>
          )}

          <div>
            <Label htmlFor="password">Password</Label>
            <div className="relative mt-2">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onFocus={() => setPasswordFocused(true)}
                onBlur={() => setPasswordFocused(false)}
                className="pl-10"
                required
                minLength={6}
                data-testid="input-password"
              />
            </div>
            {!isSignUp && (
              <div className="flex justify-end mt-1">
                <button
                  type="button"
                  className="forgot-password-link"
                  onClick={() => setShowForgotPassword(true)}
                >
                  Forgot Password?
                </button>
              </div>
            )}
            {isSignUp && (
              <>
                <div className="password-strength mt-3">
                  <div className="strength-bars">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <div
                        key={i}
                        className="strength-bar"
                        style={{
                          background:
                            i <= strength.score
                              ? strength.color
                              : "hsl(var(--border))",
                        }}
                      />
                    ))}
                  </div>
                  <span style={{ color: strength.color, fontSize: "12px" }} className="font-medium">
                    {strength.label}
                  </span>
                </div>

                {passwordFocused && (
                  <div className="password-checklist">
                    {Object.entries(strength.checks).map(([key, passed]) => (
                      <div key={key} className="check-item">
                        <span
                          style={{
                            color: passed
                              ? "#22c55e"
                              : "hsl(var(--muted-foreground))",
                          }}
                        >
                          {passed ? "✓" : "○"}
                        </span>
                        <span className="check-label">
                          {key === "length"
                            ? "8+ characters"
                            : key === "uppercase"
                            ? "Uppercase letter"
                            : key === "lowercase"
                            ? "Lowercase letter"
                            : key === "number"
                            ? "Number"
                            : "Special character"}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {isSignUp && (
            <div className="terms-row mt-4">
              <input
                type="checkbox"
                id="terms"
                checked={termsAccepted}
                onChange={(e) => setTermsAccepted(e.target.checked)}
                className="mt-1"
                required
              />
              <label htmlFor="terms" className="leading-tight">
                I agree to the{" "}
                <span className="terms-link" onClick={() => setShowTerms(true)}>
                  Terms of Service
                </span>{" "}
                and{" "}
                <span className="terms-link" onClick={() => setShowPrivacy(true)}>
                  Privacy Policy
                </span>
              </label>
            </div>
          )}

          <Button
            type="submit"
            className="w-full h-12"
            disabled={loading || (isSignUp && !termsAccepted)}
            data-testid="button-submit-auth"
          >
            {loading ? "Please wait..." : isSignUp ? "Sign Up" : "Sign In"}
          </Button>
        </form>

        {/* Toggle Sign Up/Sign In */}
        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={() => setIsSignUp(!isSignUp)}
            className="text-sm text-primary hover:underline"
            data-testid="button-toggle-auth-mode"
          >
            {isSignUp
              ? "Already have an account? Sign in"
              : "Don't have an account? Sign up"}
          </button>
        </div>
      </Card>

      {/* Terms Modal */}
      {showTerms && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <Card className="w-full max-w-lg p-6 max-h-[80vh] overflow-auto">
            <h3 className="text-xl font-bold mb-4">Terms of Service</h3>
            <div className="space-y-4 text-sm text-muted-foreground mb-6">
              <p>By using EV Charging Platform you agree to:</p>
              <ul className="list-disc pl-5 space-y-2">
                <li>Use the platform for legitimate EV charging purposes only</li>
                <li>Not abuse the booking system or lock slots without intent to charge</li>
                <li>Pay for all confirmed sessions</li>
                <li>Treat station owners and other drivers respectfully</li>
              </ul>
            </div>
            <Button onClick={() => setShowTerms(false)} className="w-full">
              Close
            </Button>
          </Card>
        </div>
      )}

      {/* Privacy Modal */}
      {showPrivacy && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <Card className="w-full max-w-lg p-6 max-h-[80vh] overflow-auto">
            <h3 className="text-xl font-bold mb-4">Privacy Policy</h3>
            <div className="space-y-4 text-sm text-muted-foreground mb-6">
              <p>Your privacy is important to us. We collect and use data to:</p>
              <ul className="list-disc pl-5 space-y-2">
                <li>Facilitate station bookings and payments</li>
                <li>Provide location-based charging station recommendations</li>
                <li>Send essential notifications about your charging sessions</li>
                <li>Improve our services based on anonymized usage data</li>
              </ul>
            </div>
            <Button onClick={() => setShowPrivacy(false)} className="w-full">
              Close
            </Button>
          </Card>
        </div>
      )}

      {/* Forgot Password Modal */}
      {showForgotPassword && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <Card className="w-full max-w-md p-6 forgot-modal">
            {!resetSent ? (
              <>
                <h3 className="text-xl font-bold mb-2">Reset Password</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Enter your email address and we'll send you a link to reset your password.
                </p>

                <div className="space-y-4">
                  <Input
                    type="email"
                    placeholder="Enter your email"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    className="reset-email-input"
                  />

                  {resetError && <p className="text-sm text-destructive">{resetError}</p>}

                  <div className="flex gap-3 justify-end">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setShowForgotPassword(false);
                        setResetEmail("");
                        setResetError("");
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      className="btn-primary"
                      disabled={!resetEmail || resetLoading}
                      onClick={handleSendReset}
                    >
                      {resetLoading ? "Sending..." : "Send Reset Link"}
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              <div className="text-center py-4">
                <div className="text-4xl mb-4">✉️</div>
                <h3 className="text-xl font-bold mb-2">Check Your Email</h3>
                <p className="text-sm text-muted-foreground mb-1">
                  We sent a password reset link to:
                </p>
                <strong className="text-primary block mb-4">{resetEmail}</strong>
                <p className="text-xs text-muted-foreground mb-6">
                  Check your spam folder if you don't see it within 2 minutes.
                </p>

                <div className="space-y-3">
                  <Button
                    className="w-full"
                    onClick={() => {
                      setShowForgotPassword(false);
                      setResetSent(false);
                      setResetEmail("");
                    }}
                  >
                    Back to Sign In
                  </Button>

                  <button
                    type="button"
                    className="text-xs text-primary hover:underline block mx-auto"
                    onClick={handleSendReset}
                  >
                    Resend Email
                  </button>
                </div>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
