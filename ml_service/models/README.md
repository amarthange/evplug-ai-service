# ML Models Directory

This directory contains trained machine learning models for EV charging availability prediction.

## Model Training

To train a LightGBM model:

1. Run the Jupyter notebook in `ml_service/notebooks/train_lightgbm.ipynb`
2. The trained model will be saved as `lightgbm_model.pkl` in this directory
3. The FastAPI service will automatically load and use the model

## Heuristic Fallback

If no model file is present, the ML service will use a heuristic-based prediction:
- Calculates recent occupancy trends
- Applies simple moving averages
- Returns predictions with lower confidence scores

## Model Features

The LightGBM model uses these features:
- Average occupancy (10min, 30min, 60min windows)
- Occupancy trend
- Hour of day
- Day of week
- Station-specific patterns

## Performance

- Model confidence: ~0.85
- Heuristic confidence: ~0.65
- Prediction latency: <50ms
