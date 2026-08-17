# Station Manager System - Owner-Only EV Charging Locator

Complete station management system for EV charging station owners to manage their charging infrastructure.

## Features

✅ **Owner Authentication**
- Email/password signup and login
- Google sign-in integration
- Owner profile with business details (name, phone, address)
- Firestore-based user profiles

✅ **Station Management Dashboard**
- Real-time station list with live updates
- Create, read, update, delete (CRUD) stations
- Station status tracking (pending, active, maintenance)
- Station images upload to Firebase Storage

✅ **Station Details**
- Name, description, address
- Geographic location (latitude, longitude)
- Operating hours
- Multiple connectors (CCS, Type 2, CHAdeMO, Tesla Supercharger)
- Connector specifications (power, count, pricing)
- Station images

✅ **Image Management**
- Upload images to Firebase Storage
- Display images in station cards
- Remove images from storage
- Resumable uploads support

✅ **Security**
- Owner-only access to their stations
- Firestore security rules enforce access control
- Firebase Storage rules restrict file access
- Admin override capability

## Getting Started

### Prerequisites

1. **Firebase Project** - Created at [Firebase Console](https://console.firebase.google.com/)
   - Enable Authentication (Email/Password + Google)
   - Enable Firestore Database
   - Enable Cloud Storage
   - Add Replit dev URL to authorized domains

2. **Replit Secrets** - Add in Secrets panel:
   ```
   VITE_FIREBASE_API_KEY=your_api_key
   VITE_FIREBASE_PROJECT_ID=your_project_id
   VITE_FIREBASE_APP_ID=your_app_id
   ```

### Running the Application

**Development:**
```bash
npm run dev
```
This starts both Express backend and Vite frontend on port 5000.

## Project Structure

```
├── client/src/
│   ├── pages/
│   │   ├── owner-signup.tsx       # Owner registration
│   │   ├── owner-login.tsx        # Owner login
│   │   └── owner-dashboard.tsx    # Main dashboard
│   ├── components/
│   │   └── station-form.tsx       # Station CRUD form
│   ├── lib/
│   │   ├── firebase.ts            # Firebase config
│   │   ├── owner-service.ts       # Owner & station operations
│   │   └── auth-context.tsx       # Auth state management
│   └── index.css                  # Styles
├── firestore.rules                # Firestore security rules
├── storage.rules                  # Cloud Storage security rules
└── README.md                      # This file
```

## Routes

- `/owner/signup` - Owner registration page
- `/owner/login` - Owner login page
- `/owner/dashboard` - Main management dashboard (protected)

## Firestore Schema

### Owners Collection
```typescript
/owners/{ownerId} {
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

### Stations Collection
```typescript
/stations/{stationId} {
  name: string
  description: string
  address: string
  location: { lat: number; lon: number }
  connectors: [
    {
      type: "CCS" | "Type 2" | "CHAdeMO" | "Tesla Supercharger"
      powerKw: number
      count: number
      pricePerKwh: number
    }
  ]
  images: string[]  // Firebase Storage URLs
  hours: { open: string; close: string }
  status: "pending" | "active" | "maintenance"
  ownerId: string   // References owners/{ownerId}
  createdAt: number
  updatedAt: number
}
```

## Security Rules

### Firestore Rules (firestore.rules)
- Owners can only read/write their own profile
- Stations are only accessible to owning manager or admins
- Other users cannot access station data

### Storage Rules (storage.rules)
- Station images are only accessible to owner or admins
- Unauthorized users cannot download or upload images

## Key Functions

### Owner Service (`lib/owner-service.ts`)

```typescript
// Get owner profile
getOwnerProfile(uid: string): Promise<OwnerProfile | null>

// Create station
createStation(ownerId: string, stationData): Promise<string>

// Update station
updateStation(stationId: string, updates): Promise<void>

// Delete station
deleteStation(stationId: string): Promise<void>

// Subscribe to owner's stations (real-time)
subscribeToOwnerStations(ownerId: string, callback): () => void

// Upload station image
uploadStationImage(stationId: string, file: File): Promise<string>

// Delete station image
deleteStationImage(imagePath: string): Promise<void>
```

## Usage Workflows

### 1. Owner Registration
1. Navigate to `/owner/signup`
2. Enter email, password, full name, business name, phone, address
3. Click "Create Account"
4. Owner profile is created in Firestore `/owners/{uid}`
5. Redirect to dashboard

### 2. Adding a Station
1. Click "Add Station" button in dashboard
2. Fill station details (name, address, hours)
3. Add connectors with specifications
4. Upload station images
5. Click "Save Station"
6. Station appears in dashboard with status "pending"
7. Admin can approve to change status to "active"

### 3. Updating a Station
1. Click "Edit" on station card
2. Modify station details
3. Add/remove connectors and images
4. Click "Save Station"
5. Changes sync in real-time

### 4. Deleting a Station
1. Click "Delete" on station card (if available)
2. Station removed from Firestore
3. Images removed from Cloud Storage

## Environment Variables

### Frontend (Required)
- `VITE_FIREBASE_API_KEY` - Firebase API key
- `VITE_FIREBASE_PROJECT_ID` - Firebase project ID
- `VITE_FIREBASE_APP_ID` - Firebase app ID

### Backend (Optional)
- `FIREBASE_ADMIN_CREDENTIALS` - Service account JSON for admin operations

## Troubleshooting

### "Access Denied" on Dashboard
- Verify you're logged in as an owner
- Check owner profile exists in Firestore at `/owners/{uid}`
- Confirm Firebase Firestore rules are properly deployed

### Images Not Uploading
- Check Firebase Storage is enabled
- Verify `storage.rules` are deployed correctly
- Check file size is under limit (usually 5MB for development)
- Ensure CORS is configured if needed

### Stations Not Appearing
- Verify Firestore listener is active (check browser console)
- Check user ID matches station's `ownerId` field
- Confirm Firestore security rules allow read access

### Firebase Configuration Error
- Double-check API key, project ID, and app ID in Replit Secrets
- Verify authorized domains include your Replit dev URL
- Check Firebase project is properly configured with Firestore and Storage

## Best Practices

1. **Always validate user input** before sending to Firestore
2. **Use real-time listeners** for dashboard to show live updates
3. **Implement proper error handling** with user-friendly messages
4. **Test Firestore rules** in Firebase Console before deploying
5. **Optimize images** before uploading to reduce storage costs
6. **Regular backups** of Firestore data

## Future Enhancements

- Admin dashboard for approving/managing all stations
- Booking management - view bookings for your stations
- Analytics - usage statistics and revenue tracking
- Email notifications for bookings and status changes
- Bulk operations - update multiple stations at once
- Revenue reports and payment integration
- Station occupancy tracking
- Mobile app version

## Support

For issues or questions:
1. Check browser console for error details
2. Review Firestore rules in Firebase Console
3. Verify all environment variables are set
4. Test Firebase connectivity in console
5. Check Firestore data structure matches schema

---

**Status:** ✅ Complete MVP  
**Last Updated:** November 28, 2025  
**Version:** 1.0.0
