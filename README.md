# Spotter Trip Planner

FMCSA-compliant trip planner for property-carrying truck drivers. Plans rest stops, fuel stops, and generates Driver's Daily Log sheets under 70-hour/8-day Hours of Service rules.

## Local Development

### Prerequisites

- Python 3.11+
- Node.js 20+
- npm

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver 8000
```

Verify: `curl http://localhost:8000/api/health` should return `{"status":"ok","service":"spotter-planner"}`

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Opens at http://localhost:5173. The Vite dev server proxies `/api` requests to `localhost:8000`.

### Running Tests

```bash
# Backend
cd backend
pytest -v

# Frontend
cd frontend
npm test
```

### Environment Variables

Copy `.env.example` to `.env` and adjust as needed. See the file for all available options.

## Architecture

- **Backend**: Django 5 + Django REST Framework — thin API layer over pure-Python services
- **Frontend**: React 18 + Vite + TypeScript + MUI v6
- **HOS Engine**: Pure Python simulation, no Django dependencies, fully tested
- **Routing**: OSRM (free, no API key)
- **Geocoding**: Nominatim (free, no API key)

## Explicit Non-Goals

- User accounts / authentication
- Sleeper berth split logic
- Short-haul exceptions
- Adverse driving conditions exception
- 34-hour restart mid-trip
- Real ELD device integration
