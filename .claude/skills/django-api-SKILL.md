---
name: django-api
description: Use this skill whenever the user is creating, modifying, testing, or debugging Django + DRF code in backend/api/ or backend/core/ — views, serializers, URLs, models, settings, middleware, CORS, OpenAPI schema, or any endpoint wiring. Trigger whenever the user mentions the API, DRF, Django REST Framework, endpoints, serializers, views, POST /api/trips, GET /api/trips, routes, URL patterns, OpenAPI, Swagger, drf-spectacular, CORS, rate limiting, authentication, Postgres settings, environment variables, or backend deployment concerns. Also trigger for Django admin, migrations, and management commands. The API is deliberately thin — it transports dataclasses from the pure services/ layer to the frontend. Keep it that way: no business logic in views.
---

# Django API Patterns (DRF)

The backend is a thin DRF layer over the pure-Python `services/` layer. Views do three things: (1) validate input, (2) call a service, (3) serialize the result. No HOS logic lives in views. No routing logic lives in views.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/trips` | Plan a trip. Accepts `TripInputPayload`, returns `TripPlanResponse`. |
| GET | `/api/trips/:id` | Retrieve a previously planned trip (for shareable URLs / re-viewing). |
| GET | `/api/health` | Liveness — reports OK + external dependency status. |
| GET | `/api/docs` | Swagger UI (drf-spectacular). |
| GET | `/api/schema` | OpenAPI schema JSON. |

No auth, no users. The brief doesn't ask for it.

## Project layout

```
backend/
├── core/                   — Django project (settings, root urls, wsgi)
│   ├── settings.py
│   ├── urls.py
│   └── wsgi.py
├── api/                    — DRF app
│   ├── __init__.py
│   ├── apps.py
│   ├── models.py           — Trip (persist plans for GET by id)
│   ├── serializers.py      — input validation + response shaping
│   ├── views.py            — thin handlers
│   ├── urls.py
│   ├── exceptions.py       — DRF exception handler mapping ServiceError → 503
│   └── migrations/
├── services/               — ★ pure-Python domain layer (no Django imports)
│   ├── types.py
│   ├── hos_engine.py
│   ├── log_builder.py
│   ├── routing.py
│   ├── geocoding.py
│   ├── factories.py        — returns configured Router / Geocoder
│   └── exceptions.py
├── tests/
└── requirements.txt
```

## requirements.txt (pinned)

```
Django==5.0.*
djangorestframework==3.15.*
drf-spectacular==0.27.*
django-cors-headers==4.4.*
psycopg[binary]==3.2.*
dj-database-url==2.2.*
gunicorn==23.0.*
requests==2.32.*
python-dotenv==1.0.*
pytest==8.3.*
pytest-django==4.9.*
responses==0.25.*
```

## settings.py (the important bits)

```python
from pathlib import Path
import os
import dj_database_url
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR.parent / ".env")

SECRET_KEY = os.getenv("DJANGO_SECRET_KEY", "dev-only-change-me")
DEBUG = os.getenv("DEBUG", "True") == "True"
ALLOWED_HOSTS = os.getenv("ALLOWED_HOSTS", "localhost,127.0.0.1").split(",")

INSTALLED_APPS = [
    "django.contrib.contenttypes", "django.contrib.auth",  # required by DRF
    "django.contrib.staticfiles",
    "rest_framework",
    "drf_spectacular",
    "corsheaders",
    "api",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
]

ROOT_URLCONF = "core.urls"
WSGI_APPLICATION = "core.wsgi.application"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

DATABASES = {
    "default": dj_database_url.config(
        default=f"sqlite:///{BASE_DIR / 'db.sqlite3'}",
        conn_max_age=600,
    ),
}

CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
        "LOCATION": "spotter",
    } if DEBUG else {
        "BACKEND": "django.core.cache.backends.db.DatabaseCache",
        "LOCATION": "cache_table",
    }
}

REST_FRAMEWORK = {
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.AllowAny"],
    "DEFAULT_THROTTLE_CLASSES": ["rest_framework.throttling.AnonRateThrottle"],
    "DEFAULT_THROTTLE_RATES": {"anon": "60/minute"},
    "EXCEPTION_HANDLER": "api.exceptions.service_aware_exception_handler",
}

SPECTACULAR_SETTINGS = {
    "TITLE": "Spotter Trip Planner API",
    "VERSION": "1.0.0",
    "DESCRIPTION": "Plans FMCSA-compliant trips for property-carrying drivers.",
    "SERVE_INCLUDE_SCHEMA": False,
}

CORS_ALLOWED_ORIGINS = [o for o in os.getenv("CORS_ALLOWED_ORIGINS", "http://localhost:5173").split(",") if o]

# Service factories
ROUTER_CLASS = os.getenv("ROUTER_CLASS", "services.routing.OSRMRouter")
GEOCODER_CLASS = os.getenv("GEOCODER_CLASS", "services.geocoding.NominatimGeocoder")
OSRM_BASE_URL = os.getenv("OSRM_BASE_URL", "https://router.project-osrm.org")
NOMINATIM_USER_AGENT = os.getenv("NOMINATIM_USER_AGENT", "spotter-planner/1.0")

# Logging — structured, one line per event
LOGGING = {
    "version": 1, "disable_existing_loggers": False,
    "formatters": {"simple": {"format": "[%(asctime)s] %(levelname)s %(name)s: %(message)s"}},
    "handlers": {"console": {"class": "logging.StreamHandler", "formatter": "simple"}},
    "loggers": {
        "services": {"handlers": ["console"], "level": "INFO", "propagate": False},
        "api": {"handlers": ["console"], "level": "INFO", "propagate": False},
    },
    "root": {"handlers": ["console"], "level": "INFO"},
}
```

## URL wiring

```python
# core/urls.py
from django.urls import path, include
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

urlpatterns = [
    path("api/", include("api.urls")),
    path("api/schema", SpectacularAPIView.as_view(), name="schema"),
    path("api/docs", SpectacularSwaggerView.as_view(url_name="schema"), name="docs"),
]
```

```python
# api/urls.py
from django.urls import path
from .views import TripCreateView, TripRetrieveView, HealthView

urlpatterns = [
    path("trips", TripCreateView.as_view(), name="trips-create"),
    path("trips/<uuid:id>", TripRetrieveView.as_view(), name="trips-retrieve"),
    path("health", HealthView.as_view(), name="health"),
]
```

## Model (minimal — just for persistence)

```python
# api/models.py
import uuid
from django.db import models

class Trip(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    input_payload = models.JSONField()   # TripInput as dict
    plan_payload = models.JSONField()    # full TripPlan as dict

    class Meta:
        ordering = ["-created_at"]
```

Persistence is optional for v1 (can plan without saving). Including it gives you shareable URLs, which is a nice polish touch.

## Serializers (input validation)

DRF serializers are used for **request validation only**. For responses, we convert dataclasses to dicts with `dataclasses.asdict()` and let DRF return JSON directly — no response serializer needed.

```python
# api/serializers.py
from rest_framework import serializers

class GeoPointInputSerializer(serializers.Serializer):
    lat = serializers.FloatField(min_value=-90, max_value=90, required=False)
    lon = serializers.FloatField(min_value=-180, max_value=180, required=False)
    label = serializers.CharField(required=False, allow_blank=True, max_length=500)

    def validate(self, attrs):
        # Accept either {lat,lon} (already geocoded) or {label} (needs geocoding)
        if "lat" not in attrs and "label" not in attrs:
            raise serializers.ValidationError("Must provide either lat/lon or label.")
        return attrs

class TripInputSerializer(serializers.Serializer):
    current_location = GeoPointInputSerializer()
    pickup_location = GeoPointInputSerializer()
    dropoff_location = GeoPointInputSerializer()
    cycle_hours_used = serializers.FloatField(min_value=0, max_value=70)
    start_datetime = serializers.DateTimeField(required=False)  # defaults to now() server-side
    home_terminal_tz = serializers.CharField(required=False, default="America/Chicago", max_length=64)
```

## Views (thin and uniform)

```python
# api/views.py
from __future__ import annotations
import logging
from dataclasses import asdict
from datetime import datetime
from zoneinfo import ZoneInfo

from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from services.factories import get_router, get_geocoder
from services.hos_engine import plan_trip
from services.types import GeoPoint, TripInput
from services.exceptions import ServiceError, GeocodingError, RoutingError
from .models import Trip
from .serializers import TripInputSerializer

logger = logging.getLogger(__name__)

class TripCreateView(APIView):
    @extend_schema(
        request=TripInputSerializer,
        responses={201: dict, 400: dict, 503: dict},
        description="Plan a trip under FMCSA Hours of Service rules.",
    )
    def post(self, request):
        serializer = TripInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        payload = serializer.validated_data

        # Geocode any locations passed as label-only
        geocoder = get_geocoder()
        try:
            current = self._resolve(payload["current_location"], geocoder)
            pickup = self._resolve(payload["pickup_location"], geocoder)
            dropoff = self._resolve(payload["dropoff_location"], geocoder)
        except GeocodingError as e:
            return Response({"error": "geocoding_failed", "detail": str(e)},
                            status=status.HTTP_400_BAD_REQUEST)

        tz = ZoneInfo(payload.get("home_terminal_tz", "America/Chicago"))
        start = payload.get("start_datetime") or datetime.now(tz=tz)
        if start.tzinfo is None:
            start = start.replace(tzinfo=tz)

        trip_input = TripInput(
            current_location=current, pickup_location=pickup, dropoff_location=dropoff,
            cycle_hours_used=payload["cycle_hours_used"],
            start_datetime=start,
        )
        try:
            plan = plan_trip(trip_input, router=get_router())
        except RoutingError as e:
            return Response({"error": "routing_failed", "detail": str(e)},
                            status=status.HTTP_503_SERVICE_UNAVAILABLE)

        plan_dict = _plan_to_json(plan)
        trip = Trip.objects.create(input_payload=_trip_input_to_json(trip_input),
                                   plan_payload=plan_dict)
        plan_dict["id"] = str(trip.id)
        return Response(plan_dict, status=status.HTTP_201_CREATED)

    @staticmethod
    def _resolve(point_data: dict, geocoder) -> GeoPoint:
        if "lat" in point_data and "lon" in point_data:
            return GeoPoint(lat=point_data["lat"], lon=point_data["lon"],
                            label=point_data.get("label", ""))
        return geocoder.geocode(point_data["label"])

class TripRetrieveView(APIView):
    def get(self, request, id):
        try:
            trip = Trip.objects.get(id=id)
        except Trip.DoesNotExist:
            return Response({"error": "not_found"}, status=status.HTTP_404_NOT_FOUND)
        return Response(trip.plan_payload)

class HealthView(APIView):
    @extend_schema(responses={200: dict})
    def get(self, request):
        return Response({"status": "ok", "service": "spotter-planner"})
```

## Serializing dataclasses to JSON

`dataclasses.asdict()` handles nested dataclasses but not `datetime`. Use a helper:

```python
# api/views.py (helpers)
import json
from dataclasses import asdict
from datetime import datetime, date

def _json_default(o):
    if isinstance(o, (datetime, date)):
        return o.isoformat()
    raise TypeError(f"Not serializable: {type(o).__name__}")

def _plan_to_json(plan):
    # Round-trip through json to hit the datetime encoder
    return json.loads(json.dumps(asdict(plan), default=_json_default))

def _trip_input_to_json(ti):
    return json.loads(json.dumps(asdict(ti), default=_json_default))
```

## Exception handler (maps service errors to HTTP)

```python
# api/exceptions.py
from rest_framework.views import exception_handler
from rest_framework.response import Response
from rest_framework import status
from services.exceptions import RoutingError, GeocodingError, ServiceError

def service_aware_exception_handler(exc, context):
    if isinstance(exc, GeocodingError):
        return Response({"error": "geocoding_failed", "detail": str(exc)},
                        status=status.HTTP_400_BAD_REQUEST)
    if isinstance(exc, RoutingError):
        return Response({"error": "routing_failed", "detail": str(exc)},
                        status=status.HTTP_503_SERVICE_UNAVAILABLE)
    if isinstance(exc, ServiceError):
        return Response({"error": "service_error", "detail": str(exc)},
                        status=status.HTTP_503_SERVICE_UNAVAILABLE)
    return exception_handler(exc, context)
```

## API integration test

```python
# tests/test_api.py
import pytest
from django.urls import reverse
from rest_framework.test import APIClient
from services.types import GeoPoint, RouteSegment

@pytest.fixture
def client():
    return APIClient()

@pytest.mark.django_db
def test_trip_create_returns_plan(client, monkeypatch):
    # Stub router and geocoder via factories
    from services import factories
    class StubRouter:
        def route(self, a, b):
            return RouteSegment(start=a, end=b, distance_miles=200, duration_hours=3.5,
                                polyline=[(a.lat, a.lon), (b.lat, b.lon)])
    class StubGeocoder:
        def geocode(self, q):
            return GeoPoint(lat=41.0, lon=-87.0, label=q)
    monkeypatch.setattr(factories, "get_router", lambda: StubRouter())
    monkeypatch.setattr(factories, "get_geocoder", lambda: StubGeocoder())

    resp = client.post("/api/trips", {
        "current_location": {"label": "Chicago, IL"},
        "pickup_location": {"label": "Indianapolis, IN"},
        "dropoff_location": {"label": "Columbus, OH"},
        "cycle_hours_used": 10,
        "home_terminal_tz": "America/Chicago",
    }, format="json")

    assert resp.status_code == 201
    body = resp.json()
    assert "id" in body
    assert "events" in body
    assert "daily_logs" in body
    assert "summary" in body
    assert body["summary"]["cycle_hours_before"] == 10

@pytest.mark.django_db
def test_trip_create_validates_cycle_hours(client):
    resp = client.post("/api/trips", {
        "current_location": {"lat": 41.0, "lon": -87.0, "label": "x"},
        "pickup_location": {"lat": 41.0, "lon": -87.0, "label": "x"},
        "dropoff_location": {"lat": 41.0, "lon": -87.0, "label": "x"},
        "cycle_hours_used": -5,  # invalid
    }, format="json")
    assert resp.status_code == 400
```

## CORS config (the common pitfall)

The frontend on Vercel must be explicitly whitelisted. In development:

```
CORS_ALLOWED_ORIGINS=http://localhost:5173
```

In production (Render env var):

```
CORS_ALLOWED_ORIGINS=https://spotter-planner.vercel.app,https://spotter-planner-git-main.vercel.app
```

Include Vercel preview URLs if you share them.

## Deployment notes (Render)

```bash
# Build Command
pip install -r requirements.txt && \
python manage.py migrate --noinput && \
python manage.py createcachetable && \
python manage.py collectstatic --noinput

# Start Command
gunicorn core.wsgi:application --bind 0.0.0.0:$PORT --workers 2 --timeout 30

# Env vars
DJANGO_SECRET_KEY=<generated>
DEBUG=False
ALLOWED_HOSTS=<render-url>,.onrender.com
DATABASE_URL=<auto-provided>
CORS_ALLOWED_ORIGINS=<vercel-url>
NOMINATIM_USER_AGENT=spotter-planner/1.0 (contact: david.zagi@example.com)
```

## Common pitfalls

- **Business logic leaking into views.** If a view has any HOS math, move it to `services/`. Views should be 20 lines, max.
- **Returning raw `RouteSegment` via DRF serializers.** DRF won't know how. Always convert with `dataclasses.asdict()` first, then let DRF pass through the dict.
- **Naive datetimes in the DB.** Postgres stores them as UTC but Python round-trips can drop tzinfo. Always `.replace(tzinfo=...)` on parse.
- **Rate limit too aggressive.** 60/min is a reasonable default; drop to 20/min on production if needed, but not less — genuine use can hit it.
- **CORS errors silently blank the frontend.** If the browser console shows a CORS error, fix `CORS_ALLOWED_ORIGINS` on the backend, not the frontend.
- **Forgetting to run `createcachetable`.** The DB cache backend won't work in production without this one-time command.
- **Serving Swagger UI behind auth.** The permission `AllowAny` above is deliberate; don't add auth layers that block the docs.
