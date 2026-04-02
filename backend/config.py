"""Load and validate projects.yaml + .env settings."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

import yaml
from dotenv import load_dotenv

load_dotenv()

ROOT = Path(__file__).parent.parent


@dataclass
class ProjectConfig:
    id: str
    name: str
    sheets_id: str
    sheet_name: str
    credentials_file: Path


@dataclass
class Settings:
    projects: list[ProjectConfig]
    telegram_token: str
    telegram_chat_id: str
    sync_interval_minutes: int
    db_path: Path


def load_settings() -> Settings:
    config_path = ROOT / "projects.yaml"
    with config_path.open() as f:
        raw = yaml.safe_load(f)

    projects = []
    for p in raw.get("projects", []):
        projects.append(
            ProjectConfig(
                id=p["id"],
                name=p["name"],
                sheets_id=p["sheets_id"],
                sheet_name=p.get("sheet_name", "Logs"),
                credentials_file=Path(p["credentials_file"]).expanduser(),
            )
        )

    return Settings(
        projects=projects,
        telegram_token=os.getenv("TELEGRAM_TOKEN", ""),
        telegram_chat_id=os.getenv("TELEGRAM_CHAT_ID", ""),
        sync_interval_minutes=int(os.getenv("SYNC_INTERVAL_MINUTES", "5")),
        db_path=ROOT / os.getenv("DB_PATH", "observability.db"),
    )


settings = load_settings()

PROJECT_MAP: dict[str, ProjectConfig] = {p.id: p for p in settings.projects}
