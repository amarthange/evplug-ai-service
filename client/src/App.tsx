// System: Owner Platform Operational Ecosystem Integrated
import React, { useState, useEffect } from "react";
import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/lib/auth-context";
import { ThemeProvider } from "@/lib/theme-provider";
import { LanguageProvider } from "@/lib/language-context";
import { Header } from "@/components/header";
import { OwnerLayout } from "@/components/owner-layout";
import { db } from "@/lib/firebase";
import { doc, onSnapshot, getDoc } from "firebase/firestore";
import Home from "@/pages/home";
import StationDetail from "@/pages/station-detail";
import Bookings from "@/pages/bookings";
import Auth from "@/pages/auth";
import Setup from "@/pages/setup";
import Admin from "./pages/admin/index";
import AdminAuditLogs from "@/pages/admin-audit-logs";
import AdminSettings from "@/pages/admin-settings";
import AdminSupport from "@/pages/admin-support";
import AdminReports from "@/pages/admin-reports";
import AdminMLMonitoring from "./pages/admin/AdminMLMonitoring";
import AdminPredictiveMaintenance from "./pages/admin/AdminPredictiveMaintenance";
import AdminFraudDetection from "./pages/admin/AdminFraudDetection";
import AdminFleet from "./pages/admin/AdminFleet";
const AdminNotificationSettings = React.lazy(() => import("@/pages/admin/AdminNotificationSettings"));
const AdminCapacityPlanning = React.lazy(() => import("@/pages/admin/AdminCapacityPlanning"));
const AdminABTests = React.lazy(() => import("@/pages/admin/AdminABTests"));
const AdminBenchmarks = React.lazy(() => import("@/pages/admin/AdminBenchmarks"));
const AdminSatisfaction = React.lazy(() => import("@/pages/admin/AdminSatisfaction"));
const AdminDataManagement = React.lazy(() => import("@/pages/admin/AdminDataManagement"));
const AdminActivity = React.lazy(() => import("@/pages/admin/AdminActivity"));
import AdminCollabSidebar from "@/components/AdminCollabSidebar";
import StripePayments from "@/pages/stripe-payments";
import MLPredictions from "@/pages/ml-predictions";
import Notifications from "@/pages/notifications";
import RoutePlanning from "@/pages/route-planning";
import UserProfile from "@/pages/user-profile";
import OwnerSignup from "@/pages/owner-signup";
import OwnerLogin from "@/pages/owner-login";
import OwnerDashboard from "@/pages/owner-dashboard";
import OwnerStations from "@/pages/owner-stations";
const OwnerLedger = React.lazy(() => import("@/pages/owner-ledger"));
import OwnerReviews from "@/pages/owner-reviews";
import CompleteProfile from "@/pages/complete-profile";
import PaymentPage from "@/pages/payment";
import SettingsPage from "@/pages/settings";
import ActiveCharge from "@/pages/active-charge";
import ReceiptPage from "@/pages/receipt";
import FleetManagement from "@/pages/fleet-management";
import NotFound from "@/pages/not-found";
import Analytics from '@/pages/analytics';
import ChargingHistory from "@/pages/charging-history";
import Favorites from "@/pages/Favorites";
import ScanQR from "@/pages/scan-qr";
import ReferralPage from "@/pages/ReferralPage";
import RoutePlanner from "@/pages/RoutePlanner";
import MyRoutes from "@/pages/MyRoutes";
import ImpactDashboard from "@/pages/ImpactDashboard";
const AdminAnalytics = React.lazy(() => import("./pages/admin/Analytics"));
import OwnerDrivers from "@/pages/owner-drivers";
import OwnerPromotions from "@/pages/owner-promotions";
import OwnerNotifications from "@/pages/owner-notifications";
import OwnerHelp from "@/pages/owner-help";
import OwnerCompleteBusinessProfile from "@/pages/owner-complete-business-profile";
import OwnerAnnouncements from "@/pages/owner/OwnerAnnouncements";
import OwnerCheckInScanner from "@/pages/OwnerCheckInScanner";
import "@/lib/seed-data";
import { BottomNav } from "@/components/bottom-nav";
import { PWAInstallPrompt } from "@/components/pwa-install";
import { OfflineBanner } from "@/components/OfflineBanner";
import MaintenancePage from "@/pages/maintenance";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

// Routes that get the full SaaS owner layout (sidebar, no global header)
const OWNER_ROUTES = ["/owner/dashboard", "/owner/stations", "/owner/ledger", "/owner/reviews", "/owner/drivers", "/owner/promotions", "/owner/notifications", "/owner/help", "/fleet", "/owner/announcements", "/owner/scanner"];

function Router({ globalSettings }: { globalSettings: any }) {
  useOfflineSync();
  const [location] = useLocation();
  const { userRole, user, loading: authLoading } = useAuth();
  const isOwnerApp = OWNER_ROUTES.some((r) => location.startsWith(r));

  // Global Maintenance Mode Redirection
  if (!authLoading && globalSettings?.maintenanceMode && userRole !== "admin") {
    return <MaintenancePage 
      message={globalSettings?.maintenanceMessage} 
      endsAt={globalSettings?.maintenanceEndsAt} 
    />;
  }

  if (isOwnerApp) {
    return <OwnerRouter />;
  }

  const isEVUser = userRole === "ev_user" || !userRole;
  const shouldShowNav = isEVUser;

  return (
    <div className="flex flex-col h-screen overscroll-none bg-background text-foreground transition-colors duration-300">
      <Header />
      <main className={cn(
        "flex-1 overflow-auto",
        shouldShowNav && "pb-16 md:pb-0" // Add padding for bottom nav on mobile
      )}>
        <Switch>
          <Route path="/" component={Home} />
          <Route path="/station/:id" component={StationDetail} />
          <Route path="/bookings" component={Bookings} />
          <Route path="/auth" component={Auth} />
          <Route path="/setup" component={Setup} />
          <Route path="/admin" component={Admin} />
          <Route path="/admin/audit-logs" component={AdminAuditLogs} />
          <Route path="/admin/settings" component={AdminSettings} />
          <Route path="/admin/support" component={AdminSupport} />
          <Route path="/admin/reports" component={AdminReports} />
          <Route path="/admin/ml-monitoring" component={AdminMLMonitoring} />
          <Route path="/admin/predictive-maintenance" component={AdminPredictiveMaintenance} />
          <Route path="/admin/fraud-detection" component={AdminFraudDetection} />
          <Route path="/admin/notification-settings" component={AdminNotificationSettings} />
          <Route path="/admin/capacity-planning" component={AdminCapacityPlanning} />
          <Route path="/admin/ab-tests" component={AdminABTests} />
          <Route path="/admin/benchmarks" component={AdminBenchmarks} />
          <Route path="/admin/customer-satisfaction" component={AdminSatisfaction} />
          <Route path="/admin/data-management" component={AdminDataManagement} />
          <Route path="/admin/activity" component={AdminActivity} />
          <Route path="/admin/fleet" component={AdminFleet} />
          <Route path="/stripe" component={StripePayments} />
          <Route path="/ml" component={MLPredictions} />
          <Route path="/notifications" component={Notifications} />
          <Route path="/route-planning" component={RoutePlanning} />
          <Route path="/user-profile" component={UserProfile} />
          <Route path="/profile" component={UserProfile} />
          <Route path="/complete-profile" component={CompleteProfile} />
          <Route path="/analytics" component={Analytics} />
          <Route path="/history" component={ChargingHistory} />
          <Route path="/favorites" component={Favorites} />
          <Route path="/referrals" component={ReferralPage} />
          <Route path="/plan-route" component={RoutePlanner} />
          <Route path="/my-routes" component={MyRoutes} />
          <Route path="/impact" component={ImpactDashboard} />
          <Route path="/admin/analytics" component={AdminAnalytics} />
          <Route path="/owner/signup" component={OwnerSignup} />
          <Route path="/owner/login" component={OwnerLogin} />
          <Route path="/owner/complete-business-profile" component={OwnerCompleteBusinessProfile} />
          <Route path="/payment/:id" component={PaymentPage} />
          <Route path="/settings" component={SettingsPage} />
          <Route path="/charge/:id" component={ActiveCharge} />
          <Route path="/scan" component={ScanQR} />
          <Route path="/receipt/:id" component={ReceiptPage} />
          <Route component={NotFound} />
        </Switch>
        {userRole === "admin" && <AdminCollabSidebar />}
      </main>
      {shouldShowNav && <BottomNav />}
    </div>
  );
}

function OwnerRouter() {
  return (
    <OwnerLayout>
      <Switch>
        <Route path="/owner/dashboard" component={OwnerDashboard} />
        <Route path="/owner/stations" component={OwnerStations} />
        <Route path="/owner/ledger" component={OwnerLedger} />
        <Route path="/owner/reviews" component={OwnerReviews} />
        <Route path="/owner/drivers" component={OwnerDrivers} />
        <Route path="/owner/promotions" component={OwnerPromotions} />
        <Route path="/owner/notifications" component={OwnerNotifications} />
        <Route path="/owner/announcements" component={OwnerAnnouncements} />
        <Route path="/owner/scanner" component={OwnerCheckInScanner} />
        <Route path="/owner/help" component={OwnerHelp} />
        <Route path="/fleet" component={FleetManagement} />
      </Switch>
    </OwnerLayout>
  );
}

function App() {
  const [globalSettings, setGlobalSettings] = useState<any>(null);

  useEffect(() => {
    if (!db) return;
    
    let active = true;
    console.log("📡 Fetching global settings...");
    const settingsRef = doc(db, "settings", "global");
    
    getDoc(settingsRef)
      .then((snap) => {
        if (!active) return;
        if (snap.exists()) {
          console.log("✅ Global settings fetched:", snap.data());
          setGlobalSettings(snap.data());
        } else {
          console.warn("⚠️ Global settings document missing");
        }
      })
      .catch((err) => {
        console.error("❌ Failed to fetch global settings:", err);
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <LanguageProvider>
        <ThemeProvider>
          <TooltipProvider>
            <OfflineBanner />
            <React.Suspense fallback={<div className="h-screen w-screen flex items-center justify-center bg-slate-900 text-white">Loading...</div>}>
              <Router globalSettings={globalSettings} />
            </React.Suspense>
            <Toaster />
            <PWAInstallPrompt />
          </TooltipProvider>
        </ThemeProvider>
      </LanguageProvider>
    </QueryClientProvider>
  );
}

export default App;
