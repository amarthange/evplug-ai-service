# SeniorDevOps EV Charging Platform — Technical Master Reference

This document serves as the definitive technical reference for the SeniorDevOps EV Charging Platform. It covers the system architecture, codebase structure, data models, and deployment configurations to provide a comprehensive understanding for developers and AI assistants.

---

## 1. System Architecture

The platform follows a **Hybrid Microservices-Monolith** approach, leveraging cloud-native services for real-time capabilities and a dedicated backend for authoritative logic.

### High-Level Component Overview
- **Frontend (Client)**: A React-based Single Page Application (SPA) that communicates directly with Firebase for real-time data and with the Express API for secure transactions.
- **Backend (Server)**: A Node.js/Express proxy that handles booking locks, payment simulation, and serves as a gateway to the ML service.
- **ML Service**: A Python FastAPI microservice running LightGBM models for predictive station availability.
- **Database (Firestore)**: A NoSQL real-time database serving as the source of truth for stations, bookings, and user profiles.
- **Telemetry Simulator**: A Python script that generates synthetic station occupancy data to feed the ML models and live dashboard.

### Communication Flow
1.  **Real-time Discovery**: Frontend $\leftrightarrow$ Firestore (via SDK `onSnapshot`).
2.  **Authoritative Actions**: Frontend $\rightarrow$ Express API $\rightarrow$ Firestore (Admin SDK).
3.  **Predictions**: Frontend $\rightarrow$ Express API $\rightarrow$ Python ML Service.
4.  **Deployment**: Firebase Hosting (Frontend) + Google Cloud Run/Functions (Backend).

---

## 2. Codebase Structure

```text
├── client/                 # React Frontend (Vite)
│   ├── src/
│   │   ├── components/     # UI Components (shadcn/ui + custom)
│   │   │   ├── owner/      # Station Manager specific components
│   │   │   ├── admin/      # Platform Administrator components
│   │   │   └── ui/         # Base UI primitives
│   │   ├── pages/          # Route-level components
│   │   ├── lib/            # Utilities (Firebase, Auth, Scheduler logic)
│   │   ├── hooks/          # Custom React hooks (useAuth, useMap)
│   │   └── App.tsx         # Routing and Provider setup
├── server/                 # Node.js/Express Backend
│   ├── index.ts            # Server entry point
│   ├── routes.ts           # API endpoint definitions
│   └── storage.ts          # Persistence layer interface (Firebase Admin)
├── shared/                 # Shared Logic & Types
│   └── schema.ts           # Zod schemas & TypeScript definitions
├── ml_service/             # Python ML Microservice
│   ├── main.py             # FastAPI entry point
│   ├── models/             # Trained LightGBM models
│   └── notebooks/          # Training and EDA notebooks
├── simulator/              # Telemetry Simulator
│   └── run_simulator.py    # Synthetic data generator
├── functions/              # Firebase Cloud Functions (Background tasks)
├── firebase.json           # Firebase configuration
└── firestore.rules         # Security rules for data access
```

---

## 3. Data Models (Zod Schemas)

The system uses **Zod** for end-to-end type safety between the frontend, backend, and database.

### Station
Core entity representing a physical charging location.
- **Status**: `active` | `pending` | `maintenance` | `rejected`
- **Connectors**: Array of `Connector` objects.
- **Maintenance**: `scheduledMaintenance` object for downtime tracking.

### Booking
Transactional record of a charging session.
- **Locking**: `holdExpiresAt` (10-minute window for payment completion).
- **Status**: `pending` | `confirmed` | `active` | `completed` | `cancelled`
- **Telemetry**: `energyDeliveredKwh`, `duration`, `totalPrice`.

### User Profile
- **Roles**: `ev_user` (General), `owner` (Station Manager), `admin` (Platform Admin).
- **Attributes**: `displayName`, `email`, `phoneNumber`, `vehicleGarage[]`.

---

## 4. Key Subsystems

### A. Smart Booking & Session Lock
- **Logic**: When a user selects a slot, the Express API creates a booking with a `holdExpiresAt` timestamp (now + 10 mins).
- **Enforcement**: Firestore rules and server-side checks prevent other users from booking the same connector while the lock is active.
- **Expiry**: Background jobs (or n8n automations) sweep expired `pending` bookings to free up slots.

### B. Maintenance Scheduler
- **Headless Coordinator**: `SchedulerMount.tsx` monitors active maintenance windows and triggers status transitions.
- **Atomic Updates**: Uses `arrayRemove` and `arrayUnion` for safe modification of maintenance arrays in Firestore.
- **Conflict Detection**: Queries the `bookings` collection before scheduling maintenance to alert owners of affected users.

### C. Predictive Availability (ML)
- **Model**: LightGBM regressor trained on historical telemetry.
- **Features**: Time of day, day of week, historical occupancy, and recent trends (last 60 mins).
- **Fallback**: Heuristic-based calculation if the ML microservice is unreachable.

---

## 5. Deployment Configuration

### Firebase Environment
- **Project ID**: Defined in `.firebaserc`.
- **Firestore**: Native Mode with regional deployment.
- **Auth**: Email/Password + Google OAuth enabled.

### Security Rules
- **Firestore**: Role-based access control (RBAC). Owners can only edit their own stations; users can only read their own bookings.
- **Storage**: Path-based security (`/stations/{id}/` and `/users/{uid}/`).

### API Configuration
- **Vite Proxy**: Configured in `vite.config.ts` to route `/api` requests to the local Express server during development.
- **Environment Variables**:
  - `VITE_FIREBASE_*`: Client-side Firebase credentials.
  - `FIREBASE_SERVICE_ACCOUNT`: Server-side admin credentials.
  - `ML_SERVICE_URL`: URL for the FastAPI microservice.

---

## 6. Automation & External Integrations
- **n8n Endpoints**: Special backend routes (`/automation/*`) allow external workflow tools to manage expired bookings and generate reports.
- **Mapbox**: Used for high-performance map rendering and geocoding.
- **Stripe (Simulated)**: Webhook endpoints in `routes.ts` handle payment confirmation flows.

---
*Generated for SeniorDevOps Platform - April 2026*
