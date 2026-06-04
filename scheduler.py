from __future__ import annotations

import asyncio
from datetime import datetime, timedelta

from .config import settings
from .fetcher import refresh_all_sources


refresh_lock = asyncio.Lock()


async def refresh_once() -> dict:
    async with refresh_lock:
        return await refresh_all_sources()


def seconds_until_next_run(hour: int) -> float:
    now = datetime.now().astimezone()
    run_at = now.replace(hour=hour, minute=0, second=0, microsecond=0)
    if run_at <= now:
        run_at += timedelta(days=1)
    return max(1.0, (run_at - now).total_seconds())


async def daily_scheduler(stop_event: asyncio.Event) -> None:
    if settings.run_on_start:
        await refresh_once()
    while not stop_event.is_set():
        timeout = seconds_until_next_run(settings.daily_run_hour)
        try:
            await asyncio.wait_for(stop_event.wait(), timeout=timeout)
        except asyncio.TimeoutError:
            await refresh_once()

