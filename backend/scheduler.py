"""APScheduler background jobs: periodic sync + alert scanning."""

from __future__ import annotations

import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler

from .alerts import process_alerts
from .config import PROJECT_MAP, settings
from .sheets import sync_project

logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler()


async def _sync_and_alert():
    for project in settings.projects:
        try:
            inserted = await sync_project(project)
            if inserted > 0:
                await process_alerts(project.id, project.name)
        except Exception as exc:
            logger.error("Scheduled sync failed for %s: %s", project.id, exc)


def start_scheduler():
    scheduler.add_job(
        _sync_and_alert,
        "interval",
        minutes=settings.sync_interval_minutes,
        id="sync_and_alert",
        replace_existing=True,
    )
    scheduler.start()
    logger.info(
        "Scheduler started — syncing every %d minutes", settings.sync_interval_minutes
    )


def stop_scheduler():
    scheduler.shutdown(wait=False)
