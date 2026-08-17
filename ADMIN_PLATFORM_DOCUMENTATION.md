# Admin Platform — Comprehensive Technical Documentation
> **EVPlugFinder EV Charging Platform | Admin Module**  
> Last Updated: May 2026

---

## 1. Architecture Overview

The Admin Platform is a role-gated operational command centre built as part of the EVPlugFinder monorepo. It provides platform administrators with full visibility and control over the EV charging ecosystem.

### 1.1 Technology Stack

| Layer | Technology | Purpose |
|:---|:---|:---|
| **Frontend** | React 18 + TypeScript (Vite) | SPA with strict type safety |
| **Routing** | Wouter (`useLocation`) | Client-side navigation |
| **Database** | Firebase Firestore | Primary data store |
| **Auth** | Firebase Authentication + RBAC | Role-based access control |
| **Styling** | Tailwind CSS + Shadcn UI | Component library |
| **Charts** | Recharts | Data visualisation |
| **Date Utils** | `date-fns` | Formatting & range calculations |

### 1.2 Data Sync Model

The admin panel uses a **Hybrid Sync Model** to balance real-time needs against cost:

```
Real-time (onSnapshot)  →  Active Sessions, Support Tickets, Live Stats
Batch Hydration         →  Revenue, Users, Owners, Bookings
Atomic Writes           →  writeBatch for bulk station approvals / ticket resolution
```

### 1.3 System Architecture Diagram

```
Browser (Admin)
    │
    ├─── Firebase Auth (token validation + role check)
    │
    ├─── Firestore SDK
    │       ├── onSnapshot listeners  (bookings, supportTickets, maintenanceWindows, announcements)
    │       ├── getDocs batch reads   (users, owners, stations, reviews, analytics)
    │       └── writeBatch writes     (bulk approvals, bulk ticket resolution)
    │
    ├─── Express Backend (via fetch)
    │       └── /api/*  (booking lock, payment proxy, ML proxy)
    │
    └─── Python ML Service (FastAPI)
            └── Occupancy predictions, Anomaly scoring
```

---

## 2. Routing & Page Map

```
/admin               →  AdminPanel        (Primary dashboard)
/admin/support       →  AdminSupport      (Helpdesk & ticket management)
/admin/reports       →  AdminReports      (Revenue analytics & payouts)
/admin/settings      →  AdminSettings     (Global configuration)
/admin/audit-logs    →  AdminAuditLogs    (Compliance & immutable log viewer)
/admin/analytics     →  Analytics         (Sub-page analytics component)
/admin/ml-monitoring →  AdminMLMonitoring (Model health & performance)
/admin/predictive-maintenance → AdminPredictiveMaintenance (Network health & risk scoring)
/admin/fraud-detection → AdminFraudDetection (Pattern matching & risk scoring)
/admin/customer-satisfaction → AdminSatisfaction (CSAT/NPS tracking)
/admin/data-management → AdminDataManagement (Bulk import/export tools)
/admin/activity → AdminActivity (Real-time session monitoring)
/admin/notification-settings → AdminNotificationSettings (System-wide alerts)
/admin/capacity-planning → AdminCapacityPlanning (Growth forecasting)
/admin/ab-tests → AdminABTests (Conversion optimization)
/admin/benchmarks → AdminBenchmarks (Industry comparison)
```

### 2.1 Route Guards

Every admin page enforces the following guard at the top of the component:

```tsx
// Pattern used in ALL admin pages
if (!authLoading && userRole !== "admin") {
  setLocation("/");
  return null;
}
```

The `userRole` is resolved by `AuthContext` using a cascading check:
1. Check `owners/{uid}` — assigns `STATION_MANAGER`
2. Check `users/{uid}.role === "admin"` — assigns `ADMIN`
3. Default → `ev_user`

---

## 3. Features & Implementation

### 3.1 Primary Dashboard (`admin.tsx`)

#### KPI State Management

```tsx
const [stats, setStats] = useState({
  totalStations, totalUsers, totalOwners,
  totalBookings, activeBookings,
  pendingStations, unapprovedOwners
});

const [analytics, setAnalytics] = useState({
  totalRevenue, bookingTrends, paymentSuccess,
  paymentFailure, totalEnergy, peakLoad,
  estimatedMonthEnd, cancellationLoss,
  hourlyRevenueData, revenueByConnectorData
});
```

#### Live Session Monitor (onSnapshot)

```tsx
// Real-time active/confirmed bookings stream
onSnapshot(
  query(collection(db, "bookings"), where("status", "in", ["active", "confirmed"])),
  snap => setActiveSessions(snap.docs.map(d => ({ id: d.id, ...d.data() })))
);

// Real-time support ticket stream
onSnapshot(collection(db, "supportTickets"), snap =>
  setTickets(snap.docs.map(d => ({ id: d.id, ...d.data() })))
);
```

#### Session Security Timeout

```tsx
const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes

// Tracks: mousedown, keydown, scroll, touchstart
// Checks every 60 seconds → triggers warning modal on inactivity
```

#### Admin Session Audit Log

Every admin dashboard load writes to `audit_logs`:
```tsx
await addDoc(collection(db, "audit_logs"), {
  action: "ADMIN_SESSION_STARTED",
  severity: "LOW",
  performedBy: user.uid,
  performedByEmail: user.email,
  targetType: "system",
  metadata: { userAgent, timestamp },
  timestamp: serverTimestamp()
});
```

---

### 3.2 Platform Health Score — `calculatePlatformHealth()`

A weighted composite score (0–100) computed entirely client-side from loaded data:

| Check | Deduction | Trigger |
|:---|:---|:---|
| Booking success rate < 90% | Up to 72pts | `(completed/total) < 0.9` |
| Pending station backlog > 3 | Up to 15pts | `stations.filter(pending).length > 3` |
| Blocked user ratio > 5% | 10pts | `blocked/total > 0.05` |
| Maintenance ratio > 20% | Variable | `maintenance/total > 0.2` |
| Platform rating < 4.0 | 8pts | `avgRating < 4.0` |
| Open tickets > 5 | 5pts | `openTicketsCount > 5` |

**Grade Scale:** A+ (≥95) | A (≥90) | B (≥80) | C (≥70) | D (≥60) | F (<60)

**Health Snapshot Persistence:**
```tsx
// Saves once per day to adminMetrics/health_{yyyy-MM-dd}
await setDoc(doc(db, "adminMetrics", `health_${today}`), {
  date, score, grade, issueCount, savedAt: serverTimestamp()
});
```

**7-Day History:** Loads last 7 daily snapshots to compute trend (Improving / Stable / Declining).

---

### 3.3 Anomaly Detection Engine — `detectAnomalies()`

Runs on mount and every 10 minutes via `setInterval`. Checks 11 patterns:

| # | Type | Trigger | Severity |
|:---|:---|:---|:---|
| 1 | `CANCELLATION_SPIKE` | Cancel rate > 40% in last 1hr | HIGH |
| 2 | `RAPID_BOOKINGS` | >3 bookings from 1 UID in 10min | HIGH |
| 3 | `REVENUE_DROP` | MoM revenue decline > 30% | MEDIUM |
| 4 | `APPROVAL_BACKLOG` | Pending stations > 5 | MEDIUM |
| 5 | `HIGH_MAINTENANCE_RATE` | >30% stations in maintenance | CRITICAL |
| 6 | `ZERO_REVENUE_STATIONS` | Active station, 0 bookings in 7 days | MEDIUM |
| 7 | `CONNECTOR_FAULT_PATTERN` | Station with ≥3 low ratings in 24hr | HIGH |
| 8 | `PAYMENT_FAILURE_SPIKE` | Payment failure rate >20% in 1hr | CRITICAL |
| 9 | `DUPLICATE_STATIONS` | 2+ stations at same coordinates (3dp) | MEDIUM |
| 10 | `INACTIVE_OWNERS` | Owner registered 30+ days, 0 stations | LOW |
| 11 | `SESSION_OVERSTAY` | Active booking >30min past end time | MEDIUM |

---

### 3.4 Analytics Engine

Triggered on `selectedDateRange` change. Date ranges: `7d | 30d | 90d | all`.

**Metrics Computed:**
- `totalRevenue` — sum of paid, valid-status bookings in range
- `totalEnergy` — sum of `energyDeliveredKwh`
- `bookingTrends` — daily booking count map
- `peakLoad` — max `connectorPowerKw` sum in any single hour (last 24h)
- `estimatedMonthEnd` — `(revenueToDate / dayOfMonth) * totalDaysInMonth`
- `peakRevenueHour` — hour with highest revenue in last 24h
- `cancellationLoss` — sum of cancelled booking prices
- `revenueByConnectorData` — Fast / Rapid / Standard breakdown
- `ownerRevenueMap` — per-owner revenue attribution
- `hourlyRevenueData` — 24-hour array for sparkline chart

---

### 3.5 Station Approval Workflow

#### States
`pending → active | rejected`

#### Bulk Approval (writeBatch)
```tsx
const batch = writeBatch(db);
selectedForApproval.forEach(stationId => {
  batch.update(doc(db, "stations", stationId), {
    status: "active",
    approvedAt: serverTimestamp(),
    approvedBy: user.uid
  });
});
await batch.commit();
```

#### SLA Tracking — `getPendingDuration()`
```tsx
// Returns { label: "2d", urgent: true } if waiting >= 2 days
const hoursWaiting = (Date.now() - created.getTime()) / 3600000;
return { label: `${daysWaiting}d`, urgent: daysWaiting >= 2 };
```

#### Rejection Modal
Predefined reasons:
- Incomplete business information
- Invalid or unverifiable address
- Poor quality images
- Pricing appears incorrect
- Duplicate station nearby
- Connector specifications incomplete
- Operating hours not provided
- UPI payment details missing
- Custom reason (free text)

---

### 3.6 User & Owner Management

| Action | Firestore Operation | Audit Log |
|:---|:---|:---|
| Block user | `updateDoc(users/{uid}, { blocked: true })` | `USER_BLOCKED` / HIGH |
| Unblock user | `updateDoc(users/{uid}, { blocked: false })` | `USER_UNBLOCKED` / HIGH |
| Verify owner | `updateDoc(owners/{uid}, { verified: true })` | `OWNER_VERIFIED` / HIGH |
| Suspend owner | `updateDoc(owners/{uid}, { suspended: true })` | `OWNER_SUSPENDED` / HIGH |

**Block cascade:** Blocking a user triggers cancellation of all their active bookings.

---

### 3.7 Support Tickets (`admin-support.tsx`)

#### Auto Priority Assignment — `autoAssignPriority()`

NLP-lite keyword scan on `subject + message`:
```
HIGH   → "urgent", "emergency", "broken", "fraud", "payment failed", "station down", "hack"
MEDIUM → "delayed", "payout", "billing", "complaint", "refund", "dispute"
LOW    → (default)
```

#### SLA Limits by Priority

| Priority | SLA Limit | Warning Threshold |
|:---|:---|:---|
| High | 4 hours | 3.2 hours (80%) |
| Medium | 24 hours | 19.2 hours |
| Low | 72 hours | 57.6 hours |

#### Ticket Resolution Flow
```tsx
// 1. Validate admin response exists
// 2. updateDoc(supportTickets/{id}, { status: "resolved", adminResponse, resolvedAt })
// 3. addDoc(notifications, { userId: owner, type: "SUPPORT_RESPONSE" })
// 4. addDoc(audit_logs, { action: "SUPPORT_TICKET_RESOLVED" })
```

#### Bulk Operations (writeBatch)
- **Mark Resolved** — sets `status: "resolved"` + `resolvedAt`
- **Mark In Progress** — sets `status: "in_progress"` + `assignedTo`
- **Close Stale** — sets `status: "resolved"` + `closedBy: "bulk_admin_action"`

#### Auto-Close (7-Day Rule)
```tsx
// Runs when tickets.length changes
// Auto-closes tickets with no update in 7 days
// closedBy: "auto_close_7_days"
```

#### Internal Admin Notes
Private notes stored in `supportTickets/{id}.internalNotes[]`:
```tsx
{ text, addedBy: user.email, addedAt: ISO string, internalOnly: true }
```

#### Response Templates
Predefined quick-fill templates: Acknowledge | Payout Delay | Station Issue | Technical Support | Resolved

---

### 3.8 Reports (`admin-reports.tsx`)

#### Available Report Types
| ID | Title | Description |
|:---|:---|:---|
| `monthly_revenue` | Monthly Revenue Report | Earnings, payouts, commission |
| `station_performance` | Station Performance | Utilisation rates, top performers |
| `user_activity` | User Activity Report | Registrations, retention |
| `network_health` | Network Health Report | Uptime, faults, kWh delivered |

#### `generateReport()` — Data Pipeline
```
1. Parallel fetch: stations, owners, users, bookings (getDocs)
2. Filter to selected month (startOfMonth / endOfMonth)
3. Filter: paymentStatus === "paid" && status in [confirmed, active, completed]
4. Compute: totalRevenue, platformCommission (5%), ownerPayouts (95%)
5. Build: stationStats, userRetentionCohorts, waterfallSegments
```

#### Revenue Waterfall — `calculateWaterfall()`
```
Gross Revenue → (−) Owner Payouts (95%) → (−) Refunds → Net Platform Earnings
```
Rendered as stacked `ComposedChart` (Recharts).

#### Owner Payout Ledger — `calculateOwnerPayouts()`
Per-owner breakdown: grossRevenue, platformFee (5%), netPayout (95%), sessionCount, stationCount, UPI status.

#### Payout Processing — `markAsPaid()`
```tsx
// Writes to owners/{ownerId}/payoutHistory/{month}
await setDoc(doc(db, "owners", ownerId, "payoutHistory", monthKey), {
  month, grossRevenue, platformFee, netPayout,
  status: "paid", paidAt: serverTimestamp(), paidBy: user.uid, upiId
});
// Logs: PAYOUT_PROCESSED / HIGH to audit_logs
```

#### Export
- **CSV Export** — Owner payout data downloads as `owner-payouts-{month}.csv`
- **Print PDF** — `window.print()` with print-optimised CSS (`@media print`)

#### User Retention — `calculateRetention()`
Cohort-based analysis: groups users by registration month, checks if they booked again in the reported period. Returns 6 most recent cohorts.

---

### 3.9 Platform Settings (`admin-settings.tsx`)

#### Platform Commission Fee
- Range: 1%–15% (0.5% step slider)
- Written to `settings/global.platformFeePercent`
- Every change logs `PLATFORM_FEE_UPDATED` / HIGH to `audit_logs`

#### Maintenance Mode (Manual Toggle)
```tsx
await setDoc(doc(db, "settings", "global"), {
  maintenanceMode: true,
  maintenanceMessage: "...",
  maintenanceStartedAt: serverTimestamp(),
  maintenanceEndsAt: Timestamp,
  maintenanceStartedBy: user.uid
}, { merge: true });
```

#### Scheduled Maintenance Windows
- Stored in `maintenanceWindows` collection
- **Auto-activate:** every 60s, checks `startDate <= now <= endDate`, sets `status: "active"` and enables maintenance mode
- **Auto-complete:** when `endDate < now`, sets `status: "completed"` and disables maintenance mode
- **Owner Notification:** on schedule, sends batch notifications to all owners via `writeBatch`

#### Announcement Engine
States: `draft → scheduled → published → archived`

```tsx
// Auto-publish logic (runs every 60s)
// published: writes to settings/global.announcementActive = true
// archived:  writes to settings/global.announcementActive = false
```

Announcement fields: `title`, `message`, `type` (info/warning/success/urgent), `targetAudience` (all/drivers/owners), `publishAt`, `expiresAt`.

#### Administrative Access Panel
- Lists all users with `role === "admin"` from `users` collection
- Displays: name, email, last login timestamp, status badge

#### Data Lifecycle (Danger Zone)
- **Wipe Platform** — deletes all documents from `stations`, `bookings`, `notifications`, `reviews` — requires typing "WIPE" to confirm

---

### 3.10 Audit Logs (`admin-audit-logs.tsx`)

**Immutable records** — update and delete are blocked by Firestore rules:
```
allow update, delete: if false;
```

#### Data Loading
- Page size: 25 logs per page (cursor-based pagination with `startAfter`)
- Filters applied server-side via Firestore `where()` constraints
- Search applied client-side via `useMemo`

#### Aggregate Stats (getCountFromServer)
```tsx
// Uses efficient server-side count API (no document reads)
totalSnap    = getCountFromServer(collection(db, "audit_logs"))
critSnap     = getCountFromServer(query(..., where("severity", "==", "CRITICAL")))
todaySnap    = getCountFromServer(query(..., where("timestamp", ">=", startOfDay)))
```

#### Exportable Fields
`Timestamp | Action | Severity | Target ID | Target Type | Performed By | Metadata (JSON)`

#### Tracked Admin Actions

| Action | Severity |
|:---|:---|
| `ADMIN_SESSION_STARTED` | LOW |
| `STATION_APPROVED` | HIGH |
| `STATION_REJECTED` | HIGH |
| `BULK_STATION_APPROVED` | HIGH |
| `USER_BLOCKED` | HIGH |
| `USER_UNBLOCKED` | HIGH |
| `OWNER_VERIFIED` | HIGH |
| `OWNER_SUSPENDED` | HIGH |
| `PLATFORM_FEE_UPDATED` | HIGH |
| `MAINTENANCE_SCHEDULED` | HIGH |
| `SUPPORT_TICKET_RESOLVED` | LOW |
| `BULK_TICKETS_RESOLVED` | LOW |
| `PAYOUT_PROCESSED` | HIGH |
| `ANNOUNCEMENT_PUBLISHED` | MEDIUM |
| `DATA_WIPED` | CRITICAL |
| `MAINTENANCE_SCHEDULED_PREDICTIVE` | HIGH |
| `OWNER_MAINTENANCE_NOTIFIED` | MEDIUM |
| `FRAUD_ALERT_DISMISSED` | LOW |
| `USER_AUTO_BLOCKED` | CRITICAL |
| `BULK_STATION_EXPORT` | MEDIUM |
| `BULK_USER_IMPORT` | HIGH |
| `ML_RETRAIN_TRIGGERED` | MEDIUM |


---

### 3.11 Predictive Maintenance Engine (`predictive-maintenance.ts`)

A heuristic-based risk scoring system that assesses the likelihood of station failure.

#### Risk Scoring Factors (Weighted 0-100)

| Factor | Calculation | Weight |
|:---|:---|:---|
| Usage Intensity | `(avgDailyBookings / connectorCount) * 10` | 10% |
| Fault Frequency | `faultCount * 15` (last 30 days) | 30% |
| Time Since Maint | `daysSinceLastMaint / 30 * 20` | 20% |
| Station Age | `ageInYears * 10` | 20% |
| Low Rating | `(4.0 - avgRating) * 20` (if < 3.5) | 20% |

#### Automation Logic
- **Risk > 85:** CRITICAL urgency, 7-day service window.
- **Risk > 70:** HIGH urgency, 14-day service window.
- **Schedule Optimizer:** Clusters nearby high-risk stations using a distance-based grouping algorithm (approx. 10km radius).

---

### 3.12 Fraud Detection Center (`AdminFraudDetection.tsx`)

A real-time anomaly detection engine monitoring 19 sophisticated patterns.

#### Real-time Monitoring
- **onSnapshot** listeners for `fraud_alerts`, `users`, and `bookings`.
- **Global Risk Score**: Aggregated assessment of network security.

#### Detection Patterns
- **Velocity Attacks**: Rapid bookings from single UID.
- **Geographic Impossibility**: Same UID booking at distant stations in minutes.
- **Payment Recycling**: Repeated failures across multiple cards.
- **Account Takeover**: Rapid PII changes + large bookings.

#### Automated Response
- **Auto-Block**: Critical severity alerts can trigger automated user suspension.
- **Audit Integration**: All alert dismissals or blocks recorded in `audit_logs`.

---

### 3.13 Customer Satisfaction Hub (`AdminSatisfaction.tsx`)

Tracks sentiment across the driver and owner ecosystem.

#### Metric Tracking
- **CSAT (Customer Satisfaction Score)**: Transactional survey after charging.
- **NPS (Net Promoter Score)**: Relationship-based survey every 90 days.
- **CES (Customer Effort Score)**: Ease of use metric for technical support.

#### Implementation
- **Data Source**: `reviews` and `feedback` collections.
- **Sentiment Analysis**: Client-side keyword categorization (positive/neutral/negative).

---

### 3.14 Data Management & Bulk Tools (`AdminDataManagement.tsx`)

Administrative utilities for mass data operations.

#### Export Capabilities
- **Stations (CSV)**: Full metadata for geospatial analysis.
- **Users (CSV)**: PII-sensitive export for CRM sync.
- **Bookings (CSV)**: Date-filtered financial logs.
- **Revenue Report (Excel)**: Multi-sheet workbook with daily revenue and growth charts.

#### Import Capabilities
- **Bulk Station Import**: JSON/CSV parser with validation logic.
- **User Batch Migration**: Tool for importing legacy user data.

---

### 3.15 Admin Collaboration Framework (`AdminCollabSidebar.tsx`)

Facilitates real-time communication for multi-admin teams.

#### Online Presence
- **Collection**: `admin_presence`
- **Heartbeat**: 30-second update via `lastSeen: serverTimestamp()`.
- **Status States**: Online | Away | Offline (auto-offline after 2 min).

#### Entity-Linked Notes
- **Collection**: `admin_notes`
- **Contextual Linking**: Notes are linked to `stationId`, `userId`, `bookingId`, or `ticketId`.
- **Real-time Sync**: `onSnapshot` ensures all admins see updates instantly.

---

### 3.16 Real-time Platform Activity (`AdminActivity.tsx`)

A dedicated command center view for the `audit_logs` stream.

#### Features
- **Live Tail**: Automatically scrolls to new events as they occur.
- **Categorized Filtering**: Quickly isolate `SECURITY`, `FINANCIAL`, or `SYSTEM` events.
- **Visual Severity**: Color-coded badges for instant threat assessment.

---

### 3.17 Admin Notification Preferences (`AdminNotificationSettings.tsx`)

Granular control over how administrators receive platform alerts.

#### Alert Categories
- **Critical Failures**: Database outages, payment gateway errors.
- **Fraud Alerts**: High-severity anomalies.
- **Business Events**: New owner registration, high-value bookings.

#### Delivery Channels
- **Email**: Detailed reports and summaries.
- **SMS/Push**: Urgent, time-sensitive alerts.
- **Quiet Hours**: Automated suppression of non-critical alerts during specified windows.

---

---

## 4. Firebase Security Rules — Admin Collections

Defined in `firestore.rules`. Admin identity is resolved by helper function:

```javascript
function isAdmin() {
  return request.auth != null && (
    request.auth.token.admin == true ||
    (exists(/databases/$(database)/documents/users/$(request.auth.uid)) &&
     get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin')
  );
}
```

### 4.1 Rules by Collection

| Collection | Read | Write | Notes |
|:---|:---|:---|:---|
| `audit_logs` | Admin only | Admin only (create); **nobody** (update/delete) | Immutable records |
| `adminMetrics` | Admin only | Admin only | Health snapshots |
| `settings/global` | Public read | Admin only | Platform-wide config |
| `settings/{docId}` | Admin only | Admin only | All other settings |
| `analytics_cache` | Admin only | Admin only | Cached analytics |
| `maintenanceWindows` | Public read | Admin only | Needed for system status banner |
| `announcements` | Public read | Admin only | Shown to all users |
| `supportTickets` | Admin or own ticket | Admin full; user limited (status/description) | Helpdesk |
| `ml_predictions` | Admin only | Blocked (ML service via Admin SDK) | ML logging |
| `ml_cold_starts` | Admin only | Blocked | ML logging |
| `maintenance_outcomes` | Admin only | Admin only | Finalised repair records |
| `ml_model_performance` | Admin only | Blocked | Daily accuracy snapshots |

### 4.2 Admin Permissions on Shared Collections

| Collection | Admin Override |
|:---|:---|
| `users` | Full read/write; can update any field including `role` |
| `owners` | Full read/write |
| `stations` | Full CRUD |
| `bookings` | Full read; update; delete |
| `reviews` | Full CRUD |
| `waitlists` | Update and delete |
| `telemetry` | Delete only (owners create/update) |
| `notifications` | Create (for announcements/maintenance alerts) |
| `locks` | Delete (release any lock) |
| `fleets` | Full read/write |

---

## 5. Firestore Data Models (Admin-Relevant)

### `audit_logs/{logId}`
```typescript
{
  action: string;           // e.g. "STATION_APPROVED"
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  performedBy: string;      // admin UID
  performedByEmail: string;
  targetId: string;         // affected document ID
  targetType: string;       // "station" | "user" | "system" | ...
  metadata: Record<string, any>;
  timestamp: Timestamp;
}
```

### `settings/global`
```typescript
{
  platformFeePercent: number;       // default 5
  maintenanceMode: boolean;
  maintenanceMessage: string;
  maintenanceStartedAt: Timestamp;
  maintenanceEndsAt: Timestamp;
  announcementActive: boolean;
  announcementId: string;
  announcementMessage: string;
  announcementType: "info" | "warning" | "success" | "urgent";
  targetAudience: "all" | "drivers" | "owners";
}
```

### `adminMetrics/health_{yyyy-MM-dd}`
```typescript
{
  date: string;       // "2026-05-03"
  score: number;      // 0-100
  grade: string;      // "A+" | "A" | "B" | "C" | "D" | "F"
  issueCount: number;
  savedAt: Timestamp;
}
```

### `maintenanceWindows/{windowId}`
```typescript
{
  title: string;
  description: string;
  startDate: Timestamp;
  endDate: Timestamp;
  affectedSystems: string[];
  status: "scheduled" | "active" | "completed" | "cancelled";
  createdBy: string;
  notifyUsers: boolean;
  notifyOwners: boolean;
  createdAt: Timestamp;
}
```

### `announcements/{announcementId}`
```typescript
{
  title: string;
  message: string;
  type: "info" | "warning" | "success" | "urgent";
  targetAudience: "all" | "drivers" | "owners";
  status: "draft" | "scheduled" | "published" | "archived";
  publishAt: Timestamp | null;
  expiresAt: Timestamp | null;
  publishedAt: Timestamp | null;
  createdBy: string;
  viewCount: number;
  createdAt: Timestamp;
}
```

### `supportTickets/{ticketId}`
```typescript
{
  subject: string;
  message: string;
  status: "open" | "in_progress" | "resolved";
  priority: "high" | "medium" | "low";       // auto-assigned if missing
  ownerId: string;
  ownerEmail: string;
  businessName: string;
  adminResponse: string;
  assignedTo: string;                          // admin UID
  internalNotes: Array<{
    text: string; addedBy: string;
    addedAt: string; internalOnly: boolean;
  }>;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  resolvedAt: Timestamp;
  closedBy: string;                           // "auto_close_7_days" | "bulk_admin_action"
}

### `maintenance_outcomes/{outcomeId}`
```typescript
{
  stationId: string;
  scheduledDate: number;
  completedDate: number;
  preMaintenanceRisk: number;
  postMaintenanceRisk: number;
  faultsFixed: string[];
  cost: number;
  performedBy: string;
}
```
```

---

## 6. Firestore Composite Indexes (Admin Queries)

Defined in `firestore.indexes.json`:

| Collection | Fields | Purpose |
|:---|:---|:---|
| `audit_logs` | `severity ASC`, `timestamp DESC` | Severity-filtered audit log view |
| `audit_logs` | `action ASC`, `timestamp DESC` | Action-filtered audit log view |
| `supportTickets` | `status ASC`, `createdAt DESC` | Filtered helpdesk queue |
| `maintenanceWindows` | `startDate DESC` | Maintenance window list |
| `announcements` | `status ASC`, `createdAt DESC` | Announcement tab views |
| `bookings` | `status IN [active,confirmed]` | Live session monitor |
| `ml_predictions` | `timestamp DESC` | Real-time ML inference log |
| `ml_cold_starts` | `timestamp DESC` | Model cache miss events |
| `ml_model_performance`| `date DESC` | Daily accuracy/latency snapshots |

---

## 7. Key Methods Reference

| Method | File | Description |
|:---|:---|:---|
| `calculatePlatformHealth()` | `admin.tsx` | Weighted 0–100 health score |
| `detectAnomalies()` | `admin.tsx` | 11-check anomaly scanner, runs every 10min |
| `saveHealthSnapshot()` | `admin.tsx` | Persists daily score to `adminMetrics` |
| `generateReport()` | `admin-reports.tsx` | Full month data pipeline |
| `calculateWaterfall()` | `admin-reports.tsx` | Revenue waterfall segments |
| `calculateOwnerPayouts()` | `admin-reports.tsx` | Per-owner payout breakdown |
| `exportPayoutCSV()` | `admin-reports.tsx` | Downloads owner payout CSV |
| `calculateRetention()` | `admin-reports.tsx` | 6-cohort retention analysis |
| `markAsPaid()` | `admin-reports.tsx` | Records payout in Firestore + audit log |
| `handleSaveFee()` | `admin-settings.tsx` | Updates platform commission + audit log |
| `handleToggleMaintenance()` | `admin-settings.tsx` | Toggles maintenance mode |
| `handleScheduleWindow()` | `admin-settings.tsx` | Creates maintenance window + notifies owners |
| `handleSaveAnnouncement()` | `admin-settings.tsx` | Creates announcement (draft/scheduled/published) |
| `handleWipeDatabase()` | `admin-settings.tsx` | Destructive delete of stations/bookings/notifications/reviews |
| `autoAssignPriority()` | `admin-support.tsx` | NLP-lite keyword priority assignment |
| `getTicketAge()` | `admin-support.tsx` | SLA tracking with breach detection |
| `handleResolveTicket()` | `admin-support.tsx` | Resolves ticket + notifies owner + audit log |
| `handleBulkResolve()` | `admin-support.tsx` | writeBatch bulk ticket resolution |
| `handleAddNote()` | `admin-support.tsx` | Appends internal admin note |
| `fetchLogs()` | `admin-audit-logs.tsx` | Paginated audit log fetch (cursor-based) |
| `fetchStats()` | `admin-audit-logs.tsx` | Server-side aggregate counts |
| `exportLogsCSV()` | `admin-audit-logs.tsx` | Downloads audit log CSV |
| `handleRetrain()` | `AdminMLMonitoring.tsx` | Triggers ML pipeline + logs `ML_RETRAIN` |
| `calculateDrift()` | `AdminMLMonitoring.tsx` | Client-side KL-divergence assessment |
| `calculateMaintenanceRisk()` | `predictive-maintenance.ts` | 5-factor risk scoring algorithm |
| `optimizeMaintenanceSchedule()` | `predictive-maintenance.ts` | Geographic clustering of service calls |
| `handleScheduleMaintenance()` | `AdminPredictiveMaintenance.tsx` | Updates station status + notifies owner |

---

## 8. Implementation Notes

### Service Worker
`firebase-messaging-sw.js` is configured to bypass `googleapis.com` to prevent interference with Firestore long-polling listeners used by `onSnapshot`.

### Session Security
- 30-minute inactivity timeout tracked client-side
- All 4 activity events (`mousedown`, `keydown`, `scroll`, `touchstart`) reset the timer
- Check interval: every 60 seconds

### Batch Write Integrity
All bulk operations (station approvals, ticket resolution) use Firestore `writeBatch` to ensure atomic all-or-nothing commits.

### Revenue Calculation Alignment
The 5% platform commission is calculated consistently across:
- `admin.tsx` analytics engine
- `admin-reports.tsx` waterfall and payout tables
- `owners/{ownerId}/payoutHistory/{month}` persistence

### Print Support
`AdminReports` includes print-optimised CSS (`@media print`) that isolates the `#admin-report-print` section, hides nav elements, and formats output for PDF generation.

---

## 9. Navigation & UI Components

The admin navigation sidebar links to all major sections:

| Icon | Label | Route |
|:---|:---|:---|
| `BarChart3` | Dashboard | `/admin` |
| `MessagesSquare` | Support | `/admin/support` |
| `BarChart3` (Reports) | Reports | `/admin/reports` |
| `Settings` | Settings | `/admin/settings` |
| `History` | Audit Logs | `/admin/audit-logs` |
| `Activity` | ML Monitoring | `/admin/ml-monitoring` |
| `Wrench` | Maintenance | `/admin/predictive-maintenance` |
| `ShieldAlert` | Fraud Detection | `/admin/fraud-detection` |
| `Smile` | CSAT | `/admin/customer-satisfaction` |
| `Database` | Data Mgmt | `/admin/data-management` |
| `Bell` | Notifications | `/admin/notification-settings` |
| `TrendingUp` | Capacity | `/admin/capacity-planning` |
| `Zap` | Activity | `/admin/activity` |

UI components used: `Card`, `Badge`, `Tabs`, `Sheet`, `Dialog`, `Slider`, `Switch`, `Table`, `Textarea`, `Select`, `Button`, `Input` — all from Shadcn UI.

---

*Documentation generated for SeniorDevOps EVPlugFinder EV Platform — Admin Module — May 2026*
