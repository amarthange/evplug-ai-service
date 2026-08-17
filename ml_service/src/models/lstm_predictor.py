import torch
import torch.nn as nn
import joblib
import os
import numpy as np

class AvailabilityLSTM(nn.Module):
    def __init__(self, num_stations=800, embedding_dim=8, input_size=9, hidden_size=64, num_layers=2):
        super(AvailabilityLSTM, self).__init__()
        self.station_embedding = nn.Embedding(num_stations, embedding_dim)
        self.lstm = nn.LSTM(embedding_dim + input_size, hidden_size, num_layers, batch_first=True)
        self.fc = nn.Linear(hidden_size, 1)
        self.sigmoid = nn.Sigmoid()

    def forward(self, x, station_idx=None):
        # x is expected to have shape [batch_size, seq_len, 9]
        if station_idx is None:
            station_idx = torch.zeros(x.size(0), dtype=torch.long, device=x.device)
            
        station_embeds = self.station_embedding(station_idx) # [batch_size, 8]
        station_embeds = station_embeds.unsqueeze(1).expand(-1, x.size(1), -1) # [batch_size, seq_len, 8]
        
        x_combined = torch.cat([station_embeds, x], dim=-1) # [batch_size, seq_len, 17]
        
        _, (hn, _) = self.lstm(x_combined)
        out = self.fc(hn[-1])
        return self.sigmoid(out)

class LSTMPredictor:
    def __init__(self, model_path, scaler_path, encoder_path):
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        
        # Load scaler and encoder — saved with joblib, must use joblib.load (not pickle)
        try:
            self.scaler = joblib.load(scaler_path)
        except Exception as e:
            print(f"Warning: Failed to load scaler from {scaler_path}: {e}. Continuing with fallback.")
            self.scaler = None

        try:
            self.encoder = joblib.load(encoder_path)
        except Exception as e:
            print(f"Warning: Failed to load encoder from {encoder_path}: {e}. Continuing with fallback.")
            self.encoder = None

        # Initialize and load model — weights_only=True required for PyTorch >= 2.0
        self.model = AvailabilityLSTM().to(self.device)
        self.model.load_state_dict(
            torch.load(model_path, map_location=self.device, weights_only=True)
        )
        self.model.eval()

    def predict(self, sequence_tensor, station_idx=None):
        with torch.no_grad():
            sequence_tensor = sequence_tensor.to(self.device)
            if station_idx is not None:
                station_idx = station_idx.to(self.device)
            prediction = self.model(sequence_tensor, station_idx)
            return prediction.item()
