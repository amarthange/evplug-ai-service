import { doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "./firebase";

export interface NotificationPreference {
  id: string;
  label: string;
  description: string;
  category: "sessions" | "stations" | "account";
  icon: string;
}

export const NOTIFICATION_CATEGORIES = [
  { id: "sessions", label: "Charging Sessions", icon: "⚡" },
  { id: "stations", label: "Station Alerts", icon: "📍" },
  { id: "account", label: "Account & Safety", icon: "🛡️" },
] as const;

export const NOTIFICATION_PREFS: NotificationPreference[] = [
  // Sessions
  {
    id: "sessionStarted",
    label: "Session Started",
    description: "Instant alert when your vehicle starts drawing power.",
    category: "sessions",
    icon: "🔌",
  },
  {
    id: "sessionComplete",
    label: "Session Complete",
    description: "Get notified as soon as your charging reaches the target.",
    category: "sessions",
    icon: "✅",
  },
  {
    id: "lowBatteryAlert",
    label: "Low Battery Warning",
    description: "Alerts when your estimated range drops below 20%.",
    category: "sessions",
    icon: "🪫",
  },
  // Stations
  {
    id: "stationAvailable",
    label: "Station Available",
    description: "Notify me when a favorite station becomes free.",
    category: "stations",
    icon: "🟢",
  },
  {
    id: "priceDrop",
    label: "Price Drops",
    description: "Alerts when surge pricing ends at nearby stations.",
    category: "stations",
    icon: "📉",
  },
  // Account
  {
    id: "streakReminder",
    label: "Streak Reminders",
    description: "Stay on track with your weekly charging goals.",
    category: "account",
    icon: "🔥",
  },
  {
    id: "monthlyReport",
    label: "Monthly Energy Report",
    description: "A detailed summary of your energy usage and CO2 savings.",
    category: "account",
    icon: "📊",
  },
  {
    id: "accountSecurity",
    label: "Account Security",
    description: "Alerts for new logins or profile changes.",
    category: "account",
    icon: "🔐",
  },
];

export async function getNotificationSettings(userId: string) {
  const userDoc = await getDoc(doc(db, "users", userId));
  if (!userDoc.exists()) return {};
  return userDoc.data().settings?.notifications || {};
}

export async function updateNotificationSettings(userId: string, settings: Record<string, boolean>) {
  const userRef = doc(db, "users", userId);
  await updateDoc(userRef, {
    "settings.notifications": settings,
  });
}
