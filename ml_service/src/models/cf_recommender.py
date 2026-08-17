import joblib
try:
    from surprise import SVD
    HAS_SURPRISE = True
except ImportError:
    HAS_SURPRISE = False

class CFRecommender:
    def __init__(self, model_path, user_encoder_path, station_encoder_path):
        if not HAS_SURPRISE:
            self.model = None
            self.user_encoder = None
            self.station_encoder = None
            print("Warning: scikit-surprise not installed. CFRecommender disabled.")
            return

        # All three artifacts are joblib-serialized — must use joblib.load (not pickle)
        self.model = joblib.load(model_path)
        self.user_encoder = joblib.load(user_encoder_path)
        self.station_encoder = joblib.load(station_encoder_path)

    def get_score(self, user_id, station_id):
        if not HAS_SURPRISE or self.model is None:
            return 0.5, True # Fallback for missing library
        try:
            # Check if user/station known to encoders
            if user_id not in self.user_encoder.classes_ or station_id not in self.station_encoder.classes_:
                return 0.5, True # Cold start
            
            # Predict using surprise model
            # surprise predict takes raw IDs if model was trained on them, 
            # but encoders are used if training was done on encoded IDs.
            # Assuming training was on raw strings as surprise handles them if passed to Dataset.load_from_df
            pred = self.model.predict(user_id, station_id)
            
            # Normalize score (assuming 1-5 scale) to 0-1
            normalized_score = (pred.est - 1) / 4.0
            return float(normalized_score), False
            
        except Exception as e:
            print(f"CF Error: {e}")
            return 0.5, True
