import lightgbm as lgb
import numpy as np
from src.features.feature_engineering import ETA_FEATURE_ORDER, build_eta_features


class ETAPredictor:
    """
    Wraps the trained LightGBM ETA model (eta_lgb_model.pkl).

    Training feature order (6 features, verified via lgb.Booster.feature_name()):
        ['Base_ETA_(min)', 'Distance_Driven_(km)', 'traffic_idx',
         'hour', 'day_of_week', 'Temperature_(C)']
    """

    # Authoritative feature order — MUST match training exactly
    FEATURE_ORDER = ETA_FEATURE_ORDER  # 6 features

    def __init__(self, model_path: str):
        # eta_lgb_model.pkl is serialized via joblib — use joblib.load as primary.
        # lgb.Booster(model_file=) is only valid for the LightGBM native text format.
        import joblib
        try:
            self.model = joblib.load(model_path)
        except Exception:
            # Last-resort: try native booster format
            self.model = lgb.Booster(model_file=model_path)

        # Validate feature count on load
        actual_n = self.model.num_feature()
        expected_n = len(self.FEATURE_ORDER)
        if actual_n != expected_n:
            raise ValueError(
                f"ETAPredictor: model expects {actual_n} features, "
                f"but FEATURE_ORDER defines {expected_n}. "
                f"Model features: {self.model.feature_name()}"
            )

    def predict(self, features_dict: dict) -> float:
        """
        Predict ETA in minutes.

        Args:
            features_dict: must contain ALL keys in FEATURE_ORDER.

        Returns:
            float – predicted ETA in minutes.
        """
        missing = [k for k in self.FEATURE_ORDER if k not in features_dict]
        if missing:
            raise ValueError(f"ETAPredictor.predict: missing features: {missing}")

        X = np.array([[features_dict[k] for k in self.FEATURE_ORDER]])  # [1, 6]
        return float(self.model.predict(X)[0])

    def predict_from_request(self, distance_km: float, traffic_index: float,
                              temperature_c: float, timestamp) -> float:
        """
        Convenience method — builds features from raw request fields and predicts.
        """
        features = build_eta_features(distance_km, traffic_index, temperature_c, timestamp)
        return self.predict(features)

    @property
    def feature_count(self) -> int:
        return self.model.num_feature()

    @property
    def feature_names(self) -> list:
        return self.model.feature_name()
