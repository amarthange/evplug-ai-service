import numpy as np
from scipy import stats
from google.cloud import firestore
from datetime import datetime, timezone, timedelta
from typing import Dict, Any

class ABStatsAnalyzer:
    def __init__(self):
        self.db = firestore.AsyncClient()

    async def get_test_metrics(self) -> Dict[str, Any]:
        """
        Retrieves and compares metrics between production and candidate variants.
        """
        # In a real system, we'd query 'ab_test_results'
        # For this demo, we'll simulate data if none exists
        variants = ["production", "candidate"]
        metrics = {}
        
        for variant in variants:
            # Query Firestore for results from the last 7 days
            seven_days_ago = datetime.now(timezone.utc) - timedelta(days=7)
            docs = self.db.collection('ab_test_results') \
                .where('variant', '==', variant) \
                .where('timestamp', '>=', seven_days_ago) \
                .stream()
                
            latencies = []
            satisfaction = []
            completions = []
            
            async for doc in docs:
                data = doc.to_dict()
                latencies.append(data.get('latency_ms', 0))
                satisfaction.append(data.get('user_satisfaction', 0))
                completions.append(1 if data.get('booking_completed', False) else 0)
            
            if not latencies:
                # Provide dummy data for initial state
                if variant == "production":
                    metrics[variant] = {"avg_latency": 45.0, "completion_rate": 0.65, "avg_satisfaction": 4.2, "count": 1000}
                else:
                    metrics[variant] = {"avg_latency": 42.0, "completion_rate": 0.68, "avg_satisfaction": 4.4, "count": 120}
                continue

            metrics[variant] = {
                "avg_latency": float(np.mean(latencies)),
                "completion_rate": float(np.mean(completions)),
                "avg_satisfaction": float(np.mean(satisfaction)),
                "count": len(latencies)
            }

        # Calculate Significance (Simple Z-test for proportions)
        p1 = metrics["production"]["completion_rate"]
        p2 = metrics["candidate"]["completion_rate"]
        n1 = metrics["production"]["count"]
        n2 = metrics["candidate"]["count"]
        
        # Pooled proportion
        p_pooled = (p1 * n1 + p2 * n2) / (n1 + n2)
        se = np.sqrt(p_pooled * (1 - p_pooled) * (1/n1 + 1/n2))
        
        z_score = (p2 - p1) / se if se > 0 else 0
        p_value = 1 - stats.norm.cdf(abs(z_score))
        
        metrics["significance"] = {
            "z_score": float(z_score),
            "p_value": float(p_value),
            "is_significant": p_value < 0.05
        }
        
        # Recommendation
        if p2 > p1 and p_value < 0.05:
            metrics["recommendation"] = "PROMOTE"
        elif p2 < p1 and p_value < 0.05:
            metrics["recommendation"] = "REJECT"
        else:
            metrics["recommendation"] = "CONTINUE_TESTING"
            
        return metrics

# Global analyzer instance
ab_analyzer = ABStatsAnalyzer()
