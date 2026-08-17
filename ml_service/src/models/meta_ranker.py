import joblib
import numpy as np

class MetaRanker:
    def __init__(self, model_path):
        # meta_learner_model.pkl is a joblib-serialized LightGBM Booster
        self.model = joblib.load(model_path)

    def rank(self, features_matrix):
        """
        features_matrix: list of [availability_score, cf_score, eta_score, distance]
        """
        X = np.array(features_matrix)
        # meta_learner usually predicts a combined score
        scores = self.model.predict(X)
        return scores.tolist()
