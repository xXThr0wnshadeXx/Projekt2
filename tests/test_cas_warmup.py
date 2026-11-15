"""CAS worker warm-up on a slow host (issue #141).

A 0.1-CPU free plan needs over a minute to spawn the workers and import
SymPy. GLANCE_CAS_WARM_DELAY makes every worker sleep that long while warming,
standing in for the slow host (spawned workers inherit the environment).
"""

import asyncio
import time

import pytest

from backend.app import timeouts
from backend.app.mathcheck import is_parseable


@pytest.fixture
def slow_host(monkeypatch):
    def make(delay: float, warm_limit: float = 60.0):
        monkeypatch.setenv("GLANCE_CAS_WARM_DELAY", str(delay))
        monkeypatch.setattr(timeouts, "_warm_limit", lambda: warm_limit)
        timeouts.shutdown()  # the next call starts a fresh, slow pool

    yield make
    timeouts.shutdown()  # leave a normal pool for the tests that follow


def test_startup_waits_for_a_real_warm_up_so_the_first_check_succeeds(slow_host):
    slow_host(delay=2.0)
    started = time.monotonic()
    assert timeouts.warm_up() is True
    assert time.monotonic() - started >= 2.0  # it really waited
    # The bug: health said ok, then this first check timed out with 504.
    assert asyncio.run(timeouts.run_cas(is_parseable, "2x = 8", timeout=1.0)) is True


def test_waiting_for_the_warm_up_is_not_charged_to_the_check(slow_host):
    slow_host(delay=2.0)
    # No warm_up() first: the request arrives while the workers are warming.
    assert asyncio.run(timeouts.run_cas(is_parseable, "2x = 8", timeout=0.5)) is True


def test_a_timeout_while_warming_does_not_kill_the_pool(slow_host):
    # The callers' wait runs out (0.3 s) long before the pool warms (3 s).
    slow_host(delay=3.0, warm_limit=0.3)
    with pytest.raises(timeouts.CasTimeout):
        asyncio.run(timeouts.run_cas(is_parseable, "2x = 8", timeout=0.2))
    slots = list(timeouts._all_slots)
    executors = [slot.executor for slot in slots]
    assert not any(slot.warm for slot in slots)
    # Killing it would start another cold worker, and every check would time
    # out the same way for ever. It is kept, finishes warming, and then works.
    for slot in slots:
        slot.ready.wait(10)
    assert [slot.executor for slot in timeouts._all_slots] == executors
    assert all(slot.warm for slot in slots)
    assert asyncio.run(timeouts.run_cas(is_parseable, "2x = 8", timeout=1.0)) is True


def test_startup_says_so_when_it_runs_out_of_time(slow_host, caplog):
    slow_host(delay=3.0, warm_limit=0.3)
    assert timeouts.warm_up() is False
    assert any("cas_not_warm_at_startup" in r.getMessage() for r in caplog.records)


def test_a_stuck_check_on_a_warm_pool_is_still_stopped():
    timeouts.warm_up()
    before = [slot.executor for slot in timeouts._all_slots]
    assert all(slot.warm for slot in timeouts._all_slots)
    with pytest.raises(timeouts.CasTimeout):
        asyncio.run(timeouts.run_cas(time.sleep, 10, timeout=0.3))
    after = [slot.executor for slot in timeouts._all_slots]
    # Only the stuck worker was replaced; the other slot kept its worker.
    assert sum(a is not b for a, b in zip(before, after)) == 1


def test_a_worker_that_hangs_while_warming_is_replaced(slow_host, monkeypatch):
    # Warming takes 3 s but the hard cap is 0.5 s: the hung worker must be
    # stopped and a fresh one started, not left in place for ever.
    slow_host(delay=3.0, warm_limit=0.5)
    monkeypatch.setattr(timeouts, "_warm_cap", lambda: 0.5)
    timeouts._idle_queue()
    first = [slot.executor for slot in timeouts._all_slots]
    deadline = time.monotonic() + 5
    while time.monotonic() < deadline:
        if all(a is not b for a, b in zip(first, [s.executor for s in timeouts._all_slots])):
            break
        time.sleep(0.1)
    assert all(a is not b for a, b in zip(first, [s.executor for s in timeouts._all_slots]))


def test_replacing_a_broken_worker_does_not_freeze_other_requests(monkeypatch):
    """The wait for a replacement happens off the event loop (#143 review)."""
    from concurrent.futures.process import BrokenProcessPool
    import threading

    class FakeExecutor:
        def __init__(self, broken):
            self.broken = broken

        def submit(self, fn, *args):
            if self.broken:
                raise BrokenProcessPool()
            from concurrent.futures import Future
            f = Future()
            f.set_result("ok")
            return f

    class FakeSlot:
        def __init__(self):
            self.executor = FakeExecutor(broken=True)
            self.ready = threading.Event()

        def kill(self):
            # The replacement takes 0.5 s to warm.
            self.executor = FakeExecutor(broken=False)
            self.ready = threading.Event()
            threading.Timer(0.5, self.ready.set).start()

    monkeypatch.setattr(timeouts, "_warm_limit", lambda: 5.0)

    async def both():
        ticks = 0

        async def ticker():
            nonlocal ticks
            for _ in range(20):
                await asyncio.sleep(0.02)
                ticks += 1

        tick = asyncio.create_task(ticker())
        future = await timeouts._submit_async(FakeSlot(), str, ())
        await tick
        return future.result(), ticks

    result, ticks = asyncio.run(both())
    assert result == "ok"
    assert ticks == 20  # the loop kept running while the worker was replaced
