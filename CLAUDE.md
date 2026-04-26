# Spotter Trip Planner — Project Context

## What this app does (one paragraph)

A property-carrying truck driver inputs their current location, pickup, dropoff, and cycle hours already used in their current 8-day window. The app plans the trip under FMCSA Hours of Service rules (70-hour/8-day): it simulates the trip forward in time, inserts mandatory 30-minute breaks, 10-hour off-duty resets, and fuel stops, then renders (a) an interactive map with the full route and all stops, and (b) one or more FMCSA-compliant Driver's Daily Log sheets drawn as SVG, covering every calendar day the trip spans.

## Non-negotiable constraints from the brief

- Property-carrying driver, **70-hour / 8-day rule**, no adverse driving conditions
- Fuel at least once every **1,000 miles**
- **1 hour** on-duty-not-driving for pickup, **1 hour** for drop-off
- Must be live-hosted (Vercel for FE hint); must have GitHub repo; must have 3–5 min Loom
- Accuracy is tested against the hosted version — the HOS engine being wrong is an instant disqualifier

## Architecture

```
Frontend (React + MUI + Vite + TypeScript)          Backend (Django + DRF)
├── TripForm     — inputs + validation              ├── api/           — DRF views
├── MapView      — react-leaflet + OSM tiles        ├── services/
├── Timeline     — MUI Timeline of duty events      │   ├── geocoding.py   (Nominatim)
├── LogSheet     — SVG renderer per day             │   ├── routing.py     (OSRM adapter)
├── CycleBar     — 70-hour usage visual             │   ├── hos_engine.py  ★ CORE
└── SummaryCard  — totals + warnings                │   └── log_builder.py (events → daily logs)
                                                    └── models.py      — Trip, TripPlan (optional persist)

Deploy: Vercel (FE)                                 Deploy: Render free tier (BE) + Postgres
External: Nominatim (geocoding), OSRM (routing) — both free, no API key
```

**The HOS engine is the centerpiece.** It is pure Python, framework-agnostic, fully tested with pytest. The Django layer is a thin transport; the React layer is a thin presenter. Keep it that way.

## Tech stack (and why — since every choice will come up in the Loom)

| Concern | Choice | Rationale |
|---|---|---|
| Frontend framework | React 18 + Vite + TypeScript | JD requires React; Vite is fast; TS signals seniority |
| UI library | Material UI v5 | JD explicitly requires MUI — use theme tokens, not inline styles |
| Map | react-leaflet + OSM tiles | Free, no key, production-quality |
| Data fetching | TanStack Query (react-query) | Caching + loading/error states, less boilerplate |
| Forms | react-hook-form + zod | Clean validation, pairs with MUI `helperText`/`error` |
| Backend | Django 5 + DRF | Direct JD match |
| Routing API | OSRM public demo (primary) + OpenRouteService (fallback) | No key needed for OSRM; build behind a `Router` adapter |
| Geocoding | Nominatim | Free, 1 req/sec — respect this |
| DB | SQLite (local), Postgres (Render) | Django ORM makes this trivial to swap |
| Backend tests | pytest + pytest-django | The HOS engine must be 100% covered |
| Frontend tests | Vitest + React Testing Library | Components and the SVG log renderer |
| CI | GitHub Actions | Run tests on every PR — senior signal |

**Do NOT introduce:** Next.js (over-engineered for SPA), Redux (react-query handles state), Tailwind (fights MUI), Mapbox with a key (avoidable friction), auth system (out of scope).

## Repository layout

```
/
├── CLAUDE.md                       — this file
├── README.md                       — final public README (polish at the end)
├── .claude/
│   └── skills/                     — focused skills for specific tasks
│       ├── hos-engine/SKILL.md
│       ├── eld-log-renderer/SKILL.md
│       ├── routing-adapters/SKILL.md
│       ├── django-api/SKILL.md
│       └── react-mui-ui/SKILL.md
├── backend/
│   ├── manage.py
│   ├── requirements.txt
│   ├── core/                       — Django project
│   │   ├── settings.py
│   │   ├── urls.py
│   │   └── wsgi.py
│   ├── api/                        — DRF app
│   │   ├── views.py
│   │   ├── serializers.py
│   │   ├── urls.py
│   │   └── models.py
│   ├── services/                   — pure business logic, no Django imports
│   │   ├── __init__.py
│   │   ├── types.py                — dataclasses: GeoPoint, DutyEvent, TripInput, TripPlan, DailyLog
│   │   ├── hos_engine.py           — ★ the simulation engine
│   │   ├── log_builder.py          — splits events into daily logs
│   │   ├── routing.py              — Router adapter + OSRM impl
│   │   └── geocoding.py            — Geocoder adapter + Nominatim impl
│   └── tests/
│       ├── test_hos_engine.py      — ★ deep coverage of every HOS rule
│       ├── test_log_builder.py
│       ├── test_routing.py
│       └── test_api.py
└── frontend/
    ├── package.json
    ├── vite.config.ts
    ├── tsconfig.json
    ├── index.html
    └── src/
        ├── main.tsx
        ├── App.tsx
        ├── theme.ts                — MUI theme tokens (palette, spacing, typography)
        ├── api/
        │   ├── client.ts           — fetch wrapper + types
        │   └── trips.ts            — react-query hooks
        ├── types.ts                — mirror backend dataclasses as TS interfaces
        ├── pages/
        │   ├── TripFormPage.tsx
        │   └── TripResultPage.tsx
        ├── components/
        │   ├── TripForm.tsx
        │   ├── LocationAutocomplete.tsx
        │   ├── MapView.tsx
        │   ├── EventTimeline.tsx
        │   ├── SummaryCard.tsx
        │   ├── CycleBar.tsx
        │   └── LogSheet.tsx        — ★ the SVG renderer
        └── utils/
            ├── time.ts             — date math helpers
            └── download.ts         — PNG/PDF export helpers
```

## Coding conventions

### Python (backend)

- **Type hints everywhere.** Use `from __future__ import annotations`, Python 3.11+ syntax.
- **Dataclasses over dicts** for domain objects (`@dataclass(frozen=True)` where immutable).
- **Services are pure.** `services/` modules MUST NOT import from Django. They operate on dataclasses and return dataclasses. This is what makes the engine testable and portable.
- **Datetimes are always timezone-aware.** Use `datetime` with `tzinfo`. Never use naive datetimes.
- **Money/distance/time units are explicit in names.** `distance_miles`, `duration_hours`, never ambiguous `distance` or `duration`.
- **Errors are domain-specific exceptions**, not generic `Exception`. E.g., `GeocodingError`, `RoutingError`, `HOSViolation`.
- **No print statements.** Use Django's logging (`logger = logging.getLogger(__name__)`).

### TypeScript (frontend)

- **Strict mode on.** `"strict": true` in tsconfig. No `any` without a `// justification` comment.
- **Interfaces over types for object shapes**, types for unions.
- **Component files are named PascalCase** and default-export one component.
- **MUI theme tokens only.** No hex colors in components. Use `theme.palette.primary.main`, `theme.spacing(2)`, etc.
- **8-point spacing grid.** `theme.spacing(1)` = 8px, `theme.spacing(2)` = 16px, etc. All margins/paddings snap to this grid.
- **No inline styles** except for one-off dynamic values. Use `sx={{}}` prop.
- **react-query for every network call.** No raw `fetch` in components.

### Testing

- **Every HOS rule has a dedicated test.** See `.claude/skills/hos-engine/SKILL.md` for the required matrix.
- **Integration test for the `POST /api/trips` endpoint** with a realistic cross-country fixture.
- **Visual smoke test for `<LogSheet>`** using React Testing Library — assert the SVG contains the right `<line>` and `<text>` elements for a known input.
- **CI must pass before merging.** No exceptions.

## How to run (local)

```bash
# Backend
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver 8000

# Frontend (separate terminal)
cd frontend
npm install
npm run dev     # runs on 5173, proxies /api to :8000

# Tests
cd backend && pytest
cd frontend && npm test
```

## How to deploy

- **Frontend → Vercel.** Import GitHub repo, root `/frontend`, preset Vite, env `VITE_API_BASE_URL=<render-url>`.
- **Backend → Render.** Web service, root `/backend`, build `pip install -r requirements.txt && python manage.py collectstatic --noinput && python manage.py migrate`, start `gunicorn core.wsgi:application --bind 0.0.0.0:$PORT`, Postgres add-on, env `DJANGO_SECRET_KEY`, `DEBUG=False`, `ALLOWED_HOSTS`, `DATABASE_URL`, `CORS_ALLOWED_ORIGINS=<vercel-url>`.
- **Render cold starts.** Free tier sleeps after 15 min. Either: add a `/api/health` cron pinger (cron-job.org), or show a "warming up" toast on first request >3s.

## Domain knowledge: the HOS rules (summary)

The simulation must enforce these exactly. Full detail lives in `.claude/skills/hos-engine/SKILL.md`.

| Rule | Value | Trigger |
|---|---|---|
| 11-hour driving limit | 11 hrs within 14-hr window | Force 10-hr reset before breach |
| 14-hour driving window | 14 consecutive hrs from shift start | Force 10-hr reset before breach |
| 30-minute break | After 8 cumulative driving hrs | Insert 30-min non-driving event |
| 10-hour off-duty | Between shifts | Automatic on 11/14-hr breach |
| 70-hour / 8-day | Running total incl. `cycle_hours_used` input | Warn if trip would breach |
| Pickup / drop-off | 1 hr each, on-duty-not-driving | Fixed events at leg boundaries |
| Fueling | Every ≥ 1,000 miles | 30 min on-duty-not-driving per stop |

**The 30-minute break can be taken on-duty, off-duty, or in sleeper berth** (FMCSA § 395.3(a)(3)(ii)). A 30-min fuel stop therefore satisfies the break requirement — the engine must not insert a redundant break in that case.

## What makes this submission stand out (remember during every PR)

1. **Cycle hours progress bar** — 0–70 visual with existing usage + this trip's usage + remaining
2. **Segment-colored route** — pickup visible as a color break on the polyline
3. **Print stylesheet for log sheets** — `@media print` so drivers can print clean single-page logs
4. **Warning banner near 70-hour cap** — shows domain understanding
5. **OpenAPI docs at `/api/docs`** — free from `drf-spectacular`
6. **Snapshot tests** for canonical trips (e.g., Chicago → Dallas → LA with 40 cycle hours used)
7. **One-command local dev** — `docker compose up` or a `Makefile` target
8. **Deterministic engine** — same inputs always produce same plan; mention this in the Loom

## Explicit non-goals (document in README)

- User accounts / login
- Sleeper berth split logic (FMCSA § 395.1(g))
- Short-haul exceptions (§ 395.1(e)(1)/(2))
- 16-hour short-haul exception (§ 395.1(o))
- Adverse driving conditions exception
- Team driver passenger-seat time
- 34-hour restart mid-trip
- Real ELD device integration

These are clearly out of scope but worth documenting as "v2 ideas" — signals that you understand the full problem domain.

## Working with Claude Code in this repo

1. **Before coding any feature, consult the matching skill** in `.claude/skills/`. The skills encode project-specific conventions that this top-level doc doesn't repeat.
2. **The HOS engine is the hardest and most important piece.** Start there and TDD it. Don't touch the frontend until the engine is green.
3. **Never fake outputs.** If the engine isn't ready, the API should return a clear 503, not a stubbed response. Fake data is what the brief warns against.
4. **When in doubt about an HOS rule, re-read the FMCSA guide** — it's the source of truth. The rules file is deliberately verbose because ambiguity here costs the whole submission.
5. **The Loom video is part of the product.** Every feature should be demo-able in one smooth narration.

## Phased build plan (suggested)

Merge each phase as its own PR. Keep `main` green.

- **Phase 0** — Scaffolding (Django + React projects, CI, empty deploys to Render + Vercel end-to-end). Do this first.
- **Phase 1** — HOS engine (pure Python, TDD, no API yet). Most of the quality time goes here.
- **Phase 2** — Routing + geocoding adapters with caching and tests.
- **Phase 3** — DRF API (`POST /api/trips`, `GET /api/trips/:id`, OpenAPI docs).
- **Phase 4** — Frontend form + results shell (react-query, loading/error).
- **Phase 5** — Map + event timeline.
- **Phase 6** — SVG log sheet renderer (the second-hardest piece).
- **Phase 7** — Polish (cycle bar, warnings, print CSS, responsive, README).
- **Phase 8** — Loom + final submission.

Target: 6–7 focused days.
