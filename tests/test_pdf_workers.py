"""PDF timeouts should leave unrelated requests and later uploads able to run."""

import asyncio
from concurrent.futures import ThreadPoolExecutor
from threading import Event

import pytest

from backend.app import pdfpages
from backend.app.errors import ApiError


def test_slow_pdf_leaves_the_shared_executor_available(monkeypatch):
    release = Event()

    async def exercise():
        loop = asyncio.get_running_loop()
        loop.set_default_executor(ThreadPoolExecutor(max_workers=1))
        started = asyncio.Event()

        def slow_count(_data):
            loop.call_soon_threadsafe(started.set)
            assert release.wait(3)
            return 1

        monkeypatch.setattr(pdfpages, "page_count", slow_count)
        request = asyncio.create_task(pdfpages.page_count_async(b"worksheet"))
        try:
            await asyncio.wait_for(started.wait(), 2)
            assert await asyncio.wait_for(asyncio.to_thread(lambda: "ready"), 0.5) == "ready"
        finally:
            release.set()
            assert await request == 1

    asyncio.run(exercise())


def test_waiting_pdf_does_not_start_after_its_timeout(monkeypatch):
    release = Event()
    processed = []

    async def exercise():
        loop = asyncio.get_running_loop()
        loop.set_default_executor(ThreadPoolExecutor(max_workers=2))
        started = asyncio.Event()

        def count(data):
            with pdfpages._lock:
                processed.append(data)
                if data == b"slow":
                    loop.call_soon_threadsafe(started.set)
                    assert release.wait(3)
            return 1

        monkeypatch.setattr(pdfpages, "page_count", count)
        monkeypatch.setattr(pdfpages, "RENDER_TIMEOUT_S", 0.1)
        first = asyncio.create_task(pdfpages.page_count_async(b"slow"))
        try:
            await asyncio.wait_for(started.wait(), 2)
            with pytest.raises(ApiError) as running:
                await first
            with pytest.raises(ApiError) as waiting:
                await pdfpages.page_count_async(b"expired")
            assert running.value.status == waiting.value.status == 504
        finally:
            release.set()
        monkeypatch.setattr(pdfpages, "RENDER_TIMEOUT_S", 2)
        assert await pdfpages.page_count_async(b"fresh") == 1

    asyncio.run(exercise())
    assert processed == [b"slow", b"fresh"]
