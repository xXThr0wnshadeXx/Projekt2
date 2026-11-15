"""Server-side access to the configured interpretation and transcription models."""

import asyncio
import json
import logging
from functools import lru_cache
from pathlib import Path
from typing import Annotated, Literal

from openai import APIConnectionError, APIStatusError, APITimeoutError, AsyncOpenAI, OpenAIError
from openai.types.chat import ChatCompletionMessageParam
from pydantic import SecretStr, StringConstraints
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[1]
SCHEMA_DIR = Path(__file__).with_name("schemas")
ModelId = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]
StructuredTask = Literal["capture", "spoken"]
log = logging.getLogger("glance.models")
_SAFE_ERROR_CODES = {
    "credit_balance_exhausted",
    "insufficient_quota",
    "organization_spend_limit_exceeded",
    "organization_usage_limit_exceeded",
    "project_spend_limit_exceeded",
    "rate_limit_exceeded",
    "slow_down",
    "invalid_api_key",
    "model_not_found",
}


def _log_provider_failure(task: str, error: Exception) -> None:
    details: dict[str, str | int] = {"evt": "model_error", "task": task}
    if isinstance(error, APIStatusError):
        code = error.code
        if not isinstance(code, str) or code not in _SAFE_ERROR_CODES:
            code = "unknown"
        details.update(status=error.status_code, code=code)
    elif isinstance(error, (TimeoutError, APITimeoutError)):
        details["category"] = "timeout"
    elif isinstance(error, APIConnectionError):
        details["category"] = "connection"
    else:
        details["category"] = "client_error"
    log.warning(json.dumps(details, separators=(",", ":")))


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

    # The SDK defaults are a 600 s read timeout and 2 retries. One stalled
    # upstream call would then hold a capture for ten minutes while the student
    # hears nothing, against a 12 s hard limit (DESIGN.md 16). These are
    # settings rather than constants so the budget can be widened from the
    # deploy dashboard during judging without shipping a change.
    #
    # The budgets differ because the steps do. A capture is one big image and
    # DESIGN.md 16 allows it 6 s at p50 and 12 s at worst. A spoken line has to
    # come back in 3 s at p50 and 6 s at worst, and the model call is only part
    # of that — transcription, CAS validation and the network all come out of
    # the same budget — so giving it the capture's timeout would let a single
    # slow call blow the step on its own. Retries are bounded by the same
    # deadline, since it wraps the whole attempt sequence rather than one try.
    model_timeout_seconds: float = 10.0
    model_fast_timeout_seconds: float = 4.0
    model_max_retries: int = 1


@lru_cache
def load_schema(task: StructuredTask) -> dict:
    return json.loads((SCHEMA_DIR / f"{task}.json").read_text(encoding="utf-8"))


class ModelClient:
    def __init__(self, settings: ModelSettings):
        self.settings = settings
        self.client = AsyncOpenAI(
            api_key=settings.openai_api_key.get_secret_value(),
            timeout=settings.model_timeout_seconds,
            max_retries=settings.model_max_retries,
        )

    async def close(self) -> None:
        await self.client.close()

    @staticmethod
    async def _bounded(seconds: float, call):
        """Hold `call` to a deadline, retries and all.

        The SDK's own `timeout` applies per attempt, so with retries enabled the
        total can still run past the step's budget. This caps the whole thing.
        """
        return await asyncio.wait_for(call, timeout=seconds)

    async def interpret(
        self, task: StructuredTask, messages: list[ChatCompletionMessageParam]
    ) -> dict:
        model = self.settings.model_vision if task == "capture" else self.settings.model_text
        # Vision gets the long budget; everything else is on the spoken-line
        # path and gets the short one.
        budget = (
            self.settings.model_timeout_seconds
            if task == "capture"
            else self.settings.model_fast_timeout_seconds
        )
        try:
            result = await self._bounded(budget, self.client.chat.completions.create(
                model=model,
                messages=messages,
                response_format={
                    "type": "json_schema",
                    "json_schema": {"name": task, "strict": True, "schema": load_schema(task)},
                },
            ))
        except (OpenAIError, TimeoutError) as error:
            _log_provider_failure(task, error)
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
            result = await self._bounded(
                self.settings.model_fast_timeout_seconds,
                self.client.audio.transcriptions.create(
                    model=self.settings.model_stt,
                    file=(filename, audio, content_type),
                    response_format="json",
                ),
            )
        except (OpenAIError, TimeoutError) as error:
            _log_provider_failure("transcribe", error)
            raise ModelError("The transcription service is unavailable.") from None
        return result.text
