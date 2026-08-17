import { FraudAlert, Booking, Station, UserProfile } from "@shared/schema";

interface AuditLog {
  id: string;
  action: string;
  performedBy: string;
  performedByEmail?: string;
  severity: string;
  metadata: any;
  timestamp: any;
}

export function detectFraudPatterns(
  users: UserProfile[],
  bookings: Booking[],
  stations: Station[],
  auditLogs: AuditLog[]
): Omit<FraudAlert, "id">[] {
  const alerts: Omit<FraudAlert, "id">[] = [];
  const now = Date.now();
  const oneDayAgo = now - 24 * 60 * 60 * 1000;
  const oneHourAgo = now - 60 * 60 * 1000;
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

  // 1. ACCOUNT_TAKEOVER
  // Logic: Login from new IP + immediate booking (< 30 min)
  users.forEach(user => {
    const userLogs = auditLogs.filter(log => 
      log.performedBy === user.uid && 
      (log.action === "LOGIN" || log.action === "ADMIN_SESSION_STARTED")
    ).sort((a, b) => (b.timestamp?.toMillis?.() || 0) - (a.timestamp?.toMillis?.() || 0));

    if (userLogs.length >= 2) {
      const latestLogin = userLogs[0];
      const previousLogin = userLogs[1];
      const latestIP = latestLogin.metadata?.ip || latestLogin.metadata?.userAgent;
      const previousIP = previousLogin.metadata?.ip || previousLogin.metadata?.userAgent;

      if (latestIP !== previousIP) {
        const immediateBooking = bookings.find(b => 
          b.userId === user.uid && 
          b.createdAt > (latestLogin.timestamp?.toMillis?.() || 0) &&
          b.createdAt < (latestLogin.timestamp?.toMillis?.() || 0) + 30 * 60 * 1000
        );

        if (immediateBooking) {
          alerts.push({
            pattern: "ACCOUNT_TAKEOVER",
            userId: user.uid,
            severity: "CRITICAL",
            details: `Immediate booking after login from new IP/Device: ${latestIP}`,
            status: "active",
            detectedAt: now,
            metadata: { bookingId: immediateBooking.id, ip: latestIP }
          });
        }
      }
    }
  });

  // 2. PAYMENT_CARD_TESTING
  // Logic: 3+ failed payments (< ₹80) from same user in 1 hour
  const failedSmallPayments = bookings.filter(b => 
    b.paymentStatus === "failed" && 
    b.totalPrice > 0 && b.totalPrice < 80 &&
    b.createdAt > oneHourAgo
  );

  const failedByUsers: Record<string, number> = {};
  failedSmallPayments.forEach(b => {
    failedByUsers[b.userId] = (failedByUsers[b.userId] || 0) + 1;
  });

  Object.entries(failedByUsers).forEach(([userId, count]) => {
    if (count >= 3) {
      alerts.push({
        pattern: "PAYMENT_CARD_TESTING",
        userId,
        severity: "HIGH",
        details: `${count} failed small-value payments in the last hour`,
        status: "active",
        detectedAt: now,
        metadata: { count }
      });
    }
  });

  // 3. COORDINATED_ABUSE
  // Logic: 3+ users with same IP booking at same station
  // We assume IP is in metadata of booking or we use audit logs of booking actions
  const bookingsByIP: Record<string, Set<string>> = {}; // "ip_stationId" -> Set of userIds
  bookings.filter(b => b.createdAt > oneDayAgo).forEach(b => {
    const ip = (b as any).metadata?.ip || "unknown";
    if (ip === "unknown") return;
    const key = `${ip}_${b.stationId}`;
    if (!bookingsByIP[key]) bookingsByIP[key] = new Set();
    bookingsByIP[key].add(b.userId);
  });

  Object.entries(bookingsByIP).forEach(([key, userIds]) => {
    if (userIds.size >= 3) {
      const [ip, stationId] = key.split("_");
      alerts.push({
        pattern: "COORDINATED_ABUSE",
        stationId,
        severity: "HIGH",
        details: `${userIds.size} distinct users booking from same IP: ${ip}`,
        status: "active",
        detectedAt: now,
        metadata: { ip, userCount: userIds.size }
      });
    }
  });

  // 4. CHARGEBACK_PATTERN
  // Logic: User with > 3 chargebacks in 30 days
  const chargebacksByUsers: Record<string, number> = {};
  bookings.filter(b => 
    b.paymentStatus === "chargeback" && 
    b.createdAt > thirtyDaysAgo
  ).forEach(b => {
    chargebacksByUsers[b.userId] = (chargebacksByUsers[b.userId] || 0) + 1;
  });

  Object.entries(chargebacksByUsers).forEach(([userId, count]) => {
    if (count > 3) {
      alerts.push({
        pattern: "CHARGEBACK_PATTERN",
        userId,
        severity: "CRITICAL",
        details: `${count} chargebacks initiated in the last 30 days`,
        status: "active",
        detectedAt: now,
        metadata: { count }
      });
    }
  });

  // 5. VELOCITY_ABUSE
  // Logic: > 10 accounts created in 24h from similar email pattern
  // Similar pattern: same first 5 chars or shared domain for common prefixes
  const newUsers = users.filter(u => u.createdAt > oneDayAgo);
  if (newUsers.length >= 10) {
    const emailPrefixes: Record<string, number> = {};
    newUsers.forEach(u => {
      const prefix = u.email.split("@")[0].substring(0, 5);
      emailPrefixes[prefix] = (emailPrefixes[prefix] || 0) + 1;
    });

    Object.entries(emailPrefixes).forEach(([prefix, count]) => {
      if (count >= 5) {
        alerts.push({
          pattern: "VELOCITY_ABUSE",
          severity: "HIGH",
          details: `${count} new accounts created with similar email prefix: ${prefix}`,
          status: "active",
          detectedAt: now,
          metadata: { prefix, count }
        });
      }
    });
  }

  // 6. SESSION_HIJACK
  // Logic: Active sessions for same user from 2 different IPs within 5 minutes
  const recentLogs = auditLogs.filter(log => log.timestamp?.toMillis?.() > (now - 5 * 60 * 1000));
  const userIPs: Record<string, Set<string>> = {};
  recentLogs.forEach(log => {
    const ip = log.metadata?.ip;
    if (ip && log.performedBy) {
      if (!userIPs[log.performedBy]) userIPs[log.performedBy] = new Set();
      userIPs[log.performedBy].add(ip);
    }
  });

  Object.entries(userIPs).forEach(([userId, ips]) => {
    if (ips.size >= 2) {
      alerts.push({
        pattern: "SESSION_HIJACK",
        userId,
        severity: "CRITICAL",
        details: `Simultaneous activity from multiple IPs: ${Array.from(ips).join(", ")}`,
        status: "active",
        detectedAt: now,
        metadata: { ips: Array.from(ips) }
      });
    }
  });

  // 7. STATION_GAMING
  // Logic: Same user booking + cancelling same connector > 5 times in 1 day
  const cancellations = bookings.filter(b => 
    b.status === "cancelled" && 
    b.createdAt > oneDayAgo
  );

  const gamingKey: Record<string, number> = {}; // "userId_connectorId"
  cancellations.forEach(b => {
    const key = `${b.userId}_${b.connectorId}`;
    gamingKey[key] = (gamingKey[key] || 0) + 1;
  });

  Object.entries(gamingKey).forEach(([key, count]) => {
    if (count > 5) {
      const [userId] = key.split("_");
      alerts.push({
        pattern: "STATION_GAMING",
        userId,
        severity: "MEDIUM",
        details: `User cancelled the same connector ${count} times in 24 hours`,
        status: "active",
        detectedAt: now,
        metadata: { count }
      });
    }
  });

  // 8. LOYALTY_POINT_FARMING
  // Logic: User earns > 500 points in 24h without corresponding revenue (₹4000+)
  // We'll estimate points from current profile points if we don't have point logs
  // For now, let's assume we have a way to track points earned in 24h
  users.forEach(user => {
    const pointsEarned = (user as any).pointsEarned24h || 0; // Simulated for now or check audit logs
    const revenueGenerated = bookings
      .filter(b => b.userId === user.uid && b.createdAt > oneDayAgo && b.paymentStatus === "paid")
      .reduce((sum, b) => sum + b.totalPrice, 0);

    if (pointsEarned > 500 && revenueGenerated < 4000) {
      alerts.push({
        pattern: "LOYALTY_POINT_FARMING",
        userId: user.uid,
        severity: "HIGH",
        details: `User earned ${pointsEarned} points with only ₹${revenueGenerated.toFixed(2)} revenue`,
        status: "active",
        detectedAt: now,
        metadata: { points: pointsEarned, revenue: revenueGenerated }
      });
    }
  });

  return alerts;
}
