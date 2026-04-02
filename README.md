# Organist Hub — Observability Dashboard

A real-time monitoring dashboard for [organist_bot](https://github.com/seby-dev/organist_bot). Syncs structured run logs from Google Sheets into a local SQLite cache and exposes them through a FastAPI backend and React frontend.

---

## Features

- **Live run feed** — every bot poll appears within 5 minutes of completion
- **Run detail view** — per-run timing, pipeline funnel counts, filter rejection breakdown, and full log stream
- **Filter rejection chart** — time-series breakdown of rejections per filter (Fee, SundayTime, Availability, Calendar, etc.)
- **Health & performance metrics** — warning/error rates, avg run time, avg listings, HTTP fetch latency
- **Funnel chart** — listed → scraped → passed filters → notified over time
- **Multi-sheet sync** — handles organist_bot's automatic Google Sheets tab rotation (`Logs`, `Logs 2`, `Logs 3`, …)
- **Manual sync** — "Sync now" button for immediate refresh outside the 5-minute schedule
- **Telegram alert forwarding** — unsent WARNING/ERROR/CRITICAL log entries are forwarded via Telegram

---

## Stack

| Layer | Tech |
|---|---|
| Backend | FastAPI + APScheduler + aiosqlite |
| Frontend | React 19 + TypeScript + Vite + Recharts |
| Data store | SQLite (incremental cache of Google Sheets logs) |
| Data source | Google Sheets (written by organist_bot) |

---

## Project Structure

```
observability-dashboard/
├── backend/
│   ├── main.py        # FastAPI app + lifespan
│   ├── config.py      # Pydantic settings (reads projects.yaml)
│   ├── db.py          # SQLite schema, migrations, query helpers
│   ├── sheets.py      # Google Sheets → SQLite incremental sync
│   ├── metrics.py     # Aggregate metric computation
│   ├── alerts.py      # Telegram alert forwarding
│   └── scheduler.py   # APScheduler 5-minute sync job
├── frontend/
│   └── src/
│       ├── pages/
│       │   ├── Dashboard.tsx   # Overview, charts, runs table
│       │   └── RunDetail.tsx   # Per-run deep-dive
│       ├── components/         # FilterBreakdown, FunnelChart, HealthChart, …
│       └── api/client.ts       # Typed API client
├── projects.yaml      # Project configuration
└── pyproject.toml     # Python dependencies
```

---

## Setup

### Prerequisites

- Python 3.13+
- Node.js 20+
- A Google Cloud service account with **Sheets read-only** access to the organist_bot log spreadsheet

### Backend

```bash
cd observability-dashboard
python -m venv .venv
source .venv/bin/activate
pip install -e .

# copy and fill in the example config
cp .env.example .env
```

Edit `projects.yaml` to point at your spreadsheet:

```yaml
projects:
  - id: organist_bot
    name: OrganistBot
    sheets_id: YOUR_SPREADSHEET_ID
    credentials_file: /path/to/credentials.json
    sheet_name: Logs
```

Start the backend:

```bash
uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173` (or whichever port Vite picks).

---

## How sync works

1. On startup and every 5 minutes, the scheduler calls `sync_project()` for each configured project
2. `sheets.py` discovers all log sheet tabs (`Logs`, `Logs 2`, …) via the Sheets metadata API
3. Each tab is synced independently — only rows after `last_row` in `sync_state` are fetched
4. New rows are inserted into SQLite with `INSERT OR IGNORE` against a content-based unique index `(project_id, run_id, timestamp, module, function, line)` — safe against sheet resets and re-syncs
5. The frontend polls the FastAPI backend for metrics and run data

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/projects` | List configured projects |
| `GET` | `/api/projects/{id}/runs` | Paginated run list |
| `GET` | `/api/projects/{id}/runs/{run_id}` | Single run summary |
| `GET` | `/api/projects/{id}/runs/{run_id}/logs` | Full log stream for a run |
| `GET` | `/api/projects/{id}/metrics/overview` | Aggregate overview stats |
| `GET` | `/api/projects/{id}/metrics/filters_series` | Filter rejection time series |
| `GET` | `/api/projects/{id}/metrics/funnel_series` | Pipeline funnel time series |
| `GET` | `/api/projects/{id}/metrics/health_series` | Health rate time series |
| `GET` | `/api/projects/{id}/metrics/speed_series` | Run speed time series |
| `POST` | `/api/sync/{id}` | Trigger immediate sync |
