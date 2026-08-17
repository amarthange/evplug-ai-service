import asyncio
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Request, HTTPException
from google.cloud import firestore
import json
import os
import shutil
from src.ab_testing.stats_analyzer import ab_analyzer

router = APIRouter(prefix="/admin", tags=["Admin"])

async def notify_admin_email(subject: str, message: str):
    """Simulates sending an email to the admin."""
    print(f"[EMAIL SIMULATION] To: admin@ev-platform.com | Subject: {subject} | Message: {message}")
    await asyncio.sleep(0.5)

@router.post("/retrain-trigger")
async def trigger_retrain(request: Request):
    """
    Checks for new stations with >7 days of data and triggers retraining.
    """
    models = request.app.state.models
    db = firestore.AsyncClient()
    
    # 1. Identify "New" stations from station_telemetry that are NOT in current encoder
    try:
        # Get current station list from loaded encoder
        current_stations = set(models['station_encoder'].classes_)
        
        # Check for stations in telemetry not in current_stations
        # This is a bit expensive in production, usually we'd have a 'stations' registry
        # We'll check the 'stations' collection for 'created_at'
        seven_days_ago = datetime.now(timezone.utc) - timedelta(days=7)
        
        new_stations_query = db.collection('stations') \
            .where('created_at', '<=', seven_days_ago)
            
        new_ready_stations = []
        async for doc in new_stations_query.stream():
            sid = doc.id
            if sid not in current_stations:
                new_ready_stations.append(sid)
                
        if not new_ready_stations:
            return {"status": "skipped", "message": "No new stations ready for retraining (>7 days data)."}

        # 2. Trigger Retrain (Simulated)
        # In real-world, this would hit a Vertex AI pipeline or similar
        print(f"Triggering retrain for {len(new_ready_stations)} new stations: {new_ready_stations}")
        
        # Simulate long-running task
        async def run_retrain():
            await asyncio.sleep(5) # Simulate work
            await notify_admin_email(
                "ML Retraining Complete",
                f"Retraining for {len(new_ready_stations)} new stations completed. New models deployed: {new_ready_stations}"
            )

        asyncio.create_task(run_retrain())
        
        return {
            "status": "triggered",
            "message": f"Retraining triggered for {len(new_ready_stations)} new stations.",
            "stations": new_ready_stations
        }
        
    except Exception as e:
        print(f"Retrain trigger error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/cold-start-stats")
async def get_cold_start_stats():
    """Returns summary of cold-start events from the last 24 hours."""
    db = firestore.AsyncClient()
    yesterday = datetime.now(timezone.utc) - timedelta(hours=24)
    
    docs = db.collection('cold_start_events') \
        .where('timestamp', '>=', yesterday) \
        .stream()
        
    stats = {"user": 0, "station": 0, "both": 0}
    async for doc in docs:
        etype = doc.to_dict().get('entity_type')
        if etype in stats:
            stats[etype] += 1
            
    return {"time_range": "24h", "event_counts": stats}

@router.get("/ab-test-stats")
async def get_ab_stats():
    """
    Returns comparative performance metrics for A/B variants.
    """
    try:
        metrics = await ab_analyzer.get_test_metrics()
        return metrics
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/promote-candidate")
async def promote_candidate():
    """
    Promotes the candidate model set to production.
    1. Archives current production.
    2. Copies candidate to production.
    """
    root_dir = "models"
    prod_dir = os.path.join(root_dir, "production")
    cand_dir = os.path.join(root_dir, "candidate")
    archive_dir = os.path.join(root_dir, f"archive_{datetime.now().strftime('%Y%m%d_%H%M%S')}")

    if not os.path.exists(cand_dir) or not os.listdir(cand_dir):
        raise HTTPException(status_code=400, detail="Candidate directory is empty.")

    try:
        # 1. Archive current production
        if os.path.exists(prod_dir):
            shutil.move(prod_dir, archive_dir)
            
        # 2. Promote candidate (copy files)
        os.makedirs(prod_dir, exist_ok=True)
        for item in os.listdir(cand_dir):
            s = os.path.join(cand_dir, item)
            d = os.path.join(prod_dir, item)
            if os.path.isdir(s):
                shutil.copytree(s, d)
            else:
                shutil.copy2(s, d)
                
        # In a real system, we'd trigger a service reload here
        return {
            "status": "success", 
            "message": "Candidate models promoted to production. Archive created.",
            "archive_path": archive_dir
        }
    except Exception as e:
        # Rollback if possible (complex for file ops, usually handled by symlinks)
        print(f"Promotion error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to promote candidate: {str(e)}")
