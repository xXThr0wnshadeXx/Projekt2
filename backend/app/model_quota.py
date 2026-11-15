"""Per-process sliding-window budget shared by all model calls."""

from collections import deque
from math import ceil
from threading import Lock
from time import monotonic

from .errors import ApiError


class ModelQuota:
    def __init__(self, limit: int, window_seconds: int):
        self.limit = limit
        self.window_seconds = window_seconds
        self._calls: deque[float] = deque()
        self._lock = Lock()

    def acquire(self) -> None:
        with self._lock:
            now = monotonic()
            while self._calls and now - self._calls[0] >= self.window_seconds:
                self._calls.popleft()
            if len(self._calls) >= self.limit:
                retry_after = ceil(self.window_seconds - (now - self._calls[0]))
                raise ApiError(
                    "RATE_LIMITED",
                    "Glance has used up its AI allowance for now. Reading, typing and handing in "
                    "still work. Try the AI features again later.",
                    429,
                    headers={"Retry-After": str(max(1, retry_after))},
                )
            self._calls.append(now)
