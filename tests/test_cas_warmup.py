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
    pool = timeouts._get_pool()
    assert pool.warm is False
    # Killing it would start another cold pool, and every check would time out
    # the same way for ever. It is kept, finishes warming, and then works.
    pool.ready.wait(10)
    assert pool in timeouts._pools() and pool.warm is True
    assert asyncio.run(timeouts.run_cas(is_parseable, "2x = 8", timeout=1.0)) is True


def test_startup_says_so_when_it_runs_out_of_time(slow_host, caplog):
    slow_host(delay=3.0, warm_limit=0.3)
    assert timeouts.warm_up() is False
    assert any("cas_not_warm_at_startup" in r.getMessage() for r in caplog.records)


def test_a_stuck_check_on_a_warm_pool_is_still_stopped():
    timeouts.warm_up()
    before = timeouts._pools()
    assert all(p.warm for p in before)
    with pytest.raises(timeouts.CasTimeout):
        asyncio.run(timeouts.run_cas(time.sleep, 10, timeout=0.3))
    after = timeouts._pools()
    # Only the stuck worker's slot was replaced; the others are untouched.
    assert len([p for p in before if p not in after]) == 1
    assert len(after) == len(before)


def test_a_stuck_check_does_not_fail_another_students_check():
    """#209: one slow expression used to kill the whole pool, failing every
    check in flight with it. Now only the stuck worker's own slot goes."""
    timeouts.warm_up()

    async def both():
        stuck = asyncio.create_task(timeouts.run_cas(time.sleep, 10, timeout=1.0))
        await asyncio.sleep(0.1)  # the stuck one is running in its slot
        other = asyncio.create_task(timeouts.run_cas(time.sleep, 1.5, timeout=5.0))
        results = await asyncio.gather(stuck, other, return_exceptions=True)
        return results

    stuck_result, other_result = asyncio.run(both())
    assert isinstance(stuck_result, timeouts.CasTimeout)
    # The other check was mid-run in its own slot when the stuck one was killed.
    assert other_result is None  # time.sleep returns None: it finished normally


def test_calls_go_to_the_least_busy_slot():
    timeouts.warm_up()

    async def two_at_once():
        a = timeouts.run_cas(time.sleep, 0.5, timeout=5.0)
        b = timeouts.run_cas(time.sleep, 0.5, timeout=5.0)
        started = time.monotonic()
        await asyncio.gather(a, b)
        return time.monotonic() - started

    # Two workers, two calls: they run side by side, not one after the other.
    assert asyncio.run(two_at_once()) < 0.9
