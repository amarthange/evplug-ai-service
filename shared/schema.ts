import { z } from "zod";

// Connector Types
export const ConnectorType = {
  CCS: "CCS",
  CHAdeMO: "CHAdeMO",
  Type2: "Type 2",
  Tesla: "Tesla Supercharger",
} as const;

export type ConnectorTypeValue = typeof ConnectorType[keyof typeof ConnectorType];

// Connector Schema
export const connectorSchema = z.object({
  id: z.string(),
  type: z.enum([ConnectorType.CCS, ConnectorType.CHAdeMO, ConnectorType.Type2, ConnectorType.Tesla]),
  powerKw: z.number(),
  count: z.number().default(1),
  pricePerKwh: z.number(),
  available: z.boolean(),
  pricing: z.object({
    baseRate: z.number(),
    peakRate: z.number(),
    peakStart: z.string(), // "18:00"
    peakEnd: z.string(),   // "21:00"
    weekendRate: z.number(),
  }).optional(),
});

export type Connector = z.infer<typeof connectorSchema>;

// Station Schema
export const stationSchema = z.object({
  id: z.string(),
  name: z.string(),
  address: z.string(),
  lat: z.number(),
  lon: z.number(),
  connectors: z.array(connectorSchema),
  chargerTypes: z.array(z.string()).default([]), // Added for efficient filtering
  imageUrl: z.string().optional(),
  rating: z.number().min(0).max(5).optional(),
  amenities: z.array(z.string()).optional(),
  operatingHours: z.string().optional(),
  lastUpdated: z.number().optional(), // timestamp
  status: z.enum(["active", "pending", "maintenance", "rejected", "offline"]).default("pending"),
  // Optional derived fields for future-readiness
  totalConnectors: z.number().optional(),
  availableConnectors: z.number().optional(),
  averagePricePerKwh: z.number().optional(),
  maxPowerKw: z.number().optional(),
  ownerId: z.string(),
  scheduledMaintenance: z.object({
    startDate: z.string(),
    endDate: z.string(),
    reason: z.string(),
  }).optional(),
  maintenanceWindows: z.array(z.any()).optional(),
  gstNumber: z.string().optional(),
  maintenanceRiskScore: z.number().default(0),
  lastMaintenanceDate: z.number().optional(), // timestamp
  nextSuggestedMaintenance: z.number().optional(), // timestamp
  faultHistory: z.array(z.object({
    date: z.number(),
    type: z.string(),
    resolved: z.boolean(),
  })).default([]),
});

export const insertStationSchema = stationSchema.omit({ id: true });

export type Station = z.infer<typeof stationSchema>;
export type InsertStation = z.infer<typeof insertStationSchema>;

// Booking Status
export const BookingStatus = {
  PENDING: "pending",
  CONFIRMED: "confirmed",
  ACTIVE: "active",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
} as const;

export type BookingStatusValue = typeof BookingStatus[keyof typeof BookingStatus];

// Booking Schema
export const bookingSchema = z.object({
  id: z.string(),
  userId: z.string(),
  stationId: z.string(),
  connectorId: z.string(),
  startTime: z.number(), // timestamp
  duration: z.number(), // minutes
  status: z.enum([
    BookingStatus.PENDING, 
    BookingStatus.CONFIRMED, 
    BookingStatus.ACTIVE, 
    BookingStatus.COMPLETED, 
    BookingStatus.CANCELLED
  ]),
  totalPrice: z.number(),
  holdExpiresAt: z.number().optional(), // timestamp for 10-min payment lock
  checkedInAt: z.number().optional(), // timestamp for QR check-in
  createdAt: z.number(),
  // Denormalized/Summary fields for Receipts & Performance
  stationName: z.string().optional(),
  connectorType: z.string().optional(),
  connectorPowerKw: z.number().optional(),
  energyDeliveredKwh: z.number().optional(),
  endedAt: z.number().optional(),
  actualEndTime: z.string().optional(),
  paymentMethod: z.string().optional(),
  transactionId: z.string().optional(),
  paymentStatus: z.string().optional(),
  ownerId: z.string().optional(), // Added for efficient business intelligence
  pricePerKwh: z.number().optional(), // Locked-in rate at booking time
  estimatedTotal: z.number().optional(), // The pre-paid budget limit
  ownerBusinessName: z.string().optional(), // Context for business communications
  receiptUrl: z.string().url().optional(),
});

export const insertBookingSchema = bookingSchema.omit({ id: true, createdAt: true });

export type Booking = z.infer<typeof bookingSchema>;
export type InsertBooking = z.infer<typeof insertBookingSchema>;

// Telemetry Schema
export const telemetrySchema = z.object({
  id: z.string(),
  stationId: z.string(),
  timestamp: z.number(),
  occupied: z.number(), // number of occupied connectors
  total: z.number(), // total connectors
});

export type Telemetry = z.infer<typeof telemetrySchema>;

// ML Prediction Request/Response
export const predictionRequestSchema = z.object({
  stationId: z.string(),
  telemetry: z.array(z.object({
    timestamp: z.number(),
    occupied: z.number(),
  })),
  lookbackMinutes: z.number().optional().default(60),
});

export const predictionResponseSchema = z.object({
  prediction: z.number(),
  confidence: z.number().min(0).max(1),
  metadata: z.record(z.any()).optional(),
  is_cold_start: z.boolean().optional(),
  is_fallback: z.boolean().optional(),
  warning: z.string().optional(),
});

export type PredictionRequest = z.infer<typeof predictionRequestSchema>;
export type PredictionResponse = z.infer<typeof predictionResponseSchema>;

// User Role Type
export const UserRole = {
  USER: "ev_user",
  STATION_MANAGER: "owner",
  ADMIN: "admin",
} as const;

export type UserRoleValue = typeof UserRole[keyof typeof UserRole];

// EV Car Schema
export const evCarSchema = z.object({
  id: z.string(),
  userId: z.string(),
  brand: z.string(),
  model: z.string(),
  year: z.number(),
  batteryCapacity: z.number(), // kWh
  chargeType: z.enum([ConnectorType.CCS, ConnectorType.CHAdeMO, ConnectorType.Type2, ConnectorType.Tesla]),
  licensePlate: z.string(),
  createdAt: z.number(),
});

export type EvCar = z.infer<typeof evCarSchema>;
export type InsertEvCar = Omit<EvCar, "id" | "createdAt">;

// User Profile Schema
export const userProfileSchema = z.object({
  uid: z.string(),
  email: z.string().email(),
  displayName: z.string().optional(),
  photoURL: z.string().optional(),
  role: z.enum([UserRole.USER, UserRole.STATION_MANAGER]),
  phoneNumber: z.string().optional(),
  completedBookingsCount: z.number().default(0),
  favoriteStations: z.array(z.string()).default([]),
  referralCode: z.string(),
  referredBy: z.string().optional(),
  referralCount: z.number().default(0),
  loyaltyPoints: z.number().default(0),
  blocked: z.boolean().default(false),
  createdAt: z.number(),
});

export type UserProfile = z.infer<typeof userProfileSchema>;

// User Auth Schema (Firebase)
export const userSchema = z.object({
  uid: z.string(),
  email: z.string().email(),
  displayName: z.string().optional(),
  photoURL: z.string().optional(),
});

export type User = z.infer<typeof userSchema>;

// Community Review Schema
export const reviewSchema = z.object({
  id: z.string(),
  stationId: z.string(),
  userId: z.string(),
  userName: z.string(),
  rating: z.number().min(1).max(5),
  comment: z.string(),
  createdAt: z.number(),
});

export type Review = z.infer<typeof reviewSchema>;
export type InsertReview = Omit<Review, "id" | "createdAt" | "userName">;
export const stationReviewSchema = z.object({
  id: z.string(),
  stationId: z.string(),
  userId: z.string(),
  userName: z.string(),
  rating: z.number().min(1).max(5),
  comment: z.string().max(200).optional(),
  bookingId: z.string(), // Proof of completed session
  createdAt: z.date(),
  helpfulCount: z.number().default(0)
});

export type StationReview = z.infer<typeof stationReviewSchema>;

// Saved Route Schema
export const savedRouteSchema = z.object({
  id: z.string(),
  userId: z.string(),
  name: z.string(), // User-provided route name
  origin: z.object({ lat: z.number(), lon: z.number(), address: z.string() }),
  destination: z.object({ lat: z.number(), lon: z.number(), address: z.string() }),
  chargingStops: z.array(z.object({
    stationId: z.string(),
    stationName: z.string(),
    lat: z.number(),
    lon: z.number(),
    estimatedArrival: z.string(),
    chargingDuration: z.number() // minutes
  })),
  createdAt: z.date()
});

export type SavedRoute = z.infer<typeof savedRouteSchema>;
export type InsertSavedRoute = Omit<SavedRoute, "id" | "createdAt">;

// ML Monitoring Schemas
export const mlPredictionSchema = z.object({
  id: z.string(),
  timestamp: z.number(),
  latency_ms: z.number(),
  prediction: z.number(),
  actual: z.number().optional(),
  modelVersion: z.string(),
  stationId: z.string(),
  confidence: z.number(),
  isColdStart: z.boolean().default(false),
});

export type MLPrediction = z.infer<typeof mlPredictionSchema>;

export const mlColdStartSchema = z.object({
  id: z.string(),
  timestamp: z.number(),
  reason: z.enum(["no_history", "new_station", "low_confidence", "system_reboot"]),
  stationId: z.string(),
});

export type MLColdStart = z.infer<typeof mlColdStartSchema>;

export const mlModelPerformanceSchema = z.object({
  id: z.string(),
  date: z.string(), // YYYY-MM-DD
  avgAccuracy: z.number(),
  avgLatency: z.number(),
  p95Latency: z.number(),
  p99Latency: z.number(),
  totalPredictions: z.number(),
  coldStartRate: z.number(),
  modelVersion: z.string(),
});

export type MLModelPerformance = z.infer<typeof mlModelPerformanceSchema>;

// Maintenance Outcome Schema
export const maintenanceOutcomeSchema = z.object({
  id: z.string(),
  stationId: z.string(),
  scheduledDate: z.number(),
  completedDate: z.number(),
  preMaintenanceRisk: z.number(),
  postMaintenanceRisk: z.number(),
  faultsFixed: z.array(z.string()),
  cost: z.number(),
  performedBy: z.string(),
});

// Fraud Alert Schema
export const fraudAlertSchema = z.object({
  id: z.string(),
  pattern: z.string(),
  userId: z.string().optional(),
  stationId: z.string().optional(),
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  details: z.string(),
  status: z.enum(["active", "investigating", "dismissed", "resolved"]),
  detectedAt: z.number(),
  resolvedAt: z.number().optional(),
  resolvedBy: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});

export type FraudAlert = z.infer<typeof fraudAlertSchema>;

export const fraudRiskTrendSchema = z.object({
  date: z.string(),
  score: z.number(),
  alertCount: z.number(),
});

export type FraudRiskTrend = z.infer<typeof fraudRiskTrendSchema>;

// ML Recommendation Log Schema
export const mlRecommendationLogSchema = z.object({
  userId: z.string(),
  recommendedStation: z.string(),
  clicked: z.boolean(),
});

export type MLRecommendationLog = z.infer<typeof mlRecommendationLogSchema>;

