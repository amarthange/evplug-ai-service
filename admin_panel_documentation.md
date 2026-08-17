# Admin Platform Technical Documentation

## 1. Platform Infrastructure & Architecture
The Admin Platform is a high-performance, real-time operational dashboard built on a modern cloud-native stack. It is designed to provide platform administrators with total visibility into the EV charging ecosystem.

### Technical Stack
- **Frontend**: React 18+ (Vite) with TypeScript for type safety.
- **Backend**: Firebase 12+ (Firestore for primary data, Authentication for RBAC).
- **Styling**: Tailwind CSS for responsive layouts and custom UI components (Shadcn UI).
- **Analytics**: Recharts for real-time telemetry and data visualization.

### Data Synchronisation Engine
The platform utilizes a **Hybrid Sync Model**:
1. **Real-time Streams (`onSnapshot`)**: Used for critical live data such as Active Charging Sessions and Support Tickets.
2. **Batch Hydration (`fetchData`)**: Used for deep metrics (Revenue, Users, Owners) to optimize read performance and reduce cloud costs.
3. **Write Optimized**: Uses `writeBatch` for bulk operations like mass station approvals to ensure transaction integrity.

---

## 2. Routing & Ecosystem Map
The admin ecosystem is partitioned into specific operational zones:

| Route | Component | Purpose |
| :--- | :--- | :--- |
| `/admin` | `AdminPanel` | Primary Dashboard: KPIs, Station Approvals, User Mgmt. |
| `/admin/support` | `AdminSupport` | Helpdesk: Ticket resolution, SLA monitoring. |
| `/admin/reports` | `AdminReports` | Analytics: Revenue exports, monthly performance summaries. |
| `/admin/settings` | `AdminSettings` | Global Controls: Maintenance mode, Platform fees. |
| `/admin/audit-logs`| `AdminAuditLogs`| Compliance: Real-time feed of all administrative actions. |

---

## 3. Core Operational Features

### A. Intelligent Dashboard
- **Platform Health Score**: A composite 0-100 score calculating system integrity based on network success rates, pending backlogs, and station maintenance ratios.
- **Anomaly Detection Engine**: Background monitor that alerts admins to 11 specific patterns, including "Cancellation Spikes," "Rapid Booking Frau," and "Connector Fault Patterns."
- **Admin Activity Timeline**: A chronological audit log of recent high-severity actions (approvals, blocks) with relative timestamps.

### B. Station Lifecycle Management
- **Verification Workflow**: New stations enter a `pending` state and are hidden from users until admin review.
- **SLA Tracking**: Visual badges indicate "Urgent" status for stations pending approval for >48 hours.
- **Rejection Modal**: Allows admins to specify granular reasons for rejection (Image quality, UPI errors, etc.), triggering automated notifications to owners.

### C. Support & High-Volume Operations
- **Bulk Action Suite**: Multi-select ticket management with batch resolution (`writeBatch`) and automated SLA auto-closing for stale tickets (7-day inactivity).
- **Internal Collaboration**: Admin-only private notes with secure state management, ensuring sensitive troubleshooting remains restricted to internal teams.

### D. Governance & Platform Lifecycle
- **Scheduled Maintenance**: A proactive downtime manager that auto-activates platform "Maintenance Mode" based on predefined windows and auto-notifies impacted owners.
- **Enhanced Announcements**: A collection-backed communication engine supporting drafts, future scheduling, and auto-expiry logic for site-wide banners.
- **Account Compliance**: One-click blocking logic that cascades to cancel all active bookings for flagged users.

---

## 4. Advanced Logic & Algorithms

### `calculatePlatformHealth()`
A weighted algorithm that assesses platform stability:
- **Success Rate (80%)**: Deduction if completed/total booking ratio falls below 90%.
- **Backlog (15%)**: Deduction for stations pending approval >3 days.
- **Maintenance (5%)**: Deduction if >20% of the network is offline.

### `detectAnomalies()`
Periodic background check for operational risks:
- **CANCELLATION_SPIKE**: >40% failure in a 1-hour window.
- **RAPID_BOOKINGS**: >3 bookings from one UID in 10 minutes (Bot detection).
- **ZERO_REVENUE_STATIONS**: Active stations with no sessions for 7 days.

### `autoAssignPriority()`
Natural Language Processing (NLP) lite for support tickets:
- Scans subjects for keywords like "urgent," "payment failed," or "emergency" to escalate priority to **High** automatically.

---

## 5. Implementation Notes
- **Service Worker (`sw.js`)**: Configured to bypass `googleapis.com` to prevent interference with Firestore long-polling listeners.
- **Indices**: Composite indices are deployed for `chats` (status + lastMessageAt) to support oversight queries.
- **Security**: Defined in `firestore.rules`, ensuring only users with `role == 'admin'` can access sensitive collections like `auditLogs` and `supportTickets`.
