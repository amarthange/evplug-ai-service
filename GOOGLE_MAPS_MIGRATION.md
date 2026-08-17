# Task: Replace Mapbox with Google Maps in Existing EV Charging Locator Project

## Background

The EV Charging Locator and Smart Booking System project is being migrated from **Mapbox** to **Google Maps Platform** for all map-based features without affecting any existing features, database schemas, or visual layouts.

---

## Required Migration Details

Replace every Mapbox implementation with Google Maps Platform.

### Google Maps APIs Required
1. **Maps JavaScript API**: Display interactive map, zoom controls, markers, info windows, and user location overlays.
2. **Places API**: Location autocomplete search, text-based search, and place details.
3. **Geocoding API**: Convert Address ↔ Latitude/Longitude.
4. **Directions API**: Navigation routes from user/vehicle to charging stations.
5. **Distance Matrix API**: Compute travel distance and Estimated Time of Arrival (ETA).
6. **Geolocation API**: Current user location integration.

---

## Existing Functionality Preserved

The following features must remain fully operational without any visual redesign:
* Charging station markers with live availability counts
* Booking and station detail sheets/popups
* Filter by connector, availability, and pricing
* User current location pinpoint and center actions
* Nearby charging stations lists and distance metrics
* Route-to-station navigation overlays
* Smart battery plan calculations & ETA
* Firebase/Firestore integrations, schemas, and collections (`users`, `owners`, `stations`, `bookings`, `payments`, `notifications`)
* n8n automation webhook notifications

---

## Required UI Changes

* Mapbox components are swapped out for Google Maps equivalents.
* Layout, glassmorphism visual styling, color themes, cards, filters, and buttons remain identical.
* **Marker Behavior**: Each station marker shows the available/total connector ratio (e.g. `2/4`), status color codes (Active=Green, Maintenance=Orange, Offline=Red), and supports selection.

---

## Owner Module Improvements

While adding/editing a station:
* Remove the need to manually lookup and type latitude/longitude.
* Integrate Google Places Autocomplete on the address search input.
* On selection, automatically fill the Address, Latitude, and Longitude fields.

---

## User Module Improvements

Allow users to:
* Search any city via Google Places search.
* Center on current location.
* Discover nearby stations with distance and travel time.
* Map routes to stations with battery capacity planning, recommended charger stops, and estimated travel time.

---

## Performance & Security

* **Lazy Loading**: Google Maps SDK must be lazy-loaded on demand (using `@googlemaps/js-api-loader`).
* **Marker Clustering**: Optimize marker rendering using Google Maps clustering (`@googlemaps/markerclusterer`) for zoomed-out states.
* **API Key Security**: Move Google Maps API Key to environment variables (`VITE_GOOGLE_MAPS_API_KEY`). Never expose API keys inside frontend code.
