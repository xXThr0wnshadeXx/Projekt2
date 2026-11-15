"""Server-side access to the configured interpretation and transcription models."""

import asyncio
import json
from functools import lru_cache
from pathlib import Path
from typing import Annotated, Literal

from openai import AsyncOpenAI, OpenAIError
from openai.types.chat import ChatCompletionMessageParam
from pydantic import SecretStr, StringConstraints
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[1]
SCHEMA_DIR = Path(__file__).with_name("schemas")
ModelId = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]
StructuredTask = Literal["capture", "spoken"]


class ModelError(RuntimeError):
    """The upstream response could not be used."""


class ModelSettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BACKEND_DIR / ".env", env_file_encoding="utf-8", extra="ignore"
    )

    openai_api_key: SecretStr
    model_vision: ModelId
    model_text: ModelId
    model_stt: ModelId


@lru_cache
def load_schema(task: StructuredTask) -> dict:
    return json.loads((SCHEMA_DIR / f"{task}.json").read_text(encoding="utf-8"))


class ModelClient:
    def __init__(self, settings: ModelSettings):
        self.settings = settings
        self.client = AsyncOpenAI(
            api_key=settings.openai_api_key.get_secret_value(), timeout=10, max_retries=0
        )

    async def close(self) -> None:
        await self.client.close()

    async def interpret(
        self, task: StructuredTask, messages: list[ChatCompletionMessageParam]
    ) -> dict:
        model = self.settings.model_vision if task == "capture" else self.settings.model_text
        try:
            result = await asyncio.wait_for(self.client.chat.completions.create(
                model=model,
                messages=messages,
                response_format={
                    "type": "json_schema",
                    "json_schema": {"name": task, "strict": True, "schema": load_schema(task)},
                },
            ), timeout=10 if task == "capture" else 4)
        except (OpenAIError, TimeoutError):
            raise ModelError("The interpretation service is unavailable.") from None
        if not result.choices:
            raise ModelError("The model returned no result.")
        choice = result.choices[0]
        if choice.finish_reason != "stop" or choice.message.refusal or not choice.message.content:
            raise ModelError("The model could not interpret this input.")
        try:
            payload = json.loads(choice.message.content)
        except ValueError:
            raise ModelError("The model returned an unreadable result.") from None
        if not isinstance(payload, dict):
            raise ModelError("The model returned an unreadable result.")
        return payload

    async def transcribe(self, filename: str, audio: bytes, content_type: str) -> str:
        try:
            result = await asyncio.wait_for(self.client.audio.transcriptions.create(
                model=self.settings.model_stt,
                file=(filename, audio, content_type),
                response_format="json",
            ), timeout=4)
        except (OpenAIError, TimeoutError):
            raise ModelError("The transcription service is unavailable.") from None
        return result.text
