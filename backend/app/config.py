"""Environment configuration.

Every value comes from the environment or `backend/.env` (never committed).
Missing model settings do not stop the server from starting, so `/api/health`
and the CAS-only endpoints stay up while keys are being configured.
"""

from functools import lru_cache
from pathlib import Path

from pydantic import SecretStr
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

    # Comma-separated list of exact origins. Never a wildcard.
    allowed_origin: str = "http://localhost:5173"

    max_image_bytes: int = 8 * 1024 * 1024
    max_audio_seconds: int = 30
    cas_timeout_seconds: float = 2.0

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
