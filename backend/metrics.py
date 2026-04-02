"""Aggregate metric computation from SQLite."""

from __future__ import annotations

import json
import statistics
from datetime import datetime, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
from typing import Any

from .db import get_db


async def get_overview(project_id: str, tz: str = "UTC") -> dict[str, Any]:
    async with get_db() as db:
        # Total distinct runs
        run_count_row = await db.execute_fetchall(
            "SELECT COUNT(DISTINCT run_id) AS cnt FROM logs WHERE project_id = ?",
            (project_id,),
        )
        total_runs = run_count_row[0]["cnt"] if run_count_row else 0

        # Speed stats from "Run summary" logs
        speed_rows = await db.execute_fetchall(
            """
            SELECT CAST(json_extract(details, '$.elapsed_ms') AS INTEGER) AS ms
            FROM logs
            WHERE project_id = ? AND message = 'Run summary'
              AND json_extract(details, '$.elapsed_ms') IS NOT NULL
            """,
            (project_id,),
        )
        speeds = [r["ms"] for r in speed_rows if r["ms"] is not None]

        if speeds:
            speed_stats = {
                "min_ms": min(speeds),
                "max_ms": max(speeds),
                "avg_ms": round(statistics.mean(speeds)),
                "median_ms": round(statistics.median(speeds)),
            }
        else:
            speed_stats = {"min_ms": None, "max_ms": None, "avg_ms": None, "median_ms": None}

        # Total notified (sum of notified field from Run summary)
        notified_rows = await db.execute_fetchall(
            """
            SELECT SUM(CAST(json_extract(details, '$.notified') AS INTEGER)) AS total
            FROM logs
            WHERE project_id = ? AND message = 'Run summary'
              AND json_extract(details, '$.notified') IS NOT NULL
            """,
            (project_id,),
        )
        total_notified = notified_rows[0]["total"] or 0

        # Conversion rate: avg(valid / listed) per run
        funnel_rows = await db.execute_fetchall(
            """
            SELECT
                MAX(CASE WHEN message = 'Scraping complete'
                         THEN CAST(json_extract(details, '$.listed') AS REAL) END) AS listed,
                MAX(CASE WHEN message IN ('Filtering complete', 'Filter chain applied')
                         THEN CAST(json_extract(details, '$.valid') AS REAL) END) AS valid
            FROM logs
            WHERE project_id = ?
            GROUP BY run_id
            HAVING listed IS NOT NULL AND listed > 0
            """,
            (project_id,),
        )
        ratios = [r["valid"] / r["listed"] for r in funnel_rows if r["listed"] and r["listed"] > 0]
        conversion_rate = round(statistics.mean(ratios) * 100, 1) if ratios else None

        # Runs today — compute midnight in the user's local timezone, expressed as UTC
        try:
            zone = ZoneInfo(tz)
        except ZoneInfoNotFoundError:
            zone = timezone.utc
        midnight_local = datetime.now(zone).replace(hour=0, minute=0, second=0, microsecond=0)
        today = midnight_local.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")
        runs_today_row = await db.execute_fetchall(
            """
            SELECT COUNT(DISTINCT run_id) AS cnt
            FROM logs
            WHERE project_id = ? AND timestamp >= ?
            """,
            (project_id, today),
        )
        runs_today = runs_today_row[0]["cnt"] if runs_today_row else 0

        # Avg HTTP fetch time (from "Fetch successful" logs)
        fetch_rows = await db.execute_fetchall(
            """
            SELECT CAST(json_extract(details, '$.elapsed_ms') AS INTEGER) AS ms
            FROM logs
            WHERE project_id = ? AND message = 'Fetch successful'
              AND json_extract(details, '$.elapsed_ms') IS NOT NULL
            """,
            (project_id,),
        )
        fetch_times = [r["ms"] for r in fetch_rows if r["ms"] is not None]
        avg_fetch_ms = round(statistics.mean(fetch_times)) if fetch_times else None

        # Fetch retry rate: retries per run
        retry_row = await db.execute_fetchall(
            """
            SELECT COUNT(*) AS retries
            FROM logs
            WHERE project_id = ? AND message LIKE '%retrying%'
            """,
            (project_id,),
        )
        total_retries = retry_row[0]["retries"] if retry_row else 0
        avg_retries_per_run = round(total_retries / total_runs, 2) if total_runs > 0 else 0

        # Warning/error rate: % of runs that had at least one warning or error
        health_rows = await db.execute_fetchall(
            """
            SELECT
                COUNT(DISTINCT CASE WHEN level = 'WARNING'  THEN run_id END) AS warn_runs,
                COUNT(DISTINCT CASE WHEN level IN ('ERROR', 'CRITICAL') THEN run_id END) AS error_runs
            FROM logs
            WHERE project_id = ?
            """,
            (project_id,),
        )
        if health_rows and total_runs > 0:
            warn_runs = health_rows[0]["warn_runs"] or 0
            error_runs = health_rows[0]["error_runs"] or 0
            warning_rate_pct = round(warn_runs / total_runs * 100, 1)
            error_rate_pct = round(error_runs / total_runs * 100, 1)
        else:
            warning_rate_pct = None
            error_rate_pct = None

        # Avg gigs listed per run
        listed_row = await db.execute_fetchall(
            """
            SELECT AVG(CAST(json_extract(details, '$.listed') AS REAL)) AS avg_listed
            FROM logs
            WHERE project_id = ? AND message = 'Scraping complete'
              AND json_extract(details, '$.listed') IS NOT NULL
            """,
            (project_id,),
        )
        avg_listed = round(listed_row[0]["avg_listed"]) if listed_row and listed_row[0]["avg_listed"] is not None else None

        # Last sync time
        sync_row = await db.execute_fetchall(
            "SELECT last_synced_at FROM sync_state WHERE project_id = ?",
            (project_id,),
        )
        last_synced_at = sync_row[0]["last_synced_at"] if sync_row else None

        return {
            "total_runs": total_runs,
            "runs_today": runs_today,
            "total_notified": total_notified,
            "conversion_rate_pct": conversion_rate,
            "avg_listed": avg_listed,
            "avg_fetch_ms": avg_fetch_ms,
            "avg_retries_per_run": avg_retries_per_run,
            "warning_rate_pct": warning_rate_pct,
            "error_rate_pct": error_rate_pct,
            "last_synced_at": last_synced_at,
            **speed_stats,
        }


async def get_speed_series(
    project_id: str,
    limit: int = 50,
    since: str | None = None,
    until: str | None = None,
) -> list[dict]:
    """Per-run timing breakdown for time-series chart."""
    SELECT_COLS = """
        SELECT
            run_id,
            MIN(timestamp) AS started_at,
            MAX(CASE WHEN message = 'Run summary'
                     THEN CAST(json_extract(details, '$.elapsed_ms') AS INTEGER) END) AS total_ms,
            MAX(CASE WHEN message = 'Scraping complete'
                     THEN CAST(json_extract(details, '$.elapsed_ms') AS INTEGER) END) AS scrape_ms,
            MAX(CASE WHEN message = 'Filtering complete'
                     THEN CAST(json_extract(details, '$.elapsed_ms') AS INTEGER) END) AS filter_ms,
            MAX(CASE WHEN message LIKE '%notification%' OR message LIKE 'Notifications%'
                     THEN CAST(json_extract(details, '$.elapsed_ms') AS INTEGER) END) AS notify_ms
        FROM logs
        WHERE project_id = ?
        GROUP BY run_id
    """
    async with get_db() as db:
        if since:
            until_clause = "AND MIN(timestamp) <= ?" if until else ""
            params: list[Any] = [project_id, since]
            if until:
                params.append(until)
            rows = await db.execute_fetchall(
                f"{SELECT_COLS} HAVING total_ms IS NOT NULL AND MIN(timestamp) >= ? {until_clause} ORDER BY started_at DESC",
                params,
            )
        else:
            rows = await db.execute_fetchall(
                f"{SELECT_COLS} HAVING total_ms IS NOT NULL ORDER BY started_at DESC LIMIT ?",
                (project_id, limit),
            )
        result = [dict(r) for r in rows]
        result.reverse()  # chronological order for chart
        return result


async def get_funnel(project_id: str, limit: int = 50) -> list[dict]:
    """Per-run funnel: listed → scraped → valid → notified."""
    async with get_db() as db:
        rows = await db.execute_fetchall(
            """
            SELECT
                run_id,
                MIN(timestamp) AS started_at,
                MAX(CASE WHEN message = 'Scraping complete'
                         THEN CAST(json_extract(details, '$.listed') AS INTEGER) END) AS listed,
                MAX(CASE WHEN message = 'Scraping complete'
                         THEN CAST(json_extract(details, '$.pre_filter_passed') AS INTEGER) END) AS pre_filter_passed,
                MAX(CASE WHEN message = 'Scraping complete'
                         THEN CAST(json_extract(details, '$.scraped') AS INTEGER) END) AS scraped,
                MAX(CASE WHEN message = 'Filtering complete'
                         THEN CAST(json_extract(details, '$.valid') AS INTEGER)
                         WHEN message = 'Filter chain applied'
                         THEN CAST(json_extract(details, '$.passed') AS INTEGER)
                         END) AS valid,
                MAX(CASE WHEN message = 'Run summary'
                         THEN CAST(json_extract(details, '$.notified') AS INTEGER) END) AS notified
            FROM logs
            WHERE project_id = ?
            GROUP BY run_id
            HAVING listed IS NOT NULL
            ORDER BY started_at DESC
            LIMIT ?
            """,
            (project_id, limit),
        )
        result = [dict(r) for r in rows]
        result.reverse()
        return result


async def get_health_series(
    project_id: str, since: str, until: str | None = None
) -> list[dict]:
    """Cumulative warning/error rate per run — same formula as get_overview().

    Cumulative is computed over ALL historical runs so the last returned point
    always equals the overview rate. The since/until params control which
    portion of the trajectory is displayed, not what goes into the calculation.
    """
    filter_extra = "AND started_at <= ?" if until else ""
    params: list[Any] = [project_id, since]
    if until:
        params.append(until)
    async with get_db() as db:
        rows = await db.execute_fetchall(
            f"""
            WITH per_run AS (
                SELECT
                    run_id,
                    MIN(timestamp) AS started_at,
                    MAX(CASE WHEN level = 'WARNING' THEN 1 ELSE 0 END) AS has_warning,
                    MAX(CASE WHEN level IN ('ERROR', 'CRITICAL') THEN 1 ELSE 0 END) AS has_error
                FROM logs
                WHERE project_id = ?
                GROUP BY run_id
            ),
            with_rates AS (
                SELECT
                    started_at,
                    ROUND(
                        SUM(has_warning) OVER (ORDER BY started_at
                            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
                        ) * 100.0 / ROW_NUMBER() OVER (ORDER BY started_at),
                        1
                    ) AS warn_rate_pct,
                    ROUND(
                        SUM(has_error) OVER (ORDER BY started_at
                            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
                        ) * 100.0 / ROW_NUMBER() OVER (ORDER BY started_at),
                        1
                    ) AS error_rate_pct
                FROM per_run
            )
            SELECT started_at, warn_rate_pct, error_rate_pct
            FROM with_rates
            WHERE started_at >= ? {filter_extra}
            ORDER BY started_at ASC
            """,
            params,
        )
        return [dict(r) for r in rows]


async def get_listings_windows(
    project_id: str,
    since: str,
    until: str | None = None,
    window_hours: int = 12,
) -> list[dict]:
    """Average gigs listed per run, bucketed into N-hour windows."""
    window_secs = window_hours * 3600
    where_extra = "AND timestamp <= ?" if until else ""
    params: list[Any] = [project_id, since]
    if until:
        params.append(until)
    params.extend([window_secs, window_secs])

    async with get_db() as db:
        rows = await db.execute_fetchall(
            f"""
            WITH per_run AS (
                SELECT
                    run_id,
                    MIN(timestamp) AS started_at,
                    MAX(CASE WHEN message = 'Scraping complete'
                             THEN CAST(json_extract(details, '$.listed') AS INTEGER) END) AS listed
                FROM logs
                WHERE project_id = ? AND timestamp >= ? {where_extra}
                GROUP BY run_id
                HAVING listed IS NOT NULL
            )
            SELECT
                datetime(
                    (CAST(strftime('%s', started_at) AS INTEGER) / ?) * ?,
                    'unixepoch'
                ) AS window_start,
                ROUND(AVG(listed), 1) AS avg_listed,
                COUNT(*) AS run_count
            FROM per_run
            GROUP BY window_start
            ORDER BY window_start ASC
            """,
            params,
        )
        return [dict(r) for r in rows]


async def get_filter_breakdown(project_id: str) -> list[dict]:
    """Aggregate average rejection counts per filter across all runs."""
    async with get_db() as db:
        total_runs_row = await db.execute_fetchall(
            "SELECT COUNT(DISTINCT run_id) AS cnt FROM logs WHERE project_id = ?",
            (project_id,),
        )
        total_runs = total_runs_row[0]["cnt"] if total_runs_row else 0

        rows = await db.execute_fetchall(
            """
            SELECT json_extract(details, '$.filter_breakdown') AS breakdown
            FROM logs
            WHERE project_id = ? AND message = 'Filter chain applied'
              AND json_extract(details, '$.filter_breakdown') IS NOT NULL
            """,
            (project_id,),
        )

    if not total_runs:
        return []

    totals: dict[str, int] = {}
    for row in rows:
        try:
            bd = json.loads(row["breakdown"])
            for filter_repr, count in bd.items():
                short = _shorten_filter_name(filter_repr)
                totals[short] = totals.get(short, 0) + (count or 0)
        except (json.JSONDecodeError, TypeError):
            pass

    return [
        {"filter": k, "rejections": round(v / total_runs, 1)}
        for k, v in sorted(totals.items(), key=lambda x: -x[1])
    ]


async def get_filter_breakdown_series(
    project_id: str, since: str, until: str | None = None
) -> dict:
    """Per-run filter rejection counts as a time series.

    Returns {"filters": ["FeeFilter", ...], "series": [{started_at, FeeFilter: 5, ...}, ...]}
    """
    until_clause = "AND timestamp <= ?" if until else ""
    params: list[Any] = [project_id, since]
    if until:
        params.append(until)
    params.append(since)  # for the HAVING precise filter
    if until:
        params.append(until)

    async with get_db() as db:
        rows = await db.execute_fetchall(
            f"""
            SELECT
                run_id,
                MIN(timestamp) AS started_at,
                MAX(CASE WHEN message = 'Filter chain applied'
                         THEN json_extract(details, '$.filter_breakdown') END) AS breakdown
            FROM logs
            WHERE project_id = ? AND timestamp >= ? {until_clause}
            GROUP BY run_id
            HAVING breakdown IS NOT NULL AND MIN(timestamp) >= ?
                {"AND MIN(timestamp) <= ?" if until else ""}
            ORDER BY started_at ASC
            """,
            params,
        )

    all_filters: set[str] = set()
    parsed_rows: list[tuple[str, dict[str, int]]] = []
    for row in rows:
        try:
            bd = json.loads(row["breakdown"])
            mapped: dict[str, int] = {}
            for filter_repr, count in bd.items():
                short = _shorten_filter_name(filter_repr)
                mapped[short] = (count or 0)
                all_filters.add(short)
            parsed_rows.append((row["started_at"], mapped))
        except (json.JSONDecodeError, TypeError):
            pass

    sorted_filters = sorted(all_filters)
    series = []
    for started_at, mapped in parsed_rows:
        point: dict[str, Any] = {"started_at": started_at}
        for f in sorted_filters:
            point[f] = mapped.get(f, 0)
        series.append(point)

    return {"filters": sorted_filters, "series": series}


def _shorten_filter_name(repr_str: str) -> str:
    """Turn filter repr strings into short display names.

    Most filters: 'FeeFilter(min_fee=100)' → 'FeeFilter'
    AvailabilityFilter: 'AvailabilityFilter(mode='block', periods=2)'
                      → 'AvailabilityFilter (block)'
    so the two modes appear as distinct lines in the chart.
    BookedDateFilter is remapped to 'AvailabilityFilter (block)' so
    historical data merges cleanly with the replacement filter.
    """
    import re as _re
    if repr_str.startswith("BookedDateFilter"):
        return "AvailabilityFilter (block)"
    if repr_str.startswith("AvailabilityFilter("):
        m = _re.search(r"mode='(\w+)'", repr_str)
        if m:
            return f"AvailabilityFilter ({m.group(1)})"
    idx = repr_str.find("(")
    return repr_str[:idx] if idx != -1 else repr_str
