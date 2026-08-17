import { safeFormat, toJSDate } from "@/lib/date-utils";
import { db } from "@/lib/firebase";
import { collection, query, getDocs, where, limit, orderBy } from "firebase/firestore";
import { handleFunctionCallingMessage } from "./geminiFunctionCalling";

export interface UserContext {
  role: "user";
  uid?: string;
  fullName?: string;
  upcomingBookings: any[];
  chargingStats: {
    totalSessions: number;
    kwhCharged: number;
    co2Saved: number;
  };
  primaryCar?: {
    brand: string;
    model: string;
    batteryCapacity: number;
    chargeType: string;
  };
  currentLocation?: {
    lat: number;
    lon: number;
  };
}

export interface OwnerContext {
  role: "owner";
  fullName?: string;
  stats: {
    totalRevenue: number;
    activeStations: number;
    pendingRequests: number;
    todayBookings: number;
    avgRating: number;
  };
  stations: any[];
  recentBookings: any[];
}

export type ChatContext = UserContext | OwnerContext;

const getGeminiResponse = async (
  message: string,
  context: ChatContext,
  dataResponse?: string
) => {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) throw new Error("VITE_GEMINI_API_KEY is not defined");

  let systemPrompt = "";
  
  if (context.role === "owner") {
    const s = context.stats;
    systemPrompt = `You are a professional business assistant for an EV Charging Station Owner in India.
Act as a consultant. Help with: peak load analysis, revenue growth, and station health.
Keep answers concise and helpful (2-4 sentences).

Owner Context:
- Name: ${context.fullName || "Owner"}
- Stations: ${s.activeStations} active.
- Revenue: ₹${s.totalRevenue.toLocaleString()} total.
- Today: ${s.todayBookings} bookings.
- Rating: ${s.avgRating}/5.0`;
  } else {
    const s = context.chargingStats;
    systemPrompt = `You are an EV Assistant for EVPlugFinder.
Help users with charging station information, bookings, and environmental impact.

Rules:
1. If data is provided (dataResponse), use it directly without modification.
2. If no data is found, say: 'No charging stations found near your location.'
3. Be helpful, concise, and professional.
4. If a user asks for a feature not yet available, suggest checking the dashboard.

User context:
- Name: ${context.fullName || "User"}
- Car: ${context.primaryCar ? `${context.primaryCar.brand} ${context.primaryCar.model}` : "Not specified"}
- Stats: ${s.totalSessions} sessions, ${s.kwhCharged}kWh charged.`;
  }

  const userMessage = dataResponse ? `${dataResponse}\n\nUser asked: ${message}` : message;

  const requestBody = {
    contents: [{
      parts: [{
        text: `${systemPrompt}\n\n${userMessage}`
      }]
    }],
    generationConfig: {
      maxOutputTokens: 1000,
      temperature: 0.1,
      topP: 0.9
    }
  };

  console.log("Gemini Request:", requestBody);

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(requestBody)
      }
    );
    
    console.log("Gemini Response Status:", response.status);
    
    let responseJson;
    try {
      responseJson = await response.json();
      console.log("Gemini Response JSON:", responseJson);
    } catch (e) {
      console.log("Gemini Response JSON parsing failed:", e);
    }
    
    if (!response.ok) {
      throw new Error(`Failed to get AI response: ${response.status} - ${JSON.stringify(responseJson)}`);
    }

    return responseJson?.candidates?.[0]?.content?.parts?.[0]?.text || "I'm sorry, I couldn't process that.";
  } catch (error) {
    console.error("Gemini Error:", error);
    throw error;
  }
};

const rateLimiter = {
  requests: [] as number[],
  
  canMakeRequest(): boolean {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    this.requests = this.requests.filter(t => t > oneMinuteAgo);
    if (this.requests.length >= 14) return false;
    this.requests.push(now);
    return true;
  }
};

const checkDailyLimit = (): boolean => {
  const today = new Date().toISOString().slice(0, 10);
  const key = `gemini_requests_${today}`;
  const count = parseInt(localStorage.getItem(key) || "0");
  if (count >= 1400) return false;
  localStorage.setItem(key, (count + 1).toString());
  return true;
};

const safeGeminiCall = async (message: string, context: ChatContext, dataResponse?: string): Promise<string> => {
  if (!rateLimiter.canMakeRequest()) {
    return "I'm a bit busy right now. Please try again in a minute! 😊";
  }
  if (!checkDailyLimit()) {
    return "I've reached my daily limit. I'll be back tomorrow!";
  }

  let retries = 3;
  let lastError: any;

  while (retries > 0) {
    try {
      // Add a small timeout to the fetch inside getGeminiResponse if needed, 
      // but here we just wrap the call.
      return await getGeminiResponse(message, context, dataResponse);
    } catch (error: any) {
      if (error?.message?.includes("429")) {
        return "⚠️ The AI Assistant has temporarily reached its daily usage limit.\n\nPlease try again later or use the Nearby Stations section for live charger information.";
      }
      lastError = error;
      retries--;
      if (retries > 0) {
        console.log(`Gemini API failed, retrying... (${retries} left)`);
        await new Promise(resolve => setTimeout(resolve, 1500)); // Wait before retry
      }
    }
  }

  console.error("Gemini API Max Retries Reached:", lastError);
  throw lastError; // Let handleUserMessage handle the final fallback
};

const getQuickAnswer = (message: string, context: ChatContext): string | null => {
  const msg = message.toLowerCase();
  
  if (context.role === "owner") {
    const s = context.stats;
    if (msg.includes("revenue") || msg.includes("earning")) {
      return `Total revenue across your ${s.activeStations} stations is ₹${s.totalRevenue.toLocaleString()}. Today you have ${s.todayBookings} new bookings! 💰`;
    }
    if (msg.includes("station") && (msg.includes("status") || msg.includes("health"))) {
      return `Currently, ${s.activeStations} of your stations are active and fully operational. Keep an eye on your pending reviews for driver feedback! ⚡`;
    }
  } else {
    // User logic
    if ((msg.includes("booking") || msg.includes("reservation")) && 
        (msg.includes("next") || msg.includes("upcoming"))) {
      if (!context.upcomingBookings.length) 
        return "You have no upcoming bookings. You can book a station directly from the map! 🗺️";
      
      const next = context.upcomingBookings[0];
      const time = next.startTime ? safeFormat(toJSDate(next.startTime), "MMM d, h:mm a") : "upcoming";
      return `Your next booking is at ${next.stationName || "your selected station"} on ${time} ⚡`;
    }
    const s = context.chargingStats;
    if (msg.includes("co2") || msg.includes("carbon") || msg.includes("environment") || msg.includes("tree")) {
      const trees = (s.co2Saved / 21.7).toFixed(1);
      return `🌱 You've saved ${s.co2Saved}kg of CO₂ across ${s.totalSessions} sessions! This is equivalent to planting ${trees} trees! 🌳`;
    }
  }
  
  return null;
};

const calculateHaversineDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
};

export const handleUserMessage = async (message: string, context: ChatContext): Promise<string> => {
  const isFunctionCallingEnabled = import.meta.env.VITE_ENABLE_GEMINI_FUNCTION_CALLING === 'true';
  
  if (isFunctionCallingEnabled && context.role === "user") {
    // If enabled, divert to the new architecture to prevent side effects on maps
    return await handleFunctionCallingMessage(message, context);
  }

  const msg = message.toLowerCase();
  
  // 1. INTENT DETECTION
  const isFindingStation = msg.includes("find") || msg.includes("station") || msg.includes("near") || msg.includes("search") || msg.includes("where") || msg.includes("plan");
  const isBookingAction = msg.includes("booking") || msg.includes("book") || msg.includes("reservation");
  const isStatsAction = msg.includes("stats") || msg.includes("co2") || msg.includes("carbon") || msg.includes("saved");
  
  // Charger type detection
  let targetChargerType = "";
  if (msg.includes("ccs2") || msg.includes("ccs")) targetChargerType = "CCS";
  else if (msg.includes("type2") || msg.includes("type 2")) targetChargerType = "Type 2";
  else if (msg.includes("tesla")) targetChargerType = "Tesla Supercharger";

  // 2. LOCATION HANDLING & FIRESTORE QUERY
  if (isFindingStation && context.role === "user") {
    if (!context.currentLocation) {
      return "Please enable location access so I can find charging stations near you. 📍";
    }

    try {
      const stationsRef = collection(db, "stations");
      let q;
      
      // Detected types for filtering
      const typesToSearch: string[] = [];
      if (msg.includes("ccs")) typesToSearch.push("CCS");
      if (msg.includes("type 2") || msg.includes("type2")) typesToSearch.push("Type 2");
      if (msg.includes("tesla")) typesToSearch.push("Tesla Supercharger");

      // Initial query: only active stations
      q = query(stationsRef, where("status", "==", "active"));
      const querySnapshot = await getDocs(q);
      
      let allStations = querySnapshot.docs.map(doc => {
        const data = doc.data() as any;
        const dist = calculateHaversineDistance(
          context.currentLocation!.lat, 
          context.currentLocation!.lon, 
          data.lat, 
          data.lon
        );
        return { id: doc.id, ...data, distance: dist };
      });

      // Filter by type in memory to be robust against missing chargerTypes field
      if (typesToSearch.length > 0) {
        allStations = allStations.filter(s => 
          s.connectors?.some((c: any) => typesToSearch.some(t => c.type.includes(t))) ||
          s.chargerTypes?.some((t: string) => typesToSearch.includes(t))
        );
      }

      // Radius filter: Use 30km for better testing visibility, fallback to 10km if many found
      let nearbyStations = allStations
        .filter(s => s.distance <= 30)
        .sort((a, b) => a.distance - b.distance);
      
      // If we have many nearby, stick to the 10km requested limit
      if (nearbyStations.filter(s => s.distance <= 10).length > 0) {
        nearbyStations = nearbyStations.filter(s => s.distance <= 10);
      }

      nearbyStations = nearbyStations.slice(0, 5);

      if (nearbyStations.length === 0) {
        return "I couldn't find any active charging stations within 30km of your location. Please check the map for a wider search! 🗺️";
      }

      // 4. CLEAN RESPONSE FORMAT
      const stationOutput = nearbyStations.map((s: any) => {
        const availableCount = s.connectors?.filter((c: any) => c.available).length || 0;
        const totalCount = s.connectors?.length || 0;
        const chargerTypes = Array.from(new Set(s.connectors?.map((c: any) => c.type) || [])).join(", ");
        
        return `🔌 Station: ${s.name}
📍 Distance: ${s.distance.toFixed(1)} km
⚡ Chargers: ${chargerTypes}
🔢 Slots Available: ${availableCount}/${totalCount}
✅ Status: ${availableCount > 0 ? "Available" : "Full"}`;
      }).join("\n\n");

      // Check if this was a button click that should skip AI
      const skipAI = msg === "find ccs2 near me" || msg === "find all chargers near me";

      if (skipAI) {
        return `✅ Here are the nearest stations:\n\n${stationOutput}`;
      }

      try {
        // AI assists in conversation if available
        return await safeGeminiCall(message, context, `I found these charging stations within 10km:\n\n${stationOutput}`);
      } catch (aiError) {
        // FALLBACK LOGIC: If AI fails after retries, return data directly
        return `🤖 AI is temporarily unavailable. Showing nearby stations:\n\n${stationOutput}`;
      }
    } catch (error) {
      console.error("Firestore error:", error);
      return "I'm having trouble accessing our station database. Please try the map for real-time results.";
    }
  }

  // Handle specific "My next booking" chip
  if ((msg.includes("my next booking") || (isBookingAction && msg.includes("next"))) && context.role === "user") {
    try {
      const userId = context.role === "user" ? context.uid : undefined;
      if (!userId) return "Please sign in to check your bookings.";

      const bookingsRef = collection(db, "bookings");
      const q = query(
        bookingsRef, 
        where("userId", "==", userId),
        where("status", "in", ["confirmed", "pending", "active"]),
        orderBy("startTime", "asc"),
        limit(1)
      );
      
      const querySnapshot = await getDocs(q);
      if (querySnapshot.empty) {
        return "You have no upcoming bookings. You can book a station directly from the map! 🗺️";
      }

      const next = querySnapshot.docs[0].data();
      const time = next.startTime ? safeFormat(toJSDate(next.startTime), "MMM d, h:mm a") : "upcoming";
      return `📅 Your next booking:
🔌 Station: ${next.stationName || "EVPlugFinder Station"}
⏰ Time: ${time}
⚡ Status: ${next.status.toUpperCase()}`;
    } catch (error) {
      console.error("Booking fetch error:", error);
      return "I couldn't fetch your bookings. Try checking the Activity tab.";
    }
  }

  // Handle CO2 saved intent
  if (isStatsAction && context.role === "user") {
    const s = context.chargingStats;
    const trees = (s.co2Saved / 21.7).toFixed(1);
    return `🌱 Environmental Impact:
🌍 CO2 Saved: ${s.co2Saved}kg
🌳 Tree Equivalent: ${trees} trees
⚡ Total Sessions: ${s.totalSessions}`;
  }

  // Original quick answers fallback
  const quickAnswer = getQuickAnswer(message, context);
  if (quickAnswer) return quickAnswer;
  
  try {
    return await safeGeminiCall(message, context);
  } catch (error) {
    return "I couldn't process that right now. Try checking your dashboard for reports.";
  }
};
