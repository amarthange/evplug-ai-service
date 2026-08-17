try:
    from firebase_admin import firestore
    FIREBASE_AVAILABLE = True
except ImportError:
    FIREBASE_AVAILABLE = False

import time

def log_prediction(model_name, input_features, prediction, confidence, latency_ms):
    """
    Logs prediction details to Firestore.
    """
    if not FIREBASE_AVAILABLE:
        print("Warning: firebase-admin not installed. Skipping prediction logging.")
        return
    try:
        db = firestore.client()
        station_id = input_features.get("station_id") or input_features.get("sid") or "station-1"
        is_cold_start = input_features.get("is_cold_start") or input_features.get("is_cold") or False
        
        db.collection('ml_predictions').add({
            'timestamp': firestore.SERVER_TIMESTAMP,
            'latency_ms': latency_ms,
            'prediction': prediction,
            'modelVersion': '1.0.0',
            'stationId': station_id,
            'confidence': confidence,
            'isColdStart': is_cold_start,
            'modelName': model_name,
            'inputFeatures': input_features
        })
    except Exception as e:
        print(f"Logging error: {e}")
