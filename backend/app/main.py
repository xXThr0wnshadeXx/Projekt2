"""FastAPI app: CORS, error shape, router registration, /api/health.

Run from `backend/`:  uvicorn app.main:app --reload
"""

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import Settings, get_settings
from .errors import install_error_handlers

logging.basicConfig(level=logging.INFO, format="%(message)s")


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    app = FastAPI(title="Glance API", docs_url=None, redoc_url=None, openapi_url=None)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Content-Type"],
        max_age=600,
    )
    install_error_handlers(app)

    @app.get("/api/health")
    async def health() -> dict:
        return {"ok": True}

    return app


app = create_app()
