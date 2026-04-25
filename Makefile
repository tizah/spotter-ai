.PHONY: setup dev test build lint clean

# ── Setup ───────────────────────────────────────────────────────────
setup:
	cd backend && python -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt && python manage.py migrate
	cd frontend && npm install

# ── Development ─────────────────────────────────────────────────────
dev:
	@trap 'kill 0' INT TERM; \
	(cd backend && . .venv/bin/activate && python manage.py runserver 8000) & \
	(cd frontend && npm run dev) & \
	wait

# ── Testing ─────────────────────────────────────────────────────────
test:
	cd backend && . .venv/bin/activate && pytest -v
	cd frontend && npm test

# ── Build ───────────────────────────────────────────────────────────
build:
	cd frontend && npm run build

# ── Lint ────────────────────────────────────────────────────────────
lint:
	cd frontend && npm run lint

# ── Clean ───────────────────────────────────────────────────────────
clean:
	rm -rf backend/.venv backend/db.sqlite3
	rm -rf frontend/node_modules frontend/dist
