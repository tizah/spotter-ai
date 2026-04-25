from __future__ import annotations

import json
import re
from pathlib import Path

import pytest
import responses
from django.core.cache import cache

from services.exceptions import GeocodingError
from services.geocoding import NominatimGeocoder

FIXTURES = Path(__file__).parent / "fixtures"
NOMINATIM_URL_RE = re.compile(r"https://nominatim\.openstreetmap\.org/search.*")


@pytest.fixture(autouse=True)
def _clear_cache():
    cache.clear()
    yield
    cache.clear()


@responses.activate
def test_nominatim_geocode_returns_geopoint():
    """Geocode 'Chicago' returns a GeoPoint near Chicago."""
    fixture = json.loads((FIXTURES / "nominatim_chicago.json").read_text())
    responses.add(responses.GET, NOMINATIM_URL_RE, json=fixture, status=200)

    geocoder = NominatimGeocoder()
    pt = geocoder.geocode("Chicago")

    assert 41.0 < pt.lat < 42.5
    assert -88.5 < pt.lon < -87.0
    assert "Chicago" in pt.label


@responses.activate
def test_nominatim_search_returns_multiple():
    """Search returns multiple GeoPoints."""
    fixture = json.loads((FIXTURES / "nominatim_chicago.json").read_text())
    responses.add(responses.GET, NOMINATIM_URL_RE, json=fixture, status=200)

    geocoder = NominatimGeocoder()
    results = geocoder.search("Chicago", limit=3)

    assert len(results) >= 1
    assert all(hasattr(r, "lat") for r in results)


@responses.activate
def test_nominatim_caches_result():
    """Second geocode call uses cache."""
    fixture = json.loads((FIXTURES / "nominatim_chicago.json").read_text())
    responses.add(responses.GET, NOMINATIM_URL_RE, json=fixture, status=200)

    geocoder = NominatimGeocoder()
    geocoder.geocode("caching_test_query")
    geocoder.geocode("caching_test_query")

    assert len(responses.calls) == 1


@responses.activate
def test_nominatim_raises_on_empty_result():
    """Empty result set raises GeocodingError."""
    responses.add(responses.GET, NOMINATIM_URL_RE, json=[], status=200)

    geocoder = NominatimGeocoder()
    with pytest.raises(GeocodingError, match="No geocoding result"):
        geocoder.geocode("xyznonexistent12345")


@responses.activate
def test_nominatim_raises_on_http_error():
    """Network failure raises GeocodingError."""
    responses.add(
        responses.GET, NOMINATIM_URL_RE, body=responses.ConnectionError("timeout")
    )

    geocoder = NominatimGeocoder()
    with pytest.raises(GeocodingError, match="unavailable"):
        geocoder.geocode("Chicago_error_test")


def test_nominatim_empty_query_returns_empty():
    """Empty string returns empty list without making a request."""
    geocoder = NominatimGeocoder()
    assert geocoder.search("") == []
    assert geocoder.search("   ") == []
