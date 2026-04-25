---
name: dev
description: Start local development servers (backend Django on :8000 + frontend Vite on :5173).
disable-model-invocation: true
allowed-tools: Bash
---

# Start Local Dev Environment

Start the backend and frontend dev servers for the Spotter Trip Planner.

## Steps

1. Kill any existing servers on ports 8000 and 5173
2. Start the Django backend on port 8000 (background)
3. Start the Vite frontend on port 5173 (background)
4. Verify both are responding

## Commands

```bash
# Kill stale processes
lsof -ti:8000 | xargs kill -9 2>/dev/null || true
lsof -ti:5173 | xargs kill -9 2>/dev/null || true

# Backend
cd /Users/davidzagi/Projects/spotter-project/backend
source .venv/bin/activate && python manage.py runserver 8000

# Frontend (separate background shell)
cd /Users/davidzagi/Projects/spotter-project/frontend
npm run dev
```

Run the backend and frontend as **separate background tasks** using `run_in_background: true` so the user can keep working.

After starting both, wait a few seconds then verify:
- `curl -s http://localhost:8000/api/health` returns `{"status":"ok"}`
- `curl -s http://localhost:5173` returns HTML

Report the status of both servers to the user.
