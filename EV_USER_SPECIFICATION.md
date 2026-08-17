# EV User (Driver) - Platform Specification & Guide

This document provides a comprehensive overview of the **EV Driver** experience, detailing the features implemented to streamline the charging lifecycle.

---

## 🚗 Core EV User Features

### 1. Digital Garage (My EV Vehicles)
The Digital Garage is the central hub for managing EV profiles. It allows users to:
*   **Add/Edit/Delete Vehicles**: Track multiple EVs in a single account.
*   **Automated Matching**: The system auto-detects **Connector Types** (CCS, Type 2, CHAdeMO) based on the brand and model selected (e.g., Tata Nexon EV defaults to CCS).
*   **Primary Vehicle**: Mark a specific EV as 'Primary' for quick booking and range estimation.
*   **Vehicle Metadata**: Store battery capacity (kWh), registration year, and license plate for official records.

### 2. Smart Booking & Discovery
*   **Live Map**: Find nearby charging stations with real-time status (Available, Occupied, Maintenance).
*   **Reservation System**: Secure a charging slot in advance to ensure availability on arrival.
*   **Station Details**: Detailed view of station amenities, pricing, connector health, and user reviews.

### 3. Active Charging Monitoring
*   **Live Sessions**: Real-time energy delivery (kWh) and cost tracking during the session.
*   **Remote Control**: Start/Stop charging directly from the mobile app (Simulated via Firebase status).

### 4. Gamification & Sustainability
*   **Milestones**: Users earn badges for:
    *   `First Charge`: Completion of the first session.
    *   `Eco Warrior`: Saving > 50kg of CO₂.
    *   `Lightning`: Consuming > 100kWh of energy.
*   **CO₂ Impact**: Real-time calculation of environmental savings (kWh * 0.708 kg CO₂/kWh).

---

## 📊 Information Architecture (What we add)

The platform maintains a robust data model to power the driver experience:

### User Profile Data (`users` collection)
*   `uid`: Unique Firebase Auth identifier.
*   `name` & `photoURL`: Basic identity.
*   `role`: Set to `ev_user`.
*   `primaryVehicleId`: Reference to the default EV in the garage.
*   `settings`: Notification preferences (Booking, Charging, Price Drops).

### Vehicle Data (`ev_vehicles` sub-collection)
*   Each user has an `ev_vehicles` sub-collection containing:
    *   `brand` & `model`: Vehicle identity.
    *   `batteryCapacity`: Used for range estimation in routing.
    *   `chargeType`: Ensures compatibility with station connectors.
    *   `licensePlate`: For station-side identification.

### Transactional Intelligence (`bookings` collection)
*   Records of every session including `energyDeliveredKwh`, `totalCost`, `status` (completed/failed), and `timeStarted`.

---

## 🗺️ Routing & Navigation

The platform includes a dedicated **Route Planning** conceptual engine (`route-planning.tsx`) designed for long-distance travel.

### 1. Smart Trip Planner
*   **Input**: User specifies Start and Destination locations.
*   **Battery-Aware Routing**: The system calculates the total distance and compares it against the **Primary Vehicle's battery capacity**.
*   **Charging Stops**: Automatically suggests optimal charging stations along the route to minimize total trip time (considering both driving and charging).
*   **Total Journey Time**: Displays predicted arrival time including charging duration.

### 2. Technical Stack (Proposed)
*   **Mapping**: Leaflet with OpenStreetMap for a zero-cost, high-performance map interface.
*   **Routing API**: integration with **OpenRouteService** for distance calculation and turn-by-turn navigation data.
*   **Geolocation**: Real-time user position tracking via Google Browser Geolocation API.

---

## 🔗 Related Technical Information

### 💰 Payment Ecosystem
*   **UPI Deep-linking**: Seamless transition to payment apps like GPay or PhonePe via `upi://pay` URI schemes.
*   **Razorpay Integration**: Simulation of the payment lifecycle (Created → Paid → Captured) using Razorpay's test mode.

### 🔔 Messaging & Notifications
*   **Session Alerts**: Push notifications for 'Charging Started', '80% Charged', and 'Session Complete'.
*   **Proximity Alerts**: Notifications when a booked station is within 5km of the user's location.

### 🛡️ Security & Privacy
*   **Firestore Rules**: Strict security policies ensure that users can only read/write their own vehicle data and booking history.
*   **Privacy Toggles**: Options to enable/disable location sharing for station discovery.

---
*Documentation prepared for SeniorDevOps EV Charging Platform - 2026*
