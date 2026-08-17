# AI-EV-Charging-Locator & Smart Booking System

A comprehensive full-stack web application with **dual systems**:
1. **Public User System** - Regular users find and book charging stations
2. **Station Manager System** - Station owners manage their charging infrastructure

## Architecture Overview

### Frontend (React + TypeScript + Firebase)
- **Framework**: React 18 with Vite, TypeScript
- **UI Components**: Tailwind CSS + shadcn/ui
- **Mapping**: Mapbox GL JS (with OpenStreetMap fallback)
- **Authentication**: Firebase Auth (Email/Password + Google Sign-in, two-role system)
- **Database**: Firebase Firestore (real-time NoSQL)
- **Storage**: Firebase Cloud Storage (for station images)
- **State Management**: TanStack Query for server state
- **Routing**: Wouter (lightweight React router)

### Backend (Node.js + Express)
- **Server**: Express.js with TypeScript
- **API Endpoints**: Helper endpoints for ML predictions and admin operations
- **Firebase Admin**: Optional server-side Firebase operations

## Project Structure

```
├── client/                           # React frontend
│   ├── src/
│   │   ├── components/
│   │   │   ├── ui/                  # shadcn/ui components
│   │   │   ├── header.tsx
│   │   │   ├── map-component.tsx
│   │   │   ├── station-card.tsx
│   │   │   ├── booking-modal.tsx
│   │   │   ├── station-form.tsx     # NEW: Station manager form
│   │   │   └── ...
│   │   ├── pages/
│   │   │   ├── home.tsx             # Public map view
│   │   │   ├── station-detail.tsx   # Station details & booking
│   │   │   ├── bookings.tsx         # User's bookings
│   │   │   ├── auth.tsx             # User login/signup
│   │   │   ├── owner-signup.tsx     # NEW: Owner registration
│   │   │   ├── owner-login.tsx      # NEW: Owner login
│   │   │   ├── owner-dashboard.tsx  # NEW: Station management
│   │   │   ├── user-profile.tsx     # User's EV vehicles
│   │   │   ├── station-manager-dashboard.tsx
│   │   │   └── ...
│   │   ├── lib/
│   │   │   ├── firebase.ts
│   │   │   ├── auth-context.tsx
│   │   │   ├── theme-provider.tsx
│   │   │   ├── owner-service.ts     # NEW: Owner & station operations
│   │   │   └── seed-data.ts
│   │   └── App.tsx
│   └── index.html
├── server/                          # Express backend
│   ├── index.ts
│   ├── routes.ts
│   ├── storage.ts
│   └── firebase-admin.ts
├── shared/                          # Shared TypeScript types
│   └── schema.ts
├── firestore.rules                  # NEW: Firestore security rules
├── storage.rules                    # NEW: Firebase Storage rules
├── STATION_MANAGER_README.md        # NEW: Station manager documentation
└── README.md
```

## Features Implemented

### ✅ Core Public Features (Regular Users)
- Interactive map with station markers (color-coded by availability)
- Real-time station availability updates via Firestore listeners
- Firebase Authentication (email/password + Google)
- Station search and filtering
- Detailed station view with connectors and amenities
- Smart booking system with time slot selection
- 10-minute booking lock mechanism
- My Bookings page (upcoming and past)
- User Profile for managing EV vehicles
- Responsive design with dark mode support

### ✅ NEW: Station Manager Features (Station Owners)
- **Owner Authentication**: Email/password + Google sign-in
- **Owner Dashboard**: Real-time list of owned stations
- **Station CRUD**: Create, read, update, delete operations
- **Station Management**: Name, description, address, hours, connectors
- **Image Uploads**: Upload and manage station images to Firebase Storage
- **Connector Management**: Add/edit/delete charging connector types
- **Status Tracking**: Pending, active, maintenance status
- **Real-time Updates**: Firestore listeners for instant dashboard updates
- **Admin Approval**: Backend endpoint for admin station approval (optional)
- **Security Rules**: Firestore and Storage rules enforce owner-only access

### ✅ Backend Features
- Express API for ML prediction proxy
- Firebase Firestore for data persistence
- Real-time data synchronization
- Type-safe schemas with Zod
- Admin endpoints for station approval

### ✅ ML & Telemetry (Optional)
- Python FastAPI service for predictions
- LightGBM model support with heuristic fallback
- Telemetry simulator for generating test data

## Getting Started

### Prerequisites
1. **Firebase Project** - Create at [Firebase Console](https://console.firebase.google.com/)
   - Enable Authentication (Email/Password + Google)
   - Enable Firestore Database
   - Enable Cloud Storage
   - Add Replit Dev URL to authorized domains

2. **Replit Secrets** - Add these in the Secrets panel:
   ```
   VITE_FIREBASE_API_KEY=your_api_key
   VITE_FIREBASE_PROJECT_ID=your_project_id
   VITE_FIREBASE_APP_ID=your_app_id
   ```

3. **Optional: Mapbox Token**
   ```
   VITE_MAPBOX_TOKEN=your_mapbox_token
   ```

### Running the Application

**Development Mode:**
```bash
npm run dev
```
This starts both Express backend and Vite frontend on port 5000.

## User Workflows

### Public User Workflow
1. Sign up as "Regular User" at `/auth`
2. Navigate to home page - see map with stations
3. Click station marker to view details
4. Select connector and time slot
5. Confirm booking - reserved for 10 minutes
6. Go to `/bookings` to manage reservations
7. Visit `/profile` to add and manage EV vehicles

### Station Owner Workflow
1. Sign up as owner at `/owner/signup`
2. Access dashboard at `/owner/dashboard`
3. Click "Add Station" to create new station
4. Fill station details (name, address, hours, connectors)
5. Upload station images
6. Station appears in dashboard with "pending" status
7. Admin can approve to activate
8. Edit/delete stations anytime
9. View real-time updates in dashboard

## Security & Access Control

### Firestore Rules
- `/owners/{uid}` - Only owner can read/write their profile
- `/stations/{id}` - Only owner or admin can read/write
- `/users/{uid}` - Only user can read/write their profile
- `/bookings/{id}` - Users can read/write their own, owners can read related bookings

### Storage Rules
- `stations/{stationId}/images/**` - Only owner or admin can read/write

### Owner-Only Endpoints
- POST `/admin/stations/{stationId}/approve` - Admin-only station approval

## Data Models

### Station
```typescript
{
  id: string
  name: string
  description: string
  address: string
  location: { lat: number; lon: number }
  connectors: Connector[]
  images: string[]
  hours: { open: string; close: string }
  status: "pending" | "active" | "maintenance"
  ownerId: string
  createdAt: number
  updatedAt: number
}
```

### Owner Profile
```typescript
{
  uid: string
  email: string
  fullName: string
  businessName: string
  phone: string
  address: string
  role: "owner"
  createdAt: number
}
```

### Connector
```typescript
{
  type: "CCS" | "CHAdeMO" | "Type 2" | "Tesla Supercharger"
  powerKw: number
  count: number
  pricePerKwh: number
}
```

### Booking
```typescript
{
  id: string
  userId: string
  stationId: string
  connectorId: string
  startTime: number
  duration: number
  status: "pending" | "confirmed" | "completed" | "cancelled"
  totalPrice: number
  lockExpiresAt: number
  createdAt: number
}
```

## Key Libraries & Technologies

**Frontend:**
- React 18, TypeScript, Vite
- Tailwind CSS, shadcn/ui
- Mapbox GL JS
- Firebase SDK (Auth + Firestore + Storage)
- TanStack Query v5, Wouter
- Lucide React Icons

**Backend:**
- Node.js 18+, Express, TypeScript
- Firebase Admin SDK (optional)

**Database:**
- Firebase Firestore (NoSQL)
- Firebase Cloud Storage

## Recent Updates

### Phase 1: Public User System ✅
- Complete MVP with auth, map, bookings, user profiles
- Real-time Firestore listeners
- Two-role authentication system
- Quick booking flow with instant confirmations

### Phase 2: Station Manager System ✅
- Owner authentication with business details
- Station CRUD operations
- Real-time dashboard with live updates
- Image upload to Firebase Storage
- Connector management
- Comprehensive security rules
- Status tracking (pending/active/maintenance)

## Environment Variables

### Frontend (Required)
- `VITE_FIREBASE_API_KEY` - Firebase API key
- `VITE_FIREBASE_PROJECT_ID` - Firebase project ID
- `VITE_FIREBASE_APP_ID` - Firebase app ID

### Frontend (Optional)
- `VITE_MAPBOX_TOKEN` - Mapbox access token (falls back to OSM)

### Backend (Optional)
- `FIREBASE_ADMIN_CREDENTIALS` - Service account JSON
- `ML_SERVICE_URL` - ML service endpoint
- `ADMIN_UID` - Admin user ID for admin operations

## Performance Optimizations

✅ Instant booking confirmation (no delay)
✅ Real-time Firestore listeners for live updates
✅ Optimized station queries with owner filter
✅ Image lazy loading
✅ Code splitting with route-based components
✅ Memoization of expensive components

## Troubleshooting

### Firebase Not Connecting
- Check all three Firebase credentials are set in Replit Secrets
- Verify Replit dev URL is in Firebase authorized domains
- Check Firestore and Storage are enabled in Firebase

### No Stations Appearing
- Verify Firestore security rules allow reads
- Check station data is seeded (check console)
- Ensure user role is set correctly

### Booking Not Saving
- Check user is authenticated
- Verify Firestore rules allow booking writes
- Check browser console for error details
- Ensure bookings collection has proper Firestore rule

### Images Not Uploading
- Verify Firebase Storage is enabled
- Check storage.rules are deployed
- Ensure station owner ID matches user UID
- Check file size is reasonable

## Future Enhancements

- Admin dashboard for all station management
- Payment integration (Stripe/PayPal)
- Advanced ML predictions with training pipeline
- Push notifications
- Route planning for long trips
- User reviews and ratings
- Charging history analytics
- Mobile app (React Native)
- Admin approval workflow UI
- Booking management for owners
- Revenue tracking and reporting

## Support

For issues or questions:
1. Check browser console (F12) for errors
2. Review Firestore rules in Firebase Console
3. Verify all secrets are properly set
4. Check database structure matches schema
5. Review STATION_MANAGER_README.md for owner-specific docs

---

**Project Status:** ✅ Complete MVP (v1.0)
- Public User System: Production Ready
- Station Manager System: Production Ready
- Security Rules: Deployed
- Real-time Updates: Active

**Last Updated:** November 28, 2025  
**Version:** 2.0.0 (Dual System)
