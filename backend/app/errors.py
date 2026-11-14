"""The single error shape from DESIGN.md 9.

Every failure leaves the API as
    {"error": {"code": "...", "message": "..."}}
and the front end announces `message` as-is, so messages are short, plain and
safe to read aloud. Stack traces never leave the server.
"""

import logging
from typing import Literal

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

log = logging.getLogger("glance.errors")

ErrorCode = Literal[
    "UNPARSEABLE",
    "TIMEOUT",
    "MODEL_ERROR",
    "BAD_INPUT",
    "MODE_DISABLED",
    "RATE_LIMITED",
    "NOT_FOUND",
    "INTERNAL",
]


class ApiError(Exception):
    def __init__(self, code: ErrorCode, message: str, status: int = 400):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status


def error_body(code: ErrorCode, message: str) -> dict:
    return {"error": {"code": code, "message": message}}


def error_response(code: ErrorCode, message: str, status: int) -> JSONResponse:
    from .observability import note_error

    note_error(code)
    return JSONResponse(status_code=status, content=error_body(code, message))


_HTTP_CODES: dict[int, tuple[ErrorCode, str]] = {
    404: ("NOT_FOUND", "That address doesn't exist."),
    405: ("BAD_INPUT", "That request method isn't supported here."),
    413: ("BAD_INPUT", "That file is too large."),
    415: ("BAD_INPUT", "That file type isn't supported."),
    429: ("RATE_LIMITED", "Too many requests. Wait a moment and try again."),
}


async def _api_error(_: Request, exc: ApiError) -> JSONResponse:
    return error_response(exc.code, exc.message, exc.status)


async def _validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
    return error_response("BAD_INPUT", "Some required information was missing or invalid.", 400)


async def _http_error(_: Request, exc: StarletteHTTPException) -> JSONResponse:
    code, message = _HTTP_CODES.get(exc.status_code, ("BAD_INPUT", "That request couldn't be handled."))
    return error_response(code, message, exc.status_code)


async def _unhandled(request: Request, exc: Exception) -> JSONResponse:
    log.error("unhandled %s on %s", type(exc).__name__, request.url.path, exc_info=exc)
    return error_response("INTERNAL", "Something went wrong on our side. Try again.", 500)


def install_error_handlers(app: FastAPI) -> None:
    app.add_exception_handler(ApiError, _api_error)
    app.add_exception_handler(RequestValidationError, _validation_error)
    app.add_exception_handler(StarletteHTTPException, _http_error)
    app.add_exception_handler(Exception, _unhandled)
