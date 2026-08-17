# EV Charging Station - Feature Analysis & Improvement Roadmap

This document analyzes the current state of the Settings and Admin features against the proposed **23 targeted improvements**, categorizing them as **Already Implemented**, **Partially Implemented**, or **New Features**.

---

## 🚀 Feature Comparison Matrix

### 👤 EV USER Settings
| # | Feature | Status | Implementation Details |
| :--- | :--- | :--- | :--- |
| **1** | **My Garage (EV Vehicles)** | ❌ **New** | Requires a new `ev_vehicles` collection and a CRUD UI for Brand/Model/Battery. |
| **2** | **Preferred Connector Types** | ❌ **New** | Multi-select chips to save in the `users` Firestore document. |
| **3** | **More Notification Toggles** | ⚠️ **Partial** | Currently has `Booking` and `Charging` toggles. Needs 4 more (Station Alert, Price Drop, Session Complete, Weekly Summary). |
| **4** | **Default Payment Method** | ❌ **New** | Add `upiId` and `preferredMethod` fields to the user profile. |
| **5** | **Privacy & Data** | ❌ **New** | Location/Analytics toggles and a "Download Data" export button. |
| **6** | **Charging History Summary** | ❌ **New** | Read-only stat cards (Total sessions, kWh, CO₂ saved) calculated from the `bookings` collection. |

### 🏢 OWNER Settings
| # | Feature | Status | Implementation Details |
| :--- | :--- | :--- | :--- |
| **7** | **Business Logo Upload** | ❌ **New** | Support for logo upload (Base64 or Firebase Storage) for station cards. |
| **8** | **Operating Hours** | ❌ **New** | Day-wise grid system to be stored in the `owners` profile. |
| **9** | **Notification Prefs** | ❌ **New** | Specific toggles for New Bookings, Faulty Connectors, and Revenue milestones. |
| **10** | **Bank/Payout Details** | ❌ **New** | Fields for Account Name, Number, and IFSC for settlements. |
| **11** | **Auto-Pricing Rules** | ❌ **New** | Peak-hour multiplier logic (UI slider/input) saved to the owner profile. |
| **12** | **Vacation / Maintenace Mode** | ❌ **New** | Global toggle that sets all child stations' status to `Maintenance`. |

### 🔐 ADMIN Settings
| # | Feature | Status | Implementation Details |
| :--- | :--- | :--- | :--- |
| **13** | **Advanced Stat Cards** | ⚠️ **Partial** | `Revenue` and `Active Sessions` are done. `Pending Approvals` and `Avg Rating` are missing. |
| **14** | **User Management Table** | ✅ **Implemented** | List of users with "Block/Unblock" functionality exists in `admin.tsx`. |
| **15** | **Station Approval Queue** | ✅ **Implemented** | Tabs for "Owners" and "Stations" handle approvals of pending entries. |
| **16** | **Platform Announcements** | ❌ **New** | A banner system using a central `settings/global` Firestore document. |
| **17** | **Audit Log** | ❌ **New** | Capture actions like "Station Approved" in a dedicated `auditLogs` collection. |
| **18** | **Wipe Button Safety** | ⚠️ **Partial** | Uses a standard `confirm()`. Needs a "Type WIPE to confirm" modal dialog. |

### 🎨 UI/UX Improvements
| # | Feature | Status | Implementation Details |
| :--- | :--- | :--- | :--- |
| **19** | **Role Badges** | ✅ **Implemented** | Colored badges (EV User, Owner, Admin) are present in the header. |
| **20** | **Section Collapse/Expand** | ❌ **New** | Use Radix UI `Accordion` or custom state to handle long settings scrolls. |
| **21** | **Unsaved Changes Indicator** | ❌ **New** | Track `isDirty` state and show a floating banner if changes are unsaved. |
| **22** | **Save Confirmation Toast** | ✅ **Implemented** | Success/Error toasts are triggered on every save action. |
| **23** | **Settings Search Bar** | ❌ **New** | Keyword filtering across settings labels. |

---

## 💎 Free-Tier API Suggestions

To implement the roadmap without incurring costs, the following APIs and services are recommended:

### 1. Maps & Geolocation
*   **Leaflet + OpenStreetMap**: Completely free, no API key required. High flexibility but lacks some premium map styles.
*   **MapTiler**: Free tier (100k tiles/mo) - excellent for high-quality vectormaps if Mapbox limits are a concern.
*   **OpenRouteService**: Free routing API for **Route Planning** (Navigation/Distance) with 2,500 requests/day.

### 2. Payments (Testing & Simulation)
*   **UPI Deep-linking**: 100% free. Uses the `upi://pay` URI scheme to open installed payment apps (GPay, PhonePe) on mobile.
*   **Stripe (Test Mode)**: Unlimited free testing for Credit/Debit card flows.
*   **Razorpay (Test Mode)**: Best-in-class simulation for Indian payment methods (UPI, Netbanking) without real KYC.

### 3. Images & Storage
*   **Firebase Storage (Spark Plan)**: 5 GB of free storage. Ideal for logos and station photos.
*   **Cloudinary (Free Tier)**: 25 "Credits" (~25k image transformations). Great for auto-optimizing uploaded station images.

### 4. Communication & Notifications
*   **SendGrid (Free Plan)**: 100 emails/day. Good for **Weekly Summaries** and **New Booking Alerts**.
*   **Firebase Cloud Messaging (FCM)**: 100% free unlimited push notifications for "Session Complete" and "Station Available" alerts.

---

## 🛠️ Recommended Implementation Sequence

1.  **Quick Wins (UI/UX)**: Section collapse, Typed Wipe confirmation, and Unsaved changes banner.
2.  **Core Data (EV User/Owner)**: Implement **My Garage** and **Operating Hours** as these power actual business logic.
3.  **Retention (Notifications)**: Hook up basic FCM for session updates.
4.  **Governance (Admin)**: Add the **Audit Log** collection to track platform changes.

*Documentation prepared for SeniorDevOps Project - 2026*
