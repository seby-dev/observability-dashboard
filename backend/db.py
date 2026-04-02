"""SQLite schema, connection management, and query helpers."""

from __future__ import annotations

import json
from contextlib import asynccontextmanager
from typing import Any

import aiosqlite

from .config import settings

DB_PATH = str(settings.db_path)

CREATE_LOGS = """
CREATE TABLE IF NOT EXISTS logs (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id   TEXT    NOT NULL,
    source_sheet TEXT    NOT NULL DEFAULT 'Logs',
    sheets_row   INTEGER NOT NULL,
    timestamp    TEXT    NOT NULL,
    run_id       TEXT    NOT NULL,
    level        TEXT    NOT NULL,
    logger       TEXT    NOT NULL DEFAULT '',
    message      TEXT    NOT NULL DEFAULT '',
    module       TEXT    NOT NULL DEFAULT '',
    function     TEXT    NOT NULL DEFAULT '',
    line         INTEGER NOT NULL DEFAULT 0,
    details      TEXT    NOT NULL DEFAULT '{}',
    alert_sent   INTEGER NOT NULL DEFAULT 0
);
"""

CREATE_LOGS_INDICES = """
CREATE INDEX IF NOT EXISTS idx_logs_project_run  ON logs (project_id, run_id);
CREATE INDEX IF NOT EXISTS idx_logs_project_ts   ON logs (project_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_logs_level        ON logs (project_id, level);
CREATE INDEX IF NOT EXISTS idx_logs_alert        ON logs (project_id, alert_sent, level);
CREATE UNIQUE INDEX IF NOT EXISTS idx_logs_dedup ON logs (project_id, run_id, timestamp, module, function, line);
"""

# sync_state tracks progress per (project, sheet) so each rotated sheet tab is
# synced independently.  The old schema had project_id as sole PK; _migrate()
# handles the upgrade for existing databases.
CREATE_SYNC_STATE = """
CREATE TABLE IF NOT EXISTS sync_state (
    project_id      TEXT NOT NULL,
    sheet_name      TEXT NOT NULL DEFAULT 'Logs',
    last_row        INTEGER NOT NULL DEFAULT 1,
    last_synced_at  TEXT,
    PRIMARY KEY (project_id, sheet_name)
);
"""


@asynccontextmanager
async def get_db():
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        yield db


async def init_db() -> None:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(CREATE_LOGS)
        await db.execute(CREATE_SYNC_STATE)
        await _migrate(db)  # adds columns before indices reference them
        await db.executescript(CREATE_LOGS_INDICES)
        await db.commit()


async def _migrate(db: aiosqlite.Connection) -> None:
    """Apply incremental schema migrations for existing databases."""
    # Migration 1: add source_sheet column to logs (missing in pre-rotation schema).
    pragma = await db.execute_fetchall("PRAGMA table_info(logs)")
    if "source_sheet" not in {row[1] for row in pragma}:
        await db.execute(
            "ALTER TABLE logs ADD COLUMN source_sheet TEXT NOT NULL DEFAULT 'Logs'"
        )

    # Migration 2: sync_state used project_id as sole PK; rebuild with composite
    # (project_id, sheet_name) PK, preserving existing rows under sheet_name='Logs'.
    pragma = await db.execute_fetchall("PRAGMA table_info(sync_state)")
    if "sheet_name" not in {row[1] for row in pragma}:
        await db.execute("""
            CREATE TABLE sync_state_new (
                project_id      TEXT NOT NULL,
                sheet_name      TEXT NOT NULL DEFAULT 'Logs',
                last_row        INTEGER NOT NULL DEFAULT 1,
                last_synced_at  TEXT,
                PRIMARY KEY (project_id, sheet_name)
            )
        """)
        await db.execute("""
            INSERT INTO sync_state_new (project_id, sheet_name, last_row, last_synced_at)
            SELECT project_id, 'Logs', last_row, last_synced_at FROM sync_state
        """)
        await db.execute("DROP TABLE sync_state")
        await db.execute("ALTER TABLE sync_state_new RENAME TO sync_state")

    # Migration 3: swap positional dedup index (project_id, source_sheet, sheets_row)
    # for content-based (project_id, run_id, timestamp, module, function, line).
    # The positional index breaks when a sheet is cleared and row numbers restart,
    # causing INSERT OR IGNORE to silently drop all new rows that collide with old ones.
    indices = await db.execute_fetchall("PRAGMA index_list(logs)")
    index_names = {row[1] for row in indices}
    if "idx_logs_dedup" in index_names:
        info = await db.execute_fetchall("PRAGMA index_info(idx_logs_dedup)")
        cols = [row[2] for row in info]
        if "sheets_row" in cols:
            await db.execute("DROP INDEX idx_logs_dedup")


async def get_last_row(project_id: str, sheet_name: str) -> int:
    async with get_db() as db:
        row = await db.execute_fetchall(
            "SELECT last_row FROM sync_state WHERE project_id = ? AND sheet_name = ?",
            (project_id, sheet_name),
        )
        return row[0]["last_row"] if row else 1


async def set_last_row(project_id: str, sheet_name: str, last_row: int, synced_at: str) -> None:
    async with get_db() as db:
        await db.execute(
            """
            INSERT INTO sync_state (project_id, sheet_name, last_row, last_synced_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(project_id, sheet_name) DO UPDATE SET
                last_row = excluded.last_row,
                last_synced_at = excluded.last_synced_at
            """,
            (project_id, sheet_name, last_row, synced_at),
        )
        await db.commit()


async def insert_logs(project_id: str, rows: list[dict[str, Any]]) -> None:
    if not rows:
        return
    async with get_db() as db:
        await db.executemany(
            """
            INSERT OR IGNORE INTO logs
                (project_id, source_sheet, sheets_row, timestamp, run_id, level, logger,
                 message, module, function, line, details)
            VALUES
                (:project_id, :source_sheet, :sheets_row, :timestamp, :run_id, :level, :logger,
                 :message, :module, :function, :line, :details)
            """,
            rows,
        )
        await db.commit()


# ---------------------------------------------------------------------------
# Run-level queries
# ---------------------------------------------------------------------------

_RUNS_CTE = """
WITH run_meta AS (
    SELECT
        project_id,
        run_id,
        MIN(timestamp)  AS started_at,
        MAX(timestamp)  AS ended_at,
        COUNT(*)        AS log_count,
        MAX(CASE WHEN level IN ('WARNING') THEN 1 ELSE 0 END)  AS has_warning,
        MAX(CASE WHEN level IN ('ERROR')   THEN 1 ELSE 0 END)  AS has_error,
        MAX(CASE WHEN level IN ('CRITICAL') THEN 1 ELSE 0 END) AS has_critical,
        -- Pull elapsed_ms from Run summary log
        MAX(CASE WHEN message = 'Run summary'
                 THEN CAST(json_extract(details, '$.elapsed_ms') AS INTEGER)
                 ELSE NULL END) AS total_elapsed_ms,
        MAX(CASE WHEN message = 'Scraping complete'
                 THEN CAST(json_extract(details, '$.elapsed_ms') AS INTEGER)
                 ELSE NULL END) AS scrape_elapsed_ms,
        MAX(CASE WHEN message = 'Filtering complete'
                 THEN CAST(json_extract(details, '$.elapsed_ms') AS INTEGER)
                 ELSE NULL END) AS filter_elapsed_ms,
        MAX(CASE WHEN message LIKE '%notification%' OR message LIKE 'Notifications%'
                 THEN CAST(json_extract(details, '$.elapsed_ms') AS INTEGER)
                 ELSE NULL END) AS notify_elapsed_ms,
        -- Funnel counts from summary logs
        MAX(CASE WHEN message = 'Scraping complete'
                 THEN CAST(json_extract(details, '$.listed') AS INTEGER)
                 ELSE NULL END) AS listed,
        MAX(CASE WHEN message = 'Scraping complete'
                 THEN CAST(json_extract(details, '$.pre_filter_passed') AS INTEGER)
                 ELSE NULL END) AS pre_filter_passed,
        MAX(CASE WHEN message = 'Scraping complete'
                 THEN CAST(json_extract(details, '$.scraped') AS INTEGER)
                 ELSE NULL END) AS scraped,
        MAX(CASE WHEN message IN ('Filtering complete', 'Filter chain applied')
                 THEN CAST(json_extract(details, '$.valid') AS INTEGER)
                 ELSE NULL END) AS valid,
        MAX(CASE WHEN message = 'Run summary'
                 THEN CAST(json_extract(details, '$.notified') AS INTEGER)
                 ELSE NULL END) AS notified,
        MAX(CASE WHEN message = 'Run summary'
                 THEN CAST(json_extract(details, '$.gig_errors') AS INTEGER)
                 ELSE NULL END) AS gig_errors,
        -- Filter breakdown JSON
        MAX(CASE WHEN message = 'Filter chain applied'
                 THEN json_extract(details, '$.filter_breakdown')
                 ELSE NULL END) AS filter_breakdown
    FROM logs
    WHERE project_id = :project_id
    GROUP BY project_id, run_id
)
"""


async def list_runs(project_id: str, limit: int = 50, offset: int = 0) -> list[dict]:
    async with get_db() as db:
        sql = f"""
        {_RUNS_CTE}
        SELECT * FROM run_meta
        ORDER BY started_at DESC
        LIMIT :limit OFFSET :offset
        """
        rows = await db.execute_fetchall(
            sql, {"project_id": project_id, "limit": limit, "offset": offset}
        )
        return [dict(r) for r in rows]


async def get_run(project_id: str, run_id: str) -> dict | None:
    async with get_db() as db:
        sql = f"""
        {_RUNS_CTE}
        SELECT * FROM run_meta WHERE run_id = :run_id
        """
        rows = await db.execute_fetchall(
            sql, {"project_id": project_id, "run_id": run_id}
        )
        return dict(rows[0]) if rows else None


async def get_run_logs(
    project_id: str,
    run_id: str,
    levels: list[str] | None = None,
) -> list[dict]:
    async with get_db() as db:
        if levels:
            placeholders = ",".join("?" * len(levels))
            sql = f"""
            SELECT * FROM logs
            WHERE project_id = ? AND run_id = ? AND level IN ({placeholders})
            ORDER BY timestamp ASC
            """
            rows = await db.execute_fetchall(
                sql, [project_id, run_id, *levels]
            )
        else:
            rows = await db.execute_fetchall(
                "SELECT * FROM logs WHERE project_id = ? AND run_id = ? ORDER BY timestamp ASC",
                (project_id, run_id),
            )
        return [dict(r) for r in rows]


# ---------------------------------------------------------------------------
# Unsent alert queries
# ---------------------------------------------------------------------------

async def get_unsent_alerts(project_id: str) -> list[dict]:
    async with get_db() as db:
        rows = await db.execute_fetchall(
            """
            SELECT id, run_id, level, module, function, message, details, timestamp
            FROM logs
            WHERE project_id = ? AND alert_sent = 0
              AND level IN ('WARNING', 'ERROR', 'CRITICAL')
            ORDER BY timestamp ASC
            """,
            (project_id,),
        )
        return [dict(r) for r in rows]


async def mark_alerts_sent(ids: list[int]) -> None:
    if not ids:
        return
    async with get_db() as db:
        placeholders = ",".join("?" * len(ids))
        await db.execute(
            f"UPDATE logs SET alert_sent = 1 WHERE id IN ({placeholders})", ids
        )
        await db.commit()
