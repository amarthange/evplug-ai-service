# EV Charging Station System - Project Documentation

This document provides a comprehensive overview of the features, data architecture, user roles, and system integrations implemented in the SeniorDevOps project.

## 1. Features Implemented

The application is a full-stack SaaS platform for EV charging discovery and management.

### User Features (EV Owners)
- **Interactive Map Interface**: Integrated Mapbox GL JS for real-time station discovery with dynamic markers representing availability.
- **Advanced Search & Filtering**: Locate stations by address, name, or connector types.
- **Detailed Station Profiles**: Access to connector specs (Power, Type, Pricing), amenities, and real-time status.
- **Smart Booking System**: Time-slot based booking with a **10-minute session lock** to prevent double booking.
- **Booking Management**: View upcoming, active, and past charging sessions.
- **User Profiles & Garage**: Manage personal details and register multiple EV models with specific battery/connector requirements.
- **Review System**: Grade stations and leave feedback for the community.
- **Route Planning**: Plan trips with charging stop recommendations.
- **Real-time Notifications**: Updates on booking status and session completions.

### Owner Features (Station Managers)
- **Station Dashboard**: Manage multiple charging locations from a single interface.
- **CRUD Operations**: Add, Edit, or Delete charging stations and their specific connectors.
- **Asset Management**: Upload and manage station images via Firebase Storage.
- **Revenue Tracking (Ledger)**: View earnings and transaction history.
- **Status Control**: Toggle station status between *Active*, *Maintenance*, or *Pending Approval*.

### Admin Features
- **Global Management**: Oversee all users and stations.
- **Approval Workflow**: Review and approve new stations submitted by owners before they appear on the public map.

### System-wide Features
- **Multimodal Authentication**: Support for Email/Password and Google OAuth.
- **Real-time Synchronization**: Live updates for station availability without page refreshes.
- **AI Integration**: Predictive availability modeling based on telemetry data.
- **Dark Mode**: Premium glassmorphic UI with full dark/light theme support.

---

## 2. Data Implementation & Usage

The system follows a reactive data model centered around **Firebase Firestore** and **Zod** for schema validation.

### Data Models (Schemas)
| Model | Fields | Usage |
| :--- | :--- | :--- |
| **User** | `uid`, `email`, `role`, `displayName`, `phoneNumber` | Identity and access control. |
| **Station** | `id`, `ownerId`, `name`, `location (lat/lon)`, `connectors[]`, `status`, `images[]` | The core entity for discovery. |
| **Booking** | `id`, `userId`, `stationId`, `connectorId`, `startTime`, `status`, `totalPrice` | Transactional data for sessions. |
| **Telemetry** | `timestamp`, `stationId`, `occupied_slots`, `total_slots` | Real-time sensor data for ML predictions. |
| **Review** | `stationId`, `userId`, `rating`, `comment` | Community feedback data. |

### Data Usage by Page
| Page | Data Sources | Primary Logic |
| :--- | :--- | :--- |
| `home.tsx` | Firestore (`stations`) | Subscribes to all 'active' stations to render markers on Mapbox. |
| `station-detail.tsx` | Firestore (`stations`, `reviews`, `bookings`) | Fetches station specifics and checks real-time connector availability. |
| `owner-dashboard.tsx`| Firestore (`stations` where `ownerId == auth.uid`) | Real-time list of owner property status and earnings summaries. |
| `bookings.tsx` | Firestore (`bookings` where `userId == auth.uid`) | Displays personal session history and active timers. |
| `payment.tsx` | Backend API (`/api/bookings`) | Validates booking lock and processes simulated payment session. |
| `settings.tsx` | Firestore (`userProfile`) | Manages user metadata and EV vehicle registry. |

---

## 3. User Roles & Data Partitioning

Data is segmented using Firebase Authentication and Firestore Security Rules to ensure privacy and security.

### User Role Determination Logic
The application employs a cascading check in the `AuthContext` to determine roles during the session initialization:
1.  **Check `owners` collection**: If the `uid` exists in the `owners` collection, the user is assigned the **STATION_MANAGER** role.
2.  **Check `users` collection**: If not an owner, it checks the `users` collection for an `admin` flag.
3.  **Default Role**: If neither is found, the user defaults to the **General USER (ev_user)** role.

### Permissions Matrix
- **General USER**:
   - **Access**: Read active stations, create bookings, read/write own profile and reviews.
   - **Isolation**: Cannot see other users' personal bookings or access owner-specific station metadata.
- **STATION_MANAGER (Owner)**:
   - **Access**: Full CRUD on stations they own (`ownerId` check). Read bookings related to their stations.
   - **Isolation**: Restricted to their own properties; cannot modify stations owned by others.
- **ADMIN**:
   - **Access**: Global read/write across all collections. Used for station approvals and platform maintenance.

---

## 4. Connectivity & Integration

The system employs a hybrid architecture for maximum performance and security.

### Firebase Integration (Frontend-to-Cloud)
- **Auth SDK**: Direct connection for instant login/logout states.
- **Firestore SDK**: Uses `onSnapshot` for real-time, low-latency UI updates (e.g., a station turning 'Occupied' instantly changes color on the map).
- **Storage SDK**: Direct upload of high-resolution images with client-side progress tracking.

### Backend Integration (Node.js/Express)
The backend acts as a **Trusted Proxy** for operations requiring server-side authority:
- **Booking Lock Logic**: When a user selects a slot, the backend writes a `lockExpiresAt` timestamp to prevent race conditions.
- **Payment Processing**: Integrates with Stripe (simulated) to ensure funds are verified before finalizing a booking.
- **ML Proxy**: Forwards telemetry data to the Python ML service and returns refined predictions to the frontend.

### AI/ML Service Connectivity
- **Service**: Python FastAPI running a LightGBM model.
- **Flow**: Frontend -> Express API -> Python ML Service -> Redis/Memory Cache -> Response.
- **Purpose**: Analyzes historical `telemetry` records to predict future station occupancy.

### External Integrations
- **Mapbox GL JS**: Map rendering and geocoding.
- **Google Fonts & Lucide**: Premium typography and iconography.
- **FastAPI**: Specialized microservice for heavy data processing.

## 5. Authentication & Onboarding Flow

The platform employs a secure, multi-stage authentication process designed to minimize friction while ensuring data integrity.

### Sign-Up & Sign-In Implementation
- **Authentication Providers**: Support for Email/Password and Google OAuth via Firebase Auth.
- **Persistence**: "Remember Me" logic uses `setPersistence(browserLocalPersistence)` to maintain sessions across browser restarts.
- **Security Features**:
    - **Password Strength**: Real-time evaluation (8+ chars, Case sensitivity, Numbers, Special chars).
    - **Session Tracking**: Every sign-in logs `lastLoginAt`, `lastLoginDevice` (Browser/OS), and `deviceType` to the user's Firestore document.
    - **Account Recovery**: Self-service "Forgot Password" flow via automated Firebase reset emails.

### Post-Auth Routing Logic
- **New Users**: Upon first sign-up, the `AuthContext` detects missing profile data and redirects the user to `/complete-profile`.
- **Returning Users**: Standard sign-in redirects to the **Home Page ( / )** or the previously intended route (via `useLocation` state).
- **Session Restoration**: On page load, if a valid session exists but profile data is incomplete, the user is forced back to the onboarding wizard.

### 3-Step Onboarding Wizard (`/complete-profile`)
1. **Identity**: Full Name and Phone (Indian format validation: `/^[6-9]\d{9}$/`). Avatar upload to `users/{uid}/avatar.jpg`.
2. **Digital Garage**: (Optional) Brand, Model, and Battery Capacity. Data is stored in `users/{uid}/ev_vehicles/`.
3. **Preferences**: Default City, Search Radius (5-50km), and Push Notification toggles.

### Partner Onboarding Flow (`/owner/complete-business-profile`)
Station owners undergo a specialized business verification process:
1. **Business Identity**: Legal Name, Support Phone, and Business Type (Proprietorship, Ltd, etc.).
2. **Financial Setup**: UPI ID for settlements, and optional Business Logo/Payment QR upload to `owners/{uid}/`.
3. **Completion**: Upon finalization, `hasCompletedBusinessProfile` is set to `true`, unlocking the full Partner Dashboard.

---

## 6. Security Architecture & Rules

The system's security is enforced at both the application level and the database level.

### Authentication Security
- **Attempt Tracking**: Enforces a **5-attempt limit** before client-side lockout.
- **Lockout Mechanism**: A 5-minute cooldown period is enforced via `localStorage` on repeated failures.
- **Audit Logging**: Suspicious login activity (reaching the attempt threshold) triggers a high-severity audit log in the `auditLogs` Firestore collection.
- **Session Persistence**: Users can choose between `browserLocalPersistence` (Remember Me) and `browserSessionPersistence` for session security.

### Firestore Security Rules
- **User Profiles**: Users can only `write` to their own document (`request.auth.uid == userId`). Admins have global access.
- **Vehicle Data**: Read/Write access is restricted to the owner of the `ev_vehicles` sub-collection.
- **Stations**:
    - **Read**: Public access for `approved` stations.
    - **Write**: Restricted to `STATION_MANAGER` (only for stations they own) or `ADMIN`.
- **Bookings**: Users can only read their own bookings. The backend proxy handles the creation of the 10-minute session lock.

### Core Methods & Backend Functions
- **`syncToFirestore`**: Background method in `active-charge.tsx` for atomic telemetry updates.
- **`handleDownloadData`**: Utility in `settings.tsx` that compiles user data (Garage + History) into a secure JSON export.
- **`lockBooking` (Server-side)**: A trusted backend function that validates station availability and sets the `lockExpiresAt` timestamp before the client proceeds to payment.

---
*Documentation generated for SeniorDevOps Project - April 2026*
