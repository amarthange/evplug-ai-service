class StationNotFoundError(Exception):
    def __init__(self, station_id: str):
        self.station_id = station_id
        super().__init__(f"Station ID '{station_id}' not found.")

class ModelNotLoadedError(Exception):
    def __init__(self, model_name: str):
        self.model_name = model_name
        super().__init__(f"Model '{model_name}' is not loaded or unavailable.")
