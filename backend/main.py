"""FastAPI application — routes and lifespan."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from .alerts import process_alerts
from .config import PROJECT_MAP, settings
from .db import get_run, get_run_logs, init_db, list_runs
from .metrics import (
    get_filter_breakdown,
    get_filter_breakdown_series,
    get_funnel,
    get_health_series,
    get_listings_windows,
    get_overview,
    get_speed_series,
)
from .scheduler import start_scheduler, stop_scheduler
from .sheets import sync_project

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    start_scheduler()
    yield
    stop_scheduler()


app = FastAPI(title="Observability Dashboard", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def _get_project(project_id: str):
    project = PROJECT_MAP.get(project_id)
    if not project:
        raise HTTPException(404, f"Project '{project_id}' not found")
    return project


# ---------------------------------------------------------------------------
# Projects
# ---------------------------------------------------------------------------

@app.get("/api/projects")
async def list_projects():
    return [{"id": p.id, "name": p.name} for p in settings.projects]


# ---------------------------------------------------------------------------
# Sync
# ---------------------------------------------------------------------------

@app.post("/api/sync/{project_id}")
async def sync(project_id: str):
    project = _get_project(project_id)
    try:
        inserted = await sync_project(project)
        if inserted > 0:
            await process_alerts(project.id, project.name)
        return {"inserted": inserted}
    except Exception as exc:
        raise HTTPException(500, str(exc)) from exc


# ---------------------------------------------------------------------------
# Runs
# ---------------------------------------------------------------------------

@app.get("/api/{project_id}/runs")
async def runs(
    project_id: str,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
):
    _get_project(project_id)
    return await list_runs(project_id, limit=limit, offset=offset)


@app.get("/api/{project_id}/runs/{run_id}")
async def run_detail(project_id: str, run_id: str):
    _get_project(project_id)
    run = await get_run(project_id, run_id)
    if not run:
        raise HTTPException(404, f"Run '{run_id}' not found")
    return run


@app.get("/api/{project_id}/runs/{run_id}/logs")
async def run_logs(
    project_id: str,
    run_id: str,
    levels: Annotated[list[str] | None, Query()] = None,
):
    _get_project(project_id)
    return await get_run_logs(project_id, run_id, levels=levels)


# ---------------------------------------------------------------------------
# Metrics
# ---------------------------------------------------------------------------

@app.get("/api/{project_id}/metrics/overview")
async def metrics_overview(project_id: str, tz: Annotated[str, Query()] = "UTC"):
    _get_project(project_id)
    return await get_overview(project_id, tz=tz)


@app.get("/api/{project_id}/metrics/speed")
async def metrics_speed(
    project_id: str,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    since: Annotated[str | None, Query()] = None,
    until: Annotated[str | None, Query()] = None,
):
    _get_project(project_id)
    return await get_speed_series(project_id, limit=limit, since=since, until=until)


@app.get("/api/{project_id}/metrics/funnel")
async def metrics_funnel(
    project_id: str,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
):
    _get_project(project_id)
    return await get_funnel(project_id, limit=limit)


@app.get("/api/{project_id}/metrics/filters")
async def metrics_filters(project_id: str):
    _get_project(project_id)
    return await get_filter_breakdown(project_id)


@app.get("/api/{project_id}/metrics/filters_series")
async def metrics_filters_series(
    project_id: str,
    since: Annotated[str | None, Query()] = None,
    until: Annotated[str | None, Query()] = None,
):
    _get_project(project_id)
    if not since:
        since = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
    return await get_filter_breakdown_series(project_id, since=since, until=until)


@app.get("/api/{project_id}/metrics/health_hourly")
async def metrics_health_hourly(
    project_id: str,
    since: Annotated[str | None, Query()] = None,
    until: Annotated[str | None, Query()] = None,
):
    _get_project(project_id)
    if not since:
        since = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
    return await get_health_series(project_id, since=since, until=until)


@app.get("/api/{project_id}/metrics/listings_windows")
async def metrics_listings_windows(
    project_id: str,
    since: Annotated[str | None, Query()] = None,
    until: Annotated[str | None, Query()] = None,
    window_hours: Annotated[int, Query(ge=1, le=720)] = 12,
):
    _get_project(project_id)
    if not since:
        since = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    return await get_listings_windows(
        project_id, since=since, until=until, window_hours=window_hours
    )
