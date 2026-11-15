"""Environment configuration.

Every value comes from the environment or `backend/.env` (never committed).
Missing model settings do not stop the server from starting, so `/api/health`
and the CAS-only endpoints stay up while keys are being configured.
"""

from functools import lru_cache
from pathlib import Path

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[1]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BACKEND_DIR / ".env", env_file_encoding="utf-8", extra="ignore"
    )

    openai_api_key: SecretStr | None = None
    model_vision: str = ""
    model_text: str = ""
    model_stt: str = ""
    # Optional neural text-to-speech for the app's own voice (#182). Empty means
    # the browser's built-in voice is used, as before.
    model_tts: str = ""

    # Comma-separated list of exact origins. Never a wildcard.
    allowed_origin: str = "http://localhost:5173"

    max_image_bytes: int = 8 * 1024 * 1024
    max_audio_seconds: int = 30
    cas_timeout_seconds: float = 2.0

    # Per-IP request budgets. Model-backed endpoints share the tighter one.
    rate_limit_model_per_minute: int = 20
    rate_limit_per_minute: int = 120
    model_call_limit: int = Field(default=0, ge=0)
    model_call_window_seconds: int = Field(default=3600, gt=0)
    # Proxies in front of the app that append to X-Forwarded-For (1 on Render).
    trusted_proxy_hops: int = 0

    # Enables GET /api/stats when set; sent as the X-Stats-Token header.
    stats_token: SecretStr | None = None

    # JSON price table per model ID, used only for cost logging. See .env.example.
    model_prices: str = ""

    @property
    def allowed_origins(self) -> list[str]:
        origins = [o.strip().rstrip("/") for o in self.allowed_origin.split(",")]
        return [o for o in origins if o and o != "*"]

    @property
    def models_configured(self) -> bool:
        key = self.openai_api_key.get_secret_value() if self.openai_api_key else ""
        return bool(key and self.model_vision and self.model_text and self.model_stt)


@lru_cache
def get_settings() -> Settings:
    return Settings()
