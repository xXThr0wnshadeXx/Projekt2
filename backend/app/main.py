"""FastAPI app: CORS, error shape, router registration, /api/health.

Run from `backend/`:  uvicorn app.main:app --reload
"""

import asyncio
import logging
from contextlib import asynccontextmanager

import hmac

from fastapi import FastAPI, Header
from fastapi.middleware.cors import CORSMiddleware

from . import guards, observability, timeouts
from .config import Settings, get_settings
from .errors import ApiError, install_error_handlers
from .explain import Explainer, model_explainer
from .mathcheck import validate_latex
from .openai_client import ModelClient, ModelSettings
from .routes.capture import capture_router
from .routes.diff import diff_router
from .routes.spoken import spoken_router
from .routes.transcribe import transcribe_router

logging.basicConfig(level=logging.INFO, format="%(message)s")


def create_app(
    settings: Settings | None = None,
    warm_cas: bool = True,
    explainer: Explainer | None = None,
) -> FastAPI:
    settings = settings or get_settings()
    explainer = explainer or model_explainer(settings)

    # Without model credentials the app still starts and serves /api/health and
    # /api/diff; the model-backed routes are simply not registered (issue #4).
    models = None
    if settings.models_configured:
        models = ModelClient(ModelSettings(
            openai_api_key=settings.openai_api_key,
            model_vision=settings.model_vision,
            model_text=settings.model_text,
            model_stt=settings.model_stt,
        ))
        # Every capture, spoken-line and transcription call adds its model,
        # tokens and cost to the request's log line and /api/stats (issue #44).
        observability.instrument_openai(models.client)

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

    # Middleware added last runs first: log → CORS → rate limit → body limit → app.
    # Guards sit inside CORS so the browser can read their friendly errors.
    app.add_middleware(
        guards.BodyLimitMiddleware,
        max_image_bytes=settings.max_image_bytes,
        max_audio_seconds=settings.max_audio_seconds,
    )
    app.add_middleware(
        guards.RateLimitMiddleware,
        model_budget=guards.Budget(settings.rate_limit_model_per_minute, 60),
        general_budget=guards.Budget(settings.rate_limit_per_minute, 60),
        trusted_proxy_hops=settings.trusted_proxy_hops,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Content-Type"],
        max_age=600,
    )
    install_error_handlers(app)
    # Outermost, so CORS preflights and error responses are timed and logged too.
    app.add_middleware(observability.RequestLogMiddleware)

    app.include_router(diff_router(explainer))
    if models is not None:
        app.include_router(capture_router(models, validate_latex, settings.max_image_bytes))
        app.include_router(spoken_router(models, validate_latex))
        app.include_router(transcribe_router(models, min(settings.max_audio_seconds, 30)))

    @app.get("/api/health")
    async def health() -> dict:
        return {"ok": True}

    @app.get("/api/stats")
    async def stats(x_stats_token: str | None = Header(default=None)) -> dict:
        """Live latency, error and cost summary. Contains no student content."""
        expected = settings.stats_token.get_secret_value() if settings.stats_token else ""
        if not expected or not hmac.compare_digest(x_stats_token or "", expected):
            raise ApiError("NOT_FOUND", "That address doesn't exist.", 404)
        return observability.summary()

    return app


app = create_app()
