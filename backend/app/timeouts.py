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
import json
import logging
import multiprocessing
import os
import threading
import time
from collections.abc import Callable
from concurrent.futures import Future, ProcessPoolExecutor
from concurrent.futures.process import BrokenProcessPool
from dataclasses import dataclass, field
from typing import Any, TypeVar

from .config import get_settings
from .errors import ApiError

T = TypeVar("T")

log = logging.getLogger("glance.cas")
_lock = threading.Lock()


@dataclass
class _Pool:
    """A worker pool and whether it has really finished warming."""

    executor: ProcessPoolExecutor
    ready: threading.Event = field(default_factory=threading.Event)
    warm: bool = False


_pool: _Pool | None = None


class CasTimeout(ApiError):
    def __init__(self) -> None:
        super().__init__("TIMEOUT", "That took too long to check. I couldn't confirm it.", 504)


def _warm() -> bool:
    # Test and rehearsal hook: simulate a slow host (a 0.1-CPU free plan).
    delay = float(os.environ.get("GLANCE_CAS_WARM_DELAY", "0") or 0)
    if delay:
        time.sleep(delay)
    from sympy.parsing.latex import parse_latex

    parse_latex("x + 1 = 2", strict=True)
    return True


def _warm_in_background(pool: _Pool, workers: int) -> None:
    """Import SymPy in every worker, then let waiting callers through.

    There is deliberately no time limit here: on a 0.1-CPU host warming takes
    minutes, and declaring the pool ready before it is (#141) sends the first
    step check to a worker still importing SymPy, where it times out.
    """
    started = time.monotonic()
    try:
        for future in [pool.executor.submit(_warm) for _ in range(workers)]:
            future.result()
        pool.warm = True
        log.info(json.dumps({"evt": "cas_warm", "seconds": round(time.monotonic() - started, 1)}))
    except Exception as exc:  # broken pool: the next _submit replaces it
        log.warning(json.dumps({"evt": "cas_warm_failed", "error": type(exc).__name__}))
    finally:
        pool.ready.set()


def _get_pool() -> _Pool:
    global _pool
    with _lock:
        if _pool is None:
            workers = max(1, get_settings().cas_workers)
            ctx = multiprocessing.get_context("spawn")
            _pool = _Pool(ProcessPoolExecutor(max_workers=workers, mp_context=ctx))
            threading.Thread(target=_warm_in_background, args=(_pool, workers), daemon=True).start()
        return _pool


def _kill_pool(pool: _Pool) -> None:
    global _pool
    with _lock:
        if _pool is pool:
            _pool = None
    for proc in list((pool.executor._processes or {}).values()):  # no public API to stop a busy worker
        proc.terminate()
    pool.executor.shutdown(wait=False, cancel_futures=True)
    _get_pool()  # start warming the replacement now, not on the next request


def _budget(timeout: float | None) -> float:
    return get_settings().cas_timeout_seconds if timeout is None else timeout


def _warm_limit() -> float:
    return get_settings().cas_warm_seconds


def _submit(fn: Callable[..., T], args: tuple) -> tuple[_Pool, Future]:
    pool = _get_pool()
    try:
        return pool, pool.executor.submit(fn, *args)
    except BrokenProcessPool:
        _kill_pool(pool)
        pool = _get_pool()
        return pool, pool.executor.submit(fn, *args)


def _on_timeout(pool: _Pool) -> None:
    # Only a warm pool is stuck. A pool still warming is just slow: killing it
    # would start another cold pool, and on a small host every check would
    # then time out the same way, for ever (#141).
    if pool.warm:
        _kill_pool(pool)


async def run_cas(fn: Callable[..., T], *args: Any, timeout: float | None = None) -> T:
    """Run `fn(*args)` in a warm worker process; raise CasTimeout past the budget.

    Waiting for the pool to warm is not charged to the budget.
    """
    pool = _get_pool()
    if not pool.ready.is_set():
        await asyncio.to_thread(pool.ready.wait, _warm_limit())
    pool, future = _submit(fn, args)
    try:
        return await asyncio.wait_for(asyncio.wrap_future(future), _budget(timeout))
    except BrokenProcessPool:
        _kill_pool(pool)
        raise CasTimeout() from None
    except asyncio.TimeoutError:
        _on_timeout(pool)
        raise CasTimeout() from None


def run_cas_sync(fn: Callable[..., T], *args: Any, timeout: float | None = None) -> T:
    """Blocking variant for scripts and evals."""
    _get_pool().ready.wait(_warm_limit())
    pool, future = _submit(fn, args)
    try:
        return future.result(timeout=_budget(timeout))
    except BrokenProcessPool:
        _kill_pool(pool)
        raise CasTimeout() from None
    except TimeoutError:
        _on_timeout(pool)
        raise CasTimeout() from None


def warm_up() -> bool:
    """Start the workers and wait until they have really warmed.

    Called before the server starts answering, so /api/health only says ok
    once a step check can actually run (#141). Returns whether it warmed in
    time; if not, the server starts anyway and checks wait for the warm-up.
    """
    pool = _get_pool()
    pool.ready.wait(_warm_limit())
    if not pool.warm:
        log.warning(json.dumps({"evt": "cas_not_warm_at_startup", "waited_seconds": _warm_limit()}))
    return pool.warm


def shutdown() -> None:
    global _pool
    with _lock:
        pool, _pool = _pool, None
    if pool is not None:
        pool.executor.shutdown(wait=False, cancel_futures=True)
