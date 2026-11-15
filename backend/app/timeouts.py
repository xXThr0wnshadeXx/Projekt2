"""2-second timeout for SymPy work.

SymPy runs in a small set of worker *processes*, not threads: a thread stuck in
`simplify` cannot be stopped and would hold the GIL, stalling every other
request. Each worker is its own single-process executor ("slot") and takes one
call at a time. When a call runs past its budget only *its* worker is
terminated and replaced; calls running in the other slots finish normally
(issue #209).

A fresh worker is *cold*: spawning a worker and importing SymPy costs about two
seconds on its own. That is startup cost, not math, so it is never charged
against the CAS budget — a cold worker warms itself in the background and callers
wait for it before the clock starts. Without that, the first call on a
replaced worker would spend its whole budget on the import, time out, and mark a
perfectly valid line "unsure", so one slow expression would cost two lines.

Warming has no time limit of its own (#141). On a 0.1-CPU host it takes over a
minute, and declaring a worker ready before it is sends the first step check to
a worker still importing SymPy, where it times out. Callers wait up to
`cas_warm_seconds` for it, and a worker that is still warming is never killed
for being slow: that would only start another cold worker, for ever.

Functions sent here must be importable top-level functions with picklable
arguments and results (plain strings, bools and tuples in practice).
"""

import asyncio
import json
import logging
import multiprocessing
import os
import queue
import threading
import time
from collections.abc import Callable
from concurrent.futures import Future, ProcessPoolExecutor
from concurrent.futures.process import BrokenProcessPool
from typing import Any, TypeVar

from .config import get_settings
from .errors import ApiError

T = TypeVar("T")

log = logging.getLogger("glance.cas")
_lock = threading.Lock()
_slots: "queue.Queue[_Slot] | None" = None  # idle slots; None until first use
_all_slots: "list[_Slot]" = []


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


class _Slot:
    """One worker process. Replaced in place when its call times out."""

    def __init__(self) -> None:
        self.executor: ProcessPoolExecutor
        self.ready: threading.Event
        self.warm = False
        self.start()

    def start(self) -> None:
        ctx = multiprocessing.get_context("spawn")
        self.executor = ProcessPoolExecutor(max_workers=1, mp_context=ctx)
        self.ready = threading.Event()
        self.warm = False
        threading.Thread(target=self._warm_in_background, args=(self.executor, self.ready), daemon=True).start()

    def _warm_in_background(self, executor: ProcessPoolExecutor, ready: threading.Event) -> None:
        """Import SymPy in the worker, then let waiting callers through.

        No time limit (#141): on a slow host warming takes minutes, and saying
        "ready" before it is sends the first check to a worker still importing.
        """
        started = time.monotonic()
        try:
            executor.submit(_warm).result()
            if executor is self.executor:  # not replaced while warming
                self.warm = True
            log.info(json.dumps({"evt": "cas_warm", "seconds": round(time.monotonic() - started, 1)}))
        except Exception as exc:  # broken worker: the next call that breaks on it replaces it
            log.warning(json.dumps({"evt": "cas_warm_failed", "error": type(exc).__name__}))
        finally:
            ready.set()

    def kill(self) -> None:
        """Stop this slot's worker and start a replacement. Touches no other slot."""
        old = self.executor
        for proc in list((old._processes or {}).values()):  # no public API to stop a busy worker
            proc.terminate()
        old.shutdown(wait=False, cancel_futures=True)
        self.start()


def _idle_queue() -> "queue.Queue[_Slot]":
    global _slots
    with _lock:
        if _slots is None:
            _slots = queue.Queue()
            _all_slots.clear()
            for _ in range(max(1, get_settings().cas_workers)):
                slot = _Slot()
                _all_slots.append(slot)
                _slots.put(slot)
        return _slots


def _budget(timeout: float | None) -> float:
    return get_settings().cas_timeout_seconds if timeout is None else timeout


def _warm_limit() -> float:
    return get_settings().cas_warm_seconds


def _on_timeout(slot: _Slot) -> None:
    # Only a warm worker is stuck. One still warming is just slow: killing it
    # would start another cold worker, and on a small host every check would
    # then time out the same way, for ever (#141).
    if slot.warm:
        slot.kill()


def _submit(slot: _Slot, fn: Callable[..., T], args: tuple) -> Future:
    try:
        return slot.executor.submit(fn, *args)
    except BrokenProcessPool:
        slot.kill()
        slot.ready.wait(_warm_limit())
        return slot.executor.submit(fn, *args)


async def _take_slot(idle: "queue.Queue[_Slot]", deadline: float) -> _Slot:
    # Polling, not a blocking get in a thread: cancelling the caller then can
    # never strand a slot.
    while True:
        try:
            return idle.get_nowait()
        except queue.Empty:
            if time.monotonic() >= deadline:
                raise CasTimeout() from None
            await asyncio.sleep(0.005)


async def run_cas(fn: Callable[..., T], *args: Any, timeout: float | None = None) -> T:
    """Run `fn(*args)` in a warm worker process; raise CasTimeout past the budget."""
    budget = _budget(timeout)
    idle = _idle_queue()
    slot = await _take_slot(idle, time.monotonic() + budget)
    try:
        if not slot.ready.is_set():
            # Waiting for the warm-up is not charged to the budget.
            await asyncio.to_thread(slot.ready.wait, _warm_limit())
        future = _submit(slot, fn, args)
        try:
            return await asyncio.wait_for(asyncio.wrap_future(future), budget)
        except BrokenProcessPool:
            slot.kill()
            raise CasTimeout() from None
        except asyncio.TimeoutError:
            _on_timeout(slot)
            raise CasTimeout() from None
    finally:
        idle.put(slot)


def run_cas_sync(fn: Callable[..., T], *args: Any, timeout: float | None = None) -> T:
    """Blocking variant for scripts and evals."""
    budget = _budget(timeout)
    idle = _idle_queue()
    try:
        slot = idle.get(timeout=budget)
    except queue.Empty:
        raise CasTimeout() from None
    try:
        slot.ready.wait(_warm_limit())
        future = _submit(slot, fn, args)
        try:
            return future.result(timeout=budget)
        except BrokenProcessPool:
            slot.kill()
            raise CasTimeout() from None
        except TimeoutError:
            _on_timeout(slot)
            raise CasTimeout() from None
    finally:
        idle.put(slot)


def warm_up() -> bool:
    """Start the workers and wait until they have really warmed.

    Called before the server starts answering, so /api/health only says ok
    once a step check can actually run (#141). Returns whether every worker
    warmed in time; if not, the server starts anyway and checks wait.
    """
    _idle_queue()
    deadline = time.monotonic() + _warm_limit()
    for slot in list(_all_slots):
        slot.ready.wait(max(0.0, deadline - time.monotonic()))
    warm = all(slot.warm for slot in _all_slots)
    if not warm:
        log.warning(json.dumps({"evt": "cas_not_warm_at_startup", "waited_seconds": _warm_limit()}))
    return warm


def shutdown() -> None:
    global _slots
    with _lock:
        slots, _slots = list(_all_slots), None
        _all_slots.clear()
    for slot in slots:
        slot.executor.shutdown(wait=False, cancel_futures=True)
