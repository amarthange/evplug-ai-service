import {
  Station,
  Booking,
  InsertStation,
  InsertBooking,
  Telemetry,
  BookingStatus,
} from "../shared/schema.js";
import { randomUUID } from "crypto";

// Firebase Admin will be used for actual persistence
// This is just the interface definition
export interface IStorage {
  // Stations
  getStation(id: string): Promise<Station | undefined>;
  getStations(): Promise<Station[]>;
  getNearbyStations(lat: number, lon: number, radiusKm: number): Promise<Station[]>;
  createStation(station: InsertStation): Promise<Station>;
  updateStation(id: string, updates: Partial<Station>): Promise<Station | undefined>;

  // Bookings
  getBooking(id: string): Promise<Booking | undefined>;
  getUserBookings(userId: string): Promise<Booking[]>;
  createBooking(booking: InsertBooking): Promise<Booking>;
  updateBooking(id: string, updates: Partial<Booking>): Promise<Booking | undefined>;

  // Telemetry
  createTelemetry(telemetry: Omit<Telemetry, "id">): Promise<Telemetry>;
  getStationTelemetry(stationId: string, limit: number): Promise<Telemetry[]>;

  // n8n Automation
  getHoldBookings(): Promise<Booking[]>;
  cancelExpiredBooking(id: string): Promise<boolean>;
  freeConnectorSlot(bookingId: string): Promise<boolean>;
}

// In-memory storage for development (Note: Firebase is used in production via client-side or admin SDK)
export class MemStorage implements IStorage {
  private stations: Map<string, Station> = new Map();
  private bookings: Map<string, Booking> = new Map();
  private telemetry: Map<string, Telemetry> = new Map();

  // n8n Automation Implementation
  async getHoldBookings(): Promise<Booking[]> {
    return Array.from(this.bookings.values()).filter(
      (b) => b.status === BookingStatus.PENDING && (b as any).paymentStatus !== "paid"
    );
  }

  async cancelExpiredBooking(id: string): Promise<boolean> {
    const booking = this.bookings.get(id);
    if (!booking) return false;
    
    const b = booking as any;
    const currentTime = Date.now();
    
    if (b.status === BookingStatus.PENDING && b.holdExpiresAt < currentTime) {
      const updated = {
        ...booking,
        status: BookingStatus.CANCELLED,
        cancelledAt: currentTime
      };
      this.bookings.set(id, updated as any);
      return true;
    }
    return false;
  }

  async freeConnectorSlot(bookingId: string): Promise<boolean> {
    const booking = this.bookings.get(bookingId);
    if (!booking) return false;

    const station = this.stations.get(booking.stationId);
    if (!station) return false;

    const connectors = [...station.connectors];
    const connectorIndex = connectors.findIndex((c) => c.id === booking.connectorId);

    if (connectorIndex !== -1) {
      const connector = connectors[connectorIndex];
      const count = (connector as any).count || 0;
      connectors[connectorIndex] = {
        ...connector,
        count: count + 1,
        available: true
      };
      
      this.stations.set(station.id, {
        ...station,
        connectors
      });
      return true;
    }
    return false;
  }

  async getStation(id: string): Promise<Station | undefined> {
    return this.stations.get(id);
  }

  async getStations(): Promise<Station[]> {
    return Array.from(this.stations.values());
  }

  async getNearbyStations(lat: number, lon: number, radiusKm: number): Promise<Station[]> {
    const stations = Array.from(this.stations.values());
    return stations.filter((station) => {
      const distance = this.calculateDistance(lat, lon, station.lat, station.lon);
      return distance <= radiusKm;
    });
  }

  async createStation(insertStation: InsertStation): Promise<Station> {
    const id = randomUUID();
    const station: Station = { ...insertStation, id };
    this.stations.set(id, station);
    return station;
  }

  async updateStation(id: string, updates: Partial<Station>): Promise<Station | undefined> {
    const station = this.stations.get(id);
    if (!station) return undefined;
    const updated = { ...station, ...updates };
    this.stations.set(id, updated);
    return updated;
  }

  async getBooking(id: string): Promise<Booking | undefined> {
    return this.bookings.get(id);
  }

  async getUserBookings(userId: string): Promise<Booking[]> {
    return Array.from(this.bookings.values()).filter((b) => b.userId === userId);
  }

  async createBooking(insertBooking: InsertBooking): Promise<Booking> {
    const id = randomUUID();
    const booking: Booking = {
      ...insertBooking,
      id,
      createdAt: Date.now(),
    };
    this.bookings.set(id, booking);
    return booking;
  }

  async updateBooking(id: string, updates: Partial<Booking>): Promise<Booking | undefined> {
    const booking = this.bookings.get(id);
    if (!booking) return undefined;
    const updated = { ...booking, ...updates };
    this.bookings.set(id, updated);
    return updated;
  }

  async createTelemetry(data: Omit<Telemetry, "id">): Promise<Telemetry> {
    const id = randomUUID();
    const telemetry: Telemetry = { ...data, id };
    this.telemetry.set(id, telemetry);
    return telemetry;
  }

  async getStationTelemetry(stationId: string, limit: number): Promise<Telemetry[]> {
    return Array.from(this.telemetry.values())
      .filter((t) => t.stationId === stationId)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }

  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // Earth's radius in km
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }
}

export const storage = new MemStorage();
