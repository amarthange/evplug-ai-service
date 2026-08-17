import asyncio
import time
import torch
import numpy as np
import pandas as pd
from fastapi import APIRouter, HTTPException, BackgroundTasks, Request
from typing import List, Dict, Any

from src.api.schemas import (
    ETARequest, 
    AvailabilityRequest, 
    RankingRequest, 
    CFScoreRequest,
    PredictionResponse
)
from src.features.feature_engineering import (
    build_eta_features, 
    build_meta_features,
    calculate_distance,
    extract_time_features,
    get_station_metadata
)
from src.api.exceptions import StationNotFoundError, ModelNotLoadedError
from src.cache.redis_client import cache
from src.models.fallback_strategies import fallback_manager
from src.ab_testing.model_router import model_router

router = APIRouter()

def get_grid_key(lat: float, lon: float, user_id: str) -> str:
    """Generates a 1km x 1km grid key for response caching."""
    grid_lat = round(lat, 2)  # ~1.1km
    grid_lon = round(lon, 2)
    return f"rank_cache:{user_id}:{grid_lat}:{grid_lon}"

@router.post("/predict-eta", response_model=PredictionResponse)
async def predict_eta(data: ETARequest, request: Request, background_tasks: BackgroundTasks):
    start_time = time.time()
    variant = model_router.get_variant(str(data.timestamp)) # ETA uses timestamp as proxy for user consistency if user_id missing
    models = request.app.state.model_variants.get(variant, request.app.state.models)
    
    if not models.get('eta_model'):
        raise ModelNotLoadedError("eta_model")
        
    distance = calculate_distance(
        data.user_location.latitude, data.user_location.longitude,
        data.station_location.latitude, data.station_location.longitude
    )
    
    if distance > 500:
        raise HTTPException(status_code=400, detail="Distance exceeds 500km")
        
    # Redis Cache for Common Routes
    route_key = f"eta_cache:{round(data.user_location.latitude, 3)}:{round(data.user_location.longitude, 3)}:{round(data.station_location.latitude, 3)}:{round(data.station_location.longitude, 3)}"
    cached_prediction = await cache.get_float(route_key)
    if cached_prediction is not None:
        return PredictionResponse(prediction=cached_prediction, metadata={"cached": True, "distance_km": distance, "variant": variant})

    if distance > 100:
        return PredictionResponse(prediction=999.0, is_fallback=True, fallback_reason="distance_too_large")
    
    try:
        X = build_eta_features(distance, data.traffic_index, data.temperature, data.timestamp)
        prediction = float(models['eta_model'].predict(X)[0])
        # Cache for 15 minutes
        await cache.set_float(route_key, prediction, ttl=900)
    except Exception as e:
        print(f"ETA Prediction Error: {e}")
        raise
        
    latency_ms = (time.time() - start_time) * 1000
    if models.get('prediction_logger'):
        background_tasks.add_task(
            models['prediction_logger'].log_prediction,
            model_name="eta_model",
            input_features=data.dict(),
            prediction=prediction,
            latency_ms=latency_ms,
            variant=variant
        )
        
    return PredictionResponse(prediction=prediction, metadata={"distance_km": distance, "variant": variant})

@router.post("/predict-availability", response_model=PredictionResponse)
async def predict_availability(data: AvailabilityRequest, request: Request, background_tasks: BackgroundTasks):
    start_time = time.time()
    models = request.app.state.models
    
    # Check Prediction Cache First
    redis_key = f"avail_pred:{data.station_id}"
    cached_pred = await cache.get_float(redis_key)
    if cached_pred is not None:
        return PredictionResponse(prediction=cached_pred, metadata={"cached": True})

    if not models.get('lstm_model'):
        raise ModelNotLoadedError("lstm_availability")
    
    if data.station_id not in models['station_encoder'].classes_:
        raise StationNotFoundError(data.station_id)

    try:
        seq_tensor = await models['lstm_sequence_builder'].build_lstm_sequence(data.station_id)
        if seq_tensor is None:
            return PredictionResponse(prediction=0.5, is_cold_start=True, cold_start_reason="insufficient_data")

        station_idx = models['station_encoder'].transform([data.station_id])[0]
        station_tensor = torch.tensor([station_idx], dtype=torch.long)

        with torch.no_grad():
            output = models['lstm_model'](seq_tensor, station_tensor)
            prediction = float(np.clip(output.cpu().numpy().flatten()[0], 0, 1))
            
        # Cache prediction for 5 minutes
        await cache.set_float(redis_key, prediction, ttl=300)
    except Exception as e:
        print(f"Availability Error: {e}")
        raise
        
    latency_ms = (time.time() - start_time) * 1000
    if models.get('prediction_logger'):
        background_tasks.add_task(models['prediction_logger'].log_prediction, "lstm_availability", {"sid": data.station_id}, prediction, latency_ms)
        
    return PredictionResponse(prediction=prediction)

@router.post("/rank-stations")
async def rank_stations(data: RankingRequest, request: Request, background_tasks: BackgroundTasks):
    start_time = time.time()
    variant = model_router.get_variant(data.user_id)
    models = request.app.state.model_variants.get(variant, request.app.state.models)
    
    # 1. Response Caching (Grid-based)
    grid_key = get_grid_key(data.user_location.latitude, data.user_location.longitude, data.user_id)
    cached_response = await cache.get_json(grid_key)
    if cached_response:
        return {"ranked_stations": cached_response, "metadata": {"cached": True, "variant": variant}}

    if not models.get('meta_model'):
        raise ModelNotLoadedError("meta_learner")

    station_ids = [s.station_id for s in data.candidate_stations]
    
    # 2. Parallel Inference: Fetch all independent features
    # Batch LSTM Sequences
    lstm_task = models['lstm_sequence_builder'].batch_build_lstm_sequences(station_ids, station_encoder=models['station_encoder'])
    
    # Async CF Scores
    cf_tasks = [models['cf_recommender'].get_cf_score(data.user_id, sid, user_connector=data.user_connector) for sid in station_ids]
    
    # Async Station Metadata (Price/Location) - Source of Truth
    meta_tasks = [get_station_metadata(sid) for sid in station_ids]

    # Gather everything
    sequences, *others = await asyncio.gather(lstm_task, *cf_tasks, *meta_tasks)
    cf_scores = others[:len(station_ids)]
    station_metas = others[len(station_ids):]
    
    results = []
    
    # Determine if user is new (could be flagged in CF recommender or checked here)
    # For now, we'll check if the user is in the encoder
    is_new_user = False
    if models.get('cf_recommender') and models['cf_recommender'].user_encoder:
        is_new_user = data.user_id not in models['cf_recommender'].user_encoder.classes_

    # Prepare Batch LSTM Input
    valid_ids = [sid for sid, seq in sequences.items() if seq is not None]
    if valid_ids:
        batch_seq = torch.cat([sequences[sid] for sid in valid_ids], dim=0)
        batch_stations = torch.tensor(models['station_encoder'].transform(valid_ids), dtype=torch.long)
        
        with torch.no_grad():
            batch_preds = models['lstm_model'](batch_seq, batch_stations)
            avail_map = dict(zip(valid_ids, batch_preds.cpu().numpy().flatten()))
    else:
        avail_map = {}

    # 3. Combine and Meta-Rank
    try:
        for i, station in enumerate(data.candidate_stations):
            sid = station.station_id
            is_new_station = sid not in models['station_encoder'].classes_
            
            # Use Firestore source of truth if available, else fallback to client data
            real_meta = station_metas[i] or {}
            real_lat = real_meta.get('latitude', station.location.latitude)
            real_lon = real_meta.get('longitude', station.location.longitude)
            real_price = real_meta.get('price_per_kwh', station.price_per_kwh)

            dist = calculate_distance(data.user_location.latitude, data.user_location.longitude, real_lat, real_lon)
            
            # Scenario: Both Cold Start
            if is_new_user and is_new_station:
                # Rank by distance (weighted) and price
                dist_score = 1.0 / (1.0 + dist / 10.0)
                price_score = 1.0 / (1.0 + real_price / 10.0)
                final_score = dist_score * 0.7 + price_score * 0.3
                
                await fallback_manager.log_cold_start_event("both", f"{data.user_id}:{sid}", "distance_price")
                
                results.append({
                    "station_id": sid,
                    "final_score": float(final_score),
                    "is_new_user": True,
                    "is_new_station": True,
                    "is_cold_start": True,
                    "fallback_reason": "both_entities_new",
                    "metadata": {"variant": variant, "price": real_price}
                })
                continue

            # Standard or partial cold start
            eta_feats = build_eta_features(dist, 0.5, 25.0, data.timestamp)
            eta_pred = float(models['eta_model'].predict(eta_feats)[0])
            
            avail_pred = float(avail_map.get(sid, 0.5))
            cf_score = float(cf_scores[i])
            
            meta_feats = build_meta_features(
                eta=eta_pred, availability=avail_pred, noshow_prob=0.1, 
                cf_score=cf_score, distance=dist, price=real_price
            )
            
            final_score = float(models['meta_model'].predict(meta_feats)[0])
            
            results.append({
                "station_id": sid,
                "final_score": final_score,
                "cf_score": cf_score,
                "eta": eta_pred,
                "availability": avail_pred,
                "distance": float(dist),
                "is_new_user": is_new_user,
                "is_new_station": is_new_station,
                "is_cold_start": is_new_user or is_new_station,
                "metadata": {"variant": variant}
            })
    except Exception as e:
        print(f"Ranking Error: {e}")
        raise

    results.sort(key=lambda x: x["final_score"], reverse=True)
    
    # Cache full response for 3 minutes
    await cache.set_json(grid_key, results, ttl=180)
    
    latency_ms = (time.time() - start_time) * 1000
    if models.get('prediction_logger'):
        background_tasks.add_task(models['prediction_logger'].log_prediction, "meta_learner", {"user": data.user_id}, results[0]["final_score"] if results else 0, latency_ms, variant=variant)

    return {"ranked_stations": results, "metadata": {"variant": variant}}
