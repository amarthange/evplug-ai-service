# 🚗 EV User Platform - Master Documentation

This document serves as the definitive technical reference for the **EVPlugFinder EV User Platform**. It covers everything from high-level architecture to granular implementation details, including security protocols and data models.

---

## 🏗️ 1. Technical Architecture

The platform is designed as a reactive, mobile-first web application optimized for real-time operational feedback.

### Core Technology Stack
*   **Frontend**: [React 18](https://reactjs.org/) + [Vite](https://vitejs.dev/) + [TypeScript](https://www.typescriptlang.org/).
*   **Styling**: [Tailwind CSS](https://tailwindcss.com/) with a custom Glassmorphic design system for a premium feel.
*   **State Management**: 
    *   **Server State**: [TanStack Query v5](https://tanstack.com/query) for caching, synchronization, and efficient data fetching.
    *   **Global State**: React Context API for `Auth`, `Theme`, and `Language`.
    *   **Local Cache**: [IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API) via native API for offline session persistence.
*   **Backend**: [Firebase](https://firebase.google.com/) ecosystem.
    *   **Firestore**: Real-time NoSQL database.
    *   **Authentication**: Multi-provider identity management.
    *   **Functions**: Node.js backend triggers.
    *   **Messaging**: Firebase Cloud Messaging (FCM) for granular push alerts.

---

## 🚦 2. Routing & Navigation

The application uses `wouter` for lightweight routing, implemented in `App.tsx`.

### Primary User Routes
| Path | Component | Purpose |
| :--- | :--- | :--- |
| `/` | `Home` | Station discovery map and list view. |
| `/station/:id` | `StationDetail` | Deep-dive into station status and vehicle-aware booking. |
| `/bookings` | `Bookings` | Active sessions and offline-capable charging history. |
| `/charge/:id` | `ActiveCharge` | Live telemetry with non-linear SoC simulation. |
| `/route-planning`| `RoutePlanner` | Trip planning with battery simulation overlays. |

---

## 🚀 3. Core Features & Implementation

### 📍 Interactive Discovery (Mapbox)
*   **Micro-interactions**: Markers use pulse animations to indicate "Currently Available" status.
*   **Battery Planner Overlay**: Simulates battery SoC at each waypoint based on vehicle efficiency and route distance.

### 🚗 Digital Garage & Quick Switcher
*   **Vehicle Data**: Stored in `users/{uid}.ev_vehicles`.
*   **Quick Switcher**: Integrated directly into `StationDetail`, allowing users to swap active vehicles during the booking flow without leaving the page.

### ⚡ Smart Booking & NFC Check-in
*   **Session Locking**: 10-minute temporary lock in Firestore to prevent double-bookings.
*   **Web NFC Fallback**: Proximity-based check-in using NDEF tags (`volthub-station:{id}`). Provides a robust fallback when QR scanning fails in low-light environments.

### 📊 Session Share Engine
*   **Implementation**: Canvas-based generation of high-fidelity (800x1400px) share cards.
*   **Capabilities**: Summarizes energy delivered, CO2 offset, and cost with a dark glassmorphic aesthetic for social sharing.

---

## 🛠️ 4. Methods & Offline Intelligence

### Key Frontend Utilities
| Method | Location | Description |
| :--- | :--- | :--- |
| `readNFCTag` | `nfc-reader.ts` | Interfaces with `NDEFReader` for hardware-level station check-in. |
| `cacheSession` | `session-cache.ts` | Atomically stores session history in IndexedDB for offline access. |
| `simulateBattery`| `battery-planner.ts` | Computes estimated SoC at waypoints using consumption curves. |
| `handleQRCheckIn`| `scan-qr.tsx` | Resolves bookings via either QR (Booking ID) or NFC (Station ID). |

### 📶 Offline Persistence
*   **Database**: `volthub-sessions-db` (IndexedDB).
*   **Logic**: When the user is offline, the `Bookings` page automatically hydrates from the local cache, displaying the `OfflineSessionBanner` and ensuring essential session data remains accessible.

---

## 🔐 5. Firebase Security Rules

Strict **Attribute-Based Access Control (ABAC)** in `firestore.rules`.

### Collection-Specific Rules
| Collection | Read Permission | Write Permission |
| :--- | :--- | :--- |
| `users` | Authenticated (Self) | Self (granular fields) / Admin (all) |
| `bookings` | Self / Owner / Admin | Self (create) / Owner/Admin (update) |
| `notifications`| Self Only | System Only (Cloud Functions) |

---

## 📊 6. Data Models (Firestore Schema)

### `users` Collection (Extended)
```json
{
  "settings": {
    "notifications": { 
      "sessionComplete": "boolean",
      "sessionStarted": "boolean",
      "lowBatteryReminder": "boolean",
      "promotions": "boolean"
    }
  },
  "ev_vehicles": [
    {
      "brand": "string",
      "efficiency_wh_km": "number",
      "batteryCapacity": "number",
      "connectorType": "string"
    }
  ]
}
```

---

## 🤖 7. AI & Integration Ecosystem

### 🧞 Gemini Intelligence (UserChatbot)
The **UserChatbot** is a multimodal AI assistant powered by Gemini 2.5 Flash.
*   **Dual-Mode Context**: 
    *   **EV User Mode**: Helps with troubleshooting, finding specific chargers (synced with `energyDeliveredKwh`), and calculating CO2 impact.
    *   **Owner Mode**: Provides business intelligence, revenue summaries, and peak load analysis.
*   **Voice Support**: Integrated Web Speech API for hands-free "Plan my route" or "Check station status" commands.
*   **Context Awareness**: Receives real-time telemetry (SoC, location, active vehicle) to provide hyper-relevant suggestions.
*   **Stability Fixes**:
    *   Migrated to stable Gemini 2.5-flash to resolve message truncation issues.
    *   Corrected system prompts to ensure complete sentence delivery.
    *   Fixed data synchronization for charging statistics by mapping correct Firestore fields.

### 📈 ML Forecasting
*   **Occupancy Prediction**: Predicts station availability up to 24h ahead based on historical session patterns.
*   **Revenue Forecasting**: Automated projection of monthly earnings for station managers.

---
*Last Updated: May 2026 for SeniorDevOps EVPlugFinder Platform*
