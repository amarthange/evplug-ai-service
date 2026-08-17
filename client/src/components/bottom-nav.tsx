import { Link, useLocation } from "wouter";
import { MapIcon, Calendar, User, QrCode, Leaf } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { useEffect, useState } from "react";
import { db } from "@/lib/firebase";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { motion } from "framer-motion";

export function BottomNav() {
  const [location] = useLocation();
  const { user } = useAuth();
  const [activeBookingCount, setActiveBookingCount] = useState(0);

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, "bookings"),
      where("userId", "==", user.uid),
      where("status", "in", ["active", "pending"])
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setActiveBookingCount(snapshot.size);
    }, (err) => console.error("Error fetching bookings (BottomNav):", err));

    return () => unsubscribe();
  }, [user]);

  const navItems = [
    { label: "Map", icon: MapIcon, href: "/" },
    { label: "Bookings", icon: Calendar, href: "/bookings", badge: activeBookingCount > 0 ? activeBookingCount : null },
    { label: "Scan", icon: QrCode, href: "/scan", isFab: true },
    { label: "Impact", icon: Leaf, href: "/impact" },
    { label: "Profile", icon: User, href: "/user-profile" },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 md:hidden pb-[calc(env(safe-area-inset-bottom)+8px)] pt-2 px-4 bg-gradient-to-t from-[#0a0a0a] to-transparent pointer-events-none">
      <nav className="flex items-center justify-between h-[56px] bg-[rgba(20,20,20,0.75)] rounded-[20px] border border-[rgba(255,255,255,0.08)] shadow-[0_8px_32px_rgba(0,0,0,0.35)] backdrop-blur-[20px] px-2 pointer-events-auto relative">
        {navItems.map((item) => {
          const isActive = location === item.href;
          
          if (item.isFab) {
            return (
              <div key={item.href} className="relative -top-5 flex-1 flex justify-center">
                <Link href={item.href}>
                  <div className="w-14 h-14 rounded-full bg-gradient-to-tr from-[#00c853] to-[#00E676] flex items-center justify-center shadow-[0_4px_16px_rgba(0,230,118,0.3)] border-4 border-[#0a0a0a] hover:scale-105 active:scale-95 transition-transform duration-300 relative z-10 cursor-pointer">
                    <item.icon className="w-6 h-6 text-black" />
                  </div>
                </Link>
              </div>
            );
          }
 
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center justify-center flex-1 h-full gap-0.5 transition-colors relative z-10 cursor-pointer",
                isActive ? "text-[#ffffff]" : "text-[rgba(255,255,255,0.35)] hover:text-[rgba(255,255,255,0.6)]"
              )}
            >
              <div className="relative flex items-center justify-center w-10 h-7">
                {isActive && (
                  <motion.div
                    layoutId="nav-indicator"
                    className="absolute inset-0 bg-[#00E676]/10 rounded-full border border-[#00E676]/20"
                    transition={{ type: "spring", stiffness: 300, damping: 25 }}
                  />
                )}
                <item.icon
                  className={cn(
                    "w-4 h-4 transition-all duration-300 relative z-10",
                    isActive ? "text-[#00E676]" : ""
                  )}
                />
                {item.badge && (
                  <span className="absolute -top-1 -right-1 min-w-[14px] h-[14px] px-1 bg-[#ef4444] text-white text-[9px] font-black rounded-full flex items-center justify-center ring-2 ring-[#0a0a0a] z-20">
                    {item.badge}
                  </span>
                )}
              </div>
              <span className={cn(
                "text-[8px] font-black tracking-wide transition-all duration-300",
                isActive ? "text-[#00E676]" : "text-white/40"
              )}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
