import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Building2 } from "lucide-react";
import { SiGoogle } from "react-icons/si";
import {
  signInWithEmailAndPassword,
  signInWithRedirect,
  getRedirectResult,
} from "firebase/auth";
import { auth, googleProvider } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";

export default function OwnerLogin() {
  const [, setLocation] = useLocation();
  const { user, userRole, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (!authLoading && user) {
      if (userRole === "owner") {
        setLocation("/owner/dashboard");
      } else if (userRole === "ev_user") {
        // If they are an EV user, they shouldn't be here
        toast({
          variant: "destructive",
          title: "Access Denied",
          description: "This portal is for station owners only. Please use the driver app.",
        });
        setLocation("/");
      }
    }
  }, [user, userRole, authLoading, setLocation, toast]);

  useEffect(() => {
    const handleRedirect = async () => {
      try {
        const result = await getRedirectResult(auth);
        if (result?.user) {
          toast({
            title: "Welcome Back!",
            description: "You have been signed in.",
          });
          setLocation("/owner/dashboard");
        }
      } catch (error: any) {
        console.error("Google sign-in error:", error);
        toast({
          variant: "destructive",
          title: "Sign In Failed",
          description: error.message,
        });
      }
    };
    handleRedirect();
  }, [toast, setLocation]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      await signInWithEmailAndPassword(auth, email, password);
      toast({
        title: "Success!",
        description: "You have been signed in.",
      });
      setLocation("/owner/dashboard");
    } catch (error: any) {
      console.error("Sign in error:", error);
      toast({
        variant: "destructive",
        title: "Sign In Failed",
        description: error.message || "Invalid email or password",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-slate-950 dark:to-slate-900 flex items-center justify-center p-4">
      <Card className="w-full max-w-md p-6">
        <div className="text-center mb-6">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Building2 className="w-6 h-6 text-blue-600" />
            <h1 className="text-2xl font-bold">Station Owner</h1>
          </div>
          <p className="text-muted-foreground">Manage your charging stations</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="your@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
              data-testid="input-email"
            />
          </div>

          <div>
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              data-testid="input-password"
            />
          </div>

          <Button
            type="submit"
            className="w-full"
            disabled={loading}
            data-testid="button-signin"
          >
            {loading ? "Signing In..." : "Sign In"}
          </Button>
        </form>

        <Separator className="my-4" />

        <Button
          variant="outline"
          className="w-full gap-2"
          onClick={() => {
            try {
              signInWithRedirect(auth, googleProvider);
            } catch (error: any) {
              console.error("Google sign-in error:", error);
            }
          }}
          disabled={loading}
          data-testid="button-google-signin"
        >
          <SiGoogle className="w-4 h-4" />
          Sign In with Google
        </Button>

        <p className="text-center text-sm text-muted-foreground mt-4">
          Don't have an account?{" "}
          <button
            onClick={() => setLocation("/owner/signup")}
            className="text-blue-600 hover:underline"
            data-testid="link-signup"
          >
            Create Account
          </button>
        </p>
      </Card>
    </div>
  );
}
