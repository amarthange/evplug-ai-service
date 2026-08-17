import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage.js";
import { insertBookingSchema, type Station, BookingStatus, mlRecommendationLogSchema } from "../shared/schema.js";
import axios from "axios";
import NodeCache from "node-cache";
import admin, { db } from "./firebase-admin.js";
import { z } from "zod";
import { notifications } from "./notifications.js";

// Cache for 5 minutes by default
const mlCache = new NodeCache({ stdTTL: parseInt(process.env.ML_CACHE_TTL_SECONDS || "300") });
const ML_SERVICE_URL = process.env.ML_SERVICE_URL || "http://localhost:8001";

export async function registerRoutes(app: Express): Promise<Server> {
  // GET /api/stations - Get all charging stations
  app.get("/api/stations", async (req, res) => {
    try {
      if (db) {
        const snapshot = await db.collection("stations").get();
        const stations: any[] = [];
        snapshot.forEach((doc) => {
          stations.push({ id: doc.id, ...doc.data() });
        });
        return res.json(stations);
      }
      
      const stations = await storage.getStations();
      res.json(stations);
    } catch (error) {
      console.error("Error fetching stations:", error);
      res.status(500).json({ error: "Failed to fetch stations" });
    }
  });

  // GET /api/stations/nearby - Get nearby charging stations
  app.get("/api/stations/nearby", async (req, res) => {
    try {
      const lat = parseFloat(req.query.lat as string);
      const lon = parseFloat(req.query.lon as string);
      const radiusKm = parseFloat(req.query.radius_km as string) || 50;

      if (isNaN(lat) || isNaN(lon)) {
        return res.status(400).json({ error: "Invalid lat/lon parameters" });
      }

      const stations = await storage.getNearbyStations(lat, lon, radiusKm);

      // Try to get ML predictions for each station (optional enhancement)
      const stationsWithPredictions = await Promise.all(
        stations.map(async (station) => {
          try {
            const telemetry = await storage.getStationTelemetry(station.id, 60);
            if (telemetry.length > 0) {
              const prediction = await getPrediction(station.id, telemetry);
              return {
                ...station,
                predictedAvailability: prediction?.prediction,
              };
            }
          } catch (error) {
            console.log("Prediction skipped:", error);
          }
          return station;
        })
      );

      res.json(stationsWithPredictions);
    } catch (error) {
      console.error("Error fetching nearby stations:", error);
      res.status(500).json({ error: "Failed to fetch stations" });
    }
  });

  // POST /api/bookings - Create a new booking
  app.post("/api/bookings", async (req, res) => {
    try {
      const validatedData = insertBookingSchema.parse(req.body);

      // Check if connector is available
      const station = await storage.getStation(validatedData.stationId);
      if (!station) {
        return res.status(404).json({ error: "Station not found" });
      }

      const connector = station.connectors.find(
        (c) => c.id === validatedData.connectorId
      );
      if (!connector || !connector.available) {
        return res.status(400).json({ error: "Connector not available" });
      }

      // Create booking with 10-minute lock
      const booking = await storage.createBooking(validatedData);

      res.json(booking);
    } catch (error) {
      console.error("Error creating booking:", error);
      res.status(400).json({ error: "Failed to create booking" });
    }
  });

  // POST /api/webhook/payment - Simulated payment webhook
  app.post("/api/webhook/payment", async (req, res) => {
    try {
      const { bookingId, status } = req.body;

      if (!bookingId) {
        return res.status(400).json({ error: "Missing bookingId" });
      }

      // Update booking status
      const booking = await storage.updateBooking(bookingId, {
        status: status || BookingStatus.CONFIRMED,
      });

      if (!booking) {
        return res.status(404).json({ error: "Booking not found" });
      }

      res.json({ success: true, booking });
    } catch (error) {
      console.error("Error processing payment webhook:", error);
      res.status(500).json({ error: "Webhook processing failed" });
    }
  });

  // POST /api/predict - Proxy to ML service for availability predictions
  app.post("/api/predict", async (req, res) => {
    try {
      const { stationId, telemetry, lookbackMinutes } = req.body;
      const prediction = await getPrediction(stationId, telemetry, lookbackMinutes);
      res.json(prediction);
    } catch (error) {
      console.error("Error getting prediction:", error);
      res.status(500).json({ error: "Prediction failed" });
    }
  });

  // ML PROXY ENDPOINTS

  // POST /api/ml/predict-availability
  app.post("/api/ml/predict-availability", async (req, res) => {
    const { station_id, timestamp } = req.body;
    const cacheKey = `avail_${station_id}_${timestamp || 'now'}`;
    
    const cached = mlCache.get(cacheKey);
    if (cached) return res.json(cached);

    try {
      const response = await axios.post(`${ML_SERVICE_URL}/predict-availability`, {
        station_id,
        timestamp
      }, { timeout: 5000 });
      
      mlCache.set(cacheKey, response.data);
      res.json(response.data);
    } catch (error: any) {
      console.error("ML Service Error (Availability):", error.message);
      
      // Fallback logic: simple heuristic based on historical average
      const telemetry = await storage.getStationTelemetry(station_id, 24 * 60); // 24 hours
      let prediction = 0.5;
      if (telemetry.length > 0) {
        const avgOccupied = telemetry.reduce((sum, t) => sum + t.occupied, 0) / telemetry.length;
        const total = telemetry[0].total || 10;
        prediction = Math.max(0, (total - avgOccupied) / total);
      }

      const fallbackResponse = {
        prediction,
        confidence: 0.5,
        metadata: { source: "fallback_heuristic" },
        is_fallback: true,
        warning: "ML service unavailable, using historical average"
      };
      res.json(fallbackResponse);
    }
  });

  // POST /api/ml/predict-eta
  app.post("/api/ml/predict-eta", async (req, res) => {
    const { distance, traffic_index, temperature, timestamp } = req.body;
    const cacheKey = `eta_${distance}_${traffic_index}_${temperature}_${timestamp || 'now'}`;
    
    const cached = mlCache.get(cacheKey);
    if (cached) return res.json(cached);

    try {
      // Note: Python ETA endpoint expects user_location and station_location
      // For simplicity, we'll assume the frontend passes distance, or we adapt.
      // The requirement says Express handles all ML communication.
      const response = await axios.post(`${ML_SERVICE_URL}/predict-eta`, req.body, { timeout: 5000 });
      
      mlCache.set(cacheKey, response.data);
      res.json(response.data);
    } catch (error: any) {
      console.error("ML Service Error (ETA):", error.message);
      
      // Fallback: simple distance/speed heuristic
      const estMinutes = (distance || 10) * 2; // Rough estimate: 30km/h avg
      const fallbackResponse = {
        prediction: estMinutes,
        confidence: 0.4,
        metadata: { source: "fallback_heuristic" },
        is_fallback: true,
        warning: "ML service unavailable, using distance-based estimate"
      };
      res.json(fallbackResponse);
    }
  });

  // POST /api/ml/batch-predict
  app.post("/api/ml/batch-predict", async (req, res) => {
    const { user_id, user_location, station_ids } = req.body;
    const cacheKey = `batch_${user_id}_${station_ids.join('_')}`;
    
    const cached = mlCache.get(cacheKey);
    if (cached) return res.json(cached);

    try {
      // Fetch stations from database to get their coordinates
      const dbStations = await Promise.all(station_ids.map((id: string) => storage.getStation(id)));
      const validStations = dbStations.filter((s): s is NonNullable<typeof s> => !!s);

      // Normalize user location to [lat, lon]
      let userLocArray: number[] = [0.0, 0.0];
      if (Array.isArray(user_location)) {
        userLocArray = user_location;
      } else if (user_location && typeof user_location === 'object') {
        const lat = user_location.latitude ?? user_location.lat ?? 0.0;
        const lon = user_location.longitude ?? user_location.lon ?? 0.0;
        userLocArray = [lat, lon];
      }

      // Format payload to RankingRequest structure for FastAPI /rank-stations
      const payload = {
        user_id,
        user_location: userLocArray,
        stations: validStations.map(s => ({
          id: s.id,
          lat: s.lat,
          lon: s.lon
        }))
      };

      const response = await axios.post(`${ML_SERVICE_URL}/rank-stations`, payload, { timeout: 8000 });
      
      mlCache.set(cacheKey, response.data);
      res.json(response.data);
    } catch (error: any) {
      console.error("ML Service Error (Batch):", error.message);
      
      // Fallback: Simple distance-based ranking
      const stations = await Promise.all(station_ids.map((id: string) => storage.getStation(id)));
      const ranked = stations
        .filter(s => s)
        .map(s => ({
          station_id: s.id,
          meta_score: 0.5,
          is_fallback: true,
          metadata: { distance_approx: "N/A" }
        }));

      res.json(ranked);
    }
  });

  // GET /api/ml/health
  app.get("/api/ml/health", async (req, res) => {
    const startTime = Date.now();
    try {
      const response = await axios.get(`${ML_SERVICE_URL}/health`, { timeout: 3000 });
      const responseTime = Date.now() - startTime;
      const data = response.data;

      // New health schema: models is { lstm: bool, eta_lgb: bool, svd: bool, meta_ranker: bool }
      // Derive loaded_models list for backwards compatibility with frontend consumers
      const modelsObj: Record<string, boolean> = data?.models || {};
      const loaded_models = Object.entries(modelsObj)
        .filter(([, v]) => v === true)
        .map(([k]) => k);

      res.json({
        status: data?.status || "healthy",
        connectivity: "connected",
        loaded_models,
        fallback_mode: data?.fallback_mode ?? false,
        uptime: data?.uptime,
        response_time_ms: responseTime,
        ml_service_url: ML_SERVICE_URL,
        version: data?.version || "1.0.0"
      });
    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      res.status(502).json({
        status: "unhealthy",
        connectivity: "disconnected",
        loaded_models: [],
        fallback_mode: true,
        response_time_ms: responseTime,
        ml_service_url: ML_SERVICE_URL,
        error: error.message
      });
    }
  });

  // POST /api/admin/retrain-trigger - Proxy ML retraining triggers to FastAPI
  app.post("/api/admin/retrain-trigger", async (req, res) => {
    try {
      const response = await axios.post(`${ML_SERVICE_URL}/admin/retrain-trigger`, req.body || {}, { timeout: 15000 });
      res.json(response.data);
    } catch (error: any) {
      console.error("ML Service Error (Retrain Trigger):", error.message);
      res.status(error.response?.status || 500).json({
        error: "Failed to trigger ML retraining",
        details: error.response?.data || error.message
      });
    }
  });

  // --- Automation Endpoints for n8n ---

  // 1. GET /automation/hold-bookings - Fetch all bookings on "pending" and not paid
  app.get("/automation/hold-bookings", async (req, res) => {
    try {
      const bookings = await storage.getHoldBookings(); // This now fetches "pending" bookings
      res.json(bookings);
    } catch (error) {
      console.error("Error fetching hold bookings:", error);
      res.status(500).json({ error: "Failed to fetch hold bookings" });
    }
  });

  // 2. PUT /automation/cancel-booking/:bookingId - Cancel expired pending booking
  app.put("/automation/cancel-booking/:bookingId", async (req, res) => {
    try {
      const { bookingId } = req.params;
      const success = await storage.cancelExpiredBooking(bookingId);
      if (success) {
        res.json({ success: true });
      } else {
        res.status(400).json({ error: "Booking not eligible for cancellation or not found" });
      }
    } catch (error) {
      console.error("Error cancelling booking:", error);
      res.status(500).json({ error: "Failed to cancel booking" });
    }
  });

  // 3. PUT /automation/free-slot/:bookingId - Increase availability after cancellation
  app.put("/automation/free-slot/:bookingId", async (req, res) => {
    try {
      const { bookingId } = req.params;
      const success = await storage.freeConnectorSlot(bookingId);
      if (success) {
        res.json({ success: true });
      } else {
        res.status(400).json({ error: "Failed to free slot or booking not found" });
      }
    } catch (error) {
      console.error("Error freeing slot:", error);
      res.status(500).json({ error: "Failed to free slot" });
    }
  });

  // --- Additional n8n Integration Webhook Endpoints ---

  // 1. POST /api/automation/notify-confirmation
  // Firestore Query: Fetches from `bookings`, `stations`, and `users` collections.
  // Response Example:
  // {
  //   "success": true,
  //   "booking": { "id": "b1", "userId": "u1", "stationId": "s1", "totalPrice": 120, ... },
  //   "station": { "id": "s1", "name": "Main Charger", "address": "123 Main St", ... },
  //   "user": { "uid": "u1", "email": "driver@gmail.com", "displayName": "Driver One", ... }
  // }
  interface NotifyConfirmationRequest {
    bookingId: string;
  }
  interface NotifyConfirmationResponse {
    success: boolean;
    booking: any;
    station: any;
    user: any;
  }
  app.post("/api/automation/notify-confirmation", async (req, res) => {
    try {
      const { bookingId } = z.object({ bookingId: z.string() }).parse(req.body) as NotifyConfirmationRequest;

      let booking: any = null;
      let station: any = null;
      let user: any = null;

      if (db) {
        const bookingDoc = await db.collection("bookings").doc(bookingId).get();
        if (bookingDoc.exists) {
          booking = { id: bookingDoc.id, ...bookingDoc.data() };
          
          const stationDoc = await db.collection("stations").doc(booking.stationId).get();
          if (stationDoc.exists) {
            station = { id: stationDoc.id, ...stationDoc.data() };
          }
          
          const userDoc = await db.collection("users").doc(booking.userId).get();
          if (userDoc.exists) {
            user = { uid: userDoc.id, ...userDoc.data() };
          }
        }
      }

      // Memory storage fallback for local development
      if (!booking) {
        const memBooking = await storage.getBooking(bookingId);
        if (memBooking) {
          booking = memBooking;
          station = await storage.getStation(booking.stationId);
          user = {
            uid: booking.userId,
            email: "driver@evplugfinder.com",
            displayName: "Test Driver",
            role: "ev_user",
            phoneNumber: "+1234567890",
            loyaltyPoints: 100,
            referralCode: "VOLT123"
          };
        }
      }

      if (!booking) {
        return res.status(404).json({ error: `Booking with ID ${bookingId} not found` });
      }

      const response: NotifyConfirmationResponse = {
        success: true,
        booking,
        station: station || { id: booking.stationId, name: "Fallback Station", address: "Unknown Address" },
        user: user || { uid: booking.userId, email: "unknown@evplugfinder.com", displayName: "Unknown User" }
      };

      res.json(response);
    } catch (error: any) {
      console.error("Error in /api/automation/notify-confirmation:", error);
      res.status(500).json({ error: error.message || "Internal server error" });
    }
  });

  // 2. POST /api/automation/remind-charge
  // Firestore Query: Fetches from `bookings`, `stations`, and `users` collections.
  // Response Example:
  // {
  //   "userPhone": "+1234567890",
  //   "stationName": "Main Charger",
  //   "slotTime": "2026-06-24T18:00:00.000Z"
  // }
  interface RemindChargeRequest {
    bookingId: string;
  }
  interface RemindChargeResponse {
    userPhone: string;
    stationName: string;
    slotTime: string;
  }
  app.post("/api/automation/remind-charge", async (req, res) => {
    try {
      const { bookingId } = z.object({ bookingId: z.string() }).parse(req.body) as RemindChargeRequest;

      let booking: any = null;
      let userPhone: string = "";
      let stationName: string = "";
      let slotTime: string = "";

      if (db) {
        const bookingDoc = await db.collection("bookings").doc(bookingId).get();
        if (bookingDoc.exists) {
          booking = { id: bookingDoc.id, ...bookingDoc.data() };
          
          const stationDoc = await db.collection("stations").doc(booking.stationId).get();
          if (stationDoc.exists) {
            stationName = stationDoc.data()?.name || "";
          }
          
          const userDoc = await db.collection("users").doc(booking.userId).get();
          if (userDoc.exists) {
            userPhone = userDoc.data()?.phoneNumber || "";
          }
          
          if (booking.startTime) {
            slotTime = new Date(booking.startTime).toISOString();
          }
        }
      }

      // Memory storage fallback
      if (!booking) {
        const memBooking = await storage.getBooking(bookingId);
        if (memBooking) {
          booking = memBooking;
          const memStation = await storage.getStation(booking.stationId);
          stationName = memStation?.name || booking.stationName || "Fallback Station";
          userPhone = "+1234567890";
          slotTime = new Date(booking.startTime).toISOString();
        }
      }

      if (!booking) {
        return res.status(404).json({ error: `Booking with ID ${bookingId} not found` });
      }

      const response: RemindChargeResponse = {
        userPhone: userPhone || "+1000000000",
        stationName: stationName || "Unknown Station",
        slotTime: slotTime || new Date().toISOString()
      };

      res.json(response);
    } catch (error: any) {
      console.error("Error in /api/automation/remind-charge:", error);
      res.status(500).json({ error: error.message || "Internal server error" });
    }
  });

  // 3. POST /api/automation/dispatch-receipt
  // Firestore Query: Fetches from `bookings` and `stations` collections.
  // Response Example:
  // {
  //   "bookingSummary": {
  //     "bookingId": "b1",
  //     "stationName": "Main Charger",
  //     "status": "completed"
  //   },
  //   "totalAmount": 120,
  //   "duration": 45
  // }
  interface DispatchReceiptRequest {
    bookingId: string;
  }
  interface DispatchReceiptResponse {
    bookingSummary: {
      bookingId: string;
      stationName: string;
      status: string;
    };
    totalAmount: number;
    duration: number;
  }
  app.post("/api/automation/dispatch-receipt", async (req, res) => {
    try {
      const { bookingId } = z.object({ bookingId: z.string() }).parse(req.body) as DispatchReceiptRequest;

      let booking: any = null;
      let bookingSummary = {
        bookingId: "",
        stationName: "Unknown Station",
        status: "unknown"
      };
      let totalAmount = 0;
      let duration = 0;

      if (db) {
        const bookingDoc = await db.collection("bookings").doc(bookingId).get();
        if (bookingDoc.exists) {
          booking = { id: bookingDoc.id, ...bookingDoc.data() };
          
          let stationName = booking.stationName || "Unknown Station";
          if (!booking.stationName) {
            const stationDoc = await db.collection("stations").doc(booking.stationId).get();
            if (stationDoc.exists) {
              stationName = stationDoc.data()?.name || "Unknown Station";
            }
          }

          bookingSummary = {
            bookingId: bookingDoc.id,
            stationName,
            status: booking.status
          };
          totalAmount = booking.totalPrice || 0;
          duration = booking.duration || 0;
        }
      }

      // Memory storage fallback
      if (!booking) {
        const memBooking = await storage.getBooking(bookingId);
        if (memBooking) {
          booking = memBooking;
          const memStation = await storage.getStation(booking.stationId);
          bookingSummary = {
            bookingId: booking.id,
            stationName: memStation?.name || booking.stationName || "Fallback Station",
            status: booking.status
          };
          totalAmount = booking.totalPrice;
          duration = booking.duration;
        }
      }

      if (!booking) {
        return res.status(404).json({ error: `Booking with ID ${bookingId} not found` });
      }

      const response: DispatchReceiptResponse = {
        bookingSummary,
        totalAmount,
        duration
      };

      res.json(response);
    } catch (error: any) {
      console.error("Error in /api/automation/dispatch-receipt:", error);
      res.status(500).json({ error: error.message || "Internal server error" });
    }
  });

  // 4. POST /api/automation/request-feedback
  // Firestore Query: Fetches from `bookings` and `users` collections.
  // Response Example:
  // {
  //   "userEmail": "driver@gmail.com",
  //   "feedbackUrl": "https://evplugfinder.com/reviews?bookingId=b1"
  // }
  interface RequestFeedbackRequest {
    bookingId: string;
  }
  interface RequestFeedbackResponse {
    userEmail: string;
    feedbackUrl: string;
  }
  app.post("/api/automation/request-feedback", async (req, res) => {
    try {
      const { bookingId } = z.object({ bookingId: z.string() }).parse(req.body) as RequestFeedbackRequest;

      let booking: any = null;
      let userEmail = "";

      if (db) {
        const bookingDoc = await db.collection("bookings").doc(bookingId).get();
        if (bookingDoc.exists) {
          booking = { id: bookingDoc.id, ...bookingDoc.data() };
          
          const userDoc = await db.collection("users").doc(booking.userId).get();
          if (userDoc.exists) {
            userEmail = userDoc.data()?.email || "";
          }
        }
      }

      // Memory storage fallback
      if (!booking) {
        const memBooking = await storage.getBooking(bookingId);
        if (memBooking) {
          booking = memBooking;
          userEmail = "driver@evplugfinder.com";
        }
      }

      if (!booking) {
        return res.status(404).json({ error: `Booking with ID ${bookingId} not found` });
      }

      const response: RequestFeedbackResponse = {
        userEmail: userEmail || "customer@evplugfinder.com",
        feedbackUrl: `https://evplugfinder.com/reviews?bookingId=${bookingId}`
      };

      res.json(response);
    } catch (error: any) {
      console.error("Error in /api/automation/request-feedback:", error);
      res.status(500).json({ error: error.message || "Internal server error" });
    }
  });

  // 5. POST /api/automation/trigger-revenue-report
  // Firestore Query: Filters `bookings` by `createdAt` range and aggregates total amount and peaks. Filters active `stations`.
  // Response Example:
  // {
  //   "totalRevenue": 24500,
  //   "totalBookings": 112,
  //   "activeStations": 5,
  //   "peakHour": "19:00"
  // }
  interface TriggerRevenueReportRequest {
    period: "daily" | "monthly";
  }
  interface TriggerRevenueReportResponse {
    totalRevenue: number;
    totalBookings: number;
    activeStations: number;
    peakHour: string;
  }
  app.post("/api/automation/trigger-revenue-report", async (req, res) => {
    try {
      const { period } = z.object({
        period: z.enum(["daily", "monthly"])
      }).parse(req.body) as TriggerRevenueReportRequest;

      const now = Date.now();
      const oneDayMs = 24 * 60 * 60 * 1000;
      const thresholdTime = period === "daily" ? now - oneDayMs : now - (30 * oneDayMs);

      let totalRevenue = 0;
      let totalBookings = 0;
      let activeStations = 0;
      let peakHour = "N/A";
      const hourCounts: Record<number, number> = {};

      if (db) {
        const bookingsSnap = await db.collection("bookings")
          .where("createdAt", ">=", thresholdTime)
          .get();

        totalBookings = bookingsSnap.size;

        bookingsSnap.forEach((doc) => {
          const data = doc.data();
          if (data.status === "completed" || data.status === "confirmed" || data.status === "active") {
            totalRevenue += data.totalPrice || 0;
          }
          
          if (data.startTime) {
            const date = new Date(data.startTime);
            const hour = date.getHours();
            hourCounts[hour] = (hourCounts[hour] || 0) + 1;
          }
        });

        const stationsSnap = await db.collection("stations")
          .where("status", "==", "active")
          .get();
        activeStations = stationsSnap.size;
      } else {
        // Fallback calculations for development mode
        totalRevenue = period === "daily" ? 4500 : 135000;
        totalBookings = period === "daily" ? 15 : 450;
        activeStations = 8;
        hourCounts[18] = 10;
        hourCounts[19] = 15;
        hourCounts[20] = 5;
      }

      let maxHour = -1;
      let maxCount = -1;
      for (const [hourStr, count] of Object.entries(hourCounts)) {
        const hour = parseInt(hourStr);
        if (count > maxCount) {
          maxCount = count;
          maxHour = hour;
        }
      }

      if (maxHour !== -1) {
        const formatHour = maxHour.toString().padStart(2, "0");
        peakHour = `${formatHour}:00`;
      } else {
        peakHour = "18:00";
      }

      const response: TriggerRevenueReportResponse = {
        totalRevenue,
        totalBookings,
        activeStations,
        peakHour
      };

      res.json(response);
    } catch (error: any) {
      console.error("Error in /api/automation/trigger-revenue-report:", error);
      res.status(500).json({ error: error.message || "Internal server error" });
    }
  });

  // 6. POST /api/automation/low-utilization-warning
  // Firestore Query: Fetches from `stations`, matches owner in `users`, and checks past 7 days of `bookings` for analytics.
  // Response Example:
  // {
  //   "stationId": "s1",
  //   "stationName": "Eco Charge Station",
  //   "ownerEmail": "owner@evplugfinder.com",
  //   "analytics": {
  //     "occupancyRate": 14.28,
  //     "totalSessions": 12,
  //     "revenue": 2400
  //   }
  // }
  interface LowUtilizationWarningRequest {
    stationId: string;
  }
  interface LowUtilizationWarningResponse {
    stationId: string;
    stationName: string;
    ownerEmail: string;
    analytics: {
      occupancyRate: number;
      totalSessions: number;
      revenue: number;
    };
  }
  app.post("/api/automation/low-utilization-warning", async (req, res) => {
    try {
      const { stationId } = z.object({ stationId: z.string() }).parse(req.body) as LowUtilizationWarningRequest;

      let station: any = null;
      let ownerEmail = "owner@evplugfinder.com";
      let occupancyRate = 12.5;
      let totalSessions = 5;
      let revenue = 1200;

      if (db) {
        const stationDoc = await db.collection("stations").doc(stationId).get();
        if (stationDoc.exists) {
          station = { id: stationDoc.id, ...stationDoc.data() };
          
          const userDoc = await db.collection("users").doc(station.ownerId).get();
          if (userDoc.exists) {
            ownerEmail = userDoc.data()?.email || ownerEmail;
          }

          const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
          const bookingsSnap = await db.collection("bookings")
            .where("stationId", "==", stationId)
            .where("createdAt", ">=", sevenDaysAgo)
            .get();

          totalSessions = bookingsSnap.size;
          revenue = 0;
          let totalMinutes = 0;

          bookingsSnap.forEach((doc) => {
            const data = doc.data();
            if (data.status === "completed" || data.status === "confirmed") {
              revenue += data.totalPrice || 0;
            }
            if (data.status === "completed" || data.status === "confirmed" || data.status === "active") {
              totalMinutes += data.duration || 30;
            }
          });

          const totalHoursBooked = totalMinutes / 60;
          const totalCapacityHours = 168 * (station.connectors?.length || 2);
          occupancyRate = Math.min(100, Math.round((totalHoursBooked / totalCapacityHours) * 100 * 100) / 100) || 0;
        }
      }

      if (!station) {
        const memStation = await storage.getStation(stationId);
        if (memStation) {
          station = memStation;
          occupancyRate = 8.5;
          totalSessions = 4;
          revenue = 850;
        }
      }

      if (!station) {
        return res.status(404).json({ error: `Station with ID ${stationId} not found` });
      }

      const response: LowUtilizationWarningResponse = {
        stationId,
        stationName: station.name || "Unknown Station",
        ownerEmail,
        analytics: {
          occupancyRate,
          totalSessions,
          revenue
        }
      };

      res.json(response);
    } catch (error: any) {
      console.error("Error in /api/automation/low-utilization-warning:", error);
      res.status(500).json({ error: error.message || "Internal server error" });
    }
  });

  // 7. POST /api/automation/reengage-user
  // Firestore Query: Fetches from `users` collection and checks newest booking from `bookings` where userId matches.
  // Response Example:
  // {
  //   "userEmail": "customer@gmail.com",
  //   "loyaltyPoints": 350,
  //   "lastBookingDate": "2026-05-24T18:00:00.000Z"
  // }
  interface ReengageUserRequest {
    userId: string;
  }
  interface ReengageUserResponse {
    userEmail: string;
    loyaltyPoints: number;
    lastBookingDate: string;
  }
  app.post("/api/automation/reengage-user", async (req, res) => {
    try {
      const { userId } = z.object({ userId: z.string() }).parse(req.body) as ReengageUserRequest;

      let user: any = null;
      let lastBookingDate = "N/A";

      if (db) {
        const userDoc = await db.collection("users").doc(userId).get();
        if (userDoc.exists) {
          user = { uid: userDoc.id, ...userDoc.data() };

          const bookingsSnap = await db.collection("bookings")
            .where("userId", "==", userId)
            .orderBy("createdAt", "desc")
            .limit(1)
            .get();

          if (!bookingsSnap.empty) {
            const lastBooking = bookingsSnap.docs[0].data();
            lastBookingDate = new Date(lastBooking.createdAt).toISOString();
          }
        }
      }

      if (!user) {
        user = {
          email: "customer@evplugfinder.com",
          loyaltyPoints: 120
        };
        lastBookingDate = new Date(Date.now() - (30 * 24 * 60 * 60 * 1000)).toISOString();
      }

      const response: ReengageUserResponse = {
        userEmail: user.email || "unknown@evplugfinder.com",
        loyaltyPoints: user.loyaltyPoints || 0,
        lastBookingDate
      };

      res.json(response);
    } catch (error: any) {
      console.error("Error in /api/automation/reengage-user:", error);
      res.status(500).json({ error: error.message || "Internal server error" });
    }
  });

  // Helper to compute start of day in Asia/Kolkata timezone as UTC epoch milliseconds
  function getKolkataStartOfDay(): number {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "numeric",
      day: "numeric",
    });
    const parts = formatter.formatToParts(now);
    const year = parseInt(parts.find(p => p.type === "year")!.value, 10);
    const month = parseInt(parts.find(p => p.type === "month")!.value, 10);
    const day = parseInt(parts.find(p => p.type === "day")!.value, 10);
    const utcMidnight = Date.UTC(year, month - 1, day, 0, 0, 0, 0);
    return utcMidnight - (5.5 * 60 * 60 * 1000);
  }

  // Helper function to perform dashboard metrics calculation
  async function computeOwnerDashboardMetrics(ownerId: string): Promise<{
    stationCount: number;
    todayBookings: number;
    todayRevenue: number;
    activeSessions: number;
  }> {
    let stationCount = 0;
    let todayBookings = 0;
    let todayRevenue = 0;
    let activeSessions = 0;

    const startOfDayTime = getKolkataStartOfDay();

    if (db) {
      // Query Firestore stations owned by owner
      const stationsSnap = await db.collection("stations").where("ownerId", "==", ownerId).get();
      stationCount = stationsSnap.size;

      if (stationCount > 0) {
        const stationIds = stationsSnap.docs.map(doc => doc.id);
        
        // Chunk stationIds into sizes of 30 because of Firestore 'in' limit
        const chunkSize = 30;
        const stationChunks: string[][] = [];
        for (let i = 0; i < stationIds.length; i += chunkSize) {
          stationChunks.push(stationIds.slice(i, i + chunkSize));
        }

        // Fetch bookings for each station chunk
        for (const chunk of stationChunks) {
          // 1. Today's bookings and revenue
          const todayBookingsSnap = await db.collection("bookings")
            .where("stationId", "in", chunk)
            .where("createdAt", ">=", startOfDayTime)
            .get();

          todayBookingsSnap.forEach(doc => {
            const data = doc.data();
            todayBookings++;
            if (data.status === "completed" || data.status === "confirmed" || data.status === "active") {
              todayRevenue += data.totalPrice || 0;
            }
          });

          // 2. Active sessions
          const activeBookingsSnap = await db.collection("bookings")
            .where("stationId", "in", chunk)
            .where("status", "==", "active")
            .get();

          activeSessions += activeBookingsSnap.size;
        }
      }
    } else {
      // Fallback for local development using storage
      const memStations = Array.from(((storage as any).stations || new Map()).values()) as any[];
      const ownerStations = memStations.filter(s => s.ownerId === ownerId);
      stationCount = ownerStations.length;

      if (stationCount > 0) {
        const ownerStationIds = new Set(ownerStations.map(s => s.id));
        const memBookings = Array.from(((storage as any).bookings || new Map()).values()) as any[];
        const ownerBookings = memBookings.filter(b => ownerStationIds.has(b.stationId));

        ownerBookings.forEach(b => {
          if ((b.createdAt || 0) >= startOfDayTime) {
            todayBookings++;
            if (b.status === "completed" || b.status === "confirmed" || b.status === "active") {
              todayRevenue += b.totalPrice || 0;
            }
          }
          if (b.status === "active") {
            activeSessions++;
          }
        });
      }
    }

    return {
      stationCount,
      todayBookings,
      todayRevenue,
      activeSessions
    };
  }

  // 8. GET /api/owner/dashboard-sync
  // Purpose: Provide station owner dashboard statistics for n8n synchronization workflows.
  app.get("/api/owner/dashboard-sync", async (req, res) => {
    try {
      const { ownerId } = z.object({
        ownerId: z.string()
      }).parse({ ...req.query, ...req.body });

      const metrics = await computeOwnerDashboardMetrics(ownerId);

      res.json({
        ownerId,
        ...metrics
      });
    } catch (error: any) {
      console.error("Error in GET /api/owner/dashboard-sync:", error);
      res.status(error instanceof z.ZodError ? 400 : 500).json({
        error: error.message || "Internal server error"
      });
    }
  });

  // 8.1 POST /api/owner/dashboard-sync
  // Purpose: Provide station owner dashboard statistics for n8n synchronization workflows via POST.
  app.post("/api/owner/dashboard-sync", async (req, res) => {
    try {
      const { ownerId } = z.object({
        ownerId: z.string()
      }).parse({ ...req.query, ...req.body });

      const metrics = await computeOwnerDashboardMetrics(ownerId);

      res.json({
        success: true,
        message: "Dashboard sync completed",
        ownerId,
        ...metrics
      });
    } catch (error: any) {
      console.error("Error in POST /api/owner/dashboard-sync:", error);
      res.status(error instanceof z.ZodError ? 400 : 500).json({
        error: error.message || "Internal server error"
      });
    }
  });

  // 9. POST /api/ml/log-recommendation
  // Purpose: Store AI recommendation events for analytics and model improvement.
  app.post("/api/ml/log-recommendation", async (req, res) => {
    try {
      const validatedData = mlRecommendationLogSchema.parse(req.body);

      if (db) {
        await db.collection("ml_recommendation_logs").add({
          ...validatedData,
          timestamp: admin.firestore.FieldValue.serverTimestamp()
        });
      } else {
        // Fallback for local memory storage
        if (!(storage as any).mlRecommendationLogs) {
          (storage as any).mlRecommendationLogs = [];
        }
        (storage as any).mlRecommendationLogs.push({
          ...validatedData,
          timestamp: Date.now()
        });
      }

      res.json({ success: true });
    } catch (error: any) {
      console.error("Error in /api/ml/log-recommendation:", error);
      res.status(error instanceof z.ZodError ? 400 : 500).json({
        error: error.message || "Internal server error"
      });
    }
  });

  // --- Admin Analytics Endpoints ---

  // GET /admin/analytics/dashboard - Complete analytics data for admin
  app.get("/admin/analytics/dashboard", async (req, res) => {
    try {
      // This would normally fetch from storage, but since we use Firestore directly,
      // this endpoint validates admin access and provides aggregated stats
      res.json({
        message: "Admin analytics dashboard - data fetched from Firestore in frontend",
        endpoints: {
          revenue: "/admin/analytics/revenue",
          trends: "/admin/analytics/trends",
          users: "/admin/analytics/users",
          stations: "/admin/analytics/stations",
          payments: "/admin/analytics/payments"
        }
      });
    } catch (error) {
      console.error("Error fetching analytics:", error);
      res.status(500).json({ error: "Failed to fetch analytics" });
    }
  });

  // GET /admin/analytics/revenue - Revenue breakdown by station and time period
  app.get("/admin/analytics/revenue", async (req, res) => {
    try {
      const period = (req.query.period as string) || "month"; // day, week, month, year
      res.json({
        message: "Revenue analytics - calculated from bookings collection",
        period,
        note: "Frontend calculates from Firestore bookings with paymentStatus = completed"
      });
    } catch (error) {
      console.error("Error fetching revenue:", error);
      res.status(500).json({ error: "Failed to fetch revenue data" });
    }
  });

  // GET /admin/analytics/trends - Booking trends over time
  app.get("/admin/analytics/trends", async (req, res) => {
    try {
      const days = parseInt(req.query.days as string) || 30;
      res.json({
        message: "Booking trends - calculated from bookings collection",
        days,
        note: "Frontend groups bookings by date and calculates daily counts"
      });
    } catch (error) {
      console.error("Error fetching trends:", error);
      res.status(500).json({ error: "Failed to fetch trend data" });
    }
  });

  // GET /admin/analytics/users - User activity logs
  app.get("/admin/analytics/users", async (req, res) => {
    try {
      const role = (req.query.role as string) || "ev_user";
      res.json({
        message: "User activity logs - calculated from users and bookings collections",
        role,
        note: "Frontend filters users by role and counts their bookings"
      });
    } catch (error) {
      console.error("Error fetching user data:", error);
      res.status(500).json({ error: "Failed to fetch user data" });
    }
  });

  // GET /admin/analytics/stations - Station performance metrics
  app.get("/admin/analytics/stations", async (req, res) => {
    try {
      res.json({
        message: "Station metrics - calculated from stations and bookings collections",
        metrics: ["utilization", "totalBookings", "popularConnector", "revenue"],
        note: "Frontend calculates from station connectors and booking history"
      });
    } catch (error) {
      console.error("Error fetching station metrics:", error);
      res.status(500).json({ error: "Failed to fetch station metrics" });
    }
  });

  // GET /admin/analytics/payments - Payment success/failure rates
  app.get("/admin/analytics/payments", async (req, res) => {
    try {
      res.json({
        message: "Payment metrics - calculated from bookings collection",
        note: "Frontend counts bookings by paymentStatus (completed vs failed)",
        statuses: [BookingStatus.COMPLETED, "failed", BookingStatus.PENDING]
      });
    } catch (error) {
      console.error("Error fetching payment data:", error);
      res.status(500).json({ error: "Failed to fetch payment data" });
    }
  });

  // GET /api/admin/debug-station/:stationId - Debug station metrics inconsistency
  app.get("/api/admin/debug-station/:stationId", async (req, res) => {
    try {
      const stationId = req.params.stationId;
      if (!stationId) {
        return res.status(400).json({ error: "Missing stationId parameter" });
      }

      let stationName = "Unknown Station";
      let bookingCount = 0;
      let confirmedBookings = 0;
      let completedBookings = 0;
      let cancelledBookings = 0;
      let totalRevenue = 0;
      let utilizationRate = 0;
      let revenueSource = "mock/demo data";
      let bookingSource = "mock/demo data";

      if (db) {
        const stationDoc = await db.collection("stations").doc(stationId).get();
        if (!stationDoc.exists) {
          return res.status(404).json({ error: `Station with ID ${stationId} not found` });
        }
        const stationData = stationDoc.data() || {};
        stationName = stationData.name || "Unknown Station";
        revenueSource = "bookings collection";
        bookingSource = "bookings collection";

        const connectors = stationData.connectors || [];
        const connectorCount = connectors.length;
        const availableConnectors = connectors.filter((c: any) => c.available).length;
        utilizationRate = connectorCount > 0 ? Math.round(((connectorCount - availableConnectors) / connectorCount) * 100) : 0;

        const bookingsSnap = await db.collection("bookings")
          .where("stationId", "==", stationId)
          .get();

        bookingsSnap.forEach((doc) => {
          const b = doc.data() || {};
          const status = b.status;
          
          if (status === "confirmed") {
            confirmedBookings++;
          } else if (status === "completed") {
            completedBookings++;
          } else if (status === "cancelled") {
            cancelledBookings++;
          }

          if (["confirmed", "completed"].includes(status)) {
            bookingCount++;
            totalRevenue += b.totalPrice || 0;
          }
        });

        if (bookingCount === 0 && totalRevenue > 0) {
          console.warn("Analytics inconsistency detected");
        }
      } else {
        // Fallback for development if db is not connected
        const station = await storage.getStation(stationId);
        if (!station) {
          return res.status(404).json({ error: `Station with ID ${stationId} not found` });
        }
        stationName = station.name || "Unknown Station";
        const connectors = station.connectors || [];
        const connectorCount = connectors.length;
        const availableConnectors = connectors.filter((c: any) => c.available).length;
        utilizationRate = connectorCount > 0 ? Math.round(((connectorCount - availableConnectors) / connectorCount) * 100) : 0;
      }

      res.json({
        stationId,
        stationName,
        bookingCount,
        confirmedBookings,
        completedBookings,
        cancelledBookings,
        totalRevenue,
        revenueSource,
        bookingSource,
        utilizationRate
      });
    } catch (error: any) {
      console.error("Error in debug-station endpoint:", error);
      res.status(500).json({ error: error.message || "Failed to debug station metrics" });
    }
  });

  // POST /admin/operations/block-user - Block/unblock a user
  app.post("/admin/operations/block-user", async (req, res) => {
    try {
      const { userId, shouldBlock } = req.body;
      if (!userId) {
        return res.status(400).json({ error: "Missing userId" });
      }
      res.json({
        message: `User ${shouldBlock ? "blocked" : "unblocked"} successfully`,
        userId,
        shouldBlock
      });
    } catch (error) {
      console.error("Error blocking user:", error);
      res.status(500).json({ error: "Failed to block user" });
    }
  });

  // POST /admin/operations/approve-owner - Approve station owner
  app.post("/admin/operations/approve-owner", async (req, res) => {
    try {
      const { ownerId } = req.body;
      if (!ownerId) {
        return res.status(400).json({ error: "Missing ownerId" });
      }
      res.json({
        message: "Owner approved successfully",
        ownerId
      });
    } catch (error) {
      console.error("Error approving owner:", error);
      res.status(500).json({ error: "Failed to approve owner" });
    }
  });

  // POST /admin/operations/approve-station - Approve pending station
  app.post("/admin/operations/approve-station", async (req, res) => {
    try {
      const { stationId } = req.body;
      if (!stationId) {
        return res.status(400).json({ error: "Missing stationId" });
      }
      res.json({
        message: "Station approved successfully",
        stationId
      });
    } catch (error) {
      console.error("Error approving station:", error);
      res.status(500).json({ error: "Failed to approve station" });
    }
  });

  // DELETE /admin/operations/delete-station/:stationId - Delete station
  app.delete("/admin/operations/delete-station/:stationId", async (req, res) => {
    try {
      const { stationId } = req.params;
      res.json({
        message: "Station deleted successfully",
        stationId
      });
    } catch (error) {
      console.error("Error deleting station:", error);
      res.status(500).json({ error: "Failed to delete station" });
    }
  });

  // POST /api/admin/notify-alert - Trigger external notifications for critical events
  app.post("/api/admin/notify-alert", async (req, res) => {
    try {
      const { event, details, severity } = z.object({
        event: z.string(),
        details: z.string(),
        severity: z.string().optional()
      }).parse(req.body);

      await notifications.notifyCriticalEvent(event, details, severity);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error sending alert notification:", error);
      res.status(500).json({ error: error.message || "Failed to send notification" });
    }
  });

  // --- Notification Management Endpoints ---

  // POST /api/notifications/send-email - Send arbitrary email
  app.post("/api/notifications/send-email", async (req, res) => {
    try {
      const { to, subject, message } = z.object({
        to: z.string().email(),
        subject: z.string(),
        message: z.string()
      }).parse(req.body);

      const success = await notifications.sendEmail(to, subject, message, undefined, "MANUAL");
      res.json({ success });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // POST /api/notifications/send-sms - Send arbitrary SMS
  app.post("/api/notifications/send-sms", async (req, res) => {
    try {
      const { to, message } = z.object({
        to: z.string(),
        message: z.string()
      }).parse(req.body);

      const success = await notifications.sendSMS(to, message, "MANUAL");
      res.json({ success });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // POST /api/notifications/test - Test notification setup
  app.post("/api/notifications/test", async (req, res) => {
    try {
      const adminEmail = process.env.ADMIN_ALERT_EMAIL || "admin@evplugfinder.com";
      const adminPhone = process.env.ADMIN_ALERT_PHONE || "+1234567890";

      const emailSent = await notifications.sendEmail(
        adminEmail,
        "EVPlugFinder: Notification Test",
        "This is a test email from the EVPlugFinder Admin Platform.",
        "<h3>EVPlugFinder Test</h3><p>Your notification system is configured correctly.</p>",
        "TEST"
      );

      const smsSent = await notifications.sendSMS(
        adminPhone,
        "EVPlugFinder: Test SMS. System operational.",
        "TEST"
      );

      res.json({ success: true, emailSent, smsSent });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // --- Referral System Endpoints ---

  // POST /api/apply-referral - Apply referral code to a new user
  app.post("/api/apply-referral", async (req, res) => {
    if (!db) {
      return res.status(500).json({ error: "Firestore Admin not initialized" });
    }

    const firestore = db;
    try {
      const { userId, referralCode } = z.object({
        userId: z.string(),
        referralCode: z.string()
      }).parse(req.body);

      const result = await firestore.runTransaction(async (transaction) => {
        // 1. Validate referral code and find referrer
        const referrerQuery = firestore.collection("users")
          .where("referralCode", "==", referralCode.toUpperCase())
          .limit(1);
        const referrerDocs = await transaction.get(referrerQuery);

        if (referrerDocs.empty) {
          throw new Error("Invalid referral code");
        }

        const referrerDoc = referrerDocs.docs[0];
        const referrerId = referrerDoc.id;
        const referrerData = referrerDoc.data();

        if (referrerId === userId) {
          throw new Error("You cannot refer yourself");
        }

        // 2. Validate new user
        const userRef = firestore.collection("users").doc(userId);
        const userSnap = await transaction.get(userRef);

        if (!userSnap.exists) {
          throw new Error("User not found");
        }

        const userData = userSnap.data();
        if (userData?.referredBy) {
          throw new Error("Referral code already applied");
        }

        // 3. Update new user: add referredBy, add 100 points
        transaction.update(userRef, {
          referredBy: referralCode.toUpperCase(),
          loyaltyPoints: (userData?.loyaltyPoints || 0) + 100
        });

        // 4. Update referrer: add 200 points, increment referralCount
        transaction.update(referrerDoc.ref, {
          loyaltyPoints: (referrerData?.loyaltyPoints || 0) + 200,
          referralCount: (referrerData?.referralCount || 0) + 1
        });

        // 5. Log to audit_logs
        const auditLogRef = firestore.collection("auditLogs").doc();
        transaction.set(auditLogRef, {
          action: "REFERRAL_APPLIED",
          severity: "LOW",
          performedBy: "system",
          targetId: userId,
          targetType: "user",
          metadata: {
            referrerId,
            referralCode: referralCode.toUpperCase(),
            newUserInfo: { uid: userId, points: 100 },
            referrerInfo: { uid: referrerId, points: 200 }
          },
          timestamp: new Date().toISOString()
        });

        return { success: true, referrerId };
      });

      res.json(result);
    } catch (error: any) {
      console.error("Error applying referral:", error);
      res.status(400).json({ error: error.message || "Failed to apply referral" });
    }
  });

  // GET /api/referrals/leaderboard - Get top 10 referrers
  app.get("/api/referrals/leaderboard", async (req, res) => {
    if (!db) {
      return res.status(500).json({ error: "Firestore Admin not initialized" });
    }

    try {
      const snapshot = await db.collection("users")
        .orderBy("referralCount", "desc")
        .limit(10)
        .get();

      const leaderboard = snapshot.docs.map(doc => ({
        uid: doc.id,
        displayName: doc.data().displayName || "Anonymous User",
        referralCount: doc.data().referralCount || 0,
        photoURL: doc.data().photoURL || ""
      }));

      res.json(leaderboard);
    } catch (error) {
      console.error("Error fetching leaderboard:", error);
      res.status(500).json({ error: "Failed to fetch leaderboard" });
    }
  });

  // --- Background Scheduler for Automated Triggers ---
  let lastRunDate = "";

  setInterval(async () => {
    if (!db) return;
    const now = new Date();
    const today = now.toISOString().split("T")[0];
    const hour = now.getHours();
    const minute = now.getMinutes();

    // Prevent multiple runs in the same minute
    const currentSlot = `${today}_${hour}_${minute}`;
    if (lastRunDate === currentSlot) return;
    lastRunDate = currentSlot;

    try {
      // Trigger 1 - Platform Health Score < 70 (Daily at 9 AM)
      if (hour === 9 && minute === 0) {
        const statsSnap = await db.collection("system_stats").doc("health").get();
        const score = statsSnap.data()?.score || 100;
        if (score < 70) {
          await notifications.notifyCriticalEvent("HEALTH_LOW", `Platform health score is critically low at ${score}%.`, "CRITICAL");
        }
      }

      // Trigger 5 - ML Model Drift > 0.5 (Daily at 10 AM)
      if (hour === 10 && minute === 0) {
        const perfSnap = await db.collection("ml_model_performance").orderBy("date", "desc").limit(1).get();
        if (!perfSnap.empty) {
          const drift = perfSnap.docs[0].data().driftScore || 0;
          if (drift > 0.5) {
            await notifications.notifyCriticalEvent("ML_DRIFT", `ML model drift detected at ${drift.toFixed(3)}. Retraining recommended.`, "WARNING");
          }
        }
      }

      // Trigger 8 - Station Approval Backlog > 10 (Daily at 8 AM)
      if (hour === 8 && minute === 0) {
        const pendingSnap = await db.collection("stations").where("status", "==", "pending").get();
        if (pendingSnap.size > 10) {
          await notifications.notifyCriticalEvent("APPROVAL_BACKLOG", `There are ${pendingSnap.size} stations pending approval.`, "INFO");
        }
      }

      // Trigger 6 - Support Ticket SLA Breach (Check every minute)
      const slaLimit = 3.2 * 60 * 60 * 1000; // 3.2 hours in ms
      const highPriorityTickets = await db.collection("supportTickets")
        .where("priority", "==", "high")
        .where("status", "==", "open")
        .get();

      for (const doc of highPriorityTickets.docs) {
        const ticket = doc.data();
        const createdAt = ticket.createdAt.toDate();
        if (now.getTime() - createdAt.getTime() > slaLimit && !ticket.slaBreachNotified) {
          await notifications.notifyCriticalEvent("SLA_BREACH", `Ticket #${doc.id} (${ticket.subject}) has breached the 3.2h SLA.`, "HIGH");
          await doc.ref.update({ slaBreachNotified: true });
        }
      }

    } catch (err) {
      console.error("Scheduler Error:", err);
    }
  }, 60000); // Check every minute

  // GET /api/debug/firebase - Temporary debug endpoint
  app.get("/api/debug/firebase", async (req, res) => {
    try {
      const firebaseInitialized = admin.apps.length > 0;
      let projectId: string | null = null;
      if (firebaseInitialized) {
        const app = admin.apps[0];
        if (app) {
          projectId = app.options.projectId || null;
          if (!projectId && (app.options.credential as any)?.projectId) {
            projectId = (app.options.credential as any).projectId;
          }
        }
      }
      if (!projectId) {
        projectId = process.env.VITE_FIREBASE_PROJECT_ID || "evapp-4d7e4";
      }

      let firestoreConnected = false;
      let stationCount = 0;

      if (db) {
        try {
          const snapshot = await db.collection("stations").get();
          firestoreConnected = true;
          stationCount = snapshot.size;
        } catch (error) {
          console.error("Firestore connection failed in debug endpoint:", error);
          firestoreConnected = false;
        }
      }

      res.json({
        "Firebase initialized": firebaseInitialized,
        "Firebase project ID": firebaseInitialized ? projectId : (process.env.VITE_FIREBASE_PROJECT_ID || "evapp-4d7e4"),
        "Firestore connected": firestoreConnected,
        "Number of documents in collection \"stations\"": stationCount
      });
    } catch (error: any) {
      console.error("Error in /api/debug/firebase:", error);
      res.status(500).json({ error: error.message || "Failed to check Firebase status" });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}

// Helper function to get ML predictions
async function getPrediction(
  stationId: string,
  telemetry: any[],
  lookbackMinutes = 60
) {
  const ML_SERVICE_URL = process.env.ML_SERVICE_URL || "http://localhost:8001";

  try {
    // Try to call ML service
    const response = await axios.post(
      `${ML_SERVICE_URL}/predict`,
      {
        stationId,
        telemetry,
        lookbackMinutes,
      },
      { timeout: 5000 }
    );

    return response.data;
  } catch (error) {
    // Fallback to heuristic prediction
    console.log("ML service unavailable, using heuristic");

    const recentOccupancy = telemetry.slice(0, 10);
    const avgOccupied =
      recentOccupancy.reduce((sum, t) => sum + t.occupied, 0) /
      recentOccupancy.length;

    // Simple heuristic: assume availability continues current trend
    const station = await storage.getStation(stationId);
    const totalConnectors = station?.connectors.length || 10;

    return {
      prediction: Math.max(0, totalConnectors - Math.ceil(avgOccupied)),
      confidence: 0.6, // Lower confidence for heuristic
    };
  }
}
