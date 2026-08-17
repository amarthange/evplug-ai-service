# EV Owner Platform Architecture & Technical Documentation

## Overview
The Owner Platform (Partner Portal) is a specialized operational ecosystem built for EV charging station operators. It provides real-time oversight, financial telemetry, dynamic pricing controls, and direct customer engagement tools, allowing partners to effectively monetize and manage their charging infrastructure.

> [!TIP]
> For detailed technical implementation details, including data models, security rules, and algorithms, see the [Owner Platform Technical Specification](file:///d:/SeniorDevOps/OWNER_PLATFORM_TECH_SPEC.md).

---

## 1. System Architecture

The Owner Platform is built within the same React single-page application but operates under a separate layout (`OwnerLayout`) and dedicated router (`OwnerRouter`), isolated from the consumer-facing app. 

### Key Architectural Traits:
- **State Management:** React Context (`AuthProvider`) for identity management and `react-query` for asynchronous data fetching.
- **Database Architecture:** Deeply integrated with Firebase Firestore. It uses `onSnapshot` subscriptions extensively for low-latency updates (Live Occupancy, Chat, Alerts).
- **Component Isolation:** The UI leverages an isolated `OwnerLayout` (typically a sidebar-nav interface) meaning owners get an enterprise SaaS-like experience rather than a consumer mobile-app experience.

---

## 2. Routing Structure

All partner operations are nested under the `/owner/*` namespace. Routing is handled by `wouter`:

| Route | Component | Purpose |
|-------|-----------|---------|
| `/owner/login` | `OwnerLogin` | Authentication gateway for partners. |
| `/owner/signup` | `OwnerSignup` | Partner onboarding and business registration. |
| `/owner/complete-business-profile` | `OwnerCompleteBusinessProfile` | 2-Step Business and Payment setup wizard. |
| `/owner/dashboard` | `OwnerDashboard` | The Command Center. Aggregated KPIs, live monitors, quick actions. |
| `/owner/stations` | `OwnerStations` | Station hardware management, adding/removing connectors, modifying status. |
| `/owner/ledger` | `OwnerLedger` | Financial hub. Tracks revenue splits, payout histories, and transaction ledgers. |
| `/owner/reviews` | `OwnerReviews` | Feedback management. Respond directly to driver ratings. |
| `/owner/drivers` | `OwnerDrivers` | Analytics on unique drivers, retention rates, and top customers. |
| `/owner/promotions` | `OwnerPromotions` | Configuration for loyalty programs, discounts, or promotional events. |
| `/owner/notifications`| `OwnerNotifications`| Historic log of system and hardware alerts. |
| `/owner/help` | `OwnerHelp` | Support and documentation for the station owner. |
| `/fleet` | `FleetManagement`| Management portal for operators managing commercial fleet vehicles. |

---

## 3. Core Features & Algorithms

### A. Real-Time Command Center (Dashboard)
The `OwnerDashboard` acts as a high-frequency trading desk for station operators. 
- **Live Occupancy Monitor:** Visualizes real-time connector states (`AVAILABLE` vs `CHARGING`) with a 5-second polling/refresh cycle.
- **Financial Goal Engine:** Owners can set customized monthly revenue targets (`monthlyTarget`). The system calculates current daily averages versus required daily averages, providing a visual progress bar and predictive status (e.g., "On track" vs "Behind pace").

### B. Dynamic Surge Pricing Engine
Owners have the ability to toggle peak pricing dynamically.
- **Method:** `handleToggleSurge()`
- **Mechanism:** Updates the `peakPricing` object on the owner's Firestore document. When enabled, the system applies a multiplier (e.g., 1.5x) to the base rate of all stations under that owner. The consumer app reads this multiplier in real-time during the booking flow.

### C. Automated Health Check System
The platform proactively monitors hardware status using behavioral heuristics rather than just waiting for hardware pings.
- **Algorithm:** Runs every 5 minutes (`runHealthChecks`).
- **Connector Fault Detection:** Queries `reviews` created in the last 24 hours. If a station receives 3+ reviews with a rating ≤ 2 stars, it automatically dispatches a `CONNECTOR_FAULT` alert to the owner.
- **High Cancellation Detection:** Queries `bookings` in the last 1 hour. If 3+ sessions are marked as `CANCELLED` at a single station, it fires a `HIGH_CANCELLATIONS` alert.

### D. Real-Time Driver Communication
- **Architecture:** Owners can chat directly with drivers actively charging at their stations.
- **Methods:** `subscribeToOwnerChats` and `closeChat`.
- **Flow:** If a driver reports an issue via the consumer app, a secure session is opened. The dashboard alerts the owner (via a flashing UI badge), allowing them to resolve the issue without phone support.

### E. Analytics Processing Pipeline
- **Method:** `processAnalytics(stationsList)`
- **Data Aggregation:** Retrieves all bookings and reviews for the owner's stations.
- **Metric Calculations:**
  - **Revenue & Sessions:** Sums `totalPrice` for successful sessions (`CONFIRMED`, `ACTIVE`, `COMPLETED`).
  - **Trend Algorithms:** Calculates percentage changes vs the previous 24 hours (for revenue/sessions) and previous month (for review sentiment).
  - **Peak Hour Mapping:** Groups historic booking start times into day-hour buckets (e.g., "Monday-14:00") to identify the top 5 most profitable time windows.
  
### G. Multi-Step Onboarding Pipeline
- **Page:** `/owner/complete-business-profile`
- **Wizard Structure:**
  - **Step 1 (Business Identity):** Captures legal business name, support contact, and entity type.
  - **Step 2 (Settlement Details):** Configures UPI ID and allows uploading of business logo and payment QR codes.
- **State Lock:** New owners are redirected to this wizard until `hasCompletedBusinessProfile` is set to `true` in Firestore.

---

## 4. Operational Methods & Functions summary

- `loadOwnerContext()`: Bootstraps the dashboard, verifying owner identity, loading surge configuration, and subscribing to active system alerts.
- `handleDismissAlert(alertId)`: Flags a system alert as resolved in Firestore, removing it from the active notification tray.
- `handleSaveTarget()`: Updates the user's monthly revenue goal. Includes integer parsing validation.

## Conclusion
The Owner Platform is engineered for **proactive management**. By combining predictive health checks, real-time connector telemetry, and dynamic financial controls (surge pricing), it transforms station owners from passive landlords into active, optimizing operators.
