import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { Link, useLocation } from "wouter";
import { 
  collection, 
  getDocs, 
  deleteDoc, 
  doc, 
  getDoc,
  setDoc,
  updateDoc, 
  addDoc, 
  serverTimestamp, 
  query, 
  where, 
  orderBy, 
  limit, 
  Timestamp,
  writeBatch,
  onSnapshot
} from "firebase/firestore";
import { isSameMonth, subMonths, format, subDays } from "date-fns";
import { auth, db } from "@/lib/firebase";
import { useQuery } from "@tanstack/react-query";
import { safeFormat } from "@/lib/date-utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Users, 
  Zap, 
  ShieldAlert,
  Trash2,
  MapIcon,
  TrendingUp,
  BarChart3,
  DollarSign,
  CheckCircle,
  XCircle,
  ArrowUpRight,
  ArrowDownRight,
  Star,
  Settings,
  History,
  MessagesSquare,
  BarChart3 as ReportsIcon,
  Trophy,
  Rocket,
  AlertTriangle,
  Activity,
  CheckCircle2,
  Clock,
  ShieldCheck,
  Wrench,
  Bell,
  Target,
  Database,
  Building2,
  Info
} from "lucide-react";
import AdminNotes from "@/components/AdminNotes";
import { 
  Sheet, 
  SheetContent, 
  SheetHeader, 
  SheetTitle, 
  SheetDescription 
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { manualSeed } from "@/lib/seed-data";
import { cn } from "@/lib/utils";
import type { Station } from "@shared/schema";
import { 
  AreaChart, 
  Area, 
  LineChart,
  Line,
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell
} from "recharts";

export default function AdminPanel() {
  const { user, userRole, loading: authLoading, signOut } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  const [stats, setStats] = useState({
    totalStations: 0,
    totalUsers: 0,
    totalOwners: 0,
    totalBookings: 0,
    activeBookings: 0,
    pendingStations: 0,
    unapprovedOwners: 0
  });
  
  const [stations, setStations] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [owners, setOwners] = useState<any[]>([]);
  const [bookings, setBookings] = useState<any[]>([]);
  const [reviews, setReviews] = useState<any[]>([]);
  const [selectedStation, setSelectedStation] = useState<Station | null>(null);
  const [loading, setLoading] = useState(true);
  
  const [analytics, setAnalytics] = useState({
    totalRevenue: 0,
    revenueByStation: {} as Record<string, number>,
    bookingTrends: [] as any[],
    userActivityLogs: [] as any[],
    stationMetrics: {} as Record<string, any>,
    paymentSuccess: 0,
    paymentFailure: 0,
    totalEnergy: 0,
    peakLoad: 0,
    estimatedMonthEnd: 0,
    peakRevenueHour: 0,
    cancellationLoss: 0,
    revenueByConnectorData: [] as any[],
    ownerRevenueMap: {} as Record<string, number>,
    hourlyRevenueData: [] as any[]
  });
  const [healthHistory, setHealthHistory] = useState<any[]>([]);

  // --- Security States ---
  const [lastActivity, setLastActivity] = useState(Date.now());
  const [showTimeoutWarning, setShowTimeoutWarning] = useState(false);
  const SESSION_TIMEOUT = 30 * 60 * 1000;

  // --- Analytics States ---
  const [selectedDateRange, setSelectedDateRange] = useState<"7d" | "30d" | "90d" | "all">("30d");
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);

  // --- New Feature States ---
  const [blockModal, setBlockModal] = useState<{uid: string, name: string} | null>(null);
  const [blockReason, setBlockReason] = useState("");
  const [activeSessions, setActiveSessions] = useState<any[]>([]);
  const [activeSessionsLoading, setActiveSessionsLoading] = useState(true);
  const [tickets, setTickets] = useState<any[]>([]);
  const [detectedAnomalies, setDetectedAnomalies] = useState<any[]>([]);
  
  // --- New Feature States (Phase 3) ---
  const [platformAvgRating, setPlatformAvgRating] = useState("0.0");
  const [openTicketsCount, setOpenTicketsCount] = useState(0);
  const [recentAuditLogs, setRecentAuditLogs] = useState<any[]>([]);
  const [totalOwnerUnread, setTotalOwnerUnread] = useState(0);
  const [activeChats, setActiveChats] = useState<any[]>([]);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [selectedBooking, setSelectedBooking] = useState<any>(null);
  const [selectedOwner, setSelectedOwner] = useState<any>(null);

  const [stationFilter, setStationFilter] = useState<"all" | "pending" | "active">("all");
  const [ownerFilter, setOwnerFilter] = useState<"all" | "pending" | "approved">("all");

  // --- Approval Enhancement States ---
  const [selectedForApproval, setSelectedForApproval] = useState<string[]>([]);
  const [rejectModal, setRejectModal] = useState<{
    stationId: string,
    stationName: string
  } | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectCustom, setRejectCustom] = useState("");

  const REJECTION_REASONS = [
    "Incomplete business information",
    "Invalid or unverifiable address",
    "Poor quality images submitted",
    "Pricing appears incorrect or misleading",
    "Duplicate station already exists nearby",
    "Connector specifications incomplete",
    "Operating hours not provided",
    "UPI payment details missing",
    "Custom reason..."
  ];

  const getPendingDuration = (createdAt: any) => {
    const created = createdAt?.toDate 
      ? createdAt.toDate() 
      : new Date(createdAt);
    const hoursWaiting = (Date.now() - created.getTime()) / 3600000;
    
    if (hoursWaiting < 24) 
      return { label: `${Math.floor(hoursWaiting)}h`, urgent: false };
    const daysWaiting = Math.floor(hoursWaiting/24);
    return { label: `${daysWaiting}d`, urgent: daysWaiting >= 2 };
  };

  const toggleSelectStation = (id: string) => {
    setSelectedForApproval(prev =>
      prev.includes(id) 
        ? prev.filter(s => s !== id) 
        : [...prev, id]);
  };

  // --- Dashboard Intelligence Widgets Logic ---
  const getActivityIcon = (action: string) => {
    const icons: Record<string, string> = {
      STATION_APPROVED: "✅",
      STATION_REJECTED: "❌",
      USER_BLOCKED: "🚫",
      USER_UNBLOCKED: "✅",
      OWNER_VERIFIED: "🏢",
      OWNER_SUSPENDED: "⛔",
      DATA_WIPED: "🗑️",
      ANNOUNCEMENT_PUBLISHED: "📢",
      BULK_STATION_APPROVED: "✅",
      PLATFORM_FEE_UPDATED: "💰",
      ADMIN_SESSION_STARTED: "🔐",
      SUPPORT_TICKET_RESOLVED: "🎫"
    };
    return icons[action] || "📋";
  };

  const getRelativeTime = (timestamp: any) => {
    const date = timestamp?.toDate 
      ? timestamp.toDate() 
      : new Date(timestamp);
    const diff = Date.now() - date.getTime();
    
    if (diff < 60000) return "just now";
    if (diff < 3600000) return `${Math.floor(diff/60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff/3600000)}h ago`;
    return `${Math.floor(diff/86400000)}d ago`;
  };

  const calculatePlatformHealth = () => {
    let score = 100;
    const issues: {
      severity: "critical" | "high" | "medium" | "low",
      message: string,
      deduction: number
    }[] = [];
    
    const totalBookings = bookings.length;
    const completedBookings = bookings.filter(b => b.status === "completed");

    // 1. Network success rate:
    const successRate = totalBookings > 0
      ? (completedBookings.length / totalBookings * 100)
      : 100;
    if (successRate < 90) {
      const d = Math.round((90 - successRate) * 0.8);
      score -= d;
      issues.push({
        severity: successRate < 70 ? "critical" : "high",
        message: `Success rate ${successRate.toFixed(1)}% below 90%`,
        deduction: d
      });
    }
    
    // 2. Pending approvals:
    const pendingCount = stations.filter(s => s.status === "pending").length;
    if (pendingCount > 3) {
      const d = Math.min(pendingCount * 2, 15);
      score -= d;
      issues.push({
        severity: "medium",
        message: `${pendingCount} stations pending approval`,
        deduction: d
      });
    }
    
    // 3. Blocked user ratio:
    const blockedRatio = users.length > 0
      ? (users.filter((u: any) => u.blocked).length / users.length * 100)
      : 0;
    if (blockedRatio > 5) {
      score -= 10;
      issues.push({
        severity: "high",
        message: `${blockedRatio.toFixed(1)}% users blocked`,
        deduction: 10
      });
    }
    
    // 4. Maintenance station ratio:
    const maintenanceRatio = stations.length > 0
      ? (stations.filter(s => s.status === "maintenance").length / stations.length * 100)
      : 0;
    if (maintenanceRatio > 20) {
      const d = Math.round(maintenanceRatio * 0.4);
      score -= d;
      issues.push({
        severity: maintenanceRatio > 40 ? "critical" : "high",
        message: `${maintenanceRatio.toFixed(0)}% stations offline`,
        deduction: d
      });
    }
    
    // 5. Platform rating:
    const rating = parseFloat(platformAvgRating);
    if (rating < 4.0 && rating > 0) {
      score -= 8;
      issues.push({
        severity: "medium",
        message: `Platform rating ${platformAvgRating} below 4.0`,
        deduction: 8
      });
    }
    
    // 6. Open tickets count:
    if (openTicketsCount > 5) {
      score -= 5;
      issues.push({
        severity: "low",
        message: `${openTicketsCount} open support tickets`,
        deduction: 5
      });
    }
    
    const finalScore = Math.max(0, Math.round(score));
    
    return {
      score: finalScore,
      grade: finalScore >= 95 ? "A+" : finalScore >= 90 ? "A" : finalScore >= 80 ? "B" : finalScore >= 70 ? "C" : finalScore >= 60 ? "D" : "F",
      status: finalScore >= 90 ? "Excellent" : finalScore >= 75 ? "Good" : finalScore >= 60 ? "Fair" : "Critical",
      statusColor: finalScore >= 90 ? "#22c55e" : finalScore >= 75 ? "#3b82f6" : finalScore >= 60 ? "#f59e0b" : "#ef4444",
      issues
    };
  };

  const healthData = calculatePlatformHealth();

  const saveHealthSnapshot = async (score: number) => {
    const today = format(new Date(), "yyyy-MM-dd");
    const snapshotRef = doc(db, "adminMetrics", `health_${today}`);
    
    try {
      const existing = await getDoc(snapshotRef);
      if (existing.exists()) return;
      
      await setDoc(snapshotRef, {
        date: today,
        score,
        grade: healthData.grade,
        issueCount: healthData.issues.length,
        savedAt: serverTimestamp()
      });
    } catch (err) {
      console.error("Error saving health snapshot:", err);
    }
  };

  useEffect(() => {
    if (userRole !== "admin") return;
    if (healthData && healthData.score > 0) {
      saveHealthSnapshot(healthData.score);
    }
  }, [healthData?.score, userRole]);

  useEffect(() => {
    if (userRole !== "admin") return;
    const load7Days = async () => {
      try {
        const docs = await Promise.all(
          Array.from({ length: 7 }, (_, i) => {
            const date = format(subDays(new Date(), i), "yyyy-MM-dd");
            return getDoc(doc(db, "adminMetrics", `health_${date}`));
          })
        );
        setHealthHistory(
          docs.filter(d => d.exists())
            .map(d => d.data())
            .reverse()
        );
      } catch (err) {
        console.error("Error loading health history:", err);
      }
    };
    load7Days();
  }, [userRole]);

  const scoreTrend = healthHistory.length >= 2
    ? healthHistory[healthHistory.length-1].score - healthHistory[0].score
    : 0;

  const trendLabel = scoreTrend > 5 
    ? "Improving" 
    : scoreTrend < -5 
      ? "Declining" 
      : "Stable";

  const trendColor = scoreTrend > 5 
    ? "#22c55e"
    : scoreTrend < -5 
      ? "#ef4444" 
      : "#f59e0b";

  const recentActivity = recentAuditLogs.slice(0, 8);

  const totalMessages = activeChats.reduce((s: number, c: any) => s + (c.ownerUnread || 0) + (c.driverUnread || 0), 0);
  const chatsWithUnread = activeChats.filter((c: any) => (c.ownerUnread || 0) + (c.driverUnread || 0) > 0);



  // Step 3 — Session activity tracker
  useEffect(() => {
    const activityEvents = ["mousedown", "keydown", "scroll", "touchstart"];
    const resetTimer = () => setLastActivity(Date.now());
    
    activityEvents.forEach(event => document.addEventListener(event, resetTimer));
    
    const checkTimeout = setInterval(() => {
      if (Date.now() - lastActivity > SESSION_TIMEOUT) {
        setShowTimeoutWarning(true);
      }
    }, 60000); // Check every minute
    
    return () => {
      activityEvents.forEach(event => document.removeEventListener(event, resetTimer));
      clearInterval(checkTimeout);
    };
  }, [lastActivity]);

  // Step 4 — Log admin session to audit_logs
  useEffect(() => {
    if (userRole !== "admin") return;
    const logAdminSession = async () => {
      if (!user) return;
      try {
        await addDoc(collection(db, "audit_logs"), {
          action: "ADMIN_SESSION_STARTED",
          performedBy: user.uid,
          performedByEmail: user.email,
          targetId: user.uid,
          targetType: "system",
          severity: "LOW",
          metadata: {
            userAgent: navigator.userAgent,
            timestamp: new Date().toISOString()
          },
          timestamp: serverTimestamp()
        });
      } catch (err) {
        console.error("Failed to log admin session:", err);
      }
    };
    logAdminSession();
  }, [user, userRole]);

  // Live monitor effect
  useEffect(() => {
    if (userRole !== "admin") return;
    const unsub = onSnapshot(
      query(
        collection(db, "bookings"),
        where("status", "in", ["active", "confirmed"])
      ),
      snap => {
        setActiveSessions(
          snap.docs.map(d => ({
            id: d.id, ...d.data()
          })))
        setActiveSessionsLoading(false)
      }
    )

    const unsubTickets = onSnapshot(collection(db, "supportTickets"), (snap) => {
      setTickets(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => {
      try {
        if (typeof unsub === "function") {
          unsub();
        }
      } catch (err) {
        console.warn("⚠️ Safe active sessions unsubscribe failed:", err);
      }

      try {
        if (typeof unsubTickets === "function") {
          unsubTickets();
        }
      } catch (err) {
        console.warn("⚠️ Safe support tickets unsubscribe failed:", err);
      }
    };
  }, [userRole]);

  // --- Anomaly Detection Engine ---
  const detectAnomalies = () => {
    const anomalies: any[] = [];
    
    // Check 1 — Cancellation spike (last 1hr):
    const last1HrBookings = bookings.filter(b => {
      const d = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt);
      return (Date.now() - d.getTime()) < 3600000;
    });
    const last1HrCancelled = last1HrBookings.filter(b => b.status === "cancelled");
    const cancelRate1hr = last1HrBookings.length > 0 ? (last1HrCancelled.length / last1HrBookings.length) * 100 : 0;
    
    if (cancelRate1hr > 40) {
      anomalies.push({
        type: "CANCELLATION_SPIKE",
        severity: "HIGH",
        message: `Cancellation rate ${cancelRate1hr.toFixed(0)}% in last hour`,
        value: cancelRate1hr,
        threshold: 40,
        action: "Check for station outages"
      });
    }

    // Check 2 — Rapid bookings from same user (last 10min):
    const bookingsByUser: Record<string, number> = {};
    const last10MinBookings = bookings.filter(b => {
      const d = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt);
      return (Date.now() - d.getTime()) < 600000;
    });
    last10MinBookings.forEach(b => {
      bookingsByUser[b.userId] = (bookingsByUser[b.userId] || 0) + 1;
    });
    const suspiciousUsers = Object.entries(bookingsByUser).filter(([, count]) => count > 3);
    
    if (suspiciousUsers.length > 0) {
      anomalies.push({
        type: "RAPID_BOOKINGS",
        severity: "HIGH",
        message: `${suspiciousUsers.length} user(s) made 3+ bookings in last 10 minutes`,
        value: suspiciousUsers.length,
        threshold: 1,
        action: "Review user accounts for fraud"
      });
    }

    // Check 3 — Revenue drop:
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1;
    const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;

    const currentMonthRevenue = bookings.filter(b => {
      const d = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt);
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear && b.paymentStatus === "paid";
    }).reduce((s, b) => s + (b.totalPrice || 0), 0);

    const lastMonthRevenue = bookings.filter(b => {
      const d = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt);
      return d.getMonth() === lastMonth && d.getFullYear() === lastMonthYear && b.paymentStatus === "paid";
    }).reduce((s, b) => s + (b.totalPrice || 0), 0);

    const revenueGrowth = lastMonthRevenue > 0 ? ((currentMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100 : 0;
    
    if (revenueGrowth < -30) {
      anomalies.push({
        type: "REVENUE_DROP",
        severity: "MEDIUM",
        message: `Revenue down ${Math.abs(Math.round(revenueGrowth))}% vs last month`,
        value: revenueGrowth,
        threshold: -30,
        action: "Review station availability"
      });
    }

    // Check 4 — Pending approvals backlog:
    const pendingStations = stations.filter(s => s.status === "pending").length;
    if (pendingStations > 5) {
      anomalies.push({
        type: "APPROVAL_BACKLOG",
        severity: "MEDIUM",
        message: `${pendingStations} stations pending approval`,
        value: pendingStations,
        threshold: 5,
        action: "Review pending stations"
      });
    }

    // Check 5 — High maintenance rate:
    const maintenanceStations = stations.filter(s => s.status === "maintenance").length;
    const maintenanceRate = stations.length > 0 ? (maintenanceStations / stations.length) * 100 : 0;
    
    if (maintenanceRate > 30) {
      anomalies.push({
        type: "HIGH_MAINTENANCE_RATE",
        severity: "CRITICAL",
        message: `${maintenanceRate.toFixed(0)}% of stations in maintenance`,
        value: maintenanceRate,
        threshold: 30,
        action: "Investigate network outage"
      });
    }

    // CHECK 6 — Zero revenue active stations:
    const completedBookings = bookings.filter(b => b.status === "completed");
    const zeroRevenueStations = stations.filter(s => {
      if (s.status !== "active") return false
      const stationBookings = completedBookings.filter(
        b => b.stationId === s.id)
      if (stationBookings.length === 0) return true
      
      const lastBooking = stationBookings.sort(
        (a,b) => new Date(b.startTime).getTime() - 
                  new Date(a.startTime).getTime())[0]
      
      const daysSinceLastBooking = lastBooking
        ? (Date.now() - new Date(
            lastBooking.startTime).getTime()) / 86400000
        : 999
      
      return daysSinceLastBooking > 7
    })

    if (zeroRevenueStations.length > 0) {
      anomalies.push({
        type: "ZERO_REVENUE_STATIONS",
        severity: "MEDIUM",
        message: `${zeroRevenueStations.length} active station(s) with no bookings in last 7 days`,
        value: zeroRevenueStations.length,
        threshold: 1,
        action: "Contact owners to investigate",
        affectedIds: zeroRevenueStations.map(s => s.id)
      })
    }

    // CHECK 7 — Connector fault pattern:
    const connectorFaultMap: Record<string,number> = {}
    const allReviews = reviews;
    const last24hReviews = allReviews.filter(r => {
      const d = r.createdAt?.toDate ? r.createdAt.toDate() : new Date(r.createdAt)
      return (Date.now() - d.getTime()) < 86400000 && r.rating <= 2
    })

    last24hReviews.forEach(r => {
      if (r.stationId) {
        connectorFaultMap[r.stationId] = (connectorFaultMap[r.stationId]||0) + 1
      }
    })

    const faultedStations = Object.entries(connectorFaultMap)
      .filter(([,count]) => count >= 3)

    if (faultedStations.length > 0) {
      anomalies.push({
        type: "CONNECTOR_FAULT_PATTERN",
        severity: "HIGH",
        message: `${faultedStations.length} station(s) received 3+ low ratings in last 24 hours`,
        value: faultedStations.length,
        threshold: 1,
        action: "Review station connector health",
        affectedIds: faultedStations.map(([id]) => id)
      })
    }

    // CHECK 8 — Payment failure spike:
    const failedPayments = last1HrBookings.filter(b => b.paymentStatus === "failed")
    const paymentFailureRate = last1HrBookings.length > 0
      ? (failedPayments.length / last1HrBookings.length * 100)
      : 0

    if (paymentFailureRate > 20) {
      anomalies.push({
        type: "PAYMENT_FAILURE_SPIKE",
        severity: "CRITICAL",
        message: `${paymentFailureRate.toFixed(0)}% payment failure rate in last hour`,
        value: paymentFailureRate,
        threshold: 20,
        action: "Check Stripe/UPI gateway status"
      })
    }

    // CHECK 9 — Duplicate station submissions:
    const stationCoords: Record<string,string[]> = {}
    stations.forEach(s => {
      // @ts-ignore - backward compatibility for location
      const loc = s.location || { lat: s.lat, lon: s.lon }
      if (!loc || !loc.lat) return
      const coordKey = `${parseFloat(loc.lat).toFixed(3)}_${parseFloat(loc.lon || loc.lng || s.lon).toFixed(3)}`
      if (!stationCoords[coordKey]) stationCoords[coordKey] = []
      stationCoords[coordKey].push(s.id)
    })

    const duplicateGroups = Object.values(stationCoords).filter(ids => ids.length > 1)

    if (duplicateGroups.length > 0) {
      anomalies.push({
        type: "DUPLICATE_STATIONS",
        severity: "MEDIUM",
        message: `${duplicateGroups.length} possible duplicate station location(s) detected`,
        value: duplicateGroups.length,
        threshold: 1,
        action: "Review stations at same coordinates",
        affectedIds: duplicateGroups.flat()
      })
    }

    // CHECK 10 — Inactive owners:
    const inactiveOwners = owners.filter(owner => {
      const joinedDate = owner.createdAt?.toDate ? owner.createdAt.toDate() : new Date(owner.createdAt)
      if (!joinedDate) return false
      const daysSinceJoined = (Date.now() - joinedDate.getTime()) / 86400000
      const ownerStations = stations.filter(s => s.ownerId === owner.uid)
      return daysSinceJoined > 30 && ownerStations.length === 0
    })

    if (inactiveOwners.length > 0) {
      anomalies.push({
        type: "INACTIVE_OWNERS",
        severity: "LOW",
        message: `${inactiveOwners.length} owner(s) registered 30+ days ago with no stations`,
        value: inactiveOwners.length,
        threshold: 1,
        action: "Reach out to onboard these partners",
        affectedIds: inactiveOwners.map(o => o.id)
      })
    }

    // CHECK 11 — Session overstay:
    const overstayedSessions = bookings.filter(b => {
      if (b.status !== "active") return false
      const endTime = b.endTime ? new Date(b.endTime) : null
      if (!endTime) return false
      const overstayMins = (Date.now() - endTime.getTime()) / 60000
      return overstayMins > 30
    })

    if (overstayedSessions.length > 0) {
      anomalies.push({
        type: "SESSION_OVERSTAY",
        severity: "MEDIUM",
        message: `${overstayedSessions.length} session(s) exceeded booking time by 30+ min`,
        value: overstayedSessions.length,
        threshold: 1,
        action: "Auto-terminate or contact drivers",
        affectedIds: overstayedSessions.map(b => b.id)
      })
    }

    setDetectedAnomalies(anomalies);

    // Trigger External Notifications for CRITICAL anomalies
    anomalies.filter(a => a.severity === "CRITICAL").forEach(async (anomaly) => {
      try {
        await fetch("/api/admin/notify-alert", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event: anomaly.type,
            details: `Critical System Anomaly: ${anomaly.message}. Suggested Action: ${anomaly.action}`,
            severity: "CRITICAL"
          })
        });
      } catch (err) {
        console.error("Failed to send external notification for anomaly:", err);
      }
    });
  };

  useEffect(() => {
    if (bookings.length > 0 || stations.length > 0) {
      detectAnomalies();
    }
    const interval = setInterval(detectAnomalies, 10 * 60 * 1000);
    return () => clearInterval(interval);
  }, [bookings, stations]);

  // --- Analytics Engine (Unified) ---
  useEffect(() => {
    if (bookings.length === 0 && stations.length === 0) return;

    const range = selectedDateRange;
    const now = new Date();
    let startDate: Date | null = null;
    
    if (range === "7d") startDate = new Date(now.getTime() - 7 * 86400000);
    if (range === "30d") startDate = new Date(now.getTime() - 30 * 86400000);
    if (range === "90d") startDate = new Date(now.getTime() - 90 * 86400000);

    const filteredBookings = bookings.filter(b => {
      const bDate = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt);
      const isPaid = b.paymentStatus === "paid" || b.paymentStatus === "success";
      const isValidStatus = ["confirmed", "active", "completed"].includes(b.status);
      const isInRange = !startDate || bDate >= startDate;
      return isPaid && isValidStatus && isInRange;
    });

    let totalRevenue = 0;
    let totalEnergy = 0;
    const revenueByStation: Record<string, number> = {};
    const trendsMap = new Map<string, number>();
    const hourlyLoad: Record<string, number> = {};

    filteredBookings.forEach((b: any) => {
      totalRevenue += b.totalPrice || 0;
      totalEnergy += b.energyDeliveredKwh || 0;
      revenueByStation[b.stationName] = (revenueByStation[b.stationName] || 0) + (b.totalPrice || 0);
      
      const dateKey = safeFormat(b.createdAt, 'dd/MM/yyyy');
      trendsMap.set(dateKey, (trendsMap.get(dateKey) || 0) + 1);

      // Hourly load for peak calculation (last 24h of trends)
      const bDate = b.startTime?.toDate ? b.startTime.toDate() : new Date(b.startTime);
      if (now.getTime() - bDate.getTime() < 86400000) {
        const hour = safeFormat(b.startTime, "yyyy-MM-dd HH:00");
        hourlyLoad[hour] = (hourlyLoad[hour] || 0) + (b.connectorPowerKw || 0);
      }
    });

    const peakLoad = Object.keys(hourlyLoad).length > 0 ? Math.max(...Object.values(hourlyLoad)) : 0;

    // --- REVENUE INTELLIGENCE LOGIC ---
    const totalDaysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const currentDayOfMonth = now.getDate();
    const estimatedMonthEnd = Math.round((totalRevenue / (currentDayOfMonth || 1)) * totalDaysInMonth);

    const hourlyRevenue: Record<number, number> = {};
    const connectorRevenue: Record<string, number> = { "Fast": 0, "Rapid": 0, "Standard": 0 };
    const ownersMap: Record<string, number> = {};
    let cancellationLoss = 0;

    bookings.forEach((b: any) => {
      const bDate = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt);
      const isPaid = (b.paymentStatus === "paid" || b.paymentStatus === "success");
      
      // Hourly Velocity (Grouped by hour of day)
      if (isPaid) {
        const hr = bDate.getHours();
        hourlyRevenue[hr] = (hourlyRevenue[hr] || 0) + (b.totalPrice || 0);
      }
      
      // Metrics by type/owner
      if (isPaid) {
        const cType = b.connectorType || "Standard";
        connectorRevenue[cType] = (connectorRevenue[cType] || 0) + (b.totalPrice || 0);
        
        // Resolve owner name dynamically from owners or stations array
        const station = stations.find((s: any) => s.id === b.stationId);
        const ownerId = b.ownerId || station?.ownerId;
        const owner = owners.find((o: any) => o.id === ownerId);
        const ownerName = b.ownerName || owner?.fullName || owner?.name || owner?.displayName || owner?.email?.split('@')[0] || "Unknown Owner";
        
        ownersMap[ownerName] = (ownersMap[ownerName] || 0) + (b.totalPrice || 0);
      }

      if (b.status === "cancelled") {
        cancellationLoss += (b.totalPrice || 0);
      }
    });

    const peakRevenueHour = Object.entries(hourlyRevenue).length > 0
      ? Number(Object.entries(hourlyRevenue).sort(([, a], [, b]) => (b as any) - (a as any))[0][0])
      : 0;

    const hourlyRevenueData = Array.from({ length: 24 }, (_, i) => ({
      hour: i,
      revenue: hourlyRevenue[i] || 0
    }));

    const revenueByConnectorData = Object.entries(connectorRevenue).map(([type, revenue]) => ({ type, revenue }));

    // Build Station Metrics
    const stationMetrics: Record<string, any> = {};
    stations.forEach((s: any) => {
      const sBookings = bookings.filter((b: any) => {
        const bDate = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt);
        const isInRange = !startDate || bDate >= startDate;
        return b.stationId === s.id && 
               ["confirmed", "completed"].includes(b.status) &&
               isInRange;
      });

      const sRevenue = sBookings.reduce((sum: number, b: any) => sum + (b.totalPrice || 0), 0);

      if (sBookings.length === 0 && sRevenue > 0) {
        console.warn(`[WARNING] Analytics inconsistency detected for station: ${s.name} (ID: ${s.id})`);
      }

      const connectorCount = s.connectors?.length || 0;
      const availableConnectors = s.connectors?.filter((c: any) => c.available).length || 0;
      
      stationMetrics[s.name] = {
        totalBookings: sBookings.length,
        utilization: connectorCount > 0 ? Math.round(((connectorCount - availableConnectors) / connectorCount) * 100) : 0,
        popularConnector: (s.connectors || []).reduce((max: any, curr: any) => 
          (curr.count || 0) > (max.count || 0) ? curr : max, 
          { type: "N/A", count: -1 }
        ).type,
        revenue: sRevenue
      };
    });

    setAnalytics({
      totalRevenue,
      totalEnergy,
      peakLoad,
      revenueByStation,
      bookingTrends: Array.from(trendsMap)
        .map(([date, count]) => ({ date, count }))
        .sort((a, b) => {
          const [d1, m1, y1] = a.date.split('/').map(Number);
          const [d2, m2, y2] = b.date.split('/').map(Number);
          return new Date(y1, m1 - 1, d1).getTime() - new Date(y2, m2 - 1, d2).getTime();
        }),
      userActivityLogs: users.map((u: any) => ({
        email: u.email,
        fullName: u.fullName || "Unknown",
        bookingCount: bookings.filter((b: any) => b.userId === u.id).length,
        lastActive: u.lastLogin || u.createdAt || new Date().getTime(),
        role: u.role
      })).filter((u: any) => u.role === "ev_user"),
      stationMetrics,
      paymentSuccess: filteredBookings.length,
      paymentFailure: 0,
      estimatedMonthEnd,
      peakRevenueHour,
      cancellationLoss,
      revenueByConnectorData,
      ownerRevenueMap: ownersMap,
      hourlyRevenueData
    });
  }, [bookings, users, stations, owners, selectedDateRange]);

  const getEntityDisplayName = (id: string, anomalyType: string) => {
    if (anomalyType === "ZERO_REVENUE_STATIONS" || anomalyType === "DUPLICATE_STATIONS" || anomalyType === "CONNECTOR_FAULT_PATTERN") {
      const station = stations.find(s => s.id === id);
      return station?.name || `${id.slice(0, 8)}...`;
    }
    if (anomalyType === "INACTIVE_OWNERS") {
      const owner = owners.find(o => o.id === id);
      return owner?.fullName || owner?.name || owner?.displayName || owner?.email?.split('@')[0] || `${id.slice(0, 8)}...`;
    }
    if (anomalyType === "SESSION_OVERSTAY") {
      const booking = bookings.find(b => b.id === id);
      if (booking) {
        const station = stations.find(s => s.id === booking.stationId);
        return `${station?.name || 'Station'} (Booking #${id.slice(0, 4)})`;
      }
      return `Booking #${id.slice(0, 8)}...`;
    }
    // Generic fallback lookup:
    const station = stations.find(s => s.id === id);
    if (station) return station.name;
    const owner = owners.find(o => o.id === id);
    if (owner) return owner.fullName || owner.name || owner.displayName || owner.email?.split('@')[0];
    const user = users.find(u => u.id === id);
    if (user) return user.fullName || user.displayName || user.email?.split('@')[0];
    return `${id.slice(0, 8)}...`;
  };

  const getAuditTargetDisplayName = (log: any) => {
    if (log.targetName) return log.targetName;
    if (log.metadata?.targetName) return log.metadata.targetName;
    if (log.metadata?.stationName) return log.metadata.stationName;
    if (log.metadata?.userName) return log.metadata.userName;

    const id = log.targetId;
    if (!id) return "";

    if (id.startsWith("benchmark_station")) return "Benchmark Station";
    if (id === user?.uid) {
      return user?.displayName || user?.email?.split('@')[0] || "Admin";
    }

    // Check if the ID is a station ID
    const station = stations.find(s => s.id === id);
    if (station) return station.name;

    // Check if the ID is an owner ID
    const owner = owners.find(o => o.id === id || o.uid === id);
    if (owner) return owner.fullName || owner.name || owner.displayName || owner.email?.split('@')[0];

    // Check if the ID is a user ID
    const u = users.find(usr => usr.id === id || usr.uid === id);
    if (u) return u.fullName || u.displayName || u.email?.split('@')[0];

    return id.slice(0, 16) + "...";
  };

  const fetchData = async () => {
    setLoading(true);
    setAnalyticsError(null);
    try {
      const [
        stationsSnap, 
        usersSnap, 
        ownersSnap, 
        bookingsSnap, 
        reviewsSnap,
        supportTicketsSnap,
        auditLogsSnap,
        chatsSnap
      ] = await Promise.all([
        getDocs(collection(db, "stations")),
        getDocs(collection(db, "users")),
        getDocs(collection(db, "owners")),
        getDocs(collection(db, "bookings")),
        getDocs(collection(db, "reviews")),
        getDocs(query(collection(db, "supportTickets"), where("status", "==", "open"))),
        getDocs(query(collection(db, "audit_logs"), orderBy("timestamp", "desc"), limit(20))),
        getDocs(query(collection(db, "chats"), where("status", "==", "active"), orderBy("lastMessageAt", "desc")))
      ]);

      const stationsList = stationsSnap.docs.map(d => {
        const data = d.data();
        const connectors = (data.connectors || []).map((c: any, index: number) => ({
          ...c,
          id: c.id || `conn-${index}-${c.type || 'unknown'}`
        }));
        return {
          id: d.id,
          ...data,
          status: data.status || "active",
          connectors
        };
      });
      setStations(stationsList);

      const allUsers = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const allOwnersFromCollection = ownersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      
      setUsers(allUsers.filter((u: any) => u.role === "ev_user"));
      
      // Combine owners from both users collection and dedicated owners collection
      const combinedOwners = [
        ...allOwnersFromCollection,
        ...allUsers.filter((u: any) => u.role === "owner")
      ].reduce((acc: any[], curr: any) => {
        if (!acc.find(o => o.id === curr.id)) acc.push(curr);
        return acc;
      }, []);
      
      setOwners(combinedOwners);

      const bookingsList = bookingsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      setBookings(bookingsList);

      const reviewsList = reviewsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      setReviews(reviewsList);

      // --- New Metrics Computation (Phase 3) ---
      const allReviews = reviewsList as any[];
      const avgRatingVal = allReviews.length > 0
        ? (allReviews.reduce((s, r) => s + (r.rating || 0), 0) / allReviews.length).toFixed(1)
        : "0.0";
      setPlatformAvgRating(avgRatingVal);

      const openTickets = supportTicketsSnap.docs.length;
      setOpenTicketsCount(openTickets);

      const recentLogs = auditLogsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      setRecentAuditLogs(recentLogs);

      const activeChatsList = chatsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      setActiveChats(activeChatsList);

      const unreadCount = activeChatsList.reduce((s, c: any) => s + (c.ownerUnread || 0), 0);
      setTotalOwnerUnread(unreadCount);

      setStats({
        totalStations: stationsList.length,
        totalUsers: allUsers.filter((u: any) => u.role === "ev_user").length,
        totalOwners: combinedOwners.length,
        totalBookings: bookingsList.length,
        activeBookings: bookingsList.filter((b: any) => b.status === "confirmed" || b.status === "active").length,
        pendingStations: stationsList.filter((s: any) => s.status === "pending").length,
        unapprovedOwners: combinedOwners.filter(o => !o.approved).length
      });
    } catch (error) {
      console.error("Error fetching admin data:", error);
      setAnalyticsError("Failed to fetch dashboard data. Please check your connection.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user && userRole === "admin") {
      fetchData();
    }
  }, [user, userRole, authLoading]);

  const handleDeleteStation = async (id: string) => {
    if (!confirm("Are you sure you want to delete this station?")) return;
    try {
      await deleteDoc(doc(db, "stations", id));
      setStations(stations.filter(s => s.id !== id));
      toast({ title: "Station deleted successfully" });
    } catch (error) {
      toast({ variant: "destructive", title: "Failed to delete station" });
    }
  };

  const handleApproveStation = async (id: string) => {
    try {
      await updateDoc(doc(db, "stations", id), {
        status: "active",
        approvedAt: serverTimestamp(),
        approvedBy: user?.email
      });
      toast({ title: "Station approved successfully" });
      fetchData();
    } catch (error) {
      toast({ variant: "destructive", title: "Failed to approve station" });
    }
  };

  const handleApproveOwner = async (id: string) => {
    try {
      // 1. Update in owners collection
      await updateDoc(doc(db, "owners", id), {
        approved: true,
        approvedAt: serverTimestamp(),
        approvedBy: user?.email
      });

      // 2. Also try to update in users collection if exists
      try {
        await updateDoc(doc(db, "users", id), {
          approved: true
        });
      } catch (e) {
        // user doc might not exist if they only registered as owner
      }

      toast({ title: "Owner verified successfully" });
      fetchData();
    } catch (error) {
      toast({ variant: "destructive", title: "Failed to verify owner" });
    }
  };

  const handleUnapproveStation = async (id: string) => {
    try {
      await updateDoc(doc(db, "stations", id), {
        status: "pending",
        unapprovedAt: serverTimestamp(),
        unapprovedBy: user?.email
      });
      toast({ title: "Station moved back to pending" });
      fetchData();
    } catch (error) {
      toast({ variant: "destructive", title: "Failed to unapprove station" });
    }
  };

  const handleRevokeOwner = async (id: string) => {
    try {
      await updateDoc(doc(db, "owners", id), {
        approved: false,
        revokedAt: serverTimestamp(),
        revokedBy: user?.email
      });
      // Also update in users collection
      try {
        await updateDoc(doc(db, "users", id), { approved: false });
      } catch (e) {}
      
      toast({ title: "Owner verification revoked" });
      fetchData();
    } catch (error) {
      toast({ variant: "destructive", title: "Failed to revoke owner" });
    }
  };

  const handleRejectStation = async (stationId: string, reason: string) => {
    try {
      await updateDoc(doc(db, "stations", stationId), {
        status: "rejected",
        rejectedAt: serverTimestamp(),
        rejectedBy: user?.uid,
        rejectionReason: reason,
        canResubmit: true
      });
      
      const station = stations.find(s => s.id === stationId);
      if (station?.ownerId) {
        await addDoc(collection(db, "notifications"), {
          userId: station.ownerId,
          type: "STATION_REJECTED",
          title: "Station requires changes",
          message: `Your station "${station.name}" was not approved. Reason: ${reason}. Please update and resubmit.`,
          stationId,
          read: false,
          createdAt: serverTimestamp()
        });
      }
      
      await addDoc(collection(db, "audit_logs"), {
        action: "STATION_REJECTED",
        severity: "MEDIUM",
        performedBy: user?.uid,
        performedByEmail: user?.email,
        targetId: stationId,
        targetType: "station",
        metadata: { reason },
        timestamp: serverTimestamp()
      });
      
      setRejectModal(null);
      setRejectReason("");
      setRejectCustom("");
      toast({ title: "Station rejected with reason ✓" });
      fetchData();
    } catch (error) {
      toast({ variant: "destructive", title: "Failed to reject station" });
    }
  };

  const handleBulkApprove = async () => {
    try {
      const batch = writeBatch(db);
      
      selectedForApproval.forEach(stationId => {
        batch.update(doc(db, "stations", stationId), {
          status: "active",
          approvedAt: serverTimestamp(),
          approvedBy: user?.uid
        });
      });
      
      await batch.commit();
      
      await addDoc(collection(db, "audit_logs"), {
        action: "BULK_STATION_APPROVED",
        severity: "HIGH",
        performedBy: user?.uid,
        performedByEmail: user?.email,
        targetId: selectedForApproval.join(","),
        targetType: "station",
        metadata: { 
          count: selectedForApproval.length,
          stationIds: selectedForApproval
        },
        timestamp: serverTimestamp()
      });
      
      setSelectedForApproval([]);
      toast({ title: `${selectedForApproval.length} stations approved ✅` });
      fetchData();
    } catch (error) {
      toast({ variant: "destructive", title: "Bulk approval failed" });
    }
  };

  const handleBlockUser = async (
    uid: string,
    currentStatus: boolean,
    reason?: string
  ) => {
    const newBlockedStatus = !currentStatus
    const action = newBlockedStatus 
      ? "USER_BLOCKED" : "USER_UNBLOCKED"
    
    try {
      const batch = writeBatch(db)
      
      // 1. Update user blocked status:
      batch.update(doc(db,"users",uid),{
        blocked: newBlockedStatus,
        blockedAt: newBlockedStatus 
          ? serverTimestamp() : null,
        blockedBy: newBlockedStatus 
          ? auth.currentUser?.uid : null,
        blockReason: newBlockedStatus 
          ? (reason || "Policy violation") : null,
        unblockedAt: !newBlockedStatus 
          ? serverTimestamp() : null
      })
      
      await batch.commit()
      
      // 2. If blocking: cancel active bookings:
      if (newBlockedStatus) {
        const activeBookings = await getDocs(
          query(
            collection(db,"bookings"),
            where("userId","==",uid),
            where("status","in",
              ["confirmed","active","pending"])
          )
        )
        
        if (!activeBookings.empty) {
          const cancelBatch = writeBatch(db)
          activeBookings.docs.forEach(d => {
            cancelBatch.update(d.ref,{
              status: "cancelled",
              cancelledAt: serverTimestamp(),
              cancellationReason: 
                "user_blocked_by_admin",
              cancelledBy: auth.currentUser?.uid
            })
          })
          await cancelBatch.commit()
        }
      }
      
      // 3. Write audit log:
      await addDoc(collection(db, "audit_logs"), {
        action: action,
        severity: newBlockedStatus ? "HIGH" : "MEDIUM",
        performedBy: auth.currentUser?.uid,
        performedByEmail: auth.currentUser?.email,
        targetId: uid,
        targetType: "user",
        metadata: {
          reason: reason || "No reason provided",
          previousStatus: currentStatus,
          newStatus: newBlockedStatus,
          cascadedBookings: newBlockedStatus
            ? "active bookings cancelled"
            : "none"
        },
        timestamp: serverTimestamp(),
        isReversible: true
      })
      
      // 4. Create notification for the user:
      await addDoc(collection(db,"notifications"),{
        userId: uid,
        type: newBlockedStatus 
          ? "ACCOUNT_BLOCKED" : "ACCOUNT_UNBLOCKED",
        title: newBlockedStatus
          ? "Account Suspended"
          : "Account Reinstated",
        message: newBlockedStatus
          ? "Your account has been suspended. Contact support for more information."
          : "Your account has been reinstated. You can now use the platform again.",
        read: false,
        createdAt: serverTimestamp()
      })
      
      toast({
        title: newBlockedStatus
          ? "User blocked and sessions cancelled"
          : "User unblocked successfully"
      })
      
      // 5. Refresh user list:
      const usersSnap = await getDocs(collection(db, "users"));
      const allUsers = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      setUsers(allUsers.filter((u: any) => u.role === "ev_user"));
      
    } catch (err) {
      console.error("Block user error:", err)
      toast({ variant: "destructive", title: "Failed to update user status" })
    }
  }

  const handleSeedData = async () => {
    try {
      await manualSeed();
      toast({ title: "Sample data seeded successfully" });
      window.location.reload();
    } catch (error) {
      toast({ variant: "destructive", title: "Failed to seed data" });
    }
  };

  // KPI Calculations for extended metrics
  const completedBookings = bookings.filter(b =>
    b.status === "completed" && 
    b.paymentStatus === "paid"
  )

  const thisMonthBookings = completedBookings.filter(
    b => isSameMonth(
      b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.startTime), 
      new Date()
    )
  )

  const lastMonthBookings = completedBookings.filter(
    b => isSameMonth(
      b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.startTime),
      subMonths(new Date(), 1)
    )
  )

  const thisMonthRevenue = thisMonthBookings.reduce(
    (s, b) => s + (b.totalPrice || 0), 0
  )

  const lastMonthRevenue = lastMonthBookings.reduce(
    (s, b) => s + (b.totalPrice || 0), 0
  )

  const revenueGrowth = lastMonthRevenue > 0
    ? ((thisMonthRevenue - lastMonthRevenue) / lastMonthRevenue * 100).toFixed(1)
    : 0

  const avgRevenuePerSession = 
    completedBookings.length > 0
    ? (completedBookings.reduce(
        (s, b) => s + (b.totalPrice || 0), 0) / 
       completedBookings.length).toFixed(0)
    : 0

  const cancelledBookings = bookings.filter(
    b => b.status === "cancelled"
  )
  const cancellationRate = bookings.length > 0
    ? (cancelledBookings.length / bookings.length * 100).toFixed(1)
    : 0

  const newUsersThisMonth = users.filter(u =>
    u.createdAt && isSameMonth(
      u.createdAt.toDate ? u.createdAt.toDate() : new Date(u.createdAt), 
      new Date()
    )
  ).length

  const avgRating = reviews.length > 0
    ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1)
    : 0

  const platformEarnings = (analytics.totalRevenue * 0.05).toFixed(0)
  const pendingApprovals = owners.filter(o => !o.approved).length

  const totalActivePowerKw = activeSessions.reduce(
    (s, b) => s + (b.connectorPowerKw || 7.2), 0
  )

  const totalActiveRevenue = activeSessions.reduce(
    (s, b) => s + (b.totalPrice || b.currentCost || b.estimatedTotal || 0), 0
  )

  useEffect(() => {
    if (!authLoading && (!user || userRole !== "admin")) {
      setLocation("/");
    }
  }, [user, userRole, authLoading, setLocation]);

  // Step 2 — Guard to prevent flash of admin content and enforce security
  if (authLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        <p className="mt-4 text-muted-foreground font-medium">Verifying credentials...</p>
      </div>
    );
  }

  if (!user || userRole !== "admin") {
    return null;
  }

  if (loading) return <div className="p-8 text-center">Loading Admin Panel...</div>;

  return (
    <div className="container mx-auto p-6 space-y-8">
      <style>{`
        .live-sessions-card {
          border: 2px solid var(--admin-border);
          border-radius: 24px;
          padding: 20px 24px;
          margin-bottom: 24px;
          background: var(--admin-surface);
          backdrop-filter: blur(12px);
          box-shadow: var(--admin-shadow), var(--admin-shadow-inset);
        }

        .live-header {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 20px;
          font-size: 13px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: var(--admin-text-primary);
        }

        .live-timestamp {
          margin-left: auto;
          font-size: 11px;
          font-weight: 600;
          color: var(--admin-text-secondary);
          text-transform: none;
          letter-spacing: normal;
        }

        .live-dot-pulse {
          width: 10px;
          height: 10px;
          background: #22c55e;
          border-radius: 50%;
          animation: livePulse 1.5s infinite;
          box-shadow: 0 0 12px #22c55e;
        }

        @keyframes livePulse {
          0%, 100% { 
            box-shadow: 0 0 0 0 rgba(34,197,94,0.6);
            transform: scale(0.95);
          }
          50% { 
            box-shadow: 0 0 0 8px rgba(34,197,94,0);
            transform: scale(1.05);
          }
        }

        .live-stats-row {
          display: grid;
          grid-template-columns: repeat(6, 1fr);
          gap: 20px;
        }

        .live-stat {
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 8px;
          border-right: 1px solid var(--admin-border-muted);
        }

        .live-stat:last-child {
          border-right: none;
        }

        .live-number {
          display: block;
          font-size: 26px;
          font-weight: 900;
          color: var(--admin-text-primary);
          letter-spacing: -0.02em;
          text-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }

        .live-label {
          font-size: 10px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--admin-text-secondary);
          margin-top: 4px;
        }

        .live-label.urgent {
          color: #ef4444;
          font-weight: 900;
        }

        .modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.5);
          backdrop-filter: blur(4px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }

        .modal-card {
          background: hsl(var(--card));
          border: 1px solid hsl(var(--border));
          padding: 24px;
          border-radius: 16px;
          width: 100%;
          max-width: 400px;
          box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1);
        }

        .modal-card h3 {
          font-size: 18px;
          font-weight: 600;
          margin-bottom: 8px;
        }

        .modal-card label {
          display: block;
          font-size: 14px;
          margin: 16px 0 8px;
        }

        .modal-card select {
          width: 100%;
          padding: 8px;
          border-radius: 8px;
          background: hsl(var(--background));
          border: 1px solid hsl(var(--border));
        }

        .modal-actions {
          display: flex;
          justify-content: flex-end;
          gap: 12px;
          margin-top: 24px;
        }

        .anomaly-id-chip {
          font-size: 11px;
          font-family: monospace;
          background: rgba(0,0,0,0.05);
          padding: 2px 6px;
          border-radius: 4px;
          cursor: pointer;
          margin-right: 4px;
          border: 1px solid rgba(0,0,0,0.05);
        }

        .revenue-intelligence-section {
          margin-top: 48px;
          padding-top: 24px;
          border-top: 1px solid hsl(var(--border));
        }
      `}</style>

      <div className="live-sessions-card">
        <div className="live-header">
          <div className="live-dot-pulse"/>
          <span>Live Network Status</span>
          <span className="live-timestamp">
            Updated just now
          </span>
        </div>
        
        <div className="live-stats-row">
          <div className="live-stat">
            <span className="live-number">
              {activeSessions.length}
            </span>
            <span className="live-label">
              Active Sessions
            </span>
          </div>
          
          <div className="live-stat">
            <span className="live-number">
              {totalActivePowerKw.toFixed(1)} kW
            </span>
            <span className="live-label">
              Current Draw
            </span>
          </div>
          
          <div className="live-stat">
            <span className="live-number">
              ₹{totalActiveRevenue.toFixed(0)}
            </span>
            <span className="live-label">
              Revenue In Progress
            </span>
          </div>

          <div className="live-stat">
            <span className="live-number flex items-center justify-center gap-1">
              {platformAvgRating} <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
            </span>
            <span className="live-label">
              Platform Rating
            </span>
          </div>

          <div className="live-stat">
            <span className="live-number relative inline-block">
              {openTicketsCount}
              {openTicketsCount > 0 && (
                <span className="absolute -top-1 -right-4 bg-red-500 text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center font-bold animate-pulse">
                  !
                </span>
              )}
            </span>
            <span className={cn("live-label", openTicketsCount > 0 && "urgent")}>
              Open Tickets
            </span>
          </div>

          <div className="live-stat">
            <span className="live-number">
              {totalOwnerUnread}
            </span>
            <span className="live-label">
              Unread Chats
            </span>
          </div>
        </div>
      </div>

      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <ShieldAlert className="w-8 h-8 text-primary" />
          Admin Dashboard
        </h1>
        <div className="flex items-center gap-4">
          <nav className="flex items-center gap-1 bg-muted/50 p-1 rounded-xl border border-border/50">
            <Link href="/admin/support">
              <Button variant="ghost" className="h-9 px-4 gap-2 font-bold text-xs rounded-lg relative">
                <MessagesSquare className="w-4 h-4" />
                Support
                {tickets.filter(t => t.status === "open").length > 0 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[10px] flex items-center justify-center rounded-full border-2 border-background animate-bounce font-black">
                    {tickets.filter(t => t.status === "open").length}
                  </span>
                )}
              </Button>
            </Link>
            <Link href="/admin/audit-logs">
              <Button variant="ghost" className="h-9 px-4 gap-2 font-bold text-xs rounded-lg">
                <History className="w-4 h-4" />
                Audit Logs
              </Button>
            </Link>
            <Link href="/admin/settings">
              <Button variant="ghost" className="h-9 px-4 gap-2 font-bold text-xs rounded-lg">
                <Settings className="w-4 h-4" />
                Settings
              </Button>
            </Link>
            <Link href="/admin/ml-monitoring">
              <Button variant="ghost" className="h-9 px-4 gap-2 font-bold text-xs rounded-lg">
                <Activity className="w-4 h-4" />
                ML Monitoring
              </Button>
            </Link>
            <Link href="/admin/predictive-maintenance">
              <Button variant="ghost" className="h-9 px-4 gap-2 font-bold text-xs rounded-lg">
                <Wrench className="w-4 h-4" />
                Maintenance
              </Button>
            </Link>
            <Link href="/admin/capacity-planning">
              <Button variant="ghost" className="h-9 px-4 gap-2 font-bold text-xs rounded-lg">
                <TrendingUp className="w-4 h-4" />
                Capacity
              </Button>
            </Link>
            <Link href="/admin/fraud-detection">
              <Button variant="ghost" className="h-9 px-4 gap-2 font-bold text-xs rounded-lg">
                <ShieldAlert className="w-4 h-4 text-red-500" />
                Fraud
              </Button>
            </Link>
            <Link href="/admin/reports">
              <Button variant="ghost" className="h-9 px-4 gap-2 font-bold text-xs rounded-lg">
                <ReportsIcon className="w-4 h-4" />
                Reports
              </Button>
            </Link>
            <Link href="/admin/notification-settings">
              <Button variant="ghost" className="h-9 px-4 gap-2 font-bold text-xs rounded-lg">
                <Bell className="w-4 h-4 text-amber-500" />
                Alerts
              </Button>
            </Link>
            <Link href="/admin/benchmarks">
              <Button variant="ghost" className="h-9 px-4 gap-2 font-bold text-xs rounded-lg">
                <Target className="w-4 h-4 text-emerald-500" />
                Benchmarks
              </Button>
            </Link>
            <Link href="/admin/data-management">
              <Button variant="ghost" className="h-9 px-4 gap-2 font-bold text-xs rounded-lg">
                <Database className="w-4 h-4 text-primary" />
                Data
              </Button>
            </Link>
            <Link href="/admin/fleet">
              <Button variant="ghost" className="h-9 px-4 gap-2 font-bold text-xs rounded-lg">
                <Building2 className="w-4 h-4 text-indigo-400" />
                Fleets
              </Button>
            </Link>
            <Link href="/admin/activity">
              <Button variant="ghost" className="h-9 px-4 gap-2 font-bold text-xs rounded-lg">
                <Activity className="w-4 h-4 text-emerald-500" />
                Activity
              </Button>
            </Link>
          </nav>
          
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleSeedData}>Seed</Button>
            <Button variant="destructive" size="sm" onClick={async () => {
              if (confirm("Clear all stations?")) {
                const snap = await getDocs(collection(db, "stations"));
                await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
                setStations([]);
                toast({ title: "All stations cleared" });
              }
            }}>Clear</Button>
          </div>
        </div>
      </div>


      {detectedAnomalies.length > 0 && (
        <div className="mb-6 rounded-2xl border-2 overflow-hidden shadow-lg animate-in fade-in zoom-in-95 duration-300">
          <div className="px-6 py-3 bg-muted/50 flex justify-between items-center border-b-2">
            <h4 className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-primary" />
              Anomaly Detection — {detectedAnomalies.length} Alerts
            </h4>
            <Button variant="ghost" size="sm" onClick={detectAnomalies} className="h-8 font-bold text-[10px] uppercase">Refresh</Button>
          </div>
          <div className="divide-y-2">
            {detectedAnomalies.map((anomaly, i) => (
              <div 
                key={i} 
                className={cn(
                  "p-4 flex items-center gap-4 border-l-8",
                  anomaly.severity === "CRITICAL" ? "border-red-600 bg-red-500/5" :
                  anomaly.severity === "HIGH" ? "border-orange-500 bg-orange-500/5" :
                  anomaly.severity === "MEDIUM" ? "border-amber-400 bg-amber-400/5" :
                  "border-emerald-500 bg-emerald-500/5"
                )}
              >
                <Badge variant="outline" className={cn(
                  "font-black text-[10px] uppercase",
                  anomaly.severity === "CRITICAL" ? "bg-red-600 text-white border-none" : ""
                )}>{anomaly.severity}</Badge>
                
                <div className="flex-1">
                  <p className="text-sm font-bold admin-text-primary">{anomaly.message}</p>
                  <p className="text-xs font-medium text-muted-foreground italic">Recommended: {anomaly.action}</p>
                  
                  {anomaly.affectedIds && anomaly.affectedIds.length > 0 && (
                    <div className="anomaly-affected-ids mt-2">
                      <span className="text-[10px] text-muted-foreground uppercase font-bold block mb-1">Affected Entities:</span>
                      {anomaly.affectedIds.slice(0, 3).map((id: string) => {
                        const displayName = getEntityDisplayName(id, anomaly.type);
                        return (
                          <span 
                            key={id}
                            className="anomaly-id-chip hover:bg-primary/10 transition-colors font-sans font-bold"
                            title={`Click to copy full ID: ${id}`}
                            onClick={() => {
                              navigator.clipboard.writeText(id).then(() => {
                                toast({ title: "ID Copied", description: `${displayName} ID copied to clipboard` });
                              });
                            }}
                          >
                            {displayName}
                          </span>
                        );
                      })}
                      {anomaly.affectedIds.length > 3 && (
                        <span className="text-[10px] text-muted-foreground">+{anomaly.affectedIds.length - 3} more</span>
                      )}
                    </div>
                  )}
                </div>

                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => setDetectedAnomalies(prev => prev.filter((_, j) => j !== i))}
                  className="text-muted-foreground hover:text-red-500"
                >
                  Dismiss
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Approvals Action Required Section */}
      {(stats.pendingStations > 0 || stats.unapprovedOwners > 0) && (
        <div className="mb-6 p-6 rounded-3xl bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/20 dark:to-orange-950/10 border-2 border-amber-200/50 dark:border-amber-500/20 shadow-xl overflow-hidden relative">
          <div className="flex flex-col md:flex-row items-center gap-6 relative z-10">
            <div className="w-16 h-16 rounded-2xl bg-amber-500 flex items-center justify-center shadow-lg shadow-amber-500/30 shrink-0">
              <ShieldAlert className="w-8 h-8 text-white animate-pulse" />
            </div>
            
            <div className="flex-1 text-center md:text-left">
              <h3 className="text-xl font-black admin-text-primary uppercase tracking-tight">Approvals Dashboard</h3>
              <p className="text-sm font-medium text-amber-800 dark:text-amber-200 mt-1">
                You have <span className="font-black underline">{stats.pendingStations + stats.unapprovedOwners} items</span> requiring immediate verify/approval.
              </p>
            </div>

            <div className="flex gap-4">
              {stats.pendingStations > 0 && (
                <div 
                  className="bg-white/80 dark:bg-white/10 backdrop-blur-md p-4 rounded-2xl border border-amber-500/20 cursor-pointer hover:scale-105 transition-transform"
                  onClick={() => {
                    const tabs = document.querySelectorAll('[role="tab"]');
                    const stationsTab = Array.from(tabs).find(t => t.textContent === 'Stations');
                    if (stationsTab) (stationsTab as HTMLElement).click();
                    setStationFilter("pending");
                  }}
                >
                  <span className="block text-2xl font-black text-amber-600">{stats.pendingStations}</span>
                  <span className="text-[10px] font-bold uppercase text-muted-foreground whitespace-nowrap">Pending Stations</span>
                </div>
              )}
              {stats.unapprovedOwners > 0 && (
                <div 
                  className="bg-white/80 dark:bg-white/10 backdrop-blur-md p-4 rounded-2xl border border-amber-500/20 cursor-pointer hover:scale-105 transition-transform"
                  onClick={() => {
                    const tabs = document.querySelectorAll('[role="tab"]');
                    const ownersTab = Array.from(tabs).find(t => t.textContent === 'Owners');
                    if (ownersTab) (ownersTab as HTMLElement).click();
                    setOwnerFilter("pending");
                  }}
                >
                  <span className="block text-2xl font-black text-amber-600">{stats.unapprovedOwners}</span>
                  <span className="text-[10px] font-bold uppercase text-muted-foreground whitespace-nowrap">Unapproved Owners</span>
                </div>
              )}
            </div>
          </div>
          <div className="absolute top-0 right-0 p-8 opacity-5">
             <Rocket className="w-32 h-32 rotate-45" />
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        {[
          { label: "Total Stations", value: stats.totalStations },
          { label: "Total Users", value: stats.totalUsers },
          { label: "Total Owners", value: stats.totalOwners },
          { label: "Total Bookings", value: stats.totalBookings },
          { label: "Active", value: stats.activeBookings, color: "text-primary" }
        ].map((stat, i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase">{stat.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${stat.color || ""}`}>{stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <style>{`
        .health-score-card { border:1px solid var(--color-border-secondary); border-radius:12px; overflow:hidden; background: var(--color-background-primary); }
        .health-score-header { padding:12px 16px; background:var(--color-background-secondary); font-size:14px; font-weight:700; color:var(--color-text-primary); border-bottom:1px solid var(--color-border-tertiary); text-transform: uppercase; letter-spacing: 0.1em; }
        .health-score-main { display:flex; align-items:center; gap:16px; padding:20px; }
        .health-score-number { font-size:48px; font-weight:900; line-height:1; }
        .health-score-max { font-size:18px; color:var(--color-text-tertiary); font-weight: 500; }
        .health-grade { font-size:18px; font-weight:800; }
        .health-status { font-size:13px; color:var(--color-text-secondary); font-weight: 600; }
        .health-progress-bar { height:6px; margin:0 16px 20px; background:var(--color-background-tertiary); border-radius:3px; overflow:hidden; }
        .health-progress-fill { height:100%; border-radius:3px; transition:width 0.8s cubic-bezier(0.4, 0, 0.2, 1); }
        .health-issues { border-top:1px solid var(--color-border-tertiary); padding:8px 0; background: var(--color-background-secondary) / 0.3; }
        .health-issue { display:flex; align-items:center; gap:10px; padding:8px 16px; font-size:12px; transition: background 0.2s; }
        .health-issue:hover { background: var(--color-background-secondary); }
        .issue-dot { width:6px; height:6px; border-radius:50%; flex-shrink:0; box-shadow: 0 0 8px currentColor; }
        .issue-critical .issue-dot { background:#ef4444; color:#ef4444 }
        .issue-high .issue-dot { background:#f97316; color:#f97316 }
        .issue-medium .issue-dot { background:#f59e0b; color:#f59e0b }
        .issue-low .issue-dot { background:#22c55e; color:#22c55e }
        .issue-text { flex:1; color:var(--color-text-secondary); font-weight: 500; }
        .issue-deduction { font-size:11px; color:hsl(var(--destructive)); font-weight: 800; }
        .health-all-good { padding:20px; font-size:13px; color:#22c55e; text-align:center; font-weight: 600; }

        .activity-timeline { border: 1px solid var(--color-border-tertiary); border-radius: 12px; overflow: hidden; background: var(--color-background-primary); }
        .activity-header { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; background: var(--color-background-secondary); font-size: 14px; font-weight: 700; color: var(--color-text-primary); border-bottom: 1px solid var(--color-border-tertiary); text-transform: uppercase; letter-spacing: 0.1em; }
        .activity-header a { font-size: 11px; font-weight: 800; color: #22c55e; text-decoration: none; transition: opacity 0.2s; }
        .activity-header a:hover { opacity: 0.8; }
        .activity-item { display: flex; align-items: center; gap: 12px; padding: 12px 16px; border-bottom: 1px solid var(--color-border-tertiary); transition: background 0.2s ease; }
        .activity-item:last-child { border-bottom: none; }
        .activity-item:hover { background: var(--color-background-secondary); cursor: pointer; }
        .activity-icon { font-size: 16px; width: 32px; height: 32px; background: var(--color-background-tertiary); border-radius: 8px; display: flex; align-items: center; justify-content: center; }
        .activity-content { flex: 1; }
        .activity-action { display: block; font-size: 13px; color: var(--color-text-primary); font-weight: 600; }
        .activity-target { display: block; font-size: 11px; color: var(--color-text-tertiary); font-family: monospace; margin-top: 2px; }
        .activity-time { font-size: 11px; color: var(--color-text-tertiary); white-space: nowrap; font-weight: 500; }
        .activity-empty { padding: 40px; text-align: center; font-size: 13px; color: var(--color-text-tertiary); font-weight: 500; }

        .chat-oversight-section { margin-top: 32px; border: 1px solid var(--color-border-tertiary); border-radius: 12px; overflow: hidden; background: var(--color-background-primary); }
        .chat-oversight-header { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; background: var(--color-background-secondary); font-size: 14px; font-weight: 700; color: var(--color-text-primary); border-bottom: 1px solid var(--color-border-tertiary); text-transform: uppercase; letter-spacing: 0.1em; }
        .chat-oversight-stats { display: flex; gap: 24px; padding: 16px; border-bottom: 1px solid var(--color-border-tertiary); background: var(--color-background-secondary) / 0.5; }
        .chat-stat-item { flex: 1; }
        .chat-stat-label { display: block; font-size: 10px; color: var(--color-text-tertiary); font-weight: 800; text-transform: uppercase; margin-bottom: 4px; }
        .chat-stat-value { font-size: 20px; font-weight: 800; color: var(--color-text-primary); }
        .chat-stats-unread { color: #ef4444; }
        .chat-oversight-list { padding: 8px 16px; }
        .chat-oversight-row { display: flex; align-items: center; gap: 12px; padding: 12px 0; border-bottom: 1px solid var(--color-border-tertiary); font-size: 13px; transition: background 0.2s; }
        .chat-oversight-row:last-child { border-bottom: none; }
        .chat-oversight-info { display: flex; flex-direction: column; gap: 2px; width: 180px; }
        .chat-station { display: block; font-weight: 700; color: var(--color-text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .chat-driver { display: block; font-size: 11px; color: var(--color-text-secondary); font-weight: 500; }
        .chat-last-msg { flex: 1; color: var(--color-text-secondary); font-size: 12px; font-style: italic; opacity: 0.8; }
        .chat-oversight-meta { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; font-size: 11px; color: var(--color-text-tertiary); min-width: 80px; }
        .chat-unread-indicator { background: #fee2e2; color: #991b1b; padding: 2px 8px; border-radius: 10px; font-size: 10px; font-weight: 800; text-transform: uppercase; }
        .chat-view-btn { padding: 6px 12px; border-radius: 8px; border: 1px solid var(--color-border-secondary); background: var(--color-background-secondary); cursor: pointer; font-size: 11px; font-weight: 700; color: var(--color-text-primary); transition: all 0.2s; }
        .chat-view-btn:hover { background: var(--color-background-tertiary); border-color: var(--color-text-primary); }
        .chat-view-all { padding: 12px 16px; background: var(--color-background-secondary); border-top: 1px solid var(--color-border-tertiary); text-align: center; }
        .chat-view-all a { font-size: 11px; font-weight: 800; color: #3b82f6; text-decoration: none; transition: opacity 0.2s; }
        .chat-view-all a:hover { text-decoration: underline; }

        .health-trend {
          display:flex; align-items:center;
          gap:8px; padding:8px 16px;
          border-top:1px solid var(--color-border-tertiary);
          font-size:13px; font-weight:500;
        }
        .health-trend-detail {
          font-size:12px; font-weight:400;
          color:var(--color-text-tertiary);
        }
        .health-sparkline {
          padding:0 16px 12px;
        }
        .sparkline-labels {
          display:flex; 
          justify-content:space-between;
          font-size:11px;
          color:var(--color-text-tertiary);
          margin-top:2px;
        }
      `}</style>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        <div className="health-score-card shadow-lg hover:shadow-xl transition-shadow">
          <div className="health-score-header flex items-center justify-between">
            <span>Platform Health Score</span>
            <Activity className="w-4 h-4 text-primary opacity-50" />
          </div>
          
          <div className="health-score-main">
            <div className="health-score-number" style={{color: healthData.statusColor}}>
              {healthData.score}<span className="health-score-max">/100</span>
            </div>
            
            <div className="space-y-1">
              <div className="health-grade" style={{color: healthData.statusColor}}>
                Grade: {healthData.grade}
              </div>
              <div className="health-status uppercase tracking-widest">
                {healthData.status}
              </div>
            </div>
          </div>
          
          <div className="health-progress-bar">
            <div
              className="health-progress-fill"
              style={{
                width: `${healthData.score}%`,
                background: healthData.statusColor,
                boxShadow: `0 0 10px ${healthData.statusColor}40`
              }}
            />
          </div>

          {/* Trend indicator */}
          <div className="health-trend">
            <span style={{color: trendColor}}>
              {scoreTrend > 0 ? "↑" : 
               scoreTrend < 0 ? "↓" : "→"} 
              {trendLabel}
            </span>
            <span className="health-trend-detail">
              {Math.abs(scoreTrend)} pts vs 7 days ago
            </span>
          </div>

          {/* Mini sparkline chart */}
          {healthHistory.length >= 3 && (
            <div className="health-sparkline">
              <ResponsiveContainer width="100%" height={48}>
                <LineChart data={healthHistory}>
                  <Line
                    type="monotone"
                    dataKey="score"
                    stroke={trendColor}
                    strokeWidth={2}
                    dot={false}
                  />
                  <YAxis domain={[0, 100]} hide />
                  <Tooltip
                    formatter={(v: any) => [`${v}/100`, "Score"]}
                  />
                </LineChart>
              </ResponsiveContainer>
              <div className="sparkline-labels">
                <span>7d ago</span>
                <span>Today</span>
              </div>
            </div>
          )}
          
          <div className="health-issues">
            {healthData.issues.length > 0 ? (
              healthData.issues.map((issue, i) => (
                <div key={i} className={`health-issue issue-${issue.severity}`}>
                  <span className="issue-dot"/>
                  <span className="issue-text">{issue.message}</span>
                  <span className="issue-deduction">-{issue.deduction} pts</span>
                </div>
              ))
            ) : (
              <div className="health-all-good flex items-center justify-center gap-2">
                <CheckCircle2 className="w-5 h-5" /> 
                All systems operating normally
              </div>
            )}
          </div>
        </div>

        <div className="activity-timeline shadow-lg hover:shadow-xl transition-shadow">
          <div className="activity-header">
            <span>Recent Admin Activity</span>
            <a href="/admin/audit-logs">VIEW AUDIT CENTER →</a>
          </div>
          
          {recentActivity.length > 0 ? (
            recentActivity.map((log) => (
              <div key={log.id} className="activity-item group">
                <div className="activity-icon group-hover:scale-110 transition-transform">
                  {getActivityIcon(log.action)}
                </div>
                
                <div className="activity-content">
                  <span className="activity-action">
                    {log.action.replace(/_/g, " ").toLowerCase() .replace(/^\w/, (c: string) => c.toUpperCase())}
                  </span>
                  {log.targetId && (
                    <span className="activity-target font-sans font-bold" title={`ID: ${log.targetId}`}>
                      Target: {getAuditTargetDisplayName(log)}
                    </span>
                  )}
                </div>
                
                <span className="activity-time inline-flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {getRelativeTime(log.timestamp)}
                </span>
              </div>
            ))
          ) : (
            <div className="activity-empty flex flex-col items-center gap-2">
              <ShieldCheck className="w-12 h-12 text-muted-foreground opacity-20" />
              <span>No administrative actions recorded in the last window</span>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase flex justify-between">
              Revenue Growth
              {Number(revenueGrowth) >= 0 ? <ArrowUpRight className="w-4 h-4 text-green-500" /> : <ArrowDownRight className="w-4 h-4 text-red-500" />}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${Number(revenueGrowth) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
              {revenueGrowth}%
            </div>
            <p className="text-xs text-muted-foreground mt-1">vs last month</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase">Avg Rev/Session</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">₹{avgRevenuePerSession}</div>
            <p className="text-xs text-muted-foreground mt-1">per completed session</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase">Cancellation Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${Number(cancellationRate) < 10 ? 'text-green-500' : Number(cancellationRate) < 20 ? 'text-yellow-500' : 'text-red-500'}`}>
              {cancellationRate}%
            </div>
            <p className="text-xs text-muted-foreground mt-1">{cancelledBookings.length} cancelled</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase">New Users</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">+{newUsersThisMonth}</div>
            <p className="text-xs text-muted-foreground mt-1">registered this month</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase">Platform Earnings</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">₹{platformEarnings}</div>
            <p className="text-xs text-muted-foreground mt-1">platform commission (5%)</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase">Avg Rating</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${Number(avgRating) >= 4 ? 'text-green-500' : Number(avgRating) >= 3 ? 'text-yellow-500' : 'text-red-500'}`}>
              {avgRating} <Star className="inline w-4 h-4 mb-1" />
            </div>
            <p className="text-xs text-muted-foreground mt-1">from {reviews.length} reviews</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="analytics" className="w-full">
        <TabsList className="grid w-full grid-cols-5 lg:w-[900px]">
          <TabsTrigger value="analytics" className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4" />
            <span>Analytics</span>
          </TabsTrigger>
          <TabsTrigger value="stations">Stations</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="owners">Owners</TabsTrigger>
          <TabsTrigger value="bookings">Bookings</TabsTrigger>
        </TabsList>

        <TabsContent value="analytics" className="space-y-6 pt-4">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-2">
            <div>
              <h2 className="text-xl font-bold flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-primary" /> 
                Network Intelligence
              </h2>
              <p className="text-sm text-muted-foreground">Operational telemetry and financial growth</p>
            </div>
            
            <div className="flex items-center gap-2 bg-muted/50 p-1 rounded-xl border border-border/50 backdrop-blur-sm">
              {(["7d", "30d", "90d", "all"] as const).map((range) => (
                <Button
                  key={range}
                  variant={selectedDateRange === range ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setSelectedDateRange(range)}
                  className={cn(
                    "rounded-lg transition-all duration-200",
                    selectedDateRange === range ? "shadow-sm" : "hover:bg-primary/10"
                  )}
                >
                  {range === "7d" ? "7 Days" : range === "30d" ? "30 Days" : range === "90d" ? "3 Months" : "All Time"}
                </Button>
              ))}
              <div className="w-[1px] h-4 bg-border mx-1"></div>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => fetchData()}
                className="hover:text-primary transition-colors"
              >
                Refresh
              </Button>
            </div>
          </div>

          {analyticsError && (
            <Card className="border-destructive/50 bg-destructive/10 text-destructive p-4">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-5 h-5" />
                <p className="font-medium">{analyticsError}</p>
              </div>
            </Card>
          )}

          <div>
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <DollarSign className="w-5 h-5" /> Revenue Dashboard
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Total Revenue</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">₹{analytics.totalRevenue.toLocaleString()}</div>
                  <p className="text-xs text-muted-foreground mt-1">From successful bookings</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Throughput</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">{analytics.totalEnergy.toLocaleString()} kWh</div>
                  <p className="text-xs text-muted-foreground mt-1">Total energy delivered</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Grid Load</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">{(analytics.peakLoad / 1000).toFixed(2)} MW</div>
                  <p className="text-xs text-muted-foreground mt-1">Peak power density</p>
                </CardContent>
              </Card>
              {Object.entries(analytics.revenueByStation).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([station, revenue]) => (
                <Card key={station}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground truncate">{station}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">₹{(revenue as number).toLocaleString()}</div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          <div>
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <TrendingUp className="w-5 h-5" /> Booking Trends (Last 30 Days)
            </h2>
            <Card className="p-6 admin-glass-card shadow-xl overflow-hidden">
              <div className="h-[300px] w-full">
                {analytics.bookingTrends.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={analytics.bookingTrends}>
                      <defs>
                        <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#22d3ee" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--admin-border-muted)" vertical={false} />
                      <XAxis 
                        dataKey="date" 
                        tick={{ fill: 'var(--admin-text-muted)' }}
                        fontSize={12}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(value) => value.split('/')[0] + '/' + value.split('/')[1]}
                      />
                      <YAxis 
                        tick={{ fill: 'var(--admin-text-muted)' }}
                        fontSize={12}
                        tickLine={false}
                        axisLine={false}
                        allowDecimals={false}
                      />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: 'var(--admin-bg)', 
                          borderColor: 'var(--admin-border)',
                          color: 'var(--admin-text-primary)',
                          borderRadius: '8px',
                          boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)'
                        }}
                        itemStyle={{ color: '#22d3ee' }}
                      />
                      <Area 
                        type="monotone" 
                        dataKey="count" 
                        stroke="#22d3ee" 
                        strokeWidth={3}
                        fillOpacity={1} 
                        fill="url(#colorCount)" 
                        animationDuration={1500}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <p className="text-muted-foreground text-sm italic">No trends detected for this period</p>
                  </div>
                )}
              </div>
            </Card>
          </div>

          <div>
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <Users className="w-5 h-5" /> User Activity Logs
            </h2>
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b">
                    <tr className="bg-muted/50">
                      <th className="text-left p-3">User</th>
                      <th className="text-left p-3">Email</th>
                      <th className="text-left p-3">Bookings</th>
                      <th className="text-left p-3">Last Active</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analytics.userActivityLogs.slice(0, 10).map((log, i) => (
                      <tr key={i} className="border-b hover:bg-muted/30">
                        <td className="p-3 font-medium">{log.fullName}</td>
                        <td className="p-3 text-muted-foreground">{log.email}</td>
                        <td className="p-3">{log.bookingCount}</td>
                        <td className="p-3 text-xs">{safeFormat(log.lastActive, "MMM d, yyyy")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>

          <div>
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <Zap className="w-5 h-5" /> Station Performance Metrics
            </h2>
            <div className="grid gap-4">
              {Object.entries(analytics.stationMetrics).map(([station, metrics]) => (
                <Card key={station} className="p-4">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h3 className="font-bold text-lg">{station}</h3>
                      <p className="text-sm text-muted-foreground">Bookings: {metrics.totalBookings}</p>
                    </div>
                    <Badge variant="outline">₹{metrics.revenue.toLocaleString()}</Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Utilization Rate</span>
                      <p className="font-bold text-lg">{metrics.utilization}%</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Popular Connector</span>
                      <p className="font-bold">{metrics.popularConnector}</p>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>

          {/* Revenue Intelligence Dashboard */}
          <div className="revenue-intelligence-section">
            <h2 className="text-2xl font-black mb-6 flex items-center gap-3">
              <div className="bg-primary/20 p-2 rounded-lg">
                <Rocket className="w-6 h-6 text-primary" />
              </div>
              Revenue Intelligence
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <Card className="bg-[var(--admin-surface)] border-[var(--admin-border)] shadow-2xl">
                <CardHeader>
                  <CardTitle className="text-xs font-black uppercase text-cyan-400">Projected Month-End</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-4xl font-black">₹{analytics.estimatedMonthEnd.toLocaleString()}</div>
                  <div className="flex items-center gap-2 mt-2">
                    <TrendingUp className="w-4 h-4 text-green-400" />
                    <span className="text-xs font-bold admin-text-muted">Linear Forecast</span>
                  </div>
                </CardContent>
              </Card>

              <Card className="admin-glass-card border-dashed border-2 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-xs font-black uppercase text-muted-foreground">Peak Revenue Hour</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-4xl font-black">{analytics.peakRevenueHour}:00</div>
                  <div className="flex items-center gap-2 mt-2">
                    <History className="w-4 h-4 text-orange-400" />
                    <span className="text-xs font-bold text-muted-foreground italic">Highest load window</span>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-red-100 dark:border-red-900/30 bg-red-50/30 dark:bg-red-950/20">
                <CardHeader>
                  <CardTitle className="text-xs font-black uppercase text-red-500">Cancellation Loss</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-4xl font-black text-red-600 dark:text-red-400">₹{analytics.cancellationLoss.toLocaleString()}</div>
                  <div className="flex items-center gap-2 mt-2">
                    <AlertTriangle className="w-4 h-4 text-red-500" />
                    <span className="text-xs font-bold text-muted-foreground">Potential recovered revenue</span>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <Card className="p-6">
                <h3 className="text-sm font-black uppercase text-muted-foreground mb-6 flex items-center gap-2">
                  <BarChart3 className="w-4 h-4" /> Revenue by Connector Type
                </h3>
                <div className="h-[250px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={analytics.revenueByConnectorData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} strokeOpacity={0.1} />
                      <XAxis dataKey="type" fontSize={11} fontWeight={700} axisLine={false} tickLine={false} />
                      <YAxis hide />
                      <Tooltip 
                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                      />
                      <Bar dataKey="revenue" radius={[6, 6, 0, 0]} barSize={40}>
                        {(analytics.revenueByConnectorData as any[]).map((_entry, index) => (
                          <Cell key={`cell-${index}`} fill={['#22d3ee', '#818cf8', '#fb7185'][index % 3]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>

              <Card className="p-6">
                <h3 className="text-sm font-black uppercase text-muted-foreground mb-6 flex items-center gap-2">
                  <Trophy className="w-4 h-4 text-yellow-500" /> Owner Performance
                </h3>
                <div className="space-y-4">
                  {Object.entries(analytics.ownerRevenueMap)
                    .sort(([,a], [,b]) => (b as number) - (a as number))
                    .slice(0, 5)
                    .map(([ownerName, revenue]: [string, any], idx) => (
                      <div key={ownerName} className="flex items-center justify-between p-3 rounded-xl bg-muted/30 border border-border/50 hover:border-primary/30 transition-all">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center font-black text-primary text-xs">
                            {idx + 1}
                          </div>
                          <span className="font-bold text-sm">{ownerName}</span>
                        </div>
                        <div className="text-right">
                          <p className="font-black text-sm">₹{revenue.toLocaleString()}</p>
                          <p className="text-[10px] text-muted-foreground">Network Share: {((revenue / (analytics.totalRevenue || 1)) * 100).toFixed(1)}%</p>
                        </div>
                      </div>
                    ))}
                </div>
              </Card>

              <Card className="p-6 lg:col-span-2">
                <h3 className="text-sm font-black uppercase text-muted-foreground mb-6 flex items-center gap-2">
                  <History className="w-4 h-4" /> Hourly Revenue Velocity
                </h3>
                <div className="h-[200px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={analytics.hourlyRevenueData}>
                      <defs>
                        <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#22c55e" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="hour" axisLine={false} tickLine={false} fontSize={10} tickFormatter={(h) => `${h}:00`} />
                      <Tooltip />
                      <Area type="monotone" dataKey="revenue" stroke="#22c55e" fill="url(#colorRev)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            </div>
          </div>

          {/* Chat Oversight Section */}
          <div className="chat-oversight-section shadow-2xl">
            <div className="chat-oversight-header">
              <div className="flex items-center gap-2">
                <MessagesSquare className="w-5 h-5 text-primary" />
                <span>Communication Oversight</span>
              </div>
              <Badge variant="outline" className="text-[10px] bg-primary/5">LIVE MONITORING</Badge>
            </div>

            <div className="chat-oversight-stats">
              <div className="chat-stat-item">
                <span className="chat-stat-label">Active Conversations</span>
                <span className="chat-stat-value">{activeChats.length}</span>
              </div>
              <div className="chat-stat-item">
                <span className="chat-stat-label">Unread Messages</span>
                <span className="chat-stat-value chat-stats-unread">
                  {chatsWithUnread.length} <span className="text-xs">🔴</span>
                </span>
              </div>
              <div className="chat-stat-item">
                <span className="chat-stat-label">Total Unreads</span>
                <span className="chat-stat-value">{totalMessages}</span>
              </div>
              <div className="chat-stat-item">
                <span className="chat-stat-label">Avg Response Time</span>
                <span className="chat-stat-value text-muted-foreground">~15 min</span>
              </div>
            </div>

            <div className="chat-oversight-list">
              {activeChats.length > 0 ? (
                activeChats.slice(0, 5).map((chat: any) => (
                  <div key={chat.id} className="chat-oversight-row group">
                    <div className="chat-oversight-info">
                      <span className="chat-station">{chat.stationName}</span>
                      <span className="chat-driver">Driver: {chat.driverName}</span>
                    </div>
                    
                    <div className="chat-last-msg">
                      {chat.lastMessage?.slice(0, 70) || "Conversation started..."}
                      {chat.lastMessage?.length > 70 && "..."}
                    </div>
                    
                    <div className="chat-oversight-meta">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {getRelativeTime(chat.lastMessageAt)}
                      </span>
                      {((chat.ownerUnread || 0) + (chat.driverUnread || 0)) > 0 && (
                        <span className="chat-unread-indicator">
                          Unread
                        </span>
                      )}
                    </div>
                    
                    <button
                      className="chat-view-btn shadow-sm hover:shadow-md"
                      onClick={() => setLocation(`/admin?chat=${chat.id}`)}
                    >
                      Oversee
                    </button>
                  </div>
                ))
              ) : (
                <div className="flex flex-col items-center justify-center p-12 text-muted-foreground gap-2">
                  <MessagesSquare className="w-12 h-12 opacity-20" />
                  <p className="text-sm font-medium italic">No active conversations detected</p>
                </div>
              )}
            </div>

            {activeChats.length > 5 && (
              <div className="chat-view-all">
                <a href="/admin/chat-oversight" className="flex items-center justify-center gap-1">
                  VIEW ALL {activeChats.length} CONVERSATIONS <TrendingUp className="w-3 h-3" />
                </a>
              </div>
            )}
          </div>
        </TabsContent>
        <TabsContent value="stations" className="space-y-4 pt-4">
          <style>{`
            .sla-badge {
              font-size: 11px;
              padding: 2px 8px;
              border-radius: 10px;
              background: hsl(var(--muted));
              color: hsl(var(--muted-foreground));
            }
            .sla-badge.urgent {
              background: #fee2e2;
              color: #991b1b;
              font-weight: 500;
            }
            .bulk-action-bar {
              position: sticky;
              top: 0;
              z-index: 10;
              background: #22c55e;
              color: white;
              padding: 10px 16px;
              border-radius: 8px;
              display: flex;
              align-items: center;
              gap: 12px;
              margin-bottom: 16px;
              font-size: 14px;
              box-shadow: 0 4px 12px rgba(34, 197, 94, 0.2);
              animation: slideDown 0.3s ease;
            }
            @keyframes slideDown {
              from { transform: translateY(-100%); opacity: 0; }
              to { transform: translateY(0); opacity: 1; }
            }
          `}</style>

          {selectedForApproval.length > 0 && (
            <div className="bulk-action-bar">
              <span className="font-bold flex items-center gap-2">
                <Badge variant="secondary" className="bg-white text-green-600">{selectedForApproval.length}</Badge> stations selected
              </span>
              <Button onClick={handleBulkApprove} className="bg-white text-green-600 hover:bg-green-50 border-none font-bold">
                Approve All Selected
              </Button>
              <Button onClick={() => setSelectedForApproval([])} variant="ghost" className="text-white hover:bg-white/20">
                Cancel
              </Button>
            </div>
          )}

          <div className="flex flex-wrap gap-2 mb-4">
            {(["all", "pending", "active"] as const).map((f) => (
              <Button
                key={f}
                variant={stationFilter === f ? "default" : "outline"}
                size="sm"
                onClick={() => setStationFilter(f)}
                className="rounded-full text-[10px] uppercase font-bold"
              >
                {f}
              </Button>
            ))}
          </div>

          <div className="grid gap-4">
            {stations
              .filter(s => stationFilter === "all" || s.status === stationFilter)
              .map((s) => {
              const { label, urgent } = getPendingDuration(s.createdAt);
              const isSelected = selectedForApproval.includes(s.id);
              
              return (
                <Card key={s.id} className={`p-4 flex justify-between items-center transition-all ${isSelected ? 'border-primary ring-1 ring-primary/20 bg-primary/5' : ''}`}>
                  <div className="flex items-center gap-4">
                    {s.status === "pending" && (
                      <input 
                        type="checkbox" 
                        checked={isSelected}
                        onChange={() => toggleSelectStation(s.id)}
                        className="w-5 h-5 rounded border-gray-300 text-primary focus:ring-primary"
                      />
                    )}
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold">{s.name}</h3>
                        {s.status === "pending" && (
                          <span className={urgent ? "sla-badge urgent" : "sla-badge"}>
                            Waiting: {label}
                            {urgent && " ⚠️ Overdue"}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">{s.address}</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {s.status === "pending" && (
                      <>
                        <Button 
                          variant="default" 
                          size="sm" 
                          onClick={() => handleApproveStation(s.id)}
                          className="bg-green-600 hover:bg-green-700 font-bold"
                        >
                          <CheckCircle className="w-4 h-4 mr-1" /> Approve
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={() => setRejectModal({ stationId: s.id, stationName: s.name })}
                          className="border-red-500 text-red-500 hover:bg-red-50 font-bold"
                        >
                          <XCircle className="w-4 h-4 mr-1" /> Reject
                        </Button>
                      </>
                    )}
                    {s.status === "active" && (
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => handleUnapproveStation(s.id)}
                        className="border-amber-500 text-amber-500 hover:bg-amber-50 font-bold"
                      >
                        <History className="w-4 h-4 mr-1" /> Unapprove
                      </Button>
                    )}
                    <Button variant="outline" size="sm" onClick={() => setSelectedStation(s)}>
                      <Info className="w-4 h-4 mr-1" /> Details
                    </Button>
                    <Button variant="destructive" size="sm" onClick={() => handleDeleteStation(s.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="users" className="space-y-4 pt-4">
          <div className="grid gap-4">
            {users.map((u) => (
              <Card key={u.id} className="p-4 flex justify-between items-center">
                <div>
                  <h3 className="font-bold">{u.fullName || u.email}</h3>
                  <p className="text-sm text-muted-foreground">{u.email}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => setSelectedUser(u)}>
                    <Info className="w-4 h-4 mr-1" /> Details
                  </Button>
                  <Button 
                    variant={u.blocked ? "default" : "secondary"} 
                    size="sm"
                    onClick={() => {
                      if (u.blocked) {
                        handleBlockUser(u.id, true)
                      } else {
                        setBlockModal({ uid: u.id, name: u.fullName || u.email })
                      }
                    }}
                  >
                    {u.blocked ? "Unblock" : "Block"}
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="owners" className="space-y-4 pt-4">
          <div className="flex flex-wrap gap-2 mb-4">
            {(["all", "pending", "approved"] as const).map((f) => (
              <Button
                key={f}
                variant={ownerFilter === f ? "default" : "outline"}
                size="sm"
                onClick={() => setOwnerFilter(f)}
                className="rounded-full text-[10px] uppercase font-bold"
              >
                {f}
              </Button>
            ))}
          </div>

          <div className="grid gap-4">
            {owners
              .filter(o => {
                if (ownerFilter === "all") return true;
                if (ownerFilter === "pending") return !o.approved;
                return o.approved;
              })
              .map((o) => (
              <Card key={o.id} className="p-4 flex justify-between items-center">
                <div>
                  <h3 className="font-bold">{o.fullName || o.businessName}</h3>
                  <p className="text-sm text-muted-foreground">{o.email}</p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant={o.approved ? "default" : "outline"}>
                    {o.approved ? "Approved" : "Pending"}
                  </Badge>
                  {!o.approved && (
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => handleApproveOwner(o.id)}
                      className="border-green-600 text-green-600 hover:bg-green-50"
                    >
                      <CheckCircle className="w-4 h-4 mr-1" /> Verify
                    </Button>
                  )}
                  <Button variant="outline" size="sm" onClick={() => setSelectedOwner(o)}>
                    <Info className="w-4 h-4 mr-1" /> Details
                  </Button>
                  {o.approved && (
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => handleRevokeOwner(o.id)}
                      className="text-amber-600 hover:text-amber-700 hover:bg-amber-50 font-bold"
                    >
                      <AlertTriangle className="w-4 h-4 mr-1" /> Revoke
                    </Button>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="bookings" className="space-y-4 pt-4">
          <div className="grid gap-4">
            {bookings.map((b) => (
              <Card key={b.id} className="p-4 flex justify-between items-center">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 flex-1">
                  <div>
                    <span className="text-muted-foreground block text-xs">Station</span>
                    {b.stationName}
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-xs">Status</span>
                    <Badge variant="outline">{b.status}</Badge>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-xs">Payment</span>
                    <Badge variant="secondary">{b.paymentStatus}</Badge>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-xs">Price</span>
                    ₹{b.totalPrice}
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={() => setSelectedBooking(b)}>
                  <Info className="w-4 h-4 mr-1" /> Details
                </Button>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      {/* Security: Session Timeout Warning Modal */}
      {showTimeoutWarning && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-card border-2 border-primary/20 p-8 rounded-2xl shadow-2xl max-w-md w-full mx-4 space-y-6 animate-in zoom-in-95 duration-300">
            <div className="flex items-center gap-4 text-primary">
              <div className="p-3 bg-primary/10 rounded-full">
                <ShieldAlert className="w-8 h-8" />
              </div>
              <h3 className="text-2xl font-bold">SessionExpiring</h3>
            </div>
            
            <p className="text-muted-foreground leading-relaxed">
              You have been inactive for over 30 minutes. For your security, this administrative session will expire soon.
            </p>
            
            <div className="flex flex-col gap-3">
              <Button 
                className="w-full text-lg h-12" 
                onClick={() => {
                  setLastActivity(Date.now());
                  setShowTimeoutWarning(false);
                }}
              >
                Keep working
              </Button>
              <Button 
                variant="ghost" 
                className="w-full text-muted-foreground hover:text-destructive" 
                onClick={() => signOut()}
              >
                Sign out now
              </Button>
            </div>
          </div>
        </div>
      )}

      {rejectModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
          <Card className="max-w-md w-full mx-4 shadow-2xl border-2 animate-in zoom-in-95 duration-200">
            <CardHeader>
              <CardTitle className="text-xl font-bold flex items-center gap-2">
                <XCircle className="w-6 h-6 text-destructive" />
                Reject {rejectModal.stationName}?
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-bold text-muted-foreground">Rejection Reason:</label>
                <select
                  className="w-full p-3 rounded-xl border-2 border-border bg-background focus:border-primary outline-none transition-all font-medium"
                  value={rejectReason}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setRejectReason(e.target.value)}>
                  <option value="">Select a reason...</option>
                  {REJECTION_REASONS.map(r => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
              
              {rejectReason === "Custom reason..." && (
                <Textarea
                  placeholder="Describe the issue in detail for the owner..."
                  value={rejectCustom}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setRejectCustom(e.target.value)}
                  className="rounded-xl min-h-[100px]"
                />
              )}
              
              <div className="p-3 bg-muted rounded-xl flex gap-3 items-start">
                <AlertTriangle className="w-5 h-5 text-warning mt-0.5" />
                <p className="text-xs text-muted-foreground leading-relaxed font-medium">
                  The station owner will be notified immediately. They will be able to correct these issues and resubmit for approval.
                </p>
              </div>
            </CardContent>
            <CardContent className="flex gap-3 pt-0">
              <Button 
                variant="ghost" 
                className="flex-1"
                onClick={() => {
                  setRejectModal(null)
                  setRejectReason("")
                  setRejectCustom("")
                }}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                className="flex-1 font-bold"
                disabled={!rejectReason || (rejectReason === "Custom reason..." && !rejectCustom)}
                onClick={() => handleRejectStation(
                  rejectModal.stationId,
                  rejectReason === "Custom reason..." ? rejectCustom : rejectReason
                )}>
                Send Rejection
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {blockModal && (
        <div className="modal-overlay">
          <div className="modal-card animate-in zoom-in-95 duration-200">
            <h3>Block {blockModal.name}?</h3>
            <p className="text-sm text-muted-foreground">This will cancel all their active sessions and prevent future bookings.</p>
            
            <label>Reason (required):</label>
            <select
              value={blockReason}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setBlockReason(e.target.value)}>
              <option value="">Select reason...</option>
              <option value="Policy violation">Policy violation</option>
              <option value="Fraudulent activity">Fraudulent activity</option>
              <option value="Repeated cancellations">Repeated cancellations</option>
              <option value="Abusive behavior">Abusive behavior</option>
              <option value="Suspicious activity">Suspicious activity</option>
            </select>
            
            <div className="modal-actions">
              <Button variant="ghost" onClick={() => {
                setBlockModal(null)
                setBlockReason("")
              }}>
                Cancel
              </Button>
              <Button
                disabled={!blockReason}
                variant="destructive"
                onClick={() => {
                  handleBlockUser(blockModal.uid, false, blockReason)
                  setBlockModal(null)
                  setBlockReason("")
                }}>
                Confirm Block
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Sheets for Collaboration */}
      <Sheet open={!!selectedStation} onOpenChange={(open) => !open && setSelectedStation(null)}>
        <SheetContent className="sm:max-w-xl overflow-y-auto">
          {selectedStation && (
            <div className="space-y-6 py-6">
              <SheetHeader>
                <SheetTitle className="text-2xl font-black italic uppercase tracking-tighter">
                  Station: {selectedStation.name}
                </SheetTitle>
                <SheetDescription>
                  {selectedStation.address}
                </SheetDescription>
              </SheetHeader>
              <div className="grid grid-cols-2 gap-4">
                <Card className="p-4 bg-muted/50 border-none">
                  <span className="text-[10px] font-black uppercase text-muted-foreground">Connector Types</span>
                  <p className="text-sm font-bold">
                    {Array.from(new Set(selectedStation.connectors?.map((c: any) => c.type))).join(", ") || "None"}
                  </p>
                </Card>
                <Card className="p-4 bg-muted/50 border-none">
                  <span className="text-[10px] font-black uppercase text-muted-foreground">Status</span>
                  <Badge className="mt-1">{selectedStation.status}</Badge>
                </Card>
              </div>
              <AdminNotes entityType="station" entityId={selectedStation.id} />
            </div>
          )}
        </SheetContent>
      </Sheet>

      <Sheet open={!!selectedUser} onOpenChange={(open) => !open && setSelectedUser(null)}>
        <SheetContent className="sm:max-w-xl overflow-y-auto">
          {selectedUser && (
            <div className="space-y-6 py-6">
              <SheetHeader>
                <SheetTitle className="text-2xl font-black italic uppercase tracking-tighter">
                  User: {selectedUser.fullName || selectedUser.email}
                </SheetTitle>
                <SheetDescription>
                  {selectedUser.email}
                </SheetDescription>
              </SheetHeader>
              <div className="grid grid-cols-2 gap-4">
                <Card className="p-4 bg-muted/50 border-none">
                  <span className="text-[10px] font-black uppercase text-muted-foreground">Role</span>
                  <p className="text-sm font-bold uppercase">{selectedUser.role || "User"}</p>
                </Card>
                <Card className="p-4 bg-muted/50 border-none">
                  <span className="text-[10px] font-black uppercase text-muted-foreground">Account Status</span>
                  <Badge variant={selectedUser.blocked ? "destructive" : "default"} className="mt-1">
                    {selectedUser.blocked ? "BLOCKED" : "ACTIVE"}
                  </Badge>
                </Card>
              </div>
              <AdminNotes entityType="user" entityId={selectedUser.id} />
            </div>
          )}
        </SheetContent>
      </Sheet>

      <Sheet open={!!selectedOwner} onOpenChange={(open) => !open && setSelectedOwner(null)}>
        <SheetContent className="sm:max-w-xl overflow-y-auto">
          {selectedOwner && (
            <div className="space-y-6 py-6">
              <SheetHeader>
                <SheetTitle className="text-2xl font-black italic uppercase tracking-tighter">
                  Owner: {selectedOwner.fullName || selectedOwner.businessName}
                </SheetTitle>
                <SheetDescription>
                  {selectedOwner.email}
                </SheetDescription>
              </SheetHeader>
              <div className="grid grid-cols-2 gap-4">
                <Card className="p-4 bg-muted/50 border-none">
                  <span className="text-[10px] font-black uppercase text-muted-foreground">Business</span>
                  <p className="text-sm font-bold">{selectedOwner.businessName || "Private"}</p>
                </Card>
                <Card className="p-4 bg-muted/50 border-none">
                  <span className="text-[10px] font-black uppercase text-muted-foreground">Verification</span>
                  <Badge variant={selectedOwner.approved ? "default" : "outline"} className="mt-1">
                    {selectedOwner.approved ? "VERIFIED" : "PENDING"}
                  </Badge>
                </Card>
              </div>
              <AdminNotes entityType="user" entityId={selectedOwner.id} />
            </div>
          )}
        </SheetContent>
      </Sheet>

      <Sheet open={!!selectedBooking} onOpenChange={(open) => !open && setSelectedBooking(null)}>
        <SheetContent className="sm:max-w-xl overflow-y-auto">
          {selectedBooking && (
            <div className="space-y-6 py-6">
              <SheetHeader>
                <SheetTitle className="text-2xl font-black italic uppercase tracking-tighter">
                  Booking: {selectedBooking.id.substring(0, 8)}...
                </SheetTitle>
                <SheetDescription>
                  Station: {selectedBooking.stationName}
                </SheetDescription>
              </SheetHeader>
              <div className="grid grid-cols-2 gap-4">
                <Card className="p-4 bg-muted/50 border-none">
                  <span className="text-[10px] font-black uppercase text-muted-foreground">Total Price</span>
                  <p className="text-sm font-bold">₹{selectedBooking.totalPrice}</p>
                </Card>
                <Card className="p-4 bg-muted/50 border-none">
                  <span className="text-[10px] font-black uppercase text-muted-foreground">Status</span>
                  <Badge variant="outline" className="mt-1 uppercase font-bold">{selectedBooking.status}</Badge>
                </Card>
              </div>
              <AdminNotes entityType="booking" entityId={selectedBooking.id} />
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
