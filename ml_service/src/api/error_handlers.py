import traceback
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from .exceptions import StationNotFoundError, ModelNotLoadedError

def register_exception_handlers(app: FastAPI):
    
    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(request: Request, exc: RequestValidationError):
        # We want to return 400 for physical bounds (lat, lon, temp, traffic)
        # and 422 for semantically invalid ones (like timestamp).
        
        status_code = 400
        errors = exc.errors()
        
        # Check if any error is related to 'timestamp'
        for err in errors:
            loc = err.get("loc", [])
            if "timestamp" in loc:
                status_code = 422
                break
                
        return JSONResponse(
            status_code=status_code,
            content={
                "detail": "Invalid input parameters",
                "errors": errors
            }
        )

    @app.exception_handler(StationNotFoundError)
    async def station_not_found_handler(request: Request, exc: StationNotFoundError):
        return JSONResponse(
            status_code=404,
            content={"detail": str(exc)}
        )

    @app.exception_handler(ModelNotLoadedError)
    async def model_not_loaded_handler(request: Request, exc: ModelNotLoadedError):
        return JSONResponse(
            status_code=503,
            content={"detail": str(exc)}
        )

    @app.exception_handler(Exception)
    async def generic_exception_handler(request: Request, exc: Exception):
        # Log stack trace in server logs
        print(f"Unhandled Exception: {exc}")
        traceback.print_exc()
        
        return JSONResponse(
            status_code=500,
            content={"detail": "An internal server error occurred."}
        )
