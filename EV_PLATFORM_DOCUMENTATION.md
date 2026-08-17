# 🔌 EV Charging Platform - Technical Documentation

This document provides a comprehensive technical overview of the EV Charging Station SaaS platform, detailing its architecture, implementation of core features, routing, and data management systems.

---

## 🛠️ Technology Stack

The platform is built using a modern, high-performance stack designed for real-time updates and scalability:

- **Frontend Framework**: React 18 with [Vite](https://vitejs.dev/) for fast builds and hot module replacement.
- **State Management**: [TanStack Query (React Query)](https://tanstack.com/query/latest) for efficient data fetching and caching.
- **Styling & UI**: Vanilla CSS + [Tailwind CSS](https://tailwindcss.com/) for responsive design, [Lucide React](https://lucide.dev/) for iconography, and [Framer Motion](https://www.framer.com/motion/) for smooth animations.
- **Backend & Database**: [Firebase](https://firebase.google.com/) (Firestore NoSQL Database, Authentication, Cloud Functions, and Firebase Storage).
- **Navigation**: [wouter](https://github.com/molecula/wouter) for lightweight, high-performance routing.
- **Form Handling**: [React Hook Form](https://react-hook-form.com/) with [Zod](https://zod.dev/) for schema-based validation.

---

## 🚦 Routing Architecture & Access Control

The application implements a role-based routing system controlled in `App.tsx`.

### Role-Based Access Control (RBAC)
User roles are assigned upon signup and stored in both Firebase Auth custom claims and the `users` collection.
- **`ev_user`**: Standard drivers looking for charging stations.
- **`owner`**: Charging station owners and operators.
- **`admin`**: Platform administrators with network-wide oversight.

### Global Routes (Public/Shared)
| Path | Component | Description |
| :--- | :--- | :--- |
| `/` | `Home` | Station discovery map and list view. |
| `/auth` | `Auth` | Login and Registration (User & Admin). |
| `/owner/signup` | `OwnerSignup` | Specialized registration for station owners. |
| `/owner/login` | `OwnerLogin` | Dedicated login for the owner portal. |
| `/setup` | `Setup` | Onboarding/initial configuration. |
| `/not-found` | `NotFound` | 404 error page. |

### 👤 EV User Routes
| Path | Component | Description |
| :--- | :--- | :--- |
| `/station/:id` | `StationDetail` | View station details, connectors, and initiate booking. |
| `/bookings` | `Bookings` | Active and past charging session history. |
| `/payment/:id` | `PaymentPage` | Checkout process for charging sessions. |
| `/charge/:id` | `ActiveCharge` | Real-time monitoring of an ongoing charging session. |
| `/receipt/:id` | `ReceiptPage` | Post-session summary and invoice. |
| `/user-profile` | `UserProfile` | Manage personal data and EV vehicles ("My Garage"). |
| `/settings` | `SettingsPage` | User preferences and notification toggles. |
| `/route-planning` | `RoutePlanning` | Trip planning with charging station waypoints. |

### 🏢 Owner Portal Routes
All owner routes are wrapped in an `OwnerLayout` providing a dashboard sidebar.
| Path | Component | Description |
| :--- | :--- | :--- |
| `/owner/dashboard` | `OwnerDashboard` | Real-time operational overview. |
| `/owner/stations` | `OwnerStations` | CRUD operations for charging stations. |
| `/owner/ledger` | `OwnerLedger` | Financial telemetry and payout management. |
| `/owner/reviews` | `OwnerReviews` | Monitoring and responding to user feedback. |
| `/owner/drivers` | `OwnerDrivers` | Analytics on frequent users at owned stations. |
| `/owner/promotions` | `OwnerPromotions` | Management of station-specific offers. |
| `/owner/notifications` | `OwnerNotifications` | Alerts for station faults or revenue milestones. |

### 🛡️ Admin Command Center
| Path | Component | Description |
| :--- | :--- | :--- |
| `/admin` | `Admin` | High-level telemetry, approvals, and user governance. |
| `/ml` | `MLPredictions` | Machine learning based occupancy and revenue forecasting. |
| `/stripe` | `StripePayments` | Admin-level Stripe integration monitoring. |

---

## 📦 Data Architecture (Firestore)

The core business logic is reflected in the following Firestore collection structure:

### 1. `users` (EV Drivers)
Stores profile information including `uid`, `email`, `role`, and notification settings.
- **Sub-collection `ev_vehicles`**: Stores vehicle details (Model, Battery Capacity, Connector Type).

### 2. `owners` (Partners)
Stores KYC details, business information, and payout configuration.
- **Sub-collection `alerts`**: Tracks operational issues (e.g., "Station Offline").
- **Sub-collection `payoutHistory`**: Logs all successful settlements to the owner's bank account.

### 3. `stations`
The central registry for charging locations.
- **Schema**: `id`, `name`, `location` (GeoPoint), `status` (Active/Maintenance/Pending), `pricing`, `connectors` (Array of connector objects).

### 4. `bookings`
Tracks the lifecycle of a charging session.
- **Status Flow**: `created` → `confirmed` → `in_progress` → `completed` / `cancelled`.

### 5. `notifications`
Global notification engine storing messages for users and owners.

### 6. `auditLogs`
Immutable records of administrative actions for security and compliance.

---

## ⚡ Core Functionality Implementation

### 1. Booking & Charging Flow
The platform implements a real-time charging simulator:
- **Initialization**: Triggered via `StationDetail` by creating a `booking` document.
- **Payment Verification**: `PaymentPage` updates `paymentStatus` to `completed`.
- **Session Simulation**: `ActiveCharge` uses a client-side timer to simulate energy delivery based on the station's kW output, updating the Firestore document every 30 seconds.

### 2. Financial Logic
- **Automated Payouts**: The platform calculates a 5% commission on every transaction.
- **Ledger Tracking**: `OwnerLedger` aggregates data from the `bookings` collection to show "Net Earnings" and "Pending Payouts" in real-time.

### 3. Real-Time Telemetry
Admins and Owners see a **Live Heartbeat** stats card. This is implemented using Firestore `onSnapshot` listeners filtering for `bookings` with an `in_progress` status.

---

## 🚀 Future Roadmap & Best Practices

- **Security Rules**: Always ensure `firestore.rules` are tested when adding new collections.
- **Performance**: Use Firestore indexes for complex queries involving `where` clauses on multiple fields (e.g., Filtering stations by status and owner).
- **Scale**: Offload intensive calculations (like monthly revenue aggregation) to Firebase Cloud Functions for performance.

*© 2026 SeniorDevOps Project Documentation*
