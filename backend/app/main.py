"""FastAPI app: CORS, error shape, router registration, /api/health.

Run from `backend/`:  uvicorn app.main:app --reload
"""

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import Settings, get_settings
from .errors import install_error_handlers
from . import timeouts
from .mathcheck import validate_latex
from .openai_client import ModelClient, ModelSettings
from .routes.capture import capture_router
from .routes.spoken import spoken_router
from .routes.transcribe import transcribe_router

logging.basicConfig(level=logging.INFO, format="%(message)s")


def create_app(settings: Settings | None = None, warm_cas: bool = True) -> FastAPI:
    settings = settings or get_settings()
    models = None
    if settings.models_configured:
        models = ModelClient(ModelSettings(
            openai_api_key=settings.openai_api_key,
            model_vision=settings.model_vision,
            model_text=settings.model_text,
            model_stt=settings.model_stt,
        ))

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        try:
            if warm_cas:
                await asyncio.to_thread(timeouts.warm_up)
            yield
        finally:
            if models is not None:
                await models.close()
            timeouts.shutdown()

    app = FastAPI(
        title="Glance API", docs_url=None, redoc_url=None, openapi_url=None, lifespan=lifespan
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Content-Type"],
        max_age=600,
    )
    install_error_handlers(app)
    if models is not None:
        app.include_router(capture_router(models, validate_latex, settings.max_image_bytes))
        app.include_router(spoken_router(models, validate_latex))
        app.include_router(transcribe_router(models, min(settings.max_audio_seconds, 30)))

    @app.get("/api/health")
    async def health() -> dict:
        return {"ok": True}

    return app


app = create_app()
