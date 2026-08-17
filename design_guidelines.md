# Design Guidelines: AI-EV-Charging-Locator & Smart Booking System

## Design Approach

**Selected Approach:** Hybrid - Material Design foundation with inspiration from Google Maps (spatial navigation), Tesla app (EV context), and Linear (modern utility aesthetics)

**Core Principle:** Prioritize clarity and speed of use. Users need to find stations and book quickly, often while on the move. The design should feel confident, modern, and trustworthy.

---

## Typography

**Font Families:**
- Primary: Inter (400, 500, 600) via Google Fonts
- Monospace: JetBrains Mono (400, 500) for technical data (kW ratings, connector IDs)

**Hierarchy:**
- H1 (Page titles): text-4xl font-semibold
- H2 (Section headers): text-2xl font-semibold
- H3 (Card headers): text-xl font-medium
- Body: text-base font-normal
- Small/Meta: text-sm
- Labels/Buttons: text-sm font-medium uppercase tracking-wide

---

## Layout System

**Spacing Primitives:** Use Tailwind units of 1, 2, 3, 4, 6, 8, 12, 16
- Micro spacing (gaps, padding in tight components): 1, 2
- Standard component padding: 4, 6
- Section spacing: 8, 12
- Page-level margins: 16

**Container Strategy:**
- Map views: Full-width, full-height (100vh)
- Content overlays: max-w-md to max-w-2xl with mx-auto
- Station detail: max-w-4xl
- Forms: max-w-md

---

## Component Library

### Navigation
**Top Navigation Bar (Fixed)**
- Height: h-16
- Contains: Logo (left), Search bar (center on desktop), User avatar + Notifications (right)
- Background: Solid with subtle shadow on scroll
- Mobile: Compact with hamburger menu

### Map Interface (Home Page)
**Full-screen map** with floating UI elements:
- Search bar: Floating at top-center (w-96 on desktop, full-width - 8 margin on mobile)
- Station markers: Custom SVG markers showing availability status (green/yellow/red)
- Floating filters panel: Top-right corner with connector type, price range toggles
- Bottom sheet: Slides up showing list of nearby stations (3 cards visible, scrollable)
- Location button: Floating bottom-right (FAB style)

### Station Cards (List View)
**Compact horizontal cards** in bottom sheet:
- Left: Station image (w-24 h-24, rounded-lg, object-cover)
- Center: Station name (font-semibold), address (text-sm), distance (text-xs)
- Right: Availability indicator (large circular badge with number of available slots)
- Padding: p-4
- Border: border-b last:border-0

### Station Detail Page
**Hero Section:**
- Full-width station image (h-64 on mobile, h-96 on desktop)
- Overlay gradient from bottom with station name and rating
- Back button: Floating top-left with blurred background (backdrop-blur-md)
- "Navigate" button: Floating bottom-right with blurred background

**Content Layout:**
- Two-column on desktop (8-4 grid), single column on mobile
- Left: Station info, connectors, amenities
- Right: Sticky booking card

**Connector List:**
- Cards with border, p-6, rounded-lg
- Display: Connector type icon (large, 48px), kW rating (text-2xl font-mono), availability status
- Real-time indicator: Pulsing green dot if available

### Booking Modal
**Full-screen overlay** on mobile, centered modal (max-w-lg) on desktop:
- Header: Connector type + Station name (p-6, border-b)
- Body: Time slot picker (grid of 30-min slots, 4 columns), duration selector
- Price calculation: Sticky bottom section showing rate breakdown
- Footer: Cancel + Confirm buttons (p-6, border-t)
- Backdrop: backdrop-blur-sm with dark overlay

### My Bookings Page
**List view** with status-based organization:
- Tabs: Upcoming / Past (sticky under header)
- Booking cards: Full-width on mobile, max-w-2xl mx-auto on desktop
- Each card: Station image (left), booking details (center), QR code for check-in (right on desktop)
- Status badge: Top-right corner (Confirmed/Pending/Completed/Cancelled)

### Authentication Pages
**Centered card layout:**
- max-w-md mx-auto, mt-16
- Card: p-8, rounded-xl, shadow-lg
- Logo: Centered at top (mb-8)
- Form fields: Stacked with mb-4
- Social login: Google button with icon, full-width, outlined
- Toggle: "Sign in" ↔ "Sign up" link at bottom

---

## Form Elements
- Input fields: h-12, px-4, rounded-lg, border focus:ring-2
- Buttons: h-12, px-6, rounded-lg, font-medium
- Primary CTA: Large (h-14), full-width on mobile
- Dropdowns: Custom styled with chevron icon

---

## Data Visualization
**Availability Indicators:**
- Large circular badges with numbers (high contrast)
- Progress rings for charging status
- Small status dots for real-time updates (pulsing animation)

**Station Metrics:**
- Grid layout (2-3 columns) for kW, price/kWh, connectors available
- Use icons from Heroicons for each metric type
- Monospace font for numerical values

---

## Animations
**Minimal and purposeful:**
- Map marker clustering: Smooth zoom transitions
- Bottom sheet: Slide-up with spring physics
- Availability updates: Subtle pulse on change
- Loading states: Skeleton screens, not spinners
- Button states: Simple scale on active (scale-95)

---

## Images
**Hero Images:**
- Station Detail: Full-width station photo showing chargers in use (h-64 to h-96)
- Auth pages: No hero image, focus on form

**Contextual Images:**
- Station cards: Thumbnail images (w-24 h-24, rounded-lg)
- Empty states: Simple illustrations for "No stations nearby", "No bookings yet"
- User avatars: Circular, 40px diameter in header

**Image Treatment:**
- All station photos: object-cover with subtle overlay for readability
- Fallback: Gradient backgrounds with station initials if no image available

---

## Mobile-First Considerations
- Bottom navigation bar on mobile (Home, Search, Bookings, Profile)
- Touch targets: Minimum 44px height
- Bottom sheet interactions: Swipe to expand/collapse
- Map controls: Larger tap areas (56px FAB)
- Sticky booking CTA on Station Detail (fixed bottom)

---

## Trust & Real-time Elements
- Live availability indicators: Green pulse animation
- "Last updated" timestamp on station cards (text-xs, muted)
- Booking confirmation: Success checkmark animation
- Security badges: Lock icons next to payment info
- User reviews: Star ratings with count (text-sm)