#!/usr/bin/env python3
"""
EV Charging Station Telemetry Simulator

Generates synthetic occupancy data for charging stations and writes to:
- Firestore (if credentials provided)
- Local JSON file (fallback)

Usage:
    python run_simulator.py --station-count 10 --interval-seconds 30 --use-firestore true
"""
import argparse
import json
import time
import random
import os
from datetime import datetime
from typing import List, Dict, Any

# Try to import Firebase Admin
try:
    import firebase_admin
    from firebase_admin import credentials, firestore
    FIREBASE_AVAILABLE = True
except ImportError:
    FIREBASE_AVAILABLE = False
    print("⚠️  firebase-admin not installed. Install with: pip install firebase-admin")

class ChargingStation:
    """Represents a charging station with connectors"""
    def __init__(self, station_id: str, name: str, lat: float, lon: float, num_connectors: int):
        self.station_id = station_id
        self.name = name
        self.lat = lat
        self.lon = lon
        self.num_connectors = num_connectors
        self.connectors = self._create_connectors(num_connectors)
    
    def _create_connectors(self, num: int) -> List[Dict[str, Any]]:
        """Create connector configurations"""
        connector_types = ["CCS", "CHAdeMO", "Type 2", "Tesla Supercharger"]
        connectors = []
        
        for i in range(num):
            connector_type = random.choice(connector_types)
            connectors.append({
                "id": f"{self.station_id}-connector-{i+1}",
                "type": connector_type,
                "powerKw": random.choice([50, 75, 100, 150, 250]),
                "pricePerKwh": round(random.uniform(0.25, 0.45), 2),
                "available": random.random() > 0.3  # 70% initially available
            })
        
        return connectors
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for storage"""
        return {
            "id": self.station_id,
            "name": self.name,
            "address": f"{random.randint(100, 9999)} Main St, San Francisco, CA",
            "lat": self.lat,
            "lon": self.lon,
            "connectors": self.connectors,
            "rating": round(random.uniform(3.5, 5.0), 1),
            "amenities": random.sample(
                ["WiFi", "Restrooms", "Coffee Shop", "Convenience Store", "Restaurant"],
                k=random.randint(1, 3)
            ),
            "operatingHours": "24/7",
            "lastUpdated": int(time.time() * 1000)
        }
    
    def simulate_occupancy(self) -> int:
        """
        Simulate realistic occupancy patterns
        
        Factors:
        - Time of day (higher during commute hours)
        - Random variation
        - Gradual changes (not too jumpy)
        """
        hour = datetime.now().hour
        
        # Base occupancy by hour (0-1 scale)
        if 7 <= hour < 9 or 17 <= hour < 19:
            base_occupancy = 0.7  # Peak hours
        elif 9 <= hour < 17:
            base_occupancy = 0.5  # Business hours
        elif 19 <= hour < 22:
            base_occupancy = 0.4  # Evening
        else:
            base_occupancy = 0.2  # Night
        
        # Add random variation
        variation = random.uniform(-0.2, 0.2)
        actual_occupancy = max(0, min(1, base_occupancy + variation))
        
        # Convert to number of occupied connectors
        occupied = int(actual_occupancy * self.num_connectors)
        
        # Update connector availability
        for i, connector in enumerate(self.connectors):
            connector["available"] = i >= occupied
        
        return occupied

class Simulator:
    """Main simulator class"""
    def __init__(self, use_firestore: bool = False):
        self.use_firestore = use_firestore and FIREBASE_AVAILABLE
        self.db = None
        self.stations: List[ChargingStation] = []
        self.local_file = "simulator_data.json"
        
        if self.use_firestore:
            self._init_firestore()
    
    def _init_firestore(self):
        """Initialize Firestore connection"""
        try:
            # Check if already initialized
            if not firebase_admin._apps:
                cred_json = os.getenv("FIREBASE_ADMIN_CREDENTIALS")
                if cred_json:
                    cred_dict = json.loads(cred_json)
                    cred = credentials.Certificate(cred_dict)
                    firebase_admin.initialize_app(cred)
                else:
                    print("⚠️  FIREBASE_ADMIN_CREDENTIALS not found, using local file")
                    self.use_firestore = False
                    return
            
            self.db = firestore.client()
            print("✅ Connected to Firestore")
        except Exception as e:
            print(f"❌ Failed to connect to Firestore: {e}")
            print("   Falling back to local JSON file")
            self.use_firestore = False
    
    def create_stations(self, count: int):
        """Create sample charging stations"""
        print(f"Creating {count} charging stations...")
        
        # San Francisco area coordinates
        base_lat, base_lon = 37.7749, -122.4194
        
        station_names = [
            "Downtown Charging Hub",
            "Airport Fast Charge",
            "Marina District Station",
            "Financial District Chargers",
            "Golden Gate Park Station",
            "Mission Bay Charging",
            "SoMa Power Hub",
            "Sunset District Station",
            "Castro Charging Center",
            "Nob Hill Chargers"
        ]
        
        for i in range(count):
            station_id = f"station-{i+1}"
            name = station_names[i % len(station_names)] + f" #{i+1}"
            
            # Random location near San Francisco
            lat = base_lat + random.uniform(-0.05, 0.05)
            lon = base_lon + random.uniform(-0.05, 0.05)
            num_connectors = random.randint(4, 8)
            
            station = ChargingStation(station_id, name, lat, lon, num_connectors)
            self.stations.append(station)
            
            # Write to Firestore or local file
            if self.use_firestore:
                self.db.collection("stations").document(station_id).set(station.to_dict())
            
        print(f"✅ Created {count} stations")
        
        if not self.use_firestore:
            self._save_to_local_file()
    
    def run(self, interval_seconds: int = 30):
        """
        Main simulation loop
        
        Args:
            interval_seconds: How often to update telemetry
        """
        print(f"\n🚀 Starting simulator (interval: {interval_seconds}s)")
        print(f"   Storage: {'Firestore' if self.use_firestore else 'Local JSON'}")
        print(f"   Stations: {len(self.stations)}")
        print("\nPress Ctrl+C to stop\n")
        
        iteration = 0
        try:
            while True:
                iteration += 1
                timestamp = int(time.time() * 1000)
                
                for station in self.stations:
                    # Simulate occupancy
                    occupied = station.simulate_occupancy()
                    
                    # Create telemetry record
                    telemetry = {
                        "stationId": station.station_id,
                        "timestamp": timestamp,
                        "occupied": occupied,
                        "total": station.num_connectors
                    }
                    
                    # Update station document
                    station_data = station.to_dict()
                    station_data["lastUpdated"] = timestamp
                    
                    # Write to storage
                    if self.use_firestore:
                        # Update station
                        self.db.collection("stations").document(station.station_id).set(
                            station_data, merge=True
                        )
                        
                        # Add telemetry
                        self.db.collection("telemetry").add(telemetry)
                    else:
                        # Local file will be updated after all stations
                        pass
                    
                    print(f"[{datetime.now().strftime('%H:%M:%S')}] "
                          f"{station.name}: {occupied}/{station.num_connectors} occupied")
                
                if not self.use_firestore:
                    self._save_to_local_file()
                
                print(f"--- Iteration {iteration} complete ---\n")
                time.sleep(interval_seconds)
                
        except KeyboardInterrupt:
            print("\n\n✅ Simulator stopped")
            print(f"   Total iterations: {iteration}")
    
    def _save_to_local_file(self):
        """Save stations to local JSON file"""
        data = {
            "stations": [s.to_dict() for s in self.stations],
            "lastUpdated": int(time.time() * 1000)
        }
        
        with open(self.local_file, "w") as f:
            json.dump(data, f, indent=2)

def main():
    parser = argparse.ArgumentParser(description="EV Charging Station Telemetry Simulator")
    parser.add_argument("--station-count", type=int, default=10,
                       help="Number of stations to create")
    parser.add_argument("--interval-seconds", type=int, default=30,
                       help="Update interval in seconds")
    parser.add_argument("--use-firestore", type=str, default="false",
                       help="Use Firestore for storage (true/false)")
    
    args = parser.parse_args()
    
    use_firestore = args.use_firestore.lower() == "true"
    
    simulator = Simulator(use_firestore=use_firestore)
    simulator.create_stations(args.station_count)
    simulator.run(args.interval_seconds)

if __name__ == "__main__":
    main()
