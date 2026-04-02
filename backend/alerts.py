"""Telegram alert sender."""

from __future__ import annotations

import json
import logging

import httpx

from .config import settings
from .db import get_unsent_alerts, mark_alerts_sent

logger = logging.getLogger(__name__)

TELEGRAM_API = "https://api.telegram.org"


def _format_message(project_name: str, log: dict) -> str:
    level_emoji = {
        "WARNING": "⚠️",
        "ERROR": "🔴",
        "CRITICAL": "🚨",
    }.get(log["level"], "📋")

    details_str = ""
    try:
        details = json.loads(log["details"] or "{}")
        if details:
            # Show first 3 most relevant keys
            items = list(details.items())[:3]
            details_str = "\n" + "\n".join(f"  {k}: {v}" for k, v in items)
    except (json.JSONDecodeError, TypeError):
        pass

    return (
        f"{level_emoji} *[{project_name}] {log['level']}*\n"
        f"Run: `{log['run_id']}`\n"
        f"Module: `{log['module']}.{log['function']}`\n"
        f"Message: {log['message']}"
        f"{details_str}\n"
        f"Time: {log['timestamp']}"
    )


async def send_alert(text: str) -> bool:
    if not settings.telegram_token or not settings.telegram_chat_id:
        logger.debug("Telegram not configured — skipping alert")
        return False

    url = f"{TELEGRAM_API}/bot{settings.telegram_token}/sendMessage"
    payload = {
        "chat_id": settings.telegram_chat_id,
        "text": text,
        "parse_mode": "Markdown",
    }
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(url, json=payload)
            resp.raise_for_status()
            return True
    except Exception as exc:
        logger.error("Telegram send failed: %s", exc)
        return False


async def process_alerts(project_id: str, project_name: str) -> int:
    """Send Telegram alerts for unsent WARNING/ERROR/CRITICAL logs. Returns count sent."""
    pending = await get_unsent_alerts(project_id)
    if not pending:
        return 0

    sent_ids = []
    for log in pending:
        text = _format_message(project_name, log)
        ok = await send_alert(text)
        if ok:
            sent_ids.append(log["id"])
        else:
            # Stop on failure to avoid flooding retries
            break

    await mark_alerts_sent(sent_ids)
    return len(sent_ids)
