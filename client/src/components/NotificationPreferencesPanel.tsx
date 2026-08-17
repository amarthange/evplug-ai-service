import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  Bell, BellOff, ShieldAlert, CheckCircle2, 
  ChevronRight, Settings2, Info, AlertTriangle
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { 
  NOTIFICATION_CATEGORIES, 
  NOTIFICATION_PREFS, 
  getNotificationSettings, 
  updateNotificationSettings 
} from "@/lib/notification-prefs";
import { cn } from "@/lib/utils";

interface Props {
  userId: string;
}

export function NotificationPreferencesPanel({ userId }: Props) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof Notification !== "undefined" ? Notification.permission : "default"
  );

  // Sync permission state
  useEffect(() => {
    if (typeof Notification === "undefined") return;
    const interval = setInterval(() => {
      if (Notification.permission !== permission) {
        setPermission(Notification.permission);
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [permission]);

  const { data: settings = {}, isLoading } = useQuery({
    queryKey: ["notification-settings", userId],
    queryFn: () => getNotificationSettings(userId),
  });

  const mutation = useMutation({
    mutationFn: (newSettings: Record<string, boolean>) => 
      updateNotificationSettings(userId, newSettings),
    onMutate: async (newSettings) => {
      await queryClient.cancelQueries({ queryKey: ["notification-settings", userId] });
      const previousSettings = queryClient.getQueryData(["notification-settings", userId]);
      queryClient.setQueryData(["notification-settings", userId], newSettings);
      return { previousSettings };
    },
    onError: (err, newSettings, context) => {
      queryClient.setQueryData(["notification-settings", userId], context?.previousSettings);
      toast({
        variant: "destructive",
        title: "Sync Failed",
        description: "Failed to update notification preferences. Please try again.",
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["notification-settings", userId] });
    },
  });

  const handleToggle = (prefId: string, value: boolean) => {
    const updatedSettings = { ...settings, [prefId]: value };
    mutation.mutate(updatedSettings);
  };

  const requestPermission = async () => {
    if (typeof Notification === "undefined") return;
    const result = await Notification.requestPermission();
    setPermission(result);
    if (result === "granted") {
      toast({
        title: "Notifications Enabled",
        description: "You will now receive real-time charging alerts.",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 bg-white/5 rounded-[24px]" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Permission Warning */}
      {permission !== "granted" && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Card className="bg-amber-500/10 border-amber-500/20 rounded-[24px] overflow-hidden">
            <CardContent className="p-4 flex gap-4 items-start">
              <div className="p-2 bg-amber-500/20 rounded-xl">
                <AlertTriangle className="w-5 h-5 text-amber-500" />
              </div>
              <div className="flex-1 space-y-2">
                <h4 className="text-sm font-black text-amber-500 uppercase tracking-wider">
                  Push Access {permission === "denied" ? "Blocked" : "Required"}
                </h4>
                <p className="text-xs font-bold text-amber-500/70 leading-relaxed">
                  {permission === "denied" 
                    ? "Your browser is blocking notifications. Please enable them in site settings to receive critical session alerts."
                    : "Enable browser notifications to stay updated on your charging progress even when the app is closed."}
                </p>
                {permission === "default" && (
                  <Button 
                    size="sm" 
                    onClick={requestPermission}
                    className="bg-amber-500 hover:bg-amber-600 text-black font-black text-[10px] uppercase tracking-widest h-8 px-4 rounded-lg"
                  >
                    Enable Notifications
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Category Groups */}
      {NOTIFICATION_CATEGORIES.map((category) => (
        <section key={category.id} className="space-y-4">
          <div className="flex items-center justify-between px-2">
            <h3 className="text-xs font-black uppercase tracking-[0.2em] text-white/40 flex items-center gap-2">
              <span className="text-base">{category.icon}</span> {category.label}
            </h3>
            <Badge variant="outline" className="bg-white/5 border-white/10 text-[9px] font-black uppercase opacity-60">
              {NOTIFICATION_PREFS.filter(p => p.category === category.id && settings[p.id]).length} Active
            </Badge>
          </div>

          <div className="grid gap-3">
            {NOTIFICATION_PREFS.filter((p) => p.category === category.id).map((pref) => (
              <Card 
                key={pref.id}
                className={cn(
                  "premium-glass border-none transition-all duration-300 rounded-[24px] group",
                  settings[pref.id] ? "bg-white/[0.04]" : "bg-white/[0.01] opacity-60"
                )}
              >
                <CardContent className="p-5 flex items-center gap-4">
                  <div className={cn(
                    "w-12 h-12 rounded-2xl flex items-center justify-center text-xl shadow-inner transition-transform group-hover:scale-110",
                    settings[pref.id] ? "bg-primary/20 text-primary" : "bg-white/5 text-white/20"
                  )}>
                    {pref.icon}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-black tracking-tight">{pref.label}</h4>
                    <p className="text-[11px] font-bold text-white/30 leading-tight mt-0.5">
                      {pref.description}
                    </p>
                  </div>

                  <Switch 
                    checked={!!settings[pref.id]} 
                    onCheckedChange={(val) => handleToggle(pref.id, val)}
                    className="data-[state=checked]:bg-primary"
                  />
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      ))}

      {/* Persistence Info */}
      <div className="flex items-center justify-center gap-2 py-4 opacity-20 group">
        <ShieldAlert className="w-3 h-3 group-hover:text-primary transition-colors" />
        <span className="text-[9px] font-black uppercase tracking-widest">
          Preferences synced with cloud profile
        </span>
      </div>
    </div>
  );
}
