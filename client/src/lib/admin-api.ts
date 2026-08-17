/**
 * Admin API Helper - Calls backend endpoints for admin operations
 */

const API_BASE = "/api";

// Analytics endpoints
export const adminAPI = {
  // Get complete analytics dashboard data
  async getDashboard() {
    try {
      const response = await fetch(`${API_BASE}/admin/analytics/dashboard`);
      return await response.json();
    } catch (error) {
      console.error("Error fetching dashboard:", error);
      throw error;
    }
  },

  // Get revenue data by period
  async getRevenue(period = "month") {
    try {
      const response = await fetch(
        `${API_BASE}/admin/analytics/revenue?period=${period}`
      );
      return await response.json();
    } catch (error) {
      console.error("Error fetching revenue:", error);
      throw error;
    }
  },

  // Get booking trends
  async getTrends(days = 30) {
    try {
      const response = await fetch(
        `${API_BASE}/admin/analytics/trends?days=${days}`
      );
      return await response.json();
    } catch (error) {
      console.error("Error fetching trends:", error);
      throw error;
    }
  },

  // Get user activity logs
  async getUserActivity(role = "ev_user") {
    try {
      const response = await fetch(
        `${API_BASE}/admin/analytics/users?role=${role}`
      );
      return await response.json();
    } catch (error) {
      console.error("Error fetching user activity:", error);
      throw error;
    }
  },

  // Get station metrics
  async getStationMetrics() {
    try {
      const response = await fetch(`${API_BASE}/admin/analytics/stations`);
      return await response.json();
    } catch (error) {
      console.error("Error fetching station metrics:", error);
      throw error;
    }
  },

  // Get payment metrics
  async getPaymentMetrics() {
    try {
      const response = await fetch(`${API_BASE}/admin/analytics/payments`);
      return await response.json();
    } catch (error) {
      console.error("Error fetching payment metrics:", error);
      throw error;
    }
  },
};

// Admin operations
export const adminOperations = {
  // Block or unblock user
  async blockUser(userId: string, shouldBlock: boolean) {
    try {
      const response = await fetch(`${API_BASE}/admin/operations/block-user`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, shouldBlock }),
      });
      return await response.json();
    } catch (error) {
      console.error("Error blocking user:", error);
      throw error;
    }
  },

  // Approve station owner
  async approveOwner(ownerId: string) {
    try {
      const response = await fetch(
        `${API_BASE}/admin/operations/approve-owner`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ownerId }),
        }
      );
      return await response.json();
    } catch (error) {
      console.error("Error approving owner:", error);
      throw error;
    }
  },

  // Approve pending station
  async approveStation(stationId: string) {
    try {
      const response = await fetch(
        `${API_BASE}/admin/operations/approve-station`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stationId }),
        }
      );
      return await response.json();
    } catch (error) {
      console.error("Error approving station:", error);
      throw error;
    }
  },

  // Delete station
  async deleteStation(stationId: string) {
    try {
      const response = await fetch(
        `${API_BASE}/admin/operations/delete-station/${stationId}`,
        { method: "DELETE" }
      );
      return await response.json();
    } catch (error) {
      console.error("Error deleting station:", error);
      throw error;
    }
  },
};
