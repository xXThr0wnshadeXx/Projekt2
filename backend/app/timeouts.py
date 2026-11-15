"""2-second timeout for SymPy work.

SymPy runs in a small pool of worker *processes*, not threads: a thread stuck in
`simplify` cannot be stopped and would hold the GIL, stalling every other
request. When a call runs past its budget the pool's workers are terminated and
a fresh pool is started on the next call.

A fresh pool is *cold*: spawning a worker and importing SymPy costs about two
seconds on its own. That is startup cost, not math, so it is never charged
against the CAS budget — a cold pool warms itself in the background and callers
wait for it before the clock starts. Without that, the first call after any
timeout would spend its whole budget on the import, time out, and mark a
perfectly valid line "unsure", so one slow expression would cost two lines.

Functions sent here must be importable top-level functions with picklable
arguments and results (plain strings, bools and tuples in practice).
"""

import asyncio
import multiprocessing
import threading
from collections.abc import Callable
from concurrent.futures import Future, ProcessPoolExecutor
from concurrent.futures.process import BrokenProcessPool
from typing import Any, TypeVar

from .config import get_settings
from .errors import ApiError

T = TypeVar("T")

_WORKERS = 2
_WARM_SECONDS = 30.0  # generous: this is process spawn plus the SymPy import
_lock = threading.Lock()
_pool: ProcessPoolExecutor | None = None
_ready: threading.Event = threading.Event()


class CasTimeout(ApiError):
    def __init__(self) -> None:
        super().__init__("TIMEOUT", "That took too long to check. I couldn't confirm it.", 504)


def _warm() -> bool:
    from sympy.parsing.latex import parse_latex

    parse_latex("x + 1 = 2", strict=True)
    return True


def _warm_in_background(pool: ProcessPoolExecutor, ready: threading.Event) -> None:
    """Import SymPy in every worker, then let waiting callers through."""
    try:
        for future in [pool.submit(_warm) for _ in range(_WORKERS)]:
            future.result(timeout=_WARM_SECONDS)
    except Exception:
        pass  # a pool that cannot warm is replaced by the next `_submit`
    finally:
        ready.set()


def _get_pool() -> tuple[ProcessPoolExecutor, threading.Event]:
    global _pool, _ready
    with _lock:
        if _pool is None:
            ctx = multiprocessing.get_context("spawn")
            _pool = ProcessPoolExecutor(max_workers=_WORKERS, mp_context=ctx)
            _ready = threading.Event()
            threading.Thread(
                target=_warm_in_background, args=(_pool, _ready), daemon=True
            ).start()
        return _pool, _ready


def _kill_pool(pool: ProcessPoolExecutor) -> None:
    global _pool
    with _lock:
        if _pool is pool:
            _pool = None
    for proc in list((pool._processes or {}).values()):  # no public API to stop a busy worker
        proc.terminate()
    pool.shutdown(wait=False, cancel_futures=True)
    _get_pool()  # start warming the replacement now, not on the next request


def _budget(timeout: float | None) -> float:
    return get_settings().cas_timeout_seconds if timeout is None else timeout


def _submit(fn: Callable[..., T], args: tuple) -> tuple[ProcessPoolExecutor, Future]:
    pool, _ = _get_pool()
    try:
        return pool, pool.submit(fn, *args)
    except BrokenProcessPool:
        _kill_pool(pool)
        pool, _ = _get_pool()
        return pool, pool.submit(fn, *args)


async def run_cas(fn: Callable[..., T], *args: Any, timeout: float | None = None) -> T:
    """Run `fn(*args)` in a warm worker process; raise CasTimeout past the budget."""
    _, ready = _get_pool()
    if not ready.is_set():
        await asyncio.to_thread(ready.wait, _WARM_SECONDS)
    pool, future = _submit(fn, args)
    try:
        return await asyncio.wait_for(asyncio.wrap_future(future), _budget(timeout))
    except (asyncio.TimeoutError, BrokenProcessPool):
        _kill_pool(pool)
        raise CasTimeout() from None


def run_cas_sync(fn: Callable[..., T], *args: Any, timeout: float | None = None) -> T:
    """Blocking variant for scripts and evals."""
    _, ready = _get_pool()
    ready.wait(_WARM_SECONDS)
    pool, future = _submit(fn, args)
    try:
        return future.result(timeout=_budget(timeout))
    except (TimeoutError, BrokenProcessPool):
        _kill_pool(pool)
        raise CasTimeout() from None


def warm_up() -> None:
    """Start the workers and import SymPy so the first real request is fast."""
    _, ready = _get_pool()
    ready.wait(_WARM_SECONDS)


def shutdown() -> None:
    global _pool
    with _lock:
        pool, _pool = _pool, None
    if pool is not None:
        pool.shutdown(wait=False, cancel_futures=True)
