import os
import sys
import numpy as np
from datetime import datetime, timezone, timedelta
import firebase_admin
from firebase_admin import credentials, firestore
from scipy.stats import entropy

def run_drift_detection(threshold: float = 0.1):
    print(f"Starting Daily Drift Detection Job at {datetime.now(timezone.utc).isoformat()}")
    
    # Initialize Firebase
    try:
        if not firebase_admin._apps:
            firebase_admin.initialize_app()
        db = firestore.client()
    except Exception as e:
        print(f"Failed to initialize Firebase Admin SDK: {e}")
        sys.exit(1)

    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(hours=24)

    # We will compute drift per model
    # Let's query all predictions in the last 24h
    try:
        docs = db.collection("ml_predictions").where("timestamp", ">=", cutoff).stream()
    except Exception as e:
        print(f"Error querying Firestore: {e}")
        sys.exit(1)

    model_preds = {}
    for doc in docs:
        data = doc.to_dict()
        m_name = data.get("model_name")
        pred = data.get("prediction")
        if m_name and pred is not None:
            if m_name not in model_preds:
                model_preds[m_name] = []
            model_preds[m_name].append(pred)

    if not model_preds:
        print("No predictions found in the last 24 hours. Exiting.")
        return

    # Baseline distributions for models.
    # In a real scenario, this would be loaded from a file saved during training.
    # For now, we assume predictions are bounded between [0, 1] and we create 10 bins.
    # Baseline: Uniform distribution
    bins = np.linspace(0, 1, 11) # 10 bins
    baseline_dist = np.ones(10) / 10.0

    for m_name, preds in model_preds.items():
        if len(preds) < 10:
            print(f"[{m_name}] Not enough predictions ({len(preds)}) to compute drift.")
            continue

        # Create histogram of recent predictions
        hist, _ = np.histogram(preds, bins=bins)
        
        # Add a tiny epsilon to avoid divide by zero or log(0) in KL divergence
        hist_prob = (hist + 1e-9) / (hist.sum() + 1e-9 * len(hist))

        # Calculate KL Divergence
        # entropy(pk, qk) -> pk is true distribution, qk is reference distribution
        # In drift detection, we often compare recent (pk) to baseline (qk)
        kl_div = entropy(hist_prob, baseline_dist)

        print(f"[{m_name}] KL Divergence: {kl_div:.4f} (Count: {len(preds)})")

        if kl_div > threshold:
            # ALERT: In production, this might trigger Slack, PagerDuty, or email
            print(f"🚨 ALERT: Data drift detected for {m_name}! KL-Div {kl_div:.4f} > Threshold {threshold}")
        else:
            print(f"✅ {m_name} is within acceptable drift threshold.")

if __name__ == "__main__":
    run_drift_detection()
