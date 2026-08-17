import React, { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { db } from "@/lib/firebase";
import { 
  collection, 
  onSnapshot, 
  query, 
  orderBy, 
  limit, 
  doc, 
  setDoc, 
  serverTimestamp, 
  where,
  addDoc,
  updateDoc
} from "firebase/firestore";
import { 
  Users, 
  MessageSquare, 
  Bell, 
  X, 
  ChevronRight, 
  ChevronLeft,
  Search,
  User,
  Clock,
  Send,
  MoreVertical,
  Flag
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

export default function AdminCollabSidebar() {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [admins, setAdmins] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<"presence" | "chat">("presence");

  // Presence Heartbeat
  useEffect(() => {
    if (!user || !db) return;

    const updatePresence = async () => {
      try {
        const presenceRef = doc(db, "admin_presence", user.uid);
        await setDoc(presenceRef, {
          adminId: user.uid,
          adminName: user.displayName || user.email?.split("@")[0],
          lastSeen: serverTimestamp(),
          status: "online"
        }, { merge: true });
      } catch (err) {
        console.error("Error updating presence:", err);
      }
    };

    updatePresence();
    const interval = setInterval(updatePresence, 30000); // Every 30 seconds
    return () => clearInterval(interval);
  }, [user]);

  // Listen to Online Admins
  useEffect(() => {
    if (!db) return;
    
    let unsub: (() => void) | null = null;
    const timeoutId = setTimeout(() => {
      try {
        const q = query(collection(db, "admin_presence"), orderBy("lastSeen", "desc"));
        unsub = onSnapshot(q, (snap) => {
          setAdmins(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        }, (err) => console.error("Error listening to admin presence:", err));
      } catch (err) {
        console.error("Error setting up admin presence snapshot:", err);
      }
    }, 50);

    return () => {
      clearTimeout(timeoutId);
      if (unsub) {
        try {
          unsub();
        } catch (err) {
          console.warn("⚠️ Safe support unsub failed for admin presence:", err);
        }
      }
    };
  }, []);

  // Listen to Mentions/Notifications
  useEffect(() => {
    if (!user || !db) return;
    
    let unsub: (() => void) | null = null;
    const timeoutId = setTimeout(() => {
      try {
        const q = query(
          collection(db, "admin_notifications"), 
          where("adminId", "==", user.uid),
          where("read", "==", false),
          orderBy("createdAt", "desc")
        );
        unsub = onSnapshot(q, (snap) => {
          setNotifications(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        }, (err) => console.error("Error listening to admin notifications:", err));
      } catch (err) {
        console.error("Error setting up admin notifications snapshot:", err);
      }
    }, 50);

    return () => {
      clearTimeout(timeoutId);
      if (unsub) {
        try {
          unsub();
        } catch (err) {
          console.warn("⚠️ Safe support unsub failed for admin notifications:", err);
        }
      }
    };
  }, [user]);

  const markAsRead = async (id: string) => {
    await updateDoc(doc(db, "admin_notifications", id), { read: true });
  };

  return (
    <div 
      className={cn(
        "fixed right-0 top-16 h-[calc(100vh-64px)] bg-slate-950 border-l border-slate-800 transition-all duration-500 z-40 flex",
        isOpen ? "w-80" : "w-0"
      )}
    >
      {/* Toggle Button */}
      <Button 
        onClick={() => setIsOpen(!isOpen)}
        variant="outline"
        className={cn(
          "absolute -left-10 top-4 w-10 h-10 rounded-l-xl rounded-r-none border-r-0 bg-slate-950 border-slate-800 p-0 hover:bg-slate-900 transition-all",
          isOpen && "bg-primary text-primary-foreground border-primary hover:bg-primary/90"
        )}
      >
        {isOpen ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
        {notifications.length > 0 && !isOpen && (
          <Badge className="absolute -top-2 -left-2 px-1.5 py-0.5 bg-red-500 animate-bounce">
            {notifications.length}
          </Badge>
        )}
      </Button>

      <div className={cn("flex-1 flex flex-col overflow-hidden", !isOpen && "hidden")}>
        {/* Header */}
        <div className="p-4 border-b border-slate-800 bg-slate-900/50 flex justify-between items-center">
          <div className="flex gap-2">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => setActiveTab("presence")}
              className={cn("px-3 rounded-lg", activeTab === 'presence' && "bg-slate-800")}
            >
              <Users className="w-4 h-4 mr-2" /> Team
            </Button>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => setActiveTab("chat")}
              className={cn("px-3 rounded-lg relative", activeTab === 'chat' && "bg-slate-800")}
            >
              <Bell className="w-4 h-4 mr-2" /> 
              Alerts
              {notifications.length > 0 && (
                <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
              )}
            </Button>
          </div>
          <Button variant="ghost" size="icon" onClick={() => setIsOpen(false)}>
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Content */}
        <ScrollArea className="flex-1">
          {activeTab === "presence" ? (
            <div className="p-4 space-y-4">
              <h3 className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Active Administrators</h3>
              <div className="space-y-3">
                {admins.map((admin) => {
                  const isOnline = admin.lastSeen?.toMillis() > Date.now() - 120000;
                  return (
                    <div key={admin.id} className="flex items-center justify-between p-2 rounded-xl hover:bg-slate-900 transition-colors group">
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          <Avatar className="w-8 h-8 border-2 border-slate-800">
                            <AvatarFallback className="bg-primary/20 text-primary text-xs font-black">
                              {admin.adminName?.substring(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <span className={cn(
                            "absolute bottom-0 right-0 w-2.5 h-2.5 border-2 border-slate-950 rounded-full",
                            isOnline ? "bg-emerald-500" : "bg-slate-600"
                          )} />
                        </div>
                        <div>
                          <p className="text-sm font-bold">{admin.adminName}</p>
                          <p className="text-[10px] text-slate-500 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {admin.lastSeen ? formatDistanceToNow(admin.lastSeen.toDate(), { addSuffix: true }) : 'offline'}
                          </p>
                        </div>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 h-8 w-8">
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="bg-slate-900 border-slate-800">
                          <DropdownMenuItem className="gap-2">
                            <MessageSquare className="w-4 h-4" /> Direct Message
                          </DropdownMenuItem>
                          <DropdownMenuItem className="gap-2">
                            <Flag className="w-4 h-4" /> View Activity
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="p-4 space-y-4">
              <h3 className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Notifications</h3>
              {notifications.length === 0 ? (
                <div className="text-center py-12 space-y-3">
                  <Bell className="w-10 h-10 text-slate-800 mx-auto" />
                  <p className="text-xs text-slate-500 italic">No new @mentions.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {notifications.map((notif) => (
                    <div 
                      key={notif.id} 
                      className="p-3 bg-primary/5 border border-primary/20 rounded-xl space-y-2 cursor-pointer hover:bg-primary/10 transition-colors"
                      onClick={() => markAsRead(notif.id)}
                    >
                      <div className="flex justify-between items-start">
                        <span className="text-[10px] font-black text-primary uppercase">Mention</span>
                        <span className="text-[10px] text-slate-500">
                          {notif.createdAt?.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-xs">
                        <span className="font-bold text-primary">@{notif.mentionedBy}</span> tagged you in a note.
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </ScrollArea>

        {/* Footer info */}
        <div className="p-4 bg-slate-900 border-t border-slate-800">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Collaboration Sync Active</span>
          </div>
        </div>
      </div>
    </div>
  );
}
