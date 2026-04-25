from __future__ import annotations

import pytest
from rest_framework.test import APIClient

from services.types import GeoPoint, RouteSegment


@pytest.fixture
def client() -> APIClient:
    return APIClient()


class _StubRouter:
    def route(self, a: GeoPoint, b: GeoPoint) -> RouteSegment:
        return RouteSegment(
            start=a,
            end=b,
            distance_miles=200,
            duration_hours=3.5,
            polyline=[(a.lat, a.lon), (b.lat, b.lon)],
        )


class _StubGeocoder:
    def geocode(self, q: str) -> GeoPoint:
        return GeoPoint(lat=41.0, lon=-87.0, label=q)

    def search(self, q: str, limit: int = 5) -> list[GeoPoint]:
        return [self.geocode(q)]


@pytest.fixture
def _stub_services(monkeypatch):
    from services import factories

    monkeypatch.setattr(factories, "get_router", lambda: _StubRouter())
    monkeypatch.setattr(factories, "get_geocoder", lambda: _StubGeocoder())


# ── Health ─────────────────────────────────────────────────────────────
@pytest.mark.django_db
def test_health_endpoint_returns_ok(client):
    resp = client.get("/api/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert body["service"] == "spotter-planner"


# ── POST /api/trips ────────────────────────────────────────────────────
@pytest.mark.django_db
def test_trip_create_with_lat_lon(client, _stub_services):
    """POST with lat/lon coordinates returns a full plan."""
    resp = client.post(
        "/api/trips",
        {
            "current_location": {"lat": 41.88, "lon": -87.63, "label": "Chicago"},
            "pickup_location": {"lat": 39.76, "lon": -86.16, "label": "Indianapolis"},
            "dropoff_location": {"lat": 32.78, "lon": -96.80, "label": "Dallas"},
            "cycle_hours_used": 10,
            "home_terminal_tz": "America/Chicago",
        },
        format="json",
    )
    assert resp.status_code == 201
    body = resp.json()
    assert "id" in body
    assert "events" in body
    assert "daily_logs" in body
    assert "summary" in body
    assert body["summary"]["cycle_hours_before"] == 10


@pytest.mark.django_db
def test_trip_create_with_label_geocoding(client, _stub_services):
    """POST with labels triggers geocoding and returns a plan."""
    resp = client.post(
        "/api/trips",
        {
            "current_location": {"label": "Chicago, IL"},
            "pickup_location": {"label": "Indianapolis, IN"},
            "dropoff_location": {"label": "Dallas, TX"},
            "cycle_hours_used": 5,
        },
        format="json",
    )
    assert resp.status_code == 201
    body = resp.json()
    assert "id" in body
    assert "summary" in body


@pytest.mark.django_db
def test_trip_create_validates_cycle_hours(client):
    """Negative cycle_hours_used returns 400."""
    resp = client.post(
        "/api/trips",
        {
            "current_location": {"lat": 41.0, "lon": -87.0},
            "pickup_location": {"lat": 41.0, "lon": -87.0},
            "dropoff_location": {"lat": 41.0, "lon": -87.0},
            "cycle_hours_used": -5,
        },
        format="json",
    )
    assert resp.status_code == 400


@pytest.mark.django_db
def test_trip_create_validates_missing_location(client):
    """Missing location fields returns 400."""
    resp = client.post(
        "/api/trips",
        {
            "current_location": {},
            "pickup_location": {"lat": 41.0, "lon": -87.0},
            "dropoff_location": {"lat": 41.0, "lon": -87.0},
            "cycle_hours_used": 10,
        },
        format="json",
    )
    assert resp.status_code == 400


@pytest.mark.django_db
def test_trip_create_validates_lat_without_lon(client):
    """Providing lat without lon returns 400."""
    resp = client.post(
        "/api/trips",
        {
            "current_location": {"lat": 41.0},
            "pickup_location": {"lat": 41.0, "lon": -87.0},
            "dropoff_location": {"lat": 41.0, "lon": -87.0},
            "cycle_hours_used": 10,
        },
        format="json",
    )
    assert resp.status_code == 400


# ── GET /api/trips/:id ─────────────────────────────────────────────────
@pytest.mark.django_db
def test_trip_retrieve_by_id(client, _stub_services):
    """GET a trip by UUID returns the saved plan."""
    create_resp = client.post(
        "/api/trips",
        {
            "current_location": {"lat": 41.88, "lon": -87.63},
            "pickup_location": {"lat": 39.76, "lon": -86.16},
            "dropoff_location": {"lat": 32.78, "lon": -96.80},
            "cycle_hours_used": 0,
        },
        format="json",
    )
    assert create_resp.status_code == 201
    trip_id = create_resp.json()["id"]

    get_resp = client.get(f"/api/trips/{trip_id}")
    assert get_resp.status_code == 200
    body = get_resp.json()
    assert body["id"] == trip_id
    assert "summary" in body


@pytest.mark.django_db
def test_trip_retrieve_not_found(client):
    """GET with non-existent UUID returns 404."""
    resp = client.get("/api/trips/00000000-0000-0000-0000-000000000000")
    assert resp.status_code == 404
    assert resp.json()["error"] == "not_found"
