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
    assert timeouts._get_pool() is pool and pool.warm is True
    assert asyncio.run(timeouts.run_cas(is_parseable, "2x = 8", timeout=1.0)) is True


def test_startup_says_so_when_it_runs_out_of_time(slow_host, caplog):
    slow_host(delay=3.0, warm_limit=0.3)
    assert timeouts.warm_up() is False
    assert any("cas_not_warm_at_startup" in r.getMessage() for r in caplog.records)


def test_a_stuck_check_on_a_warm_pool_is_still_stopped():
    timeouts.warm_up()
    pool = timeouts._get_pool()
    assert pool.warm
    with pytest.raises(timeouts.CasTimeout):
        asyncio.run(timeouts.run_cas(time.sleep, 10, timeout=0.3))
    assert timeouts._get_pool() is not pool  # the stuck worker's pool was replaced
