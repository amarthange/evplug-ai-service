import { ChatContext } from "./geminiChatbot";

export const handleFunctionCallingMessage = async (message: string, context: ChatContext): Promise<string> => {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) throw new Error("VITE_GEMINI_API_KEY is not defined");

  const lat = context.currentLocation?.lat;
  const lon = context.currentLocation?.lon;
  
  console.log("Current Location:", lat, lon);

  if (!lat || !lon) {
    return "Please enable location access so I can find charging stations near you. 📍";
  }

  const systemPrompt = `You are an EV Assistant for EVPlugFinder.
Help users with charging station information, bookings, and environmental impact.
Use the find_nearby_stations tool if the user asks to find chargers.

CRITICAL INSTRUCTIONS FOR FUNCTION CALL RESPONSES:
- The functionResponse is the absolute source of truth. NEVER ignore station data supplied through functionResponse.
- If the functionResponse contains one or more stations, ALWAYS list the stations.
- Format each station with: Name, Distance, Availability, and Connector Types.
- Only return "No charging stations found near your location." when the stations array length is exactly 0. NEVER say this if stations are provided.

Be helpful, concise, and professional.

User context:
- Name: ${context.fullName || "User"}
- Current Location: lat ${lat}, lon ${lon}
- Car: ${context.primaryCar ? `${context.primaryCar.brand} ${context.primaryCar.model}` : "Not specified"}
- Stats: ${context.role === "user" ? `${context.chargingStats.totalSessions} sessions` : ""}`;

  const tools = [{
    functionDeclarations: [{
      name: "find_nearby_stations",
      description: "Finds charging stations near a location. Call this when the user is looking for stations.",
      parameters: {
        type: "OBJECT",
        properties: {
          lat: { type: "NUMBER", description: "Latitude" },
          lon: { type: "NUMBER", description: "Longitude" },
          connector_type: { type: "STRING", description: "Type of connector, e.g. CCS, Type 2, Tesla Supercharger" }
        },
        required: ["lat", "lon"]
      }
    }]
  }];

  const initialMessages = [
    {
      role: "user",
      parts: [{ text: `${systemPrompt}\n\nUser asked: ${message}` }]
    }
  ];

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: initialMessages,
          tools,
          generationConfig: { temperature: 0.1 }
        })
      }
    );

    if (!response.ok) {
      if (response.status === 429) throw new Error("429");
      throw new Error("Failed to reach Gemini API");
    }
    const data = await response.json();
    const candidate = data.candidates?.[0];
    const part = candidate?.content?.parts?.[0];

    if (!part) return "I'm sorry, I couldn't process that.";

    if (part.functionCall && part.functionCall.name === "find_nearby_stations") {
      const args = part.functionCall.args;
      const qLat = args.lat || lat;
      const qLon = args.lon || lon;
      const cType = args.connector_type || "";

      try {
        const apiUrl = `/api/stations/nearby?lat=${qLat}&lon=${qLon}&radius_km=150`;
        console.log("Nearby API URL:", apiUrl);
        const apiRes = await fetch(apiUrl);
        if (!apiRes.ok) throw new Error("API failed");
        let stations = await apiRes.json();
        console.log("Raw Station Count:", stations.length);

        // 1. Calculate distance on client since API doesn't return it
        const calculateHaversineDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
          const R = 6371;
          const dLat = (lat2 - lat1) * Math.PI / 180;
          const dLon = (lon2 - lon1) * Math.PI / 180;
          const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
                    Math.sin(dLon/2) * Math.sin(dLon/2);
          const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
          return R * c;
        };

        stations = stations.map((s: any) => ({
          ...s,
          distance: calculateHaversineDistance(qLat, qLon, s.lat, s.lon)
        }));

        // Additional client-side filtering as per requirements
        stations = stations.filter((s: any) => {
          if (typeof s.status === 'boolean') return s.status === true;
          return s.status?.toString().toLowerCase() === 'active';
        });
        console.log("After Active Filter:", stations.length);
        
        // Availability > 0
        stations = stations.filter((s: any) => {
          const availableCount = s.connectors?.filter((c: any) => c.available).length || 0;
          return availableCount > 0;
        });
        console.log("After Availability Filter:", stations.length);

        // Connector type matching
        if (cType) {
          const normalizeConnector = (str: string) => str.toLowerCase().replace(/[\s-]/g, '');
          const searchType = normalizeConnector(cType);
          
          stations = stations.filter((s: any) => 
            s.connectors?.some((c: any) => normalizeConnector(c.type).includes(searchType)) ||
            s.chargerTypes?.some((t: string) => normalizeConnector(t).includes(searchType))
          );
        }
        console.log("After Connector Filter:", stations.length);

        // Distance sort ASC
        stations = stations.sort((a: any, b: any) => a.distance - b.distance);
        
        console.log("Adaptive Radius Mode Enabled");
        
        let finalStations: any[] = [];
        let usedRadius = 25;
        const radiusSteps = [25, 50, 100, 150];
        
        for (const radius of radiusSteps) {
          console.log("Trying radius:", radius);
          const filtered = stations.filter((s: any) => s.distance <= radius);
          console.log("Stations found:", filtered.length);
          if (filtered.length > 0) {
            finalStations = filtered;
            usedRadius = radius;
            break;
          }
        }

        console.log(`Nearest station distance: ${stations.length > 0 ? stations[0].distance.toFixed(1) + ' km' : 'N/A'}`);
        console.log("Radius used:", usedRadius);
        console.log("Total stations before filter:", stations.length);
        console.log("Total stations after filter:", finalStations.length);

        // Limit 10
        stations = finalStations.slice(0, 10);

        // Simplify payload for Gemini context limit
        const mappedData = stations.map((s: any) => ({
          name: s.name,
          distance_km: parseFloat(s.distance.toFixed(1)),
          price_per_kwh: s.price,
          available_chargers: s.connectors?.filter((c: any) => c.available).length || 0,
          connector_types: Array.from(new Set(s.connectors?.map((c: any) => c.type) || []))
        }));

        // Send function response back to Gemini
        initialMessages.push({
          role: "model",
          parts: [{ functionCall: part.functionCall }]
        });
        
        initialMessages.push({
          role: "user",
          parts: [{
            functionResponse: {
              name: "find_nearby_stations",
              response: { stations: mappedData } // Passed as an object with a 'stations' key
            }
          }]
        });
        
        console.log("Stations sent to Gemini:", mappedData);
        
        const secondRequestBody = {
          contents: initialMessages,
          generationConfig: { temperature: 0.1 }
        };
        
        // Log the payload to verify Gemini is actually receiving the data
        console.log("Second Gemini Request Body:", JSON.stringify(secondRequestBody, null, 2));

        const secondResponse = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(secondRequestBody)
          }
        );

        if (!secondResponse.ok) {
          if (secondResponse.status === 429) throw new Error("429");
          throw new Error("Failed to reach Gemini API on second turn");
        }
        const secondData = await secondResponse.json();
        return secondData.candidates?.[0]?.content?.parts?.[0]?.text || "I'm sorry, I couldn't format the stations.";

      } catch (err) {
        console.error("API call failed", err);
        return "Unable to fetch live station data right now.";
      }
    }

    // Not a function call, return direct response
    return part.text || "I'm sorry, I couldn't process that.";

  } catch (error: any) {
    console.error("Gemini function calling error:", error);
    if (error?.message?.includes("429")) {
      return "⚠️ The AI Assistant has temporarily reached its daily usage limit.\n\nPlease try again later or use the Nearby Stations section for live charger information.";
    }
    return "I'm having trouble accessing our station database. Please try the map for real-time results.";
  }
};
