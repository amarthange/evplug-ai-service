import axios from "axios";
import { PredictionResponse } from "@shared/schema";

/**
 * Predicts availability of a charging station.
 */
export async function predictAvailability(stationId: string, timestamp?: number): Promise<PredictionResponse> {
  const response = await axios.post<PredictionResponse>("/api/ml/predict-availability", {
    station_id: stationId,
    timestamp: timestamp || Date.now()
  });
  return response.data;
}

/**
 * Predicts estimated time of arrival (ETA) to a charging station.
 */
export async function predictETA(params: {
  distance: number;
  traffic_index: number;
  temperature: number;
  timestamp?: number;
}): Promise<PredictionResponse> {
  const response = await axios.post<PredictionResponse>("/api/ml/predict-eta", {
    ...params,
    timestamp: params.timestamp || Date.now()
  });
  return response.data;
}

/**
 * Batch calls ML service for multiple stations to get ranked predictions.
 */
export async function batchPredict(params: {
  userId: string;
  userLocation: { latitude: number; longitude: number };
  stationIds: string[];
}): Promise<any[]> {
  const response = await axios.post<any[]>("/api/ml/batch-predict", {
    user_id: params.userId,
    user_location: {
      latitude: params.userLocation.latitude,
      longitude: params.userLocation.longitude
    },
    station_ids: params.stationIds
  });
  return response.data;
}
