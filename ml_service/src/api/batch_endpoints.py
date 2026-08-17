import asyncio
import time
import torch
import numpy as np
from fastapi import APIRouter, Request, HTTPException
from google.cloud import firestore
from typing import List

from src.api.schemas import BatchPredictRequest, BatchStationResponse, Location
from src.features.feature_engineering import (
    calculate_distance, build_eta_features, build_meta_features
)
from src.ab_testing.model_router import model_router

router = APIRouter(tags=["Batch"])

def get_bounding_box(lat: float, lon: float, radius_km: float):
    """
    Calculates a simple bounding box for a given radius in km.
    1 degree lat ~ 111km. 1 degree lon ~ 111 * cos(lat) km.
    """
    lat_delta = radius_km / 111.0
    lon_delta = radius_km / (111.0 * np.cos(np.radians(lat)))
    
    return {
        "min_lat": lat - lat_delta,
        "max_lat": lat + lat_delta,
        "min_lon": lon - lon_delta,
        "max_lon": lon + lon_delta
    }

@router.post("/batch-predict", response_model=List[BatchStationResponse])
async def batch_predict(data: BatchPredictRequest, request: Request):
    start_time = time.time()
    
    # 1. Determine Model Variant
    variant = model_router.get_variant(data.user_id)
    models = request.app.state.model_variants.get(variant, request.app.state.models)
    db = firestore.AsyncClient()

    # 2. Fetch Stations in Radius (Bounding Box Approximation)
    bbox = get_bounding_box(data.user_location.latitude, data.user_location.longitude, data.radius_km)
    
    # Note: Firestore doesn't support multiple inequality filters on different fields easily.
    # We'll filter on Latitude and then do manual filtering on Longitude.
    stations_ref = db.collection('stations')
    query = stations_ref.where('latitude', '>=', bbox['min_lat']) \
                        .where('latitude', '<=', bbox['max_lat'])
    
    station_docs = []
    async for doc in query.stream():
        d = doc.to_dict()
        # Manual Longitude filter
        if bbox['min_lon'] <= d.get('longitude', 0) <= bbox['max_lon']:
            d['id'] = doc.id
            station_docs.append(d)
            
    if not station_docs:
        return []
    
    # Cap at 50 for latency
    station_docs = station_docs[:50]
    station_ids = [d['id'] for d in station_docs]

    # 3. Parallel Feature Fetching
    # Batch LSTM Sequences
    lstm_task = models['lstm_sequence_builder'].batch_build_lstm_sequences(station_ids, station_encoder=models['station_encoder'])
    
    # Async CF Scores
    cf_tasks = [models['cf_recommender'].get_cf_score(data.user_id, sid) for sid in station_ids]
    
    sequences, *cf_scores = await asyncio.gather(lstm_task, *cf_tasks)

    # 4. Batch Inference
    # A. LSTM Batch Prediction
    valid_ids = [sid for sid, seq in sequences.items() if seq is not None]
    avail_map = {sid: 0.5 for sid in station_ids} # Default fallback
    
    if valid_ids:
        batch_seq = torch.cat([sequences[sid] for sid in valid_ids], dim=0)
        # Filter out stations not in encoder
        filtered_valid_ids = [sid for sid in valid_ids if sid in models['station_encoder'].classes_]
        if filtered_valid_ids:
            # We need to re-align batch_seq if we filtered out IDs
            valid_indices = [valid_ids.index(sid) for sid in filtered_valid_ids]
            batch_seq = batch_seq[valid_indices]
            
            batch_stations = torch.tensor(models['station_encoder'].transform(filtered_valid_ids), dtype=torch.long)
            with torch.no_grad():
                batch_preds = models['lstm_model'](batch_seq, batch_stations)
                avail_results = batch_preds.cpu().numpy().flatten()
                for sid, pred in zip(filtered_valid_ids, avail_results):
                    avail_map[sid] = float(np.clip(pred, 0, 1))

    # B. ETA Batch Prediction (LightGBM)
    eta_features = []
    distances = []
    for doc in station_docs:
        dist = calculate_distance(
            data.user_location.latitude, data.user_location.longitude,
            doc['latitude'], doc['longitude']
        )
        distances.append(dist)
        eta_features.append(build_eta_features(dist, 0.5, 25.0, data.timestamp))
    
    eta_preds = models['eta_model'].predict(np.array(eta_features))

    # C. Meta-Learner Batch Prediction
    meta_features = []
    for i, sid in enumerate(station_ids):
        # build_meta_features(eta, availability, noshow_prob, cf_score, distance, price)
        meta_features.append(build_meta_features(
            eta=eta_preds[i],
            availability=avail_map[sid],
            noshow_prob=0.1,
            cf_score=cf_scores[i],
            distance=distances[i],
            price=station_docs[i].get('price_per_kwh', 15.0)
        ))
    
    meta_preds = models['meta_model'].predict(np.array(meta_features))

    # 5. Format and Rank
    response = []
    for i, sid in enumerate(station_ids):
        response.append(BatchStationResponse(
            station_id=sid,
            availability_prob=avail_map[sid],
            cf_score=float(cf_scores[i]),
            eta_minutes=float(eta_preds[i]),
            meta_score=float(meta_preds[i]),
            rank=0, # Placeholder
            metadata={"distance_km": round(distances[i], 2), "variant": variant}
        ))
    
    # Sort by meta_score descending
    response.sort(key=lambda x: x.meta_score, reverse=True)
    
    # Assign ranks
    for idx, item in enumerate(response):
        item.rank = idx + 1
        
    latency_ms = (time.time() - start_time) * 1000
    print(f"Batch predict for {len(station_ids)} stations completed in {latency_ms:.2f}ms")
    
    return response
