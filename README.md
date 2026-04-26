# Spotter Trip Planner

FMCSA-compliant trip planner for property-carrying truck drivers. Plans rest stops, fuel stops, and generates Driver's Daily Log sheets under **70-hour/8-day** Hours of Service rules.

## Quick Start

```bash
make setup   # create venv, install deps, run migrations
make dev     # start backend (:8000) + frontend (:5173) — Ctrl-C stops both
```

Or run each service manually:

```bash
# Backend
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python3 manage.py migrate
python3 manage.py runserver 8000

# Frontend (separate terminal)
cd frontend
npm install
npm run dev
```

Frontend opens at http://localhost:5173 with API calls proxied to `localhost:8000`.

### Prerequisites

- Python 3.11+
- Node.js 20+

### Running Tests

```bash
make test          # runs both suites
# or individually:
cd backend && pytest -v
cd frontend && npm test
```

## Architecture

```
┌─────────────────────────────────┐       ┌──────────────────────────────────┐
│  Frontend (React + MUI + Vite)  │       │  Backend (Django + DRF)          │
│                                 │       │                                  │
│  TripForm ─→ POST /api/trips ──┼──────→│  api/views.py                    │
│  MapView  ← route polylines    │       │       │                          │
│  Timeline ← duty events        │       │       ▼                          │
│  LogSheet ← daily logs (SVG)   │       │  services/                       │
│  CycleBar ← cycle summary      │       │  ├── geocoding.py  (Nominatim)  │
│  Warning  ← 70-hr warnings     │       │  ├── routing.py    (OSRM)       │
│                                 │       │  ├── hos_engine.py  ★ core      │
│  Download: PDF / PNG export     │       │  └── log_builder.py             │
└─────────────────────────────────┘       └──────────────────────────────────┘
```

**Key design choice:** The HOS engine (`services/hos_engine.py`) is pure Python with no Django imports. It operates on dataclasses, is fully deterministic (same inputs → same plan), and is testable without any framework.

## Key Features

- **HOS simulation** — 11-hour driving, 14-hour window, 30-min break, 10-hour reset, 70-hour/8-day cycle tracking
- **Interactive map** — Leaflet with segment-colored route polylines and annotated stop markers
- **SVG Driver's Daily Logs** — FMCSA-style duty status graph for every calendar day the trip spans
- **Print-ready logs** — `@media print` stylesheet paginates each log to its own landscape page
- **PDF / PNG download** — export all logs as a multi-page PDF or save individual days as PNG
- **Cycle hours bar** — visual 0–70 progress bar showing existing + trip usage + remaining
- **70-hour warning banner** — prominent alert when the cycle is running low
- **Fuel stops** — automatic every 1,000 miles with 30-min on-duty time
- **Free APIs** — OSRM (routing) and Nominatim (geocoding), no API keys required

## Deployment

### Frontend → Vercel

- Import GitHub repo, set root directory to `frontend`, framework preset **Vite**
- Environment variable: `VITE_API_BASE_URL=https://<your-render-app>.onrender.com`

### Backend → Render

- Web service, root directory `backend`
- Build: `pip install -r requirements.txt && python manage.py collectstatic --noinput && python manage.py migrate`
- Start: `gunicorn core.wsgi:application --bind 0.0.0.0:$PORT`
- Add Postgres add-on
- Environment variables: `DJANGO_SECRET_KEY`, `DEBUG=False`, `ALLOWED_HOSTS`, `DATABASE_URL`, `CORS_ALLOWED_ORIGINS=https://<your-vercel-app>.vercel.app`

> **Note:** Render free tier sleeps after 15 min of inactivity. The frontend shows a "warming up" indicator if the first request is slow.

## Explicit Non-Goals

These are intentionally out of scope but documented to show awareness of the full HOS domain:

- User accounts / authentication
- Sleeper berth split logic (FMCSA § 395.1(g))
- Short-haul exceptions (§ 395.1(e)(1)/(2))
- 16-hour short-haul exception (§ 395.1(o))
- Adverse driving conditions exception
- Team driver passenger-seat time
- 34-hour restart mid-trip
- Real ELD device integration

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite, TypeScript, MUI v6 |
| Data fetching | TanStack Query |
| Forms | react-hook-form + zod |
| Map | react-leaflet + OpenStreetMap |
| Backend | Django 5 + Django REST Framework |
| Routing API | OSRM (free, no key) |
| Geocoding | Nominatim (free, no key) |
| CI | GitHub Actions |
