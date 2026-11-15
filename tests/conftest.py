"""Shared test setup.

The CAS worker pool imports SymPy on first use, which costs seconds. Tests that
assert on the 2-second budget would otherwise measure that import and pass or
fail depending on how fast the machine is, so the pool is warmed once per
session before any test runs.
"""

import pytest

from backend.app import timeouts


@pytest.fixture(scope="session", autouse=True)
def warm_cas_pool():
    timeouts.warm_up()
    yield
    timeouts.shutdown()
