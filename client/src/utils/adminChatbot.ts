export interface AdminData {
  totalStations: number;
  activeStations: number;
  pendingStations: number;
  maintenanceStations: number;
  totalUsers: number;
  blockedUsers: number;
  totalBookings: number;
  completedBookings: number;
  cancelledBookings: number;
  activeBookings: number;
  totalRevenue: number;
  thisMonthRevenue: number;
  lastMonthRevenue: number;
  avgRating: number;
  totalReviews: number;
  topStation: { name: string; revenue: number } | null;
  recentAuditLogs: any[];
}

export const getAdminBotResponse = (
  message: string,
  data: AdminData
): string => {
  const msg = message.toLowerCase().trim();
  
  // Revenue queries:
  if (msg.includes("revenue") || 
      msg.includes("earning") ||
      msg.includes("money") ||
      msg.includes("income")) {
    const growth = data.lastMonthRevenue > 0 
      ? ((data.thisMonthRevenue - data.lastMonthRevenue) / data.lastMonthRevenue * 100).toFixed(1)
      : "0.0";
    return `💰 Platform Revenue:
- Total (all time): ₹${data.totalRevenue.toLocaleString('en-IN')}
- This month: ₹${data.thisMonthRevenue.toLocaleString('en-IN')}
- vs last month: ${Number(growth) > 0 ? '📈' : '📉'} ${growth}%
- Net (after 5% fee): ₹${(data.totalRevenue * 0.95).toLocaleString('en-IN')}`;
  }
  
  // Station queries:
  if (msg.includes("station") && 
      (msg.includes("how many") || 
       msg.includes("count") ||
       msg.includes("total"))) {
    return `🏢 Station Overview:
- Total: ${data.totalStations}
- Active: ${data.activeStations} 🟢
- Pending approval: ${data.pendingStations} 🟡
- Maintenance: ${data.maintenanceStations} 🔴`;
  }
  
  // Pending approvals:
  if (msg.includes("pending") || 
      msg.includes("approval") ||
      msg.includes("approve")) {
    if (data.pendingStations === 0) {
      return `✅ No pending approvals! 
All stations are reviewed.`;
    }
    return `⚠️ You have ${data.pendingStations} 
station(s) waiting for approval.
Go to the Stations tab to review them.`;
  }
  
  // User queries:
  if (msg.includes("user") || 
      msg.includes("driver") ||
      msg.includes("member")) {
    const successRate = data.totalBookings > 0 
      ? (data.completedBookings / data.totalBookings * 100).toFixed(1)
      : "0";
    return `👥 User Overview:
- Total users: ${data.totalUsers}
- Active: ${data.totalUsers - data.blockedUsers}
- Blocked: ${data.blockedUsers}
- System success rate: ${successRate}%`;
  }
  
  // Booking queries:
  if (msg.includes("booking") || 
      msg.includes("session") ||
      msg.includes("reservation")) {
    const successRate = data.totalBookings > 0 
      ? (data.completedBookings / data.totalBookings * 100).toFixed(1)
      : "0";
    return `📅 Booking Overview:
- Total bookings: ${data.totalBookings}
- Completed: ${data.completedBookings}
- Active right now: ${data.activeBookings} 🔵
- Cancelled: ${data.cancelledBookings}
- Success rate: ${successRate}%`;
  }
  
  // Rating/review queries:
  if (msg.includes("rating") || 
      msg.includes("review") || 
      msg.includes("feedback")) {
    return `⭐ Platform Ratings:
- Average rating: ${data.avgRating}/5 ⭐
- Total reviews: ${data.totalReviews}
- Most popular: ${data.topStation?.name || "N/A"}`;
  }
  
  // Best/top station:
  if (msg.includes("best") || 
      msg.includes("top") || 
      msg.includes("highest")) {
    if (!data.topStation) return "No top station data available yet.";
    return `🏆 Top Performing Station:
- Name: ${data.topStation.name}
- Total Revenue: ₹${data.topStation.revenue.toLocaleString('en-IN')}`;
  }
  
  // Recent activity:
  if (msg.includes("recent") || 
      msg.includes("activity") || 
      msg.includes("log") || 
      msg.includes("audit")) {
    const recent = data.recentAuditLogs
      .slice(0, 3)
      .map(l => {
        let timestamp = "Just now";
        if (l.timestamp && typeof l.timestamp.toDate === 'function') {
           timestamp = l.timestamp.toDate().toLocaleDateString('en-IN');
        }
        return `• ${l.action} — ${timestamp}`;
      })
      .join('\n');
    return `📋 Recent Admin Actions:\n${recent || "No recent activity logs found."}`;
  }
  
  // Help:
  if (msg.includes("help") || 
      msg.includes("what can") || 
      (msg.includes("?") && msg.length < 10)) {
    return `🤖 I can help you with:
- 💰 Revenue & earnings
- 🏢 Station counts & status
- 👥 User management stats
- 📅 Booking overview
- ⭐ Ratings & reviews
- 📋 Recent audit activity
- 🏆 Top performing stations

Just ask me anything!`;
  }
  
  // Default:
  return `I didn't quite understand that. 
Try asking about:
revenue, stations, users, bookings, 
ratings, or recent activity.`;
};
