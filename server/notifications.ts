import twilio from "twilio";
import sgMail from "@sendgrid/mail";
import { db } from "./firebase-admin.js";
import { Timestamp } from "firebase-admin/firestore";

// Simple log function to avoid importing vite.ts which pulls in vite.config.ts (crashing production)
function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
  console.log(`${formattedTime} [${source}] ${message}`);
}

// Initialize Twilio
const twilioClient = process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN
  ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
  : null;

// Initialize SendGrid
if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

// In-memory batching for rapid alerts
const batchQueue: Record<string, { timer: NodeJS.Timeout | null, count: number, lastDetails: string }> = {};

export const notifications = {
  /**
   * Check rate limits in Firestore
   */
  async checkRateLimit(type: "sms" | "email"): Promise<boolean> {
    if (!db) return true;
    const limitDoc = db.collection("system_stats").doc("notification_limits");
    const today = new Date().toISOString().split("T")[0];
    const hour = new Date().getHours();

    try {
      const doc = await limitDoc.get();
      const data = doc.data() || {};
      
      if (type === "sms") {
        const hourlyKey = `sms_hour_${hour}`;
        const hourlyCount = data[hourlyKey] || 0;
        if (hourlyCount >= 10) return false;
        await limitDoc.set({ [hourlyKey]: hourlyCount + 1 }, { merge: true });
      } else {
        const dailyKey = `email_day_${today}`;
        const dailyCount = data[dailyKey] || 0;
        if (dailyCount >= 50) return false;
        await limitDoc.set({ [dailyKey]: dailyCount + 1 }, { merge: true });
      }
      return true;
    } catch (e) {
      log(`Rate limit check failed: ${e}`);
      return true; // Fail open for safety
    }
  },

  /**
   * Log notification to history
   */
  async logHistory(type: string, channel: string, recipient: string, subject: string, message: string, status: string, error?: string) {
    if (!db) return;
    try {
      await db.collection("notification_history").add({
        type,
        channel,
        recipient,
        subject,
        message: message.substring(0, 500), // Truncate long messages
        sentAt: Timestamp.now(),
        status,
        error: error || null
      });
    } catch (e) {
      log(`Failed to log notification history: ${e}`);
    }
  },

  /**
   * Send an SMS alert using Twilio
   */
  async sendSMS(to: string, body: string, type: string = "ALERT") {
    if (!twilioClient) {
      log("Twilio not configured. Skipping SMS.");
      return false;
    }

    const allowed = await this.checkRateLimit("sms");
    if (!allowed) {
      log("SMS rate limit exceeded.");
      await this.logHistory(type, "sms", to, "N/A", body, "failed", "Rate limit exceeded");
      return false;
    }

    try {
      const message = await twilioClient.messages.create({
        body,
        from: process.env.TWILIO_PHONE_NUMBER,
        to
      });
      log(`SMS sent: ${message.sid}`);
      await this.logHistory(type, "sms", to, "N/A", body, "success");
      return true;
    } catch (error: any) {
      log(`Failed to send SMS: ${error.message}`);
      await this.logHistory(type, "sms", to, "N/A", body, "failed", error.message);
      return false;
    }
  },

  /**
   * Send an email alert using SendGrid
   */
  async sendEmail(to: string, subject: string, text: string, html?: string, type: string = "ALERT") {
    if (!process.env.SENDGRID_API_KEY) {
      log("SendGrid not configured. Skipping email.");
      return false;
    }

    const allowed = await this.checkRateLimit("email");
    if (!allowed) {
      log("Email rate limit exceeded.");
      await this.logHistory(type, "email", to, subject, text, "failed", "Rate limit exceeded");
      return false;
    }

    const msg = {
      to,
      from: process.env.SENDGRID_FROM_EMAIL || "alerts@evplugfinder.com",
      subject,
      text,
      html: html || text,
    };

    try {
      await sgMail.send(msg);
      log(`Email sent to ${to}`);
      await this.logHistory(type, "email", to, subject, text, "success");
      return true;
    } catch (error: any) {
      log(`Failed to send email: ${error.message}`);
      await this.logHistory(type, "email", to, subject, text, "failed", error.message);
      return false;
    }
  },

  /**
   * High-level helper to notify admins of critical events with preference checking
   */
  async notifyCriticalEvent(event: string, details: string, severity: string = "CRITICAL") {
    log(`Processing critical event: ${event} [${severity}]`);
    
    // Load preferences
    let prefs: any = null;
    if (db) {
      const prefSnap = await db.collection("admin_notification_prefs").limit(1).get();
      if (!prefSnap.empty) prefs = prefSnap.docs[0].data();
    }

    // Default to enabled if no prefs found (for safety during initial setup)
    const alertPref = prefs?.alerts?.[event] || { enabled: true, channels: ["email", "sms"] };
    if (!alertPref.enabled) {
      log(`Notification for ${event} is disabled by preferences.`);
      return [];
    }

    // Check quiet hours
    if (prefs?.quietHours) {
      const now = new Date();
      const current = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      if (current >= prefs.quietHours.start || current <= prefs.quietHours.end) {
        if (alertPref.channels.includes("sms")) {
          log("Quiet hours active. Silencing SMS.");
          alertPref.channels = alertPref.channels.filter((c: string) => c !== "sms");
        }
      }
    }

    const adminEmail = process.env.ADMIN_ALERT_EMAIL || "admin@evplugfinder.com";
    const adminPhone = process.env.ADMIN_ALERT_PHONE || "+1234567890";

    const message = `[EVPlugFinder ${severity}] ${event}: ${details}`;
    const promises = [];

    if (alertPref.channels.includes("email")) {
      promises.push(this.sendEmail(
        adminEmail, 
        `EVPlugFinder Alert: ${event} [${severity}]`, 
        message,
        `<h3>EVPlugFinder Administrative Alert</h3>
         <p><strong>Event:</strong> ${event}</p>
         <p><strong>Severity:</strong> ${severity}</p>
         <p><strong>Details:</strong> ${details}</p>
         <p><strong>Timestamp:</strong> ${new Date().toLocaleString()}</p>
         <hr/>
         <p><a href="https://evplugfinder.com/admin">Access Admin Panel</a></p>`,
        event
      ));
    }

    if (alertPref.channels.includes("sms")) {
      // Batch SMS if they happen too fast (e.g. fraud patterns)
      if (batchQueue[event]) {
        batchQueue[event].count++;
        batchQueue[event].lastDetails = details;
        log(`Batching ${event} alert (Count: ${batchQueue[event].count})`);
      } else {
        batchQueue[event] = { 
          timer: setTimeout(() => {
            const b = batchQueue[event];
            const batchMsg = b.count > 1 
              ? `[EVPlugFinder] ${event} (${b.count} events). Last: ${b.lastDetails}`
              : message;
            this.sendSMS(adminPhone, batchMsg, event);
            delete batchQueue[event];
          }, 5000), // 5 second window for batching
          count: 1,
          lastDetails: details
        };
      }
    }

    return Promise.all(promises);
  }
};
