# EV User Platform - Technical Documentation & Analysis

This document provides a deep-dive technical analysis of the **EV Driver (User) Platform**, covering its implementation architecture, core features, routing logic, and the mathematical models driving the charging experience.

---

## 🏗️ 1. Technical Architecture

The platform is built on a modern, reactive stack designed for real-time operational feedback and cross-platform compatibility.

### Core Stack
*   **Frontend**: [React](https://reactjs.org/) + [Vite](https://vitejs.dev/) + [TypeScript](https://www.typescriptlang.org/).
*   **Styling**: [Tailwind CSS](https://tailwindcss.com/) with a custom Glassmorphic design system.
*   **State Management**: 
    *   **Server State**: [TanStack Query (React Query)](https://tanstack.com/query) for caching and data fetching.
    *   **Global State**: React Context API for `Auth`, `Theme`, and `Language`.
*   **Backend & Persistence**: [Firebase](https://firebase.google.com/) (Firestore, Authentication, Storage, Messaging).

### Data Flow Patterns
*   **Real-time Reactivity**: Uses Firestore `onSnapshot` listeners to update UI instantly when station status, bookings, or notifications change.
*   **Optimistic Updates**: Local state simulation during active charging to provide 1Hz feedback without overloading the network.
*   **Audit Logging**: Integrated `auditLogger` to track security events and critical user actions.

---

## 🚀 2. Core Features & Implementation

### 📍 Interactive Discovery (Map Interface)
*   **Engine**: [Mapbox GL JS](https://www.mapbox.com/mapbox-gl-js).
*   **Implementation**: Dynamic rendering of station markers based on real-time availability. 
*   **Logic**: Markers change color (Emerald: Active, Amber: Maintenance, Red: Offline) based on a reactive `status` field in Firestore.

### 🚗 Digital Garage (Vehicle Management)
*   **Schema**: Managed via a `ev_vehicles` sub-collection under the `users` document.
*   **Automation**: The platform auto-detects **Connector Types** (CCS2, Type 2, etc.) based on vehicle brand/model metadata to simplify the search process.
*   **Physics Data**: Vehicles must include `battery_capacity_kwh` (number) to drive the non-linear charging simulation.
*   **Data Portability**: Users can download a JSON export of their entire garage and booking history (`handleDownloadData` method).

### ⚡ Smart Booking System
*   **Transactional Integrity**: Uses a **10-minute session lock** (`lockExpiresAt`) written to Firestore via a trusted backend proxy to prevent race conditions.
*   **Waitlist Logic**: A dedicated `waitlist-service.ts` notifies users via Push Notifications when their preferred connector becomes available.

---

## 🗺️ 3. Routing & Navigation Structure

The platform employs a **Modular Routing Architecture** using `wouter` to separate User and Owner experiences.

### Navigation Logic
*   **Role-Based Layouts**: 
    *   **EV Drivers**: Use a mobile-first `BottomNav` for quick access to the Map, Bookings, and Settings.
    *   **Home ( / )**: Serves as the primary discovery hub.
*   **Decoupled Routes**: Owner routes (`/owner/*`) are isolated into an `OwnerRouter` with a dedicated sidebar layout, ensuring a clean separation of concerns and reduced bundle weight for drivers.

### Routing "Moved" Analysis
*   **Update**: Navigation was recently restructured from a global header-only approach to a **Context-Aware Navigation** system where the UI adapts its navigation bars (Header vs. BottomNav) based on the user's active role (`ev_user` vs. `station_manager`).

---

## 🔢 4. Algorithms & Mathematical Models

### 🔋 Charging Simulation Algorithm (Non-Linear)
Implemented in `active-charge.tsx` using a 1Hz numerical integration engine to model real-world battery behavior:
*   **Constant Power Phase**: Delivers rated `powerKw` until SoC reaches **80%**.
*   **Tapering Phase**: Above 80%, power intake throttles exponentially: `P_eff = P_rated * e^(-5 * (SoC - 0.8))`.
*   **Precision**: Calculation uses 1-second step intervals for accurate energy (kWh) and cost tracking.
*   **Auto-Stop Logic**: Sessions automatically terminate if the **Pre-paid Limit** (₹) is reached or the battery hits **100% SoC**.

### 🌍 Carbon Impact Model
The platform tracks environmental contributions using a standardized offset factor:
*   **Formula**: `Energy Delivered (kWh) * 0.82` = **kg CO₂ Offset**.
*   **Source**: Based on national average grid emissions displacement vs. internal combustion engines (ICE).

### 📍 Proximity Logic
*   **Radius**: 500 meters.
*   **Feedback**: Triggered via `navigator.vibrate` and Push Alerts when a user approaches their booked station, enhancing the "arrival" experience.

---

## 🛠️ 5. Key Methods & API Interactions

| Method | Component | Description |
| :--- | :--- | :--- |
| `onSnapshot` | `home.tsx` | Real-time subscription to station availability. |
| `syncToFirestore` | `active-charge.tsx` | Background sync of session telemetery every 5 minutes or on visibility change. |
| `handleDownloadData`| `settings.tsx` | Compiles and exports user profile, garage, and bookings to JSON. |
| `enrichConnectors` | `home.tsx` | Calculates live availability by subtracting active bookings from total counts. |

---

## 🤖 6. AI & Related Ecosystem

### AI Chatbot (Gemini Integration)
*   **Context-Aware**: The `UserChatbot` receives a rich `userContext` object containing the user's primary vehicle, current location, and upcoming bookings to provide personalized assistance.

### ML Availability Forecasting
*   **Model**: LightGBM (Python FastAPI).
*   **Output**: Predictive scores for station occupancy 1, 6, and 24 hours in advance, visible on the station detail page.

## 🔐 7. Auth & Onboarding Flow
The platform features a secure, multi-layered authentication and a premium 3-step onboarding experience.

### Authentication Features
*   **Password Security**: Real-time strength indicator with a dynamic checklist (8+ chars, uppercase, lowercase, numbers, special chars).
*   **Session Persistence**: "Remember Me" functionality using Firebase `setPersistence` logic to maintain sessions across browser restarts.
*   **Account Recovery**: Integrated "Forgot Password" modal using Firebase's built-in reset email triggers.
*   **Session Tracking**: Automatically saves device metadata (browser, type, OS) and `lastLoginAt` timestamps to Firestore on every successful sign-in.

### 3-Step Onboarding Wizard
1.  **Identity**: Collects Name, verified Indian Phone Number, and optional Avatar (stored in Firebase Storage). Syncs with both Firestore and Firebase Auth profiles.
2.  **Digital Garage (Optional)**: Allows users to add their first EV (Brand, Model, Battery, Connector) immediately, or skip to explore.
3.  **Preferences**: Configures default City, Search Radius (5-50km slider), and detailed Notification toggles (Bookings, Reminders, Price Alerts).
*   **Completion Celebration**: A high-energy fullscreen animation greets users upon successful setup before redirecting to the dashboard.

---
*Generated for SeniorDevOps EV Platform - April 2026*
