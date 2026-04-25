from __future__ import annotations

import json
import re
from pathlib import Path

import pytest
import responses
from django.core.cache import cache

from services.exceptions import RoutingError
from services.routing import OSRMRouter
from services.types import GeoPoint

FIXTURES = Path(__file__).parent / "fixtures"
CHICAGO = GeoPoint(lat=41.8781, lon=-87.6298, label="Chicago")
STL = GeoPoint(lat=38.627, lon=-90.1994, label="St. Louis")

# Matches any OSRM driving route URL
OSRM_URL_RE = re.compile(r"https://router\.project-osrm\.org/route/v1/driving/.+")


@pytest.fixture(autouse=True)
def _clear_cache():
    cache.clear()
    yield
    cache.clear()


@responses.activate
def test_osrm_returns_normalized_segment():
    """OSRM response is converted to RouteSegment with correct units."""
    fixture = json.loads((FIXTURES / "osrm_chicago_to_stl.json").read_text())
    responses.add(responses.GET, OSRM_URL_RE, json=fixture, status=200)

    router = OSRMRouter()
    seg = router.route(CHICAGO, STL)

    assert 260 < seg.distance_miles < 330
    assert 3.5 < seg.duration_hours < 6.0
    assert seg.start == CHICAGO
    assert seg.end == STL
    assert len(seg.polyline) > 10
    assert all(len(p) == 2 for p in seg.polyline)


@responses.activate
def test_osrm_caches_result():
    """Second call for the same route uses cache, not network."""
    fixture = json.loads((FIXTURES / "osrm_chicago_to_stl.json").read_text())
    responses.add(responses.GET, OSRM_URL_RE, json=fixture, status=200)

    router = OSRMRouter()
    seg1 = router.route(CHICAGO, STL)
    seg2 = router.route(CHICAGO, STL)

    assert seg1.distance_miles == seg2.distance_miles
    assert len(responses.calls) == 1


@responses.activate
def test_osrm_raises_routing_error_on_http_failure():
    """Network error raises RoutingError."""
    responses.add(responses.GET, OSRM_URL_RE, body=responses.ConnectionError("timeout"))

    router = OSRMRouter()
    with pytest.raises(RoutingError, match="unavailable"):
        router.route(CHICAGO, STL)


@responses.activate
def test_osrm_raises_routing_error_on_no_route():
    """OSRM returns code != 'Ok' → RoutingError."""
    responses.add(
        responses.GET,
        OSRM_URL_RE,
        json={"code": "NoRoute", "routes": [], "message": "No route found"},
        status=200,
    )
    router = OSRMRouter()
    with pytest.raises(RoutingError, match="No route"):
        router.route(CHICAGO, STL)


@responses.activate
def test_osrm_polyline_is_lat_lon_order():
    """Polyline coordinates are (lat, lon), not GeoJSON (lon, lat)."""
    fixture = json.loads((FIXTURES / "osrm_chicago_to_stl.json").read_text())
    responses.add(responses.GET, OSRM_URL_RE, json=fixture, status=200)

    router = OSRMRouter()
    seg = router.route(CHICAGO, STL)

    first = seg.polyline[0]
    assert 40.0 < first[0] < 43.0, f"First lat {first[0]} not near Chicago"
    assert -89.0 < first[1] < -86.0, f"First lon {first[1]} not near Chicago"
