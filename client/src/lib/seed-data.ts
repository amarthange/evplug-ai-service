// Seed initial data to Firestore for development
import { collection, addDoc, getDocs } from "firebase/firestore";
import { db } from "./firebase";
import type { Station } from "@shared/schema";

const CITIES = [
  { name: "Pune", lat: 18.5204, lon: 73.8567 },
  { name: "Mumbai", lat: 19.0760, lon: 72.8777 },
  { name: "Bangalore", lat: 12.9716, lon: 77.5946 },
  { name: "Delhi", lat: 28.6139, lon: 77.2090 },
  { name: "Hyderabad", lat: 17.3850, lon: 78.4867 },
  { name: "Chennai", lat: 13.0827, lon: 80.2707 },
  { name: "Ahmedabad", lat: 23.0225, lon: 72.5714 },
  { name: "Kolkata", lat: 22.5726, lon: 88.3639 }
];

const STATION_NAMES = [
  "EV Power Hub", "EcoCharge Station", "VoltPoint Terminal", "GreenDrive Plaza", 
  "Lightning Port", "JuiceBox Center", "SparkConnect", "Tesla Grid", 
  "RapidCharge Hub", "SuperVolt Station", "CleanEnergy Port", "FutureFuel Hub"
];

const AMENITIES = ["WiFi", "Café", "Restrooms", "Convenience Store", "Pharmacy", "Lounge", "Restaurant", "Shopping"];

// Helper to generate random stations
function generateRandomStations(count: number): Omit<Station, "id">[] {
  const stations: Omit<Station, "id">[] = [];
  
  for (let i = 0; i < count; i++) {
    const city = CITIES[Math.floor(Math.random() * CITIES.length)];
    const namePrefix = STATION_NAMES[Math.floor(Math.random() * STATION_NAMES.length)];
    
    // Add small random offset to lat/lon for spread within city
    const lat = city.lat + (Math.random() - 0.5) * 0.2;
    const lon = city.lon + (Math.random() - 0.5) * 0.2;
    
    const statuses: Array<"active" | "pending" | "maintenance" | "rejected"> = ["active", "active", "active", "pending", "maintenance", "rejected"];
    const status = statuses[Math.floor(Math.random() * statuses.length)];

    stations.push({
      name: `${namePrefix} - ${city.name} ${i + 1}`,
      address: `${Math.floor(Math.random() * 999)} Sector, ${city.name}, India`,
      lat,
      lon,
      rating: Number((3 + Math.random() * 2).toFixed(1)),
      amenities: AMENITIES.filter(() => Math.random() > 0.6),
      operatingHours: Math.random() > 0.7 ? "24/7" : "6 AM - 11 PM",
      lastUpdated: Date.now(),
      status,
      ownerId: "system-seed",
      maintenanceRiskScore: Number(Math.random().toFixed(2)),
      faultHistory: [],
      connectors: [
        {
          id: `conn-${i}-1`,
          type: "CCS",
          powerKw: 150,
          pricePerKwh: 12 + Math.floor(Math.random() * 5),
          count: Math.floor(Math.random() * 5) + 1,
          available: Math.random() > 0.3
        },
        {
          id: `conn-${i}-2`,
          type: "Type 2",
          powerKw: 50,
          pricePerKwh: 8 + Math.floor(Math.random() * 3),
          count: Math.floor(Math.random() * 5) + 1,
          available: Math.random() > 0.3
        }
      ],
      chargerTypes: ["CCS", "Type 2"]
    });
  }
  
  return stations;
}

export async function seedStations(adminUid?: string) {
  try {
    console.log("🌱 Cleaning and Seeding 50+ Stations...");

    const stationsRef = collection(db, "stations");
    const existing = await getDocs(stationsRef);
    
    if (existing.size > 20) {
      console.log(`✅ Database already has ${existing.size} stations. Skipping auto-seed.`);
      return false;
    }

    const stationsToSeed = generateRandomStations(55);

    for (let i = 0; i < stationsToSeed.length; i++) {
        const station = {
          ...stationsToSeed[i],
          ownerId: adminUid || "system-seed"
        };
        try {
          await addDoc(stationsRef, station);
        } catch (docError) {
          console.error(`❌ Failed to add station ${i + 1}:`, docError);
        }
    }

    console.log(`✅ Seeding complete! Added ${stationsToSeed.length} stations.`);
    return true;
  } catch (error) {
    console.error("❌ Error seeding stations:", error);
    return false;
  }
}

export async function manualSeed(adminUid?: string) {
  return seedStations(adminUid);
}

// Auto-seed on app load in development
if (import.meta.env.DEV) {
  setTimeout(() => {
    seedStations().catch((err) => console.error("Auto-seed failed:", err));
  }, 1000);
}
