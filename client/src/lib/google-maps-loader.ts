import { setOptions, importLibrary } from "@googlemaps/js-api-loader";

const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";

// Initialize options
setOptions({
  key: apiKey,
  v: "weekly",
});

let loadPromise: Promise<any> | null = null;
let isAuthFailure = false;
const authFailureCallbacks = new Set<() => void>();

if (typeof window !== "undefined") {
  (window as any).gm_authFailure = () => {
    isAuthFailure = true;
    console.error("Google Maps API Authentication Failure detected (e.g., RefererNotAllowedMapError).");
    authFailureCallbacks.forEach((cb) => cb());
  };
}

export const googleMapsLoader = {
  load: (): Promise<any> => {
    if (!loadPromise) {
      loadPromise = Promise.all([
        importLibrary("maps"),
        importLibrary("marker"),
        importLibrary("places"),
        importLibrary("visualization"),
      ]);
    }
    return loadPromise;
  },
  hasAuthFailed: () => isAuthFailure,
  onAuthFailure: (callback: () => void) => {
    authFailureCallbacks.add(callback);
    // If auth failure already occurred before subscription, invoke immediately
    if (isAuthFailure) {
      callback();
    }
    return () => {
      authFailureCallbacks.delete(callback);
    };
  },
};
