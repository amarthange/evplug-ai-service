import React, { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { db } from "@/lib/firebase";
import { 
  collection, 
  query, 
  orderBy, 
  limit, 
  onSnapshot, 
  doc, 
  setDoc, 
  getDoc,
  serverTimestamp 
} from "firebase/firestore";
import { 
  Bell, 
  Settings, 
  History, 
  ShieldAlert, 
  Zap, 
  Activity, 
  Mail, 
  MessageSquare, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle,
  RefreshCw,
  Send,
  Save,
  Moon,
  Sun
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface NotificationPref {
  enabled: boolean;
  channels: ("email" | "sms")[];
}

interface AdminPrefs {
  alerts: Record<string, NotificationPref>;
  quietHours: {
    start: string;
    end: string;
    enabled: boolean;
  };
  limits: {
    smsHourly: number;
    emailDaily: number;
  };
}

export default function AdminNotificationSettings() {
  const { user, userRole } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [limits, setLimits] = useState<any>(null);
  
  const [prefs, setPrefs] = useState<AdminPrefs>({
    alerts: {
      SYSTEM_HEALTH_LOW: { enabled: true, channels: ["email", "sms"] },
      CRITICAL_ANOMALY: { enabled: true, channels: ["email", "sms"] },
      FRAUD_DETECTED: { enabled: true, channels: ["email", "sms"] },
      ML_MODEL_DRIFT: { enabled: true, channels: ["email"] },
      APPROVAL_BACKLOG: { enabled: true, channels: ["email"] },
      SLA_BREACH: { enabled: true, channels: ["email", "sms"] }
    },
    quietHours: {
      start: "22:00",
      end: "07:00",
      enabled: true
    },
    limits: {
      smsHourly: 10,
      emailDaily: 50
    }
  });

  useEffect(() => {
    if (!db || !user) return;

    // Load Prefs
    const loadPrefs = async () => {
      const docRef = doc(db, "admin_notification_prefs", "global");
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        setPrefs(snap.data() as AdminPrefs);
      }
      setLoading(false);
    };
    loadPrefs();

    // Listen to History
    const historyQuery = query(
      collection(db, "notification_history"),
      orderBy("sentAt", "desc"),
      limit(20)
    );
    const unsubHistory = onSnapshot(historyQuery, (snap) => {
      setHistory(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    // Listen to Limits
    const limitRef = doc(db, "system_stats", "notification_limits");
    const unsubLimits = onSnapshot(limitRef, (snap) => {
      if (snap.exists()) setLimits(snap.data());
    });

    return () => {
      try {
        if (typeof unsubHistory === "function") unsubHistory();
      } catch (err) {
        console.warn("⚠️ Safe unsubHistory failed:", err);
      }

      try {
        if (typeof unsubLimits === "function") unsubLimits();
      } catch (err) {
        console.warn("⚠️ Safe unsubLimits failed:", err);
      }
    };
  }, [user]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await setDoc(doc(db, "admin_notification_prefs", "global"), {
        ...prefs,
        updatedAt: serverTimestamp(),
        updatedBy: user?.email
      });
      toast({ title: "Settings saved successfully" });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Failed to save", description: err.message });
    } finally {
      setSaving(false);
    }
  };

  const triggerTest = async () => {
    try {
      const res = await fetch("/api/notifications/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          type: "TEST_ALERT", 
          data: { message: "This is a verification test from the admin panel." } 
        })
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: "Test notification triggered" });
      } else {
        throw new Error(data.error);
      }
    } catch (err: any) {
      toast({ variant: "destructive", title: "Test failed", description: err.message });
    }
  };

  const toggleChannel = (alertKey: string, channel: "email" | "sms") => {
    setPrefs(prev => {
      const current = prev.alerts[alertKey].channels;
      const next = current.includes(channel) 
        ? current.filter(c => c !== channel)
        : [...current, channel];
      
      return {
        ...prev,
        alerts: {
          ...prev.alerts,
          [alertKey]: { ...prev.alerts[alertKey], channels: next }
        }
      };
    });
  };

  if (loading) {
    return <div className="p-8 text-center animate-pulse">Loading settings...</div>;
  }

  return (
    <div className="container mx-auto p-6 space-y-8 bg-[var(--admin-bg)] text-[var(--admin-text-primary)] transition-colors duration-300 min-h-screen">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-4xl font-black flex items-center gap-3">
            <Bell className="w-10 h-10 text-amber-500 animate-bounce" />
            Alert Center
          </h1>
          <p className="admin-text-muted mt-2 font-medium">Configure platform-wide critical event triggers and delivery channels.</p>
        </div>
        <div className="flex gap-4">
          <Button variant="outline" onClick={triggerTest} className="gap-2 border-[var(--admin-border)] hover:bg-[var(--admin-border-muted)] text-[var(--admin-text-primary)]">
            <Send className="w-4 h-4" /> Test System
          </Button>
          <Button onClick={handleSave} disabled={saving} className="gap-2 bg-amber-600 hover:bg-amber-700 text-white font-bold">
            {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Changes
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Preferences */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="admin-glass-card border-none shadow-2xl overflow-hidden">
            <CardHeader className="border-b border-[var(--admin-border)] bg-[var(--admin-border-muted)]">
              <CardTitle className="text-xl font-bold flex items-center gap-2 admin-text-primary">
                <Settings className="w-5 h-5 text-blue-400" />
                Notification Triggers
              </CardTitle>
              <CardDescription className="admin-text-muted">Enable or disable specific system alerts.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-[var(--admin-border)]">
                {Object.entries(prefs.alerts).map(([key, pref]) => (
                  <div key={key} className="p-6 flex items-center justify-between hover:bg-[var(--admin-border-muted)] transition-colors">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold admin-text-primary">{key.replace(/_/g, ' ')}</span>
                        {key === 'FRAUD_DETECTED' && <Badge className="bg-red-500/20 text-red-400 border-red-500/30">CRITICAL</Badge>}
                      </div>
                      <p className="text-xs admin-text-muted italic">
                        {key === 'SYSTEM_HEALTH_LOW' ? 'Triggered when platform health score drops below 70%' :
                         key === 'FRAUD_DETECTED' ? 'Immediate alert for suspicious patterns (Account Takeover, Velocity Abuse)' :
                         key === 'ML_MODEL_DRIFT' ? 'Alerts when predictive accuracy falls below 50%' :
                         'Standard administrative monitoring trigger'}
                      </p>
                    </div>
                    
                    <div className="flex items-center gap-6">
                      <div className="flex gap-2">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => toggleChannel(key, "email")}
                          className={cn(
                            "h-8 w-8 p-0 rounded-full",
                            pref.channels.includes("email") ? "bg-blue-500/20 text-blue-400" : "admin-text-muted opacity-30"
                          )}
                        >
                          <Mail className="w-4 h-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => toggleChannel(key, "sms")}
                          className={cn(
                            "h-8 w-8 p-0 rounded-full",
                            pref.channels.includes("sms") ? "bg-green-500/20 text-green-400" : "admin-text-muted opacity-30"
                          )}
                        >
                          <MessageSquare className="w-4 h-4" />
                        </Button>
                      </div>
                      <Switch 
                        checked={pref.enabled} 
                        onCheckedChange={(val) => setPrefs(p => ({
                          ...p,
                          alerts: { ...p.alerts, [key]: { ...pref, enabled: val } }
                        }))}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="admin-glass-card border-none shadow-xl">
              <CardHeader>
                <CardTitle className="text-lg font-bold flex items-center gap-2 text-indigo-400">
                  <Moon className="w-5 h-5" /> Quiet Hours
                </CardTitle>
                <CardDescription className="admin-text-muted">Suppress SMS alerts during rest periods.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium admin-text-secondary">Enable Quiet Hours</span>
                  <Switch 
                    checked={prefs.quietHours.enabled}
                    onCheckedChange={(val) => setPrefs(p => ({
                      ...p,
                      quietHours: { ...p.quietHours, enabled: val }
                    }))}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase font-bold admin-text-muted">Start</label>
                    <Input 
                      type="time" 
                      value={prefs.quietHours.start} 
                      className="bg-[var(--admin-border-muted)] border-[var(--admin-border)] text-[var(--admin-text-primary)] h-9"
                      onChange={(e) => setPrefs(p => ({
                        ...p,
                        quietHours: { ...p.quietHours, start: e.target.value }
                      }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase font-bold admin-text-muted">End</label>
                    <Input 
                      type="time" 
                      value={prefs.quietHours.end} 
                      className="bg-[var(--admin-border-muted)] border-[var(--admin-border)] text-[var(--admin-text-primary)] h-9"
                      onChange={(e) => setPrefs(p => ({
                        ...p,
                        quietHours: { ...p.quietHours, end: e.target.value }
                      }))}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="admin-glass-card border-none border-l-4 border-l-amber-500 shadow-xl">
              <CardHeader>
                <CardTitle className="text-lg font-bold flex items-center gap-2 text-amber-500">
                  <Activity className="w-5 h-5" /> Usage Limits
                </CardTitle>
                <CardDescription className="admin-text-muted">Monitoring free-tier quotas.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-xs font-bold uppercase tracking-widest admin-text-secondary">
                    <span>SMS (Hourly)</span>
                    <span>{limits?.[`sms_hour_${new Date().getHours()}`] || 0} / {prefs.limits.smsHourly}</span>
                  </div>
                  <div className="h-2 bg-[var(--admin-border)] rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-amber-500" 
                      style={{ width: `${Math.min(100, ((limits?.[`sms_hour_${new Date().getHours()}`] || 0) / prefs.limits.smsHourly) * 100)}%` }}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-xs font-bold uppercase tracking-widest admin-text-secondary">
                    <span>Email (Daily)</span>
                    <span>{limits?.[`email_day_${new Date().toISOString().split('T')[0]}`] || 0} / {prefs.limits.emailDaily}</span>
                  </div>
                  <div className="h-2 bg-[var(--admin-border)] rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-blue-500" 
                      style={{ width: `${Math.min(100, ((limits?.[`email_day_${new Date().toISOString().split('T')[0]}`] || 0) / prefs.limits.emailDaily) * 100)}%` }}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Right Column: History */}
        <div className="space-y-6">
          <Card className="admin-glass-card border-none h-full shadow-2xl">
            <CardHeader className="border-b border-[var(--admin-border)] bg-[var(--admin-border-muted)]">
              <CardTitle className="text-xl font-bold flex items-center gap-2 admin-text-primary">
                <History className="w-5 h-5 text-emerald-400" />
                Alert History
              </CardTitle>
              <CardDescription className="admin-text-muted">Recently dispatched alerts.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-[600px] overflow-y-auto divide-y divide-[var(--admin-border)] custom-scrollbar">
                {history.length > 0 ? (
                  history.map((item) => (
                    <div key={item.id} className="p-4 space-y-2 hover:bg-[var(--admin-border-muted)] transition-colors">
                      <div className="flex justify-between items-start">
                        <div className="flex flex-col">
                          <span className="text-sm font-black admin-text-primary">{item.type}</span>
                          <span className="text-[10px] admin-text-muted flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {item.sentAt?.toDate ? item.sentAt.toDate().toLocaleString() : 'Just now'}
                          </span>
                        </div>
                        {item.status === 'success' ? (
                          <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                            <CheckCircle2 className="w-3 h-3 mr-1" /> SENT
                          </Badge>
                        ) : (
                          <Badge className="bg-red-500/20 text-red-400 border-red-500/30">
                            <XCircle className="w-3 h-3 mr-1" /> FAILED
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs admin-text-secondary line-clamp-2 italic">"{item.message}"</p>
                      <div className="flex gap-3 text-[10px] font-bold admin-text-muted uppercase">
                        <span className="flex items-center gap-1">
                          {item.channel === 'sms' ? <MessageSquare className="w-3 h-3" /> : <Mail className="w-3 h-3" />}
                          {item.channel}
                        </span>
                        <span className="truncate max-w-[100px]">{item.recipient}</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="p-12 text-center admin-text-muted flex flex-col items-center gap-4">
                    <Activity className="w-12 h-12 opacity-10" />
                    <span className="text-sm">No notification history recorded yet.</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

