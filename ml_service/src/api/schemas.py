from pydantic import BaseModel, Field, validator
from typing import List, Optional, Tuple, Literal
from datetime import datetime, timezone, timedelta

class Location(BaseModel):
    latitude: float = Field(..., ge=8.0, le=35.0, description="India latitude bounds")
    longitude: float = Field(..., ge=68.0, le=97.0, description="India longitude bounds")

class StationCandidate(BaseModel):
    station_id: str
    location: Location
    price_per_kwh: float
    cf_score: Optional[float] = 0.5  # Collaborative filtering score

class ETARequest(BaseModel):
    user_location: Location
    station_location: Location
    traffic_index: float = Field(..., ge=0.0, le=3.0)
    temperature: float = Field(..., ge=-10.0, le=50.0)
    timestamp: Optional[int] = None  # Unix timestamp in ms

    @validator('timestamp', pre=True, always=True)
    def validate_timestamp(cls, v):
        now_ms = int(datetime.now(timezone.utc).timestamp() * 1000)
        if v is None:
            return now_ms
            
        # Check future
        if v > now_ms:
            raise ValueError("Timestamp cannot be in the future")
            
        # Check > 7 days old
        seven_days_ms = 7 * 24 * 60 * 60 * 1000
        if (now_ms - v) > seven_days_ms:
            raise ValueError("Timestamp cannot be older than 7 days")
            
        return v

class AvailabilityRequest(BaseModel):
    station_id: str
    timestamp: Optional[int] = None

class RankingRequest(BaseModel):
    user_id: str
    user_location: Location
    candidate_stations: List[StationCandidate]
    timestamp: Optional[int] = None
    user_connector: Optional[str] = None

class CFScoreRequest(BaseModel):
    user_id: str
    station_id: str

class BatchPredictRequest(BaseModel):
    user_id: str
    user_location: Location
    radius_km: float = Field(5.0, ge=1.0, le=50.0)
    timestamp: Optional[int] = None

class BatchStationResponse(BaseModel):
    station_id: str
    availability_prob: float
    cf_score: float
    eta_minutes: float
    meta_score: float
    rank: int
    metadata: Optional[dict] = None

class PredictionResponse(BaseModel):
    prediction: float
    confidence: float = 1.0
    metadata: dict = {}
    is_cold_start: bool = False
    is_new_user: bool = False
    is_new_station: bool = False
    cold_start_reason: Optional[Literal["new_user", "new_station", "insufficient_data"]] = None
    is_fallback: bool = False
    fallback_reason: Optional[str] = None
    warning: Optional[str] = None
