"""FastAPI app: CORS, error shape, router registration, /api/health.

Run from `backend/`:  uvicorn app.main:app --reload
"""

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import Settings, get_settings
from . import timeouts
from .errors import install_error_handlers
from .explain import Explainer, model_explainer
from .routes.diff import diff_router

logging.basicConfig(level=logging.INFO, format="%(message)s")


def create_app(
    settings: Settings | None = None,
    warm_cas: bool = True,
    explainer: Explainer | None = None,
) -> FastAPI:
    settings = settings or get_settings()
    explainer = explainer or model_explainer(settings)

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        if warm_cas:
            await asyncio.to_thread(timeouts.warm_up)  # first step check isn't a cold start
        yield
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

    app.include_router(diff_router(explainer))

    @app.get("/api/health")
    async def health() -> dict:
        return {"ok": True}

    return app


app = create_app()
