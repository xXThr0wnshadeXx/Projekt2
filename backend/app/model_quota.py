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
                    "Reading new photos and speech is paused for today to keep the demo running. You can still type your lines, check them, and hand in.",
                    429,
                    headers={"Retry-After": str(max(1, retry_after))},
                )
            self._calls.append(now)
