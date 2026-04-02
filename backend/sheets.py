"""Google Sheets → SQLite incremental sync.

Supports automatic sheet rotation: when organist_bot fills a "Logs" tab and
creates "Logs 2", "Logs 3" etc., this module discovers all matching tabs and
syncs each one independently, tracking progress per (project_id, sheet_name).
"""

from __future__ import annotations

import logging
import re
from datetime import datetime, timezone
from pathlib import Path

from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

from .config import ProjectConfig
from .db import get_last_row, insert_logs, set_last_row

logger = logging.getLogger(__name__)

SCOPES = ["https://www.googleapis.com/auth/spreadsheets.readonly"]

# Fixed column order matching organist_bot's SheetsLogger._HEADERS
FIXED_COLS = ["timestamp", "run_id", "level", "logger", "message", "module", "function", "line"]


def _build_service(credentials_file: Path):
    creds = service_account.Credentials.from_service_account_file(
        str(credentials_file), scopes=SCOPES
    )
    return build("sheets", "v4", credentials=creds, cache_discovery=False)


def _discover_log_sheets(service, sheets_id: str, base_name: str) -> list[str]:
    """Return all sheet tabs matching 'base_name' or 'base_name N', sorted by number.

    For example, if base_name is "Logs" and the spreadsheet contains tabs
    "Logs", "Logs 2", and "Logs 3", this returns ["Logs", "Logs 2", "Logs 3"].
    """
    meta = (
        service.spreadsheets()
        .get(spreadsheetId=sheets_id, fields="sheets.properties.title")
        .execute()
    )
    titles = [s["properties"]["title"] for s in meta.get("sheets", [])]

    pattern = re.compile(rf"^{re.escape(base_name)}(?: (\d+))?$")
    found: list[tuple[int, str]] = []
    for title in titles:
        m = pattern.match(title)
        if m:
            n = int(m.group(1)) if m.group(1) else 1
            found.append((n, title))
    found.sort()
    return [title for _, title in found]


def _row_to_dict(project_id: str, source_sheet: str, sheets_row_num: int, row: list) -> dict:
    """Convert a raw Sheets row (list of values) to a log dict for SQLite."""
    def _get(index: int) -> str:
        if index < len(row):
            return str(row[index]).strip()
        return ""

    line_str = _get(7)
    try:
        line = int(line_str)
    except (ValueError, TypeError):
        line = 0

    details = _get(8) if len(row) > 8 else "{}"
    if not details or details == "None":
        details = "{}"

    return {
        "project_id": project_id,
        "source_sheet": source_sheet,
        "sheets_row": sheets_row_num,
        "timestamp": _get(0),
        "run_id": _get(1),
        "level": _get(2) or "INFO",
        "logger": _get(3),
        "message": _get(4),
        "module": _get(5),
        "function": _get(6),
        "line": line,
        "details": details,
    }


async def sync_project(project: ProjectConfig) -> int:
    """Pull new rows from all log sheet tabs into SQLite.

    Discovers every tab matching the project's sheet_name pattern (e.g. "Logs",
    "Logs 2", "Logs 3") and syncs each one independently.

    Returns total number of rows inserted.
    """
    try:
        service = _build_service(project.credentials_file)
        sheet_names = _discover_log_sheets(service, project.sheets_id, project.sheet_name)
    except Exception as exc:
        logger.error("Sheets discovery failed for %s: %s", project.id, exc)
        raise

    if not sheet_names:
        logger.warning("No log sheets found for %s (base name: %r)", project.id, project.sheet_name)
        return 0

    total = 0
    for sheet_name in sheet_names:
        total += await _sync_sheet(project, service, sheet_name)
    return total


async def _sync_sheet(project: ProjectConfig, service, sheet_name: str) -> int:
    """Sync a single sheet tab for a project. Returns number of rows inserted."""
    last_row = await get_last_row(project.id, sheet_name)
    # Sheets rows are 1-indexed; row 1 = header. Data starts at row 2.
    start_row = last_row + 1 if last_row >= 2 else 2

    try:
        range_name = f"{sheet_name}!A{start_row}:I"
        result = (
            service.spreadsheets()
            .values()
            .get(spreadsheetId=project.sheets_id, range=range_name)
            .execute()
        )
        values = result.get("values", [])
    except HttpError as exc:
        if exc.resp.status == 400 and "exceeds grid limits" in str(exc).lower():
            # start_row is past the sheet's allocated grid — the sheet is fully
            # consumed.  Treat as no new rows so the caller moves on to the
            # next sheet tab ("Logs 2", etc.) instead of aborting entirely.
            logger.debug(
                "Sheet %s/%s grid exhausted at row %d — no new rows",
                project.id, sheet_name, start_row,
            )
            return 0
        logger.error("Sheets fetch failed for %s/%s: %s", project.id, sheet_name, exc)
        raise
    except Exception as exc:
        logger.error("Sheets fetch failed for %s/%s: %s", project.id, sheet_name, exc)
        raise

    if not values:
        logger.debug("No new rows for %s/%s (last_row=%d)", project.id, sheet_name, last_row)
        return 0

    rows_to_insert = []
    for i, row in enumerate(values):
        sheets_row_num = start_row + i
        parsed = _row_to_dict(project.id, sheet_name, sheets_row_num, row)
        if parsed["timestamp"] and parsed["run_id"]:
            rows_to_insert.append(parsed)

    await insert_logs(project.id, rows_to_insert)

    new_last_row = start_row + len(values) - 1
    synced_at = datetime.now(timezone.utc).isoformat()
    await set_last_row(project.id, sheet_name, new_last_row, synced_at)

    logger.info(
        "Synced %d rows for %s/%s (rows %d–%d)",
        len(rows_to_insert),
        project.id,
        sheet_name,
        start_row,
        new_last_row,
    )
    return len(rows_to_insert)
