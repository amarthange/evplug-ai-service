import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Zap, MapIcon, Calendar, LogOut, User, Settings, Bell, Search } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/language-context";
import { Building2 } from "lucide-react";

export function Header() {
  const [location] = useLocation();
  const { user, userRole, signOut } = useAuth();
  const { t } = useTranslation();
  const [unreadCount, setUnreadCount] = useState(0);
  const [activeBookingId, setActiveBookingId] = useState<string | null>(null);

  const isActive = (path: string) => location === path;

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, "notifications"),
      where("userId", "==", user.uid),
      where("read", "==", false)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setUnreadCount(snapshot.size);
    }, (err) => console.error("Error fetching notifications:", err));

    // Active Session Listener
    const aq = query(
      collection(db, "bookings"),
      where("userId", "==", user.uid),
      where("status", "==", "active")
    );
    const unsubscribeActive = onSnapshot(aq, (snapshot) => {
      if (!snapshot.empty) {
        setActiveBookingId(snapshot.docs[0].id);
      } else {
        setActiveBookingId(null);
      }
    }, (err) => console.error("Error fetching active booking:", err));

    return () => {
      try {
        if (typeof unsubscribe === "function") {
          unsubscribe();
        }
      } catch (err) {
        console.warn("⚠️ Safe notifications unsubscribe failed:", err);
      }

      try {
        if (typeof unsubscribeActive === "function") {
          unsubscribeActive();
        }
      } catch (err) {
        console.warn("⚠️ Safe active booking unsubscribe failed:", err);
      }
    };
  }, [user]);

  return (
    <header className={cn(
      "sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur-sm",
      userRole === "ev_user" && "hidden md:block" // Hide for EV users on mobile
    )}>
      <div className="container flex h-16 items-center justify-between px-4">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 hover-elevate px-3 py-2 rounded-lg -ml-3">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Zap className="w-5 h-5 text-primary" />
          </div>
          <span className="font-black text-xl hidden sm:inline tracking-tighter">
            EVPlug<span className="text-primary">Finder</span>
          </span>
        </Link>

        {/* Navigation */}
        <nav className="flex items-center gap-1">
          {userRole !== "owner" && userRole !== "admin" && (
            <Button
              variant={isActive("/") ? "secondary" : "ghost"}
              size="sm"
              className="gap-2 font-bold"
              asChild
            >
              <Link href="/">
                <MapIcon className="w-4 h-4" />
                <span className="hidden sm:inline">{t('nav_discovery')}</span>
              </Link>
            </Button>
          )}

          {user && userRole === "ev_user" && (
            <Button
              variant={isActive("/bookings") ? "secondary" : "ghost"}
              size="sm"
              className="gap-2 font-bold"
              asChild
            >
              <Link href="/bookings">
                <Calendar className="w-4 h-4" />
                <span className="hidden sm:inline">{t('nav_bookings')}</span>
              </Link>
            </Button>
          )}

          {userRole === "owner" && (
            <Button
              variant={isActive("/owner/dashboard") ? "secondary" : "ghost"}
              size="sm"
              className="gap-2 font-bold"
              asChild
            >
              <Link href="/owner/dashboard">
                <Zap className="w-4 h-4" />
                <span className="hidden sm:inline">Manage Stations</span>
              </Link>
            </Button>
          )}

          {userRole === "admin" && (
            <Button
              variant={isActive("/admin") ? "secondary" : "ghost"}
              size="sm"
              className="gap-2 font-bold"
              asChild
            >
              <Link href="/admin">
                <Search className="w-4 h-4" />
                <span className="hidden sm:inline">Admin Ops</span>
              </Link>
            </Button>
          )}
        </nav>

        {/* Right Actions */}
        <div className="flex items-center gap-2">
          {user && activeBookingId && location !== `/charge/${activeBookingId}` && (
            <Link href={`/charge/${activeBookingId}`} className="hidden sm:flex items-center gap-2 bg-emerald-500/10 text-emerald-500 px-3 py-1.5 rounded-full border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors mr-2">
              <Zap className="w-4 h-4 fill-emerald-500 animate-pulse" />
              <span className="text-[10px] font-black uppercase tracking-widest">Active session</span>
            </Link>
          )}

          {user && (
            <Link href="/notifications" className="relative group p-2 hover:bg-muted rounded-full transition-colors">
              <Bell className={cn(
                "w-5 h-5 transition-transform group-hover:rotate-12",
                unreadCount > 0 ? "text-primary animate-pulse" : "text-muted-foreground"
              )} />
              {unreadCount > 0 && (
                <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-destructive text-destructive-foreground text-[10px] font-black rounded-full flex items-center justify-center ring-2 ring-background">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </Link>
          )}

          <ThemeToggle />

          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="rounded-full ring-2 ring-transparent hover:ring-primary/20 transition-all ml-1"
                >
                  <Avatar className="w-8 h-8">
                    <AvatarImage src={user.photoURL || undefined} />
                    <AvatarFallback className="bg-primary/10 text-primary font-bold">
                      {user.displayName?.charAt(0) || user.email?.charAt(0).toUpperCase() || "U"}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64 p-2 shadow-2xl ring-1 ring-border/50">
                <div className="px-3 py-3 mb-2 bg-muted/30 rounded-xl">
                  <p className="text-sm font-black truncate">{user.displayName || "Explorer"}</p>
                  <p className="text-[10px] font-bold text-muted-foreground truncate uppercase tracking-widest">
                    {user.email}
                  </p>
                </div>
                {userRole !== "admin" && (
                  <DropdownMenuItem asChild className="rounded-lg h-10 font-bold mb-1">
                    <Link href="/user-profile" className="flex items-center w-full">
                      <User className="w-4 h-4 mr-2 text-primary" />
                      {t('profile_garage')}
                    </Link>
                  </DropdownMenuItem>
                )}
                {userRole === "owner" && (
                  <DropdownMenuItem asChild className="rounded-lg h-10 font-bold mb-1">
                    <Link href="/fleet" className="flex items-center w-full">
                      <Building2 className="w-4 h-4 mr-2 text-blue-400" />
                      Corporate Fleet
                    </Link>
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem asChild className="rounded-lg h-10 font-bold mb-1">
                  <Link href="/settings" className="flex items-center w-full">
                    <Settings className="w-4 h-4 mr-2" />
                    {t('settings')}
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator className="my-2" />
                <DropdownMenuItem onClick={() => signOut()} className="rounded-lg h-10 font-bold text-destructive hover:bg-destructive/10">
                  <LogOut className="w-4 h-4 mr-2" />
                  Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button size="sm" className="font-bold shadow-lg shadow-primary/20" asChild>
              <Link href="/auth">
                <User className="w-4 h-4 mr-2" />
                Sign In
              </Link>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
