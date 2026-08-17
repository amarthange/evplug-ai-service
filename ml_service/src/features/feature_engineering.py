import numpy as np
import pandas as pd
from datetime import datetime
import torch

# ─────────────────────────────────────────────────────────────────────────────
# ETA model training feature order  (MUST match eta_lgb_model.pkl exactly)
# Verified via: lgb.Booster.feature_name() → 6 features
# ─────────────────────────────────────────────────────────────────────────────
ETA_FEATURE_ORDER = [
    'Base_ETA_(min)',       # base ETA = distance / 40 km/h * 60
    'Distance_Driven_(km)', # raw km
    'traffic_idx',          # float 0–1
    'hour',                 # raw hour 0–23  (NOT sine-encoded)
    'day_of_week',          # 0=Mon … 6=Sun
    'Temperature_(C)',      # celsius
]

# ─────────────────────────────────────────────────────────────────────────────
# LSTM scaler training feature order  (MUST match availability_scaler.pkl)
# Verified via: joblib.load → MinMaxScaler.feature_names_in_  → 9 features
# ─────────────────────────────────────────────────────────────────────────────
LSTM_FEATURE_COLUMNS = [
    'Availability (slots)',  # 0 – slot availability count / ratio
    'Day of Week',           # 1 – 0=Mon … 6=Sun
    'Time of Day',           # 2 – raw hour 0–23
    'Traffic Level',         # 3 – 0=Low 1=Moderate 2=High 3=Severe
    'Weather Condition',     # 4 – 0=Clear … 4=Storm
    'Holiday Flag',          # 5 – 0 or 1
    'Event Flag',            # 6 – 0 or 1
    'Temperature (C)',       # 7 – celsius
    'Rainfall (mm)',         # 8 – mm/hr
]


def extract_time_features(timestamp):
    """
    Extracts raw and cyclic time features.

    Returns:
        hour         – raw integer 0–23  (used by ETA model)
        day_of_week  – raw integer 0–6   (used by ETA model)
        hour_sin     – cyclic sine encoding
        hour_cos     – cyclic cosine encoding
        is_peak_hour – 1 during rush hours else 0
    """
    if isinstance(timestamp, (int, float)):
        # Handle both seconds and milliseconds epoch
        if timestamp > 1e10:
            timestamp = timestamp / 1000.0
        dt = datetime.fromtimestamp(timestamp)
    elif isinstance(timestamp, str):
        dt = datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
    else:
        dt = timestamp

    hour = dt.hour
    day_of_week = dt.weekday()

    hour_sin = np.sin(2 * np.pi * hour / 24.0)
    hour_cos = np.cos(2 * np.pi * hour / 24.0)
    is_peak_hour = 1 if (8 <= hour <= 10) or (17 <= hour <= 20) else 0

    return {
        "hour":        float(hour),        # raw – needed by ETA model
        "day_of_week": float(day_of_week), # raw – needed by ETA model
        "hour_sin":    float(hour_sin),
        "hour_cos":    float(hour_cos),
        "is_peak_hour": float(is_peak_hour),
    }


def build_eta_features(distance_km: float, traffic_index: float,
                       temperature_c: float, timestamp) -> dict:
    """
    Build the exact 6-feature dict that eta_lgb_model.pkl expects.
    Feature order matches ETA_FEATURE_ORDER.
    """
    time_feats = extract_time_features(timestamp)

    # Base ETA: assuming average speed 40 km/h adjusted for traffic
    base_eta = (distance_km / 40.0) * 60.0  # minutes

    return {
        'Base_ETA_(min)':       base_eta,
        'Distance_Driven_(km)': distance_km,
        'traffic_idx':          float(traffic_index),
        'hour':                 time_feats['hour'],
        'day_of_week':          time_feats['day_of_week'],
        'Temperature_(C)':      float(temperature_c),
    }


def encode_traffic(index: float) -> int:
    """Bins traffic index into categorical 0–3."""
    if index < 0.2: return 0  # Low
    if index < 0.5: return 1  # Moderate
    if index < 0.8: return 2  # High
    return 3                   # Severe


def calculate_distance(lat1, lon1, lat2, lon2) -> float:
    """Haversine distance in km."""
    R = 6371.0
    phi1, phi2 = np.radians(lat1), np.radians(lat2)
    dphi   = np.radians(lat2 - lat1)
    dlambda = np.radians(lon2 - lon1)
    a = np.sin(dphi / 2.0)**2 + np.cos(phi1) * np.cos(phi2) * np.sin(dlambda / 2.0)**2
    return R * 2 * np.arctan2(np.sqrt(a), np.sqrt(1 - a))


def extract_lstm_row(firestore_doc: dict, timestamp) -> list:
    """
    Convert a Firestore station_history document into the 9-value row
    that the LSTM scaler/model expects (order = LSTM_FEATURE_COLUMNS).
    Falls back gracefully for missing fields.
    """
    if isinstance(timestamp, str):
        dt = datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
    elif isinstance(timestamp, (int, float)):
        ts = timestamp / 1000.0 if timestamp > 1e10 else timestamp
        dt = datetime.fromtimestamp(ts)
    else:
        dt = timestamp

    d = firestore_doc
    return [
        float(d.get('availability',       d.get('Availability (slots)', 0.5))),
        float(d.get('day_of_week',        dt.weekday())),
        float(d.get('time_of_day',        dt.hour)),
        float(d.get('traffic_level',      d.get('Traffic Level',      1))),
        float(d.get('weather_condition',  d.get('Weather Condition',  0))),
        float(d.get('holiday_flag',       d.get('Holiday Flag',       0))),
        float(d.get('event_flag',         d.get('Event Flag',         0))),
        float(d.get('temperature',        d.get('Temperature (C)',    25.0))),
        float(d.get('rainfall',           d.get('Rainfall (mm)',      0.0))),
    ]


def build_lstm_sequence(history_rows: list, scaler, sequence_length: int = 12):
    """
    Build a scaled LSTM input tensor from a list of 9-value rows.

    Args:
        history_rows: list of lists, each with 9 floats in LSTM_FEATURE_COLUMNS order.
        scaler:       fitted MinMaxScaler (9 features).
        sequence_length: expected sequence length (default 12).

    Returns:
        torch.Tensor of shape [1, sequence_length, 9]
    """
    arr = np.array(history_rows, dtype=np.float32)  # [n, 9]

    # Pad with zeros at front if not enough history
    if len(arr) < sequence_length:
        pad = np.zeros((sequence_length - len(arr), arr.shape[1]), dtype=np.float32)
        arr = np.vstack([pad, arr])

    # Take last sequence_length rows
    arr = arr[-sequence_length:]  # [12, 9]

    # Scale using the fitted scaler (applied row-wise, feature-wise)
    arr_scaled = scaler.transform(arr)  # [12, 9]

    tensor = torch.tensor(arr_scaled, dtype=torch.float32).unsqueeze(0)  # [1, 12, 9]
    return tensor
