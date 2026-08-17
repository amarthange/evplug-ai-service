from firebase_admin import firestore

def log_cold_start(user_id, station_id, model_type):
    try:
        db = firestore.client()
        db.collection('ml_cold_starts').add({
            'userId': user_id,
            'stationId': station_id,
            'modelType': model_type,
            'timestamp': firestore.SERVER_TIMESTAMP
        })
    except Exception as e:
        # Firestore unavailable in dev (no ADC) — skip silently
        print(f"[cold_start] Firestore logging skipped: {e}")

def get_popularity_score(station_id):
    """
    Fallback: returns a default popularity score for unknown stations.
    In production, query a 'station_stats' aggregation collection for real scores.
    """
    return 0.5  # Default middle-ground score
