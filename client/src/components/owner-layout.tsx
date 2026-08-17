import { Link, useLocation } from "wouter";
import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import UserChatbot from "@/components/UserChatbot";
import { subscribeToOwnerChats } from "@/services/chatService";
import { OwnerContext } from "@/utils/geminiChatbot";
import { ThemeToggle } from "@/components/theme-toggle";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  LayoutDashboard,
  Zap,
  BookOpen,
  Star,
  Settings,
  LogOut,
  Search,
  Bell,
  ChevronDown,
  Users,
  Tag,
  HelpCircle,
  Building2,
  QrCode
} from "lucide-react";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useToast } from "@/hooks/use-toast";

const navItems = [
  { href: "/owner/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/owner/stations", label: "My Stations", icon: Zap },
  { href: "/owner/scanner", label: "Check-in Scanner", icon: QrCode },
  { href: "/owner/ledger", label: "Booking Ledger", icon: BookOpen },
  { href: "/owner/drivers", label: "Drivers", icon: Users },
  { href: "/owner/promotions", label: "Promotions", icon: Tag },
  { href: "/owner/reviews", label: "Reviews", icon: Star },
  { 
    href: "/owner/announcements", 
    label: "Announcements", 
    icon: () => (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none"
           stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <path d="M2 4h12v8a1 1 0 01-1 1H3a1 1 0 01-1-1V4z"/>
        <path d="M2 4l6 5 6-5"/>
      </svg>
    ) 
  },
  { href: "/owner/notifications", label: "Notifications", icon: Bell },
  { href: "/owner/help", label: "Help & Support", icon: HelpCircle },
  { href: "/fleet", label: "Fleet Management", icon: Building2 },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function OwnerLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const [unreadCount, setUnreadCount] = useState(0);
  const [totalChatUnread, setTotalChatUnread] = useState(0);
  const [stationIds, setStationIds] = useState<string[]>([]);

  const [ownerContext, setOwnerContext] = useState<OwnerContext>({
    role: "owner",
    fullName: user?.displayName || "",
    stats: { totalRevenue: 0, activeStations: 0, pendingRequests: 0, todayBookings: 0, avgRating: 0 },
    stations: [],
    recentBookings: []
  });

  // Fetch Owner Stats for AI Chatbot
  useEffect(() => {
    if (!user?.uid) return;

    // 1. Listen to Stations
    const qStations = query(collection(db, "stations"), where("ownerId", "==", user.uid));
    const unsubStations = onSnapshot(qStations, (snap) => {
      const stations = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const activeCount = stations.filter((s: any) => s.status === "active").length;
      const pendingCount = stations.filter((s: any) => s.status === "pending").length;
      
      const avgRating = stations.length > 0 
        ? stations.reduce((acc, s: any) => acc + (s.avgRating || 0), 0) / stations.length 
        : 5.0; // Default to 5.0 for new owners

      setStationIds(stations.map(s => s.id));
      setOwnerContext(prev => ({
        ...prev,
        stats: { ...prev.stats, activeStations: activeCount, pendingRequests: pendingCount, avgRating },
        stations
      }));
    });

    // 2. Listen to Notifications
    const qNotifs = query(collection(db, "notifications"), where("ownerId", "==", user.uid));
    const unsubNotifs = onSnapshot(qNotifs, (snap) => {
      const activeUnread = snap.docs.filter(d => !d.data().read).length;
      setUnreadCount(activeUnread);
    });

    // 3. Listen to Chat Unreads
    const unsubChats = subscribeToOwnerChats(user.uid, (chats) => {
      const total = chats.reduce((sum, chat) => sum + (chat.ownerUnread || 0), 0);
      setTotalChatUnread(total);
    });

    return () => {
      unsubStations();
      unsubNotifs();
      unsubChats();
    };
  }, [user?.uid]);

  // Listen to Bookings for revenue and today's count (by ownerId and stationIds to handle seeded/older bookings)
  useEffect(() => {
    if (!user?.uid) return;

    let unsubBookingsOwner: (() => void) | null = null;
    let unsubBookingsStations: (() => void)[] = [];

    let bookingsFromOwner: any[] = [];
    const bookingsFromStationsMap: Record<number, any[]> = {};

    const updateBookingsContext = () => {
      const bookingsMap = new Map<string, any>();
      bookingsFromOwner.forEach(b => bookingsMap.set(b.id, b));
      Object.values(bookingsFromStationsMap).forEach(list => {
        list.forEach(b => bookingsMap.set(b.id, b));
      });
      const mergedBookings = Array.from(bookingsMap.values());

      const totalRevenue = mergedBookings
        .filter((b: any) => b.status === "completed" || b.paymentStatus === "completed" || b.paymentStatus === "paid")
        .reduce((acc, b: any) => acc + (Number(b.totalPrice) || 0), 0);
      
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayCount = mergedBookings.filter((b: any) => {
        const bDate = b.createdAt ? new Date(b.createdAt) : new Date();
        return bDate >= todayStart;
      }).length;

      setOwnerContext(prev => ({
        ...prev,
        stats: { ...prev.stats, totalRevenue, todayBookings: todayCount },
        recentBookings: (mergedBookings as any[]).sort((a,b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 5)
      }));
    };

    // 1. Listen by ownerId
    const qBookingsOwner = query(collection(db, "bookings"), where("ownerId", "==", user.uid));
    unsubBookingsOwner = onSnapshot(qBookingsOwner, (snap) => {
      bookingsFromOwner = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      updateBookingsContext();
    });

    // 2. Listen by stationId in chunks of 10
    const chunks: string[][] = [];
    for (let i = 0; i < stationIds.length; i += 10) {
      chunks.push(stationIds.slice(i, i + 10));
    }

    chunks.forEach((chunk, index) => {
      const qBookingsStations = query(collection(db, "bookings"), where("stationId", "in", chunk));
      const unsub = onSnapshot(qBookingsStations, (snap) => {
        bookingsFromStationsMap[index] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        updateBookingsContext();
      });
      unsubBookingsStations.push(unsub);
    });

    return () => {
      if (unsubBookingsOwner) unsubBookingsOwner();
      unsubBookingsStations.forEach(unsub => unsub());
    };
  }, [user?.uid, stationIds]);

  const handleSignOut = async () => {
    try {
      await signOut(auth);
    } catch {
      toast({ variant: "destructive", title: "Sign out failed" });
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-[hsl(220,20%,97%)] dark:bg-[hsl(220,20%,8%)]">
      {/* ─── Sidebar ─── */}
      <aside className="w-60 shrink-0 flex flex-col bg-white dark:bg-[hsl(220,20%,12%)] border-r border-border/60 z-20">
        {/* Logo */}
        <div className="flex items-center gap-3 px-6 py-5 border-b border-border/40">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shadow-sm">
            <Zap className="w-5 h-5 text-primary-foreground" />
          </div>
          <span className="font-bold text-lg tracking-tight">EV Owner</span>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = location === href;
            return (
              <Link key={href} href={href}>
                <a
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 cursor-pointer ${
                    active
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  {label}
                  {label === "Dashboard" && totalChatUnread > 0 && (
                    <span className="ml-auto bg-rose-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full shadow-lg shadow-rose-500/20 animate-pulse">
                      {totalChatUnread}
                    </span>
                  )}
                  {label === "Notifications" && unreadCount > 0 && (
                    <span className="ml-auto bg-primary text-primary-foreground text-[10px] font-black px-1.5 py-0.5 rounded-full shadow-lg shadow-primary/20">
                      {unreadCount}
                    </span>
                  )}
                </a>
              </Link>
            );
          })}
        </nav>

        {/* Sign Out */}
        <div className="px-3 pb-4 border-t border-border/40 pt-3">
          <button
            onClick={handleSignOut}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all duration-150"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* ─── Main Area ─── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Bar */}
        <header className="h-16 shrink-0 bg-white dark:bg-[hsl(220,20%,12%)] border-b border-border/60 flex items-center px-6 gap-4 z-10">
          {/* Search */}
          <div className="flex-1 max-w-xs relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search stations, bookings…"
              className="pl-9 h-9 bg-muted/30 border-transparent focus:border-border text-sm"
            />
          </div>

          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <Link href="/owner/notifications">
              <a className="relative inline-block">
                <Button variant="ghost" size="icon">
                  <Bell className="w-5 h-5" />
                  {unreadCount > 0 && (
                    <span className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-red-500 flex items-center justify-center text-[9px] font-bold text-white border-2 border-background">
                      {unreadCount}
                    </span>
                  )}
                </Button>
              </a>
            </Link>

            {/* Owner Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="gap-2 px-2 h-9">
                  <Avatar className="w-7 h-7">
                    <AvatarImage src={user?.photoURL || undefined} />
                    <AvatarFallback className="text-xs bg-primary/10 text-primary font-semibold">
                      {user?.email?.charAt(0).toUpperCase() || "O"}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-sm font-medium hidden sm:block max-w-[100px] truncate">
                    {user?.displayName || user?.email?.split("@")[0] || "Owner"}
                  </span>
                  <ChevronDown className="w-3 h-3 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <div className="px-2 py-1.5 text-sm">
                  <p className="font-medium truncate">{user?.displayName || "Station Owner"}</p>
                  <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/settings">Settings</Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut} className="text-destructive">
                  <LogOut className="w-4 h-4 mr-2" /> Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-auto p-6">{children}</main>
        <UserChatbot chatContext={ownerContext} />
      </div>
    </div>
  );
}
