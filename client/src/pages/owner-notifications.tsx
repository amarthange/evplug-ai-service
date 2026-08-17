import { useState, useEffect, useMemo } from "react";
import { collection, query, where, onSnapshot, writeBatch, doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bell, Zap, AlertTriangle, CheckCircle2, DollarSign, Filter, Wrench, MessageCircle } from "lucide-react";
import { toJSDate, safeFormatDistanceToNow } from "@/lib/date-utils";
import ChatWindow from "@/components/ChatWindow";
import { cn } from "@/lib/utils";

const NOTIF_CATEGORIES = [
  { id: 'all', label: 'All Activity', icon: Bell },
  { id: 'booking', label: 'Bookings', icon: Zap },
  { id: 'maintenance', label: 'Maintenance', icon: Wrench },
  { id: 'revenue', label: 'Revenue', icon: DollarSign },
];

export default function OwnerNotifications() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all');
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [activeChatData, setActiveChatData] = useState<any>(null);

  useEffect(() => {
    if (!user?.uid) return;

    const q = query(collection(db, "notifications"), where("ownerId", "==", user.uid));
    const unsubscribe = onSnapshot(q, (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];
      data.sort((a, b) => toJSDate(b.createdAt).getTime() - toJSDate(a.createdAt).getTime());
      setNotifications(data);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user?.uid]);

  const filteredNotifications = useMemo(() => {
    if (activeTab === 'all') return notifications;
    if (activeTab === 'booking') return notifications.filter(n => 
      ["NEW_BOOKING", "SESSION_COMPLETE", "NEW_MESSAGE"].includes(notifTypeToCategory(n.type)) || 
      n.type?.includes("BOOKING")
    );
    if (activeTab === 'maintenance') return notifications.filter(n => 
      ["CONNECTOR_FAULT", "MAINTENANCE_DUE", "LOW_RATING"].includes(notifTypeToCategory(n.type)) || 
      n.type?.includes("MAINTENANCE") || n.type?.includes("RISK")
    );
    if (activeTab === 'revenue') return notifications.filter(n => 
      ["REVENUE_MILESTONE"].includes(notifTypeToCategory(n.type)) || 
      n.type?.includes("REVENUE")
    );
    return notifications;
  }, [notifications, activeTab]);

  function notifTypeToCategory(type: string) {
    if (["NEW_BOOKING", "SESSION_COMPLETE", "NEW_MESSAGE"].includes(type)) return type;
    if (["CONNECTOR_FAULT", "MAINTENANCE_DUE", "LOW_RATING", "HIGH_RISK_ALERT"].includes(type)) return type;
    if (["REVENUE_MILESTONE"].includes(type)) return type;
    return type;
  }

  const markAllRead = async () => {
    const unread = notifications.filter(n => !n.read);
    if (unread.length === 0) return;

    const batchSize = 500;
    for (let i = 0; i < unread.length; i += batchSize) {
      const chunk = unread.slice(i, i + batchSize);
      const batch = writeBatch(db);
      chunk.forEach(n => {
        batch.update(doc(db, "notifications", n.id), { read: true });
      });
      await batch.commit();
    }
  };

  const markAsRead = async (id: string, currentlyRead: boolean) => {
    if (currentlyRead) return;
    const batch = writeBatch(db);
    batch.update(doc(db, "notifications", id), { read: true });
    await batch.commit();
  };

  const handleReply = async (chatId: string) => {
    try {
      const chatRef = doc(db, "chats", chatId);
      const chatSnap = await getDoc(chatRef);
      if (chatSnap.exists()) {
        setActiveChatData({ id: chatId, ...chatSnap.data() });
        setActiveChatId(chatId);
      }
    } catch (err) {
      console.error("Error fetching chat for reply:", err);
    }
  };

  if (loading) {
    return (
      <div className="h-[60vh] flex flex-col items-center justify-center gap-4">
        <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
        <p className="font-black text-slate-400 animate-pulse uppercase tracking-widest text-xs">Synchronizing Alerts...</p>
      </div>
    );
  }

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-20 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1">
          <h1 className="text-4xl font-black tracking-tight text-slate-900 dark:text-white flex items-center gap-3">
             Notification Hub
          </h1>
          <p className="text-muted-foreground font-medium flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Live monitoring active for {notifications.length} logged events
          </p>
        </div>
        <div className="flex items-center gap-3">
          {unreadCount > 0 && (
            <Button onClick={markAllRead} variant="outline" className="rounded-2xl h-11 border-primary/20 bg-primary/5 text-primary hover:bg-primary hover:text-white transition-all font-bold">
              <CheckCircle2 className="w-4 h-4 mr-2" /> Mark all read ({unreadCount})
            </Button>
          )}
        </div>
      </div>

      {/* Tabs / Filters */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
        {NOTIF_CATEGORIES.map((cat) => {
          const Icon = cat.icon;
          const active = activeTab === cat.id;
          return (
            <button
              key={cat.id}
              onClick={() => setActiveTab(cat.id)}
              className={cn(
                "flex items-center gap-2 px-5 py-2.5 rounded-2xl text-sm font-bold transition-all whitespace-nowrap border-2",
                active 
                  ? "bg-primary text-primary-foreground border-primary shadow-lg shadow-primary/20 scale-105 z-10" 
                  : "bg-white dark:bg-slate-900 border-transparent text-muted-foreground hover:border-border"
              )}
            >
              <Icon className="w-4 h-4" />
              {cat.label}
              {cat.id === 'all' && unreadCount > 0 && (
                <span className="ml-1 bg-white/20 text-white text-[10px] px-1.5 py-0.5 rounded-full">
                  {unreadCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Notifications List */}
      <div className="grid gap-4">
        {filteredNotifications.length === 0 ? (
          <Card className="rounded-[32px] border-2 border-dashed border-muted bg-transparent h-80 flex flex-col items-center justify-center text-center p-8">
            <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mb-4">
              <Bell className="w-8 h-8 text-muted-foreground opacity-40" />
            </div>
            <h3 className="text-xl font-black text-slate-400">Quiet for now</h3>
            <p className="text-muted-foreground font-medium mt-2 max-w-xs">
              No notifications found for this category. New events will appear here in real-time.
            </p>
          </Card>
        ) : (
          filteredNotifications.map((notif) => {
             const isMaintenance = ["LOW_RATING", "CONNECTOR_FAULT", "MAINTENANCE_DUE", "HIGH_RISK_ALERT"].includes(notif.type);
             const isRevenue = ["REVENUE_MILESTONE"].includes(notif.type);
             const isBooking = ["NEW_BOOKING", "SESSION_COMPLETE"].includes(notif.type);
             const isMessage = ["NEW_MESSAGE"].includes(notif.type);

             return (
               <Card 
                 key={notif.id} 
                 onClick={() => markAsRead(notif.id, notif.read)}
                 className={cn(
                   "group relative cursor-pointer rounded-[28px] transition-all duration-300 border-2 overflow-hidden",
                   !notif.read 
                    ? (isMaintenance ? 'border-amber-500/50 bg-amber-500/[0.03] shadow-lg shadow-amber-500/5' : 
                       isRevenue ? 'border-emerald-500/50 bg-emerald-500/[0.03] shadow-lg shadow-emerald-500/5' :
                       'border-primary/50 bg-primary/[0.03] shadow-lg shadow-primary/5')
                    : 'bg-white dark:bg-slate-900 border-white/5 hover:border-border hover:shadow-xl'
                 )}
               >
                 <CardContent className="p-6 flex gap-5 items-start">
                    <div className={cn(
                      "mt-1 w-12 h-12 shrink-0 rounded-2xl flex items-center justify-center transition-transform group-hover:scale-110 duration-300",
                      isMaintenance ? 'bg-amber-500/10 text-amber-500' : 
                      isRevenue ? 'bg-emerald-500/10 text-emerald-500' :
                      isMessage ? 'bg-blue-500/10 text-blue-500' :
                      'bg-primary/10 text-primary'
                    )}>
                      {isMaintenance ? <AlertTriangle className="w-6 h-6" /> : 
                       isRevenue ? <DollarSign className="w-6 h-6" /> :
                       isMessage ? <MessageCircle className="w-6 h-6" /> :
                       <Zap className="w-6 h-6" />}
                    </div>
                    
                    <div className="flex-1 space-y-1">
                      <div className="flex justify-between items-start gap-4">
                        <div className="space-y-1">
                          <h4 className={cn(
                            "text-lg tracking-tight transition-colors",
                            !notif.read ? 'font-black' : 'font-bold text-slate-700 dark:text-slate-300'
                          )}>
                            {notif.title}
                          </h4>
                          {!notif.read && (
                            <Badge className={cn(
                              "text-[8px] font-black uppercase tracking-tighter px-1.5 py-0 h-4 rounded-md",
                              isMaintenance ? "bg-amber-500" : isRevenue ? "bg-emerald-500" : "bg-primary"
                            )}>
                              New Alert
                            </Badge>
                          )}
                        </div>
                        <span className="text-[10px] uppercase font-black tracking-widest text-muted-foreground shrink-0 mt-1 opacity-60">
                          {safeFormatDistanceToNow(notif.createdAt, { addSuffix: true })}
                        </span>
                      </div>
                      
                      <p className={cn(
                        "text-sm leading-relaxed",
                        !notif.read ? 'font-bold text-slate-800 dark:text-slate-200' : 'font-medium text-muted-foreground'
                      )}>
                        {notif.message}
                      </p>
                      
                      <div className="flex flex-wrap items-center gap-3 mt-4">
                        {notif.amount && (
                           <div className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center gap-2">
                             <DollarSign className="w-3 h-3" />
                             + ₹{notif.amount.toLocaleString()} Revenue
                           </div>
                        )}
                        
                        {notif.stationId && (
                          <div className="bg-slate-500/10 text-slate-600 dark:text-slate-400 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider">
                            Station ID: {notif.stationId.split('-')[0].toUpperCase()}
                          </div>
                        )}

                        {isMessage && notif.chatId && (
                          <Button 
                            size="sm" 
                            className="bg-primary text-primary-foreground font-black uppercase text-[10px] tracking-widest px-5 h-9 rounded-xl shadow-lg shadow-primary/20"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleReply(notif.chatId);
                            }}
                          >
                            Reply to Driver →
                          </Button>
                        )}

                        {(isMaintenance || notif.type === "HIGH_RISK_ALERT") && (
                          <Button 
                            variant="outline"
                            size="sm" 
                            className="border-amber-500/30 text-amber-500 hover:bg-amber-500 hover:text-white font-black uppercase text-[10px] tracking-widest px-5 h-9 rounded-xl"
                            onClick={(e) => {
                              e.stopPropagation();
                              window.location.href = "/owner/stations";
                            }}
                          >
                            Inspect Station →
                          </Button>
                        )}
                      </div>
                    </div>
                 </CardContent>
               </Card>
             );
          })
        )}
      </div>

      {activeChatId && activeChatData && (
        <ChatWindow
          chatId={activeChatId}
          currentUserId={user?.uid || ""}
          currentUserRole="owner"
          currentUserName={user?.displayName || "Station Owner"}
          recipientName={activeChatData.driverName || "Driver"}
          stationName={activeChatData.stationName || "Your Station"}
          onClose={() => setActiveChatId(null)}
        />
      )}
    </div>
  );
}
