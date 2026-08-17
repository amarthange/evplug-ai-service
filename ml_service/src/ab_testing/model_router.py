import hashlib
from typing import Literal

class ModelRouter:
    def __init__(self, candidate_traffic_pct: int = 10):
        self.candidate_traffic_pct = candidate_traffic_pct

    def get_variant(self, user_id: str) -> Literal["production", "candidate"]:
        """
        Determines which model variant to use for a given user ID.
        Uses a deterministic hash to ensure consistent user experience.
        """
        if not user_id:
            return "production"
            
        # Create a stable hash of the user_id
        hash_val = int(hashlib.md5(user_id.encode()).hexdigest(), 16)
        percentile = hash_val % 100
        
        if percentile < self.candidate_traffic_pct:
            return "candidate"
        return "production"

# Global router instance
model_router = ModelRouter(candidate_traffic_pct=10)
