import { db } from "./firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";

export type AuditSeverity = "info" | "warning" | "error" | "critical";

export interface AuditLogData {
  action: string;
  category: "STATION" | "USER" | "OWNER" | "FINANCE" | "DATABASE" | "SYSTEM";
  targetId?: string;
  targetName?: string;
  performedBy: string;
  performedByName?: string;
  severity: AuditSeverity;
  metadata?: Record<string, any>;
}

/**
 * Logs an administrative event to Firestore for compliance and tracking.
 */
export async function logAuditEvent(data: AuditLogData) {
  try {
    await addDoc(collection(db, "audit_logs"), {
      ...data,
      timestamp: serverTimestamp(),
    });
    console.log(`[AuditLog] ${data.action} logged for ${data.targetId}`);
  } catch (error) {
    console.error("[AuditLog Error]", error);
    // Fallback to local storage if firestore is down (optional)
  }
}

/**
 * Severity mapping for consistent visual feedback in the UI.
 */
export const severityColors: Record<AuditSeverity, string> = {
  info: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  warning: "bg-orange-500/10 text-orange-600 border-orange-500/20",
  error: "bg-red-500/10 text-red-600 border-red-500/20",
  critical: "bg-destructive text-destructive-foreground animate-pulse",
};
