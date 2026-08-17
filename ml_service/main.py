import os
import time
import asyncio
from datetime import datetime
from typing import List, Optional
from fastapi import FastAPI, HTTPException, BackgroundTasks
from pydantic import BaseModel
from dotenv import load_dotenv
import firebase_admin
from firebase_admin import credentials, firestore

# Local imports
from src.features.feature_engineering import (
    extract_time_features, encode_traffic, calculate_distance, build_lstm_sequence, extract_lstm_row
)
from src.models.lstm_predictor import LSTMPredictor
from src.models.eta_predictor import ETAPredictor
from src.models.cf_recommender import CFRecommender
from src.models.meta_ranker import MetaRanker
from src.models.fallback_strategies import log_cold_start, get_popularity_score
from src.monitoring.prediction_logger import log_prediction

# Load environment variables
load_dotenv()

app = FastAPI(title="EVPlugFinder ML Service", version="1.0.0")

# Initialize Firebase — supports both file path (dev) and JSON string env var (Render/Vercel)
def _init_firebase():
    # Option 1: JSON string in env var (production / Render)
    cred_json = os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON")
    if cred_json:
        import json
        cred_dict = json.loads(cred_json)
        cred = credentials.Certificate(cred_dict)
        firebase_admin.initialize_app(cred)
        print("Firebase initialized from FIREBASE_SERVICE_ACCOUNT_JSON env var.")
        return

    # Option 2: File path (local dev)
    cred_path = os.getenv("FIREBASE_SERVICE_ACCOUNT_PATH", "./serviceAccountKey.json")
    if os.path.exists(cred_path):
        cred = credentials.Certificate(cred_path)
        firebase_admin.initialize_app(cred)
        print(f"Firebase initialized from file: {cred_path}")
        return

    # Option 3: Application Default Credentials (GCP / Cloud Run)
    try:
        firebase_admin.initialize_app()
        print("Firebase initialized from Application Default Credentials.")
    except Exception as e:
        print(f"Warning: Firebase not initialized: {e}. Firestore logging will be skipped.")

_init_firebase()

# Global model instances
MODEL_DIR = os.getenv("MODEL_DIR", "./models")
lstm_predictor = None
eta_predictor = None
cf_recommender = None
meta_ranker = None

# Uptime tracking
APP_START_TIME = time.time()

@app.on_event("startup")
async def load_models():
    global lstm_predictor, eta_predictor, cf_recommender, meta_ranker
    try:
        lstm_predictor = LSTMPredictor(
            os.path.join(MODEL_DIR, "lstm_availability.pth"),
            os.path.join(MODEL_DIR, "availability_scaler.pkl"),
            os.path.join(MODEL_DIR, "station_encoder.pkl")
        )
        eta_predictor = ETAPredictor(os.path.join(MODEL_DIR, "eta_lgb_model.pkl"))
        cf_recommender = CFRecommender(
            os.path.join(MODEL_DIR, "svd_cf.pkl"),
            os.path.join(MODEL_DIR, "cf_user_encoder.pkl"),
            os.path.join(MODEL_DIR, "cf_station_encoder.pkl")
        )
        meta_ranker = MetaRanker(os.path.join(MODEL_DIR, "meta_learner_model.pkl"))
        print("All models loaded successfully.")
    except Exception as e:
        print(f"Error loading models: {e}")

# Schemas
class AvailabilityRequest(BaseModel):
    station_id: str
    timestamp: str

class ETARequest(BaseModel):
    distance: float
    traffic_index: float
    temperature: float
    timestamp: str

class CFRequest(BaseModel):
    user_id: str
    station_id: str

class RankingRequest(BaseModel):
    user_id: str
    user_location: List[float] # [lat, lon]
    stations: List[dict] # List of {id, lat, lon}

@app.post("/predict-availability")
async def predict_availability(req: AvailabilityRequest, background_tasks: BackgroundTasks):
    start_time = time.time()
    try:
        is_cold_start = False
        history_rows = []

        # Fetch last 12 intervals from Firestore (graceful fallback if ADC unavailable)
        try:
            db = firestore.client()
            docs = db.collection('station_history')\
                     .where('stationId', '==', req.station_id)\
                     .order_by('timestamp', direction=firestore.Query.DESCENDING)\
                     .limit(12).get()
            # Build 9-feature rows using extract_lstm_row (LSTM_FEATURE_COLUMNS order)
            for doc in reversed(docs):
                d = doc.to_dict()
                row = extract_lstm_row(d, d.get('timestamp', req.timestamp))
                history_rows.append(row)
        except Exception as fs_err:
            print(f"[predict-availability] Firestore unavailable, using cold-start: {fs_err}")

        if not history_rows:
            is_cold_start = True
            prediction = 0.5
            log_cold_start(None, req.station_id, "availability")  # now safe (guarded internally)
        else:
            if lstm_predictor.scaler is None:
                raise RuntimeError(
                    "availability_scaler.pkl failed to load — cannot scale LSTM input."
                )
            # build_lstm_sequence(history_rows, scaler) → Tensor [1, 12, 9]
            seq_tensor = build_lstm_sequence(history_rows, lstm_predictor.scaler)
            prediction = lstm_predictor.predict(seq_tensor)

        latency = (time.time() - start_time) * 1000
        background_tasks.add_task(
            log_prediction, "lstm_availability", req.dict(), prediction, 0.85, latency
        )
        return {
            "prediction": float(prediction),
            "confidence": 0.85,
            "is_cold_start": is_cold_start,
            "model": "lstm_availability",
            "metadata": {"latency_ms": round(latency, 2)}
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/predict-eta")
async def predict_eta(req: ETARequest, background_tasks: BackgroundTasks):
    start_time = time.time()
    try:
        # build_eta_features produces the exact 6-key dict ETA_FEATURE_ORDER requires:
        # ['Base_ETA_(min)', 'Distance_Driven_(km)', 'traffic_idx',
        #  'hour', 'day_of_week', 'Temperature_(C)']
        from src.features.feature_engineering import build_eta_features
        features = build_eta_features(
            distance_km=req.distance,
            traffic_index=req.traffic_index,
            temperature_c=req.temperature,
            timestamp=req.timestamp,
        )
        prediction = eta_predictor.predict(features)

        latency = (time.time() - start_time) * 1000
        background_tasks.add_task(log_prediction, "eta_lgb", req.dict(), prediction, 0.9, latency)
        return {
            "prediction": float(prediction),
            "confidence": 0.9,
            "model": "eta_lgb",
            "features_used": list(features.keys()),
            "metadata": {"latency_ms": round(latency, 2)}
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/get-cf-score")
async def get_cf_score(req: CFRequest, background_tasks: BackgroundTasks):
    start_time = time.time()
    try:
        score, is_cold_start = cf_recommender.get_score(req.user_id, req.station_id)

        if is_cold_start:
            score = get_popularity_score(req.station_id)  # now safe (no Firestore dependency)
            log_cold_start(req.user_id, req.station_id, "cf_recommender")  # now safe (guarded internally)

        latency = (time.time() - start_time) * 1000
        background_tasks.add_task(log_prediction, "svd_cf", req.dict(), score, 0.7, latency)
        return {
            "score": float(score),
            "is_cold_start": is_cold_start,
            "model": "svd_cf",
            "metadata": {"latency_ms": round(latency, 2)}
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/rank-stations")
async def rank_stations(req: RankingRequest):
    try:
        from src.features.feature_engineering import build_eta_features
        timestamp = datetime.now().isoformat()

        async def get_station_features(station):
            # 1. LSTM availability (simplified — avoids Firestore round-trip per station)
            avail_score = 0.8  # TODO: call lstm_predictor inline when Firestore is available

            # 2. CF score from trained SVD model
            cf_score, _ = cf_recommender.get_score(req.user_id, station['id'])

            # 3. Distance (km) via haversine
            dist = calculate_distance(
                req.user_location[0], req.user_location[1],
                station['lat'], station['lon']
            )

            # 4. ETA via trained LightGBM (uses build_eta_features for correct keys)
            eta_features = build_eta_features(
                distance_km=dist,
                traffic_index=station.get('traffic_index', 0.3),
                temperature_c=station.get('temperature', 25.0),
                timestamp=timestamp,
            )
            eta_minutes = eta_predictor.predict(eta_features)

            # 5. Meta ranker feature vector — MUST match training schema exactly:
            # ['cf_score', 'lstm_avail_prob', 'eta_adjusted', 'price_norm', 'Past_No_Shows']
            price_norm = float(station.get('price_norm', 0.5))
            past_no_shows = float(station.get('past_no_shows', 0.0))
            feature_vec = [cf_score, avail_score, eta_minutes, price_norm, past_no_shows]
            return feature_vec, station

        tasks = [get_station_features(s) for s in req.stations]
        results = await asyncio.gather(*tasks)

        features_matrix = [r[0] for r in results]
        station_data   = [r[1] for r in results]

        meta_scores = meta_ranker.rank(features_matrix)

        ranked_list = []
        for i, score in enumerate(meta_scores):
            station_info = dict(station_data[i])  # copy to avoid mutation
            station_info['meta_score'] = float(score)
            ranked_list.append(station_info)

        ranked_list.sort(key=lambda x: x['meta_score'], reverse=True)
        return {
            "ranked_stations": ranked_list,
            "model": "meta_learner_lgb",
            "feature_schema": ["cf_score", "lstm_avail_prob", "eta_adjusted", "price_norm", "Past_No_Shows"]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
async def health():
    """Production health endpoint — real model state + uptime + fallback mode."""
    uptime_seconds = round(time.time() - APP_START_TIME, 1)
    startup_iso = datetime.fromtimestamp(APP_START_TIME).isoformat()

    model_status = {
        "lstm": lstm_predictor is not None and lstm_predictor.scaler is not None,
        "eta_lgb": eta_predictor is not None,
        "svd": cf_recommender is not None and cf_recommender.model is not None,
        "meta_ranker": meta_ranker is not None,
    }
    all_loaded = all(model_status.values())

    # Detailed per-model info
    model_detail = {
        "lstm_availability": {
            "loaded": lstm_predictor is not None,
            "scaler_loaded": lstm_predictor is not None and lstm_predictor.scaler is not None,
            "encoder_loaded": lstm_predictor is not None and lstm_predictor.encoder is not None,
        },
        "eta_lgb": {
            "loaded": eta_predictor is not None,
            "feature_count": eta_predictor.feature_count if eta_predictor else None,
            "feature_names": eta_predictor.feature_names if eta_predictor else None,
        },
        "svd_cf": {
            "loaded": cf_recommender is not None and cf_recommender.model is not None,
        },
        "meta_ranker": {
            "loaded": meta_ranker is not None,
            "feature_names": meta_ranker.model.feature_name() if meta_ranker else None,
        },
    }

    return {
        "status": "healthy" if all_loaded else "degraded",
        "models": model_status,
        "model_detail": model_detail,
        "uptime": f"{uptime_seconds}s",
        "uptime_seconds": uptime_seconds,
        "startup_time": startup_iso,
        "fallback_mode": not all_loaded,
        "version": "1.0.0",
    }

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8001))
    uvicorn.run(app, host="0.0.0.0", port=port)
