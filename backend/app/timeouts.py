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

Functions sent here must be importable top-level functions with picklable
arguments and results (plain strings, bools and tuples in practice).
"""

import asyncio
import multiprocessing
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

_WORKERS = 2
_WARM_SECONDS = 30.0  # generous: this is process spawn plus the SymPy import
_lock = threading.Lock()
_slots: "queue.Queue[_Slot] | None" = None  # idle slots; None until first use
_all_slots: "list[_Slot]" = []


class CasTimeout(ApiError):
    def __init__(self) -> None:
        super().__init__("TIMEOUT", "That took too long to check. I couldn't confirm it.", 504)


def _warm() -> bool:
    from sympy.parsing.latex import parse_latex

    parse_latex("x + 1 = 2", strict=True)
    return True


class _Slot:
    """One worker process. Replaced in place when its call times out."""

    def __init__(self) -> None:
        self.executor: ProcessPoolExecutor
        self.ready: threading.Event
        self.start()

    def start(self) -> None:
        ctx = multiprocessing.get_context("spawn")
        self.executor = ProcessPoolExecutor(max_workers=1, mp_context=ctx)
        self.ready = threading.Event()
        threading.Thread(
            target=self._warm_in_background, args=(self.executor, self.ready), daemon=True
        ).start()

    @staticmethod
    def _warm_in_background(executor: ProcessPoolExecutor, ready: threading.Event) -> None:
        try:
            executor.submit(_warm).result(timeout=_WARM_SECONDS)
        except Exception:
            pass  # a worker that cannot warm is replaced by the next call that breaks on it
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
            for _ in range(_WORKERS):
                slot = _Slot()
                _all_slots.append(slot)
                _slots.put(slot)
        return _slots


def _budget(timeout: float | None) -> float:
    return get_settings().cas_timeout_seconds if timeout is None else timeout


def _submit(slot: _Slot, fn: Callable[..., T], args: tuple) -> Future:
    try:
        return slot.executor.submit(fn, *args)
    except BrokenProcessPool:
        slot.kill()
        slot.ready.wait(_WARM_SECONDS)
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
            await asyncio.to_thread(slot.ready.wait, _WARM_SECONDS)
        future = _submit(slot, fn, args)
        try:
            return await asyncio.wait_for(asyncio.wrap_future(future), budget)
        except (asyncio.TimeoutError, BrokenProcessPool):
            slot.kill()
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
        slot.ready.wait(_WARM_SECONDS)
        future = _submit(slot, fn, args)
        try:
            return future.result(timeout=budget)
        except (TimeoutError, BrokenProcessPool):
            slot.kill()
            raise CasTimeout() from None
    finally:
        idle.put(slot)


def warm_up() -> None:
    """Start the workers and import SymPy so the first real request is fast."""
    _idle_queue()
    for slot in list(_all_slots):
        slot.ready.wait(_WARM_SECONDS)


def shutdown() -> None:
    global _slots
    with _lock:
        slots, _slots = list(_all_slots), None
        _all_slots.clear()
    for slot in slots:
        slot.executor.shutdown(wait=False, cancel_futures=True)
