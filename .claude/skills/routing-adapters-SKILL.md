---
name: routing-adapters
description: Use this skill whenever the user is integrating, modifying, testing, or debugging the routing and geocoding adapters in backend/services/routing.py and backend/services/geocoding.py. These adapters wrap external free APIs — OSRM (routing) and Nominatim (geocoding) — behind clean Protocol interfaces (Router, Geocoder) so the HOS engine stays decoupled from specific providers. Trigger whenever the user mentions OSRM, Nominatim, OpenRouteService, routing, geocoding, Places API, map API, route polyline, distance calculation, lat/lon, coordinate conversion, address lookup, or wants to swap or add a routing provider. Also trigger for caching, rate limiting, retry logic, or adapter fallback strategies. Correctly handling lon/lat ordering and unit conversions is the biggest source of silent bugs in this area — always check both.
---

# Routing & Geocoding Adapters

These adapters are thin clients over free external APIs. They normalize responses into the project's internal dataclasses (`RouteSegment`, `GeoPoint`) and hide provider quirks from the rest of the backend.

## Why adapters

The HOS engine shouldn't know whether routes come from OSRM, Google Directions, or a CSV. Wrapping each provider behind a Protocol interface means:

- Tests use `FakeRouter` / `FakeGeocoder` — zero network calls in the engine's test suite
- Swapping providers is a one-line change in settings
- Per-provider quirks (lon/lat order, units, error shapes) live in exactly one place
- Caching and rate limiting are adapter concerns, not engine concerns

## Provider choices

| Concern | Primary | Fallback | Why |
|---|---|---|---|
| Geocoding | Nominatim | (none) | Free, no key, 1 req/sec. Adequate for a demo. |
| Routing | OSRM public demo (`router.project-osrm.org`) | OpenRouteService (free tier, requires key) | OSRM is free and keyless but has no SLA; ORS gives us a backup path if we need it. |

**Do NOT use:** Google Maps (requires paid key + billing), Mapbox Directions (requires key + rate-limited free tier is stingy), HERE (key required).

## The Protocols

Define these in `services/routing.py` and `services/geocoding.py` (or a shared `services/protocols.py`):

```python
from typing import Protocol
from .types import GeoPoint, RouteSegment

class Router(Protocol):
    def route(self, origin: GeoPoint, destination: GeoPoint) -> RouteSegment:
        """Return a route between two points.

        Raises:
            RoutingError: upstream failure or no route available.
        """
        ...

class Geocoder(Protocol):
    def geocode(self, query: str) -> GeoPoint:
        """Forward-geocode a free-form address to a single best-match GeoPoint.

        Raises:
            GeocodingError: upstream failure or no result.
        """
        ...

    def search(self, query: str, limit: int = 5) -> list[GeoPoint]:
        """Return multiple candidates for autocomplete."""
        ...
```

Concrete exceptions (in `services/exceptions.py`):

```python
class ServiceError(Exception):
    """Base for all external service errors."""

class RoutingError(ServiceError):
    pass

class GeocodingError(ServiceError):
    pass
```

## OSRM adapter

OSRM public URL: `https://router.project-osrm.org/route/v1/driving/{lon1},{lat1};{lon2},{lat2}?overview=full&geometries=geojson`

**Critical gotchas:**

1. OSRM expects `lon,lat` (not `lat,lon`) in the URL path
2. Response `geometry.coordinates` is `[[lon, lat], ...]` in GeoJSON order — **swap** before storing
3. `distance` is in meters, `duration` in seconds — convert to miles and hours
4. `geometry` only exists when `overview=full&geometries=geojson` is set

```python
# services/routing.py
import logging
import requests
from django.core.cache import cache
from .types import GeoPoint, RouteSegment
from .exceptions import RoutingError

logger = logging.getLogger(__name__)

METERS_PER_MILE = 1609.344
SECONDS_PER_HOUR = 3600.0

class OSRMRouter:
    def __init__(self, base_url: str = "https://router.project-osrm.org",
                 timeout_s: float = 15.0, cache_ttl_s: int = 60 * 60 * 24):
        self.base_url = base_url.rstrip("/")
        self.timeout_s = timeout_s
        self.cache_ttl_s = cache_ttl_s

    def route(self, origin: GeoPoint, destination: GeoPoint) -> RouteSegment:
        cache_key = self._cache_key(origin, destination)
        cached = cache.get(cache_key)
        if cached is not None:
            return cached

        url = (f"{self.base_url}/route/v1/driving/"
               f"{origin.lon},{origin.lat};{destination.lon},{destination.lat}"
               f"?overview=full&geometries=geojson")
        try:
            resp = requests.get(url, timeout=self.timeout_s,
                                headers={"User-Agent": "spotter-planner/1.0"})
            resp.raise_for_status()
        except requests.RequestException as e:
            logger.exception("OSRM request failed")
            raise RoutingError(f"Routing service unavailable: {e}") from e

        data = resp.json()
        if data.get("code") != "Ok" or not data.get("routes"):
            raise RoutingError(f"No route returned: {data.get('message', data.get('code'))}")

        r = data["routes"][0]
        # GeoJSON is [lon, lat]; we store [lat, lon] for Leaflet compatibility
        polyline = [(c[1], c[0]) for c in r["geometry"]["coordinates"]]
        segment = RouteSegment(
            start=origin,
            end=destination,
            distance_miles=r["distance"] / METERS_PER_MILE,
            duration_hours=r["duration"] / SECONDS_PER_HOUR,
            polyline=polyline,
        )
        cache.set(cache_key, segment, self.cache_ttl_s)
        return segment

    def _cache_key(self, a: GeoPoint, b: GeoPoint) -> str:
        # Round to 4 decimals (~11m) so slight geocoding jitter still hits the cache
        return f"osrm:{a.lat:.4f},{a.lon:.4f}->{b.lat:.4f},{b.lon:.4f}"
```

## Nominatim adapter

Nominatim public URL: `https://nominatim.openstreetmap.org/search?q={query}&format=json&limit=5`

**Critical gotchas:**

1. Nominatim **requires** a `User-Agent` header that identifies your app
2. Rate limited to **1 req/sec** on the public server — enforce this client-side
3. Response `lat`/`lon` are strings — convert to float
4. Results aren't always ordered by relevance; trust the first one for `geocode()`, offer multiple for autocomplete

```python
# services/geocoding.py
import logging
import time
import requests
from django.core.cache import cache
from .types import GeoPoint
from .exceptions import GeocodingError

logger = logging.getLogger(__name__)

class NominatimGeocoder:
    _last_call_ts: float = 0.0  # class var for simple rate limiting
    MIN_INTERVAL_S = 1.0

    def __init__(self, base_url: str = "https://nominatim.openstreetmap.org",
                 user_agent: str = "spotter-planner/1.0 (contact: you@example.com)",
                 timeout_s: float = 15.0, cache_ttl_s: int = 60 * 60 * 24 * 7):
        self.base_url = base_url.rstrip("/")
        self.user_agent = user_agent
        self.timeout_s = timeout_s
        self.cache_ttl_s = cache_ttl_s

    def geocode(self, query: str) -> GeoPoint:
        results = self.search(query, limit=1)
        if not results:
            raise GeocodingError(f"No geocoding result for: {query!r}")
        return results[0]

    def search(self, query: str, limit: int = 5) -> list[GeoPoint]:
        query = query.strip()
        if not query:
            return []

        cache_key = f"nominatim:{query.lower()}:{limit}"
        cached = cache.get(cache_key)
        if cached is not None:
            return cached

        self._rate_limit()
        try:
            resp = requests.get(
                f"{self.base_url}/search",
                params={"q": query, "format": "json", "limit": limit, "addressdetails": 1},
                headers={"User-Agent": self.user_agent},
                timeout=self.timeout_s,
            )
            resp.raise_for_status()
        except requests.RequestException as e:
            logger.exception("Nominatim request failed")
            raise GeocodingError(f"Geocoding service unavailable: {e}") from e

        points = [
            GeoPoint(lat=float(r["lat"]), lon=float(r["lon"]),
                     label=r.get("display_name", query))
            for r in resp.json()
        ]
        cache.set(cache_key, points, self.cache_ttl_s)
        return points

    @classmethod
    def _rate_limit(cls) -> None:
        elapsed = time.time() - cls._last_call_ts
        if elapsed < cls.MIN_INTERVAL_S:
            time.sleep(cls.MIN_INTERVAL_S - elapsed)
        cls._last_call_ts = time.time()
```

The class-level `_last_call_ts` is a simple in-process throttle. Sufficient for a demo — in production, use a shared cache-backed limiter.

## Fakes for testing

```python
# tests/conftest.py
import pytest
from services.types import GeoPoint, RouteSegment

class FakeRouter:
    def __init__(self, segments: list[RouteSegment]):
        self._segments = list(segments)
    def route(self, origin, destination):
        return self._segments.pop(0)

class FakeGeocoder:
    def __init__(self, mapping: dict[str, GeoPoint]):
        self._mapping = mapping
    def geocode(self, query):
        if query not in self._mapping:
            raise GeocodingError(query)
        return self._mapping[query]
    def search(self, query, limit=5):
        return [v for k, v in self._mapping.items() if query.lower() in k.lower()][:limit]

@pytest.fixture
def fake_router():
    def _build(segments):
        return FakeRouter(segments)
    return _build
```

## DI wiring in Django settings

```python
# core/settings.py
ROUTER_CLASS = "services.routing.OSRMRouter"
GEOCODER_CLASS = "services.geocoding.NominatimGeocoder"
OSRM_BASE_URL = os.getenv("OSRM_BASE_URL", "https://router.project-osrm.org")
NOMINATIM_USER_AGENT = os.getenv("NOMINATIM_USER_AGENT", "spotter-planner/1.0")
```

```python
# services/factories.py
from django.conf import settings
from django.utils.module_loading import import_string

def get_router():
    cls = import_string(settings.ROUTER_CLASS)
    return cls(base_url=settings.OSRM_BASE_URL)

def get_geocoder():
    cls = import_string(settings.GEOCODER_CLASS)
    return cls(user_agent=settings.NOMINATIM_USER_AGENT)
```

Views call `get_router()` / `get_geocoder()` and pass the returned instance into the HOS engine.

## Recording fixtures for tests (no live calls)

Don't hit the network in tests. Record responses once and replay with `responses` or `vcrpy`:

```python
# tests/test_routing.py
import json
import responses
from pathlib import Path
from services.routing import OSRMRouter
from services.types import GeoPoint

FIXTURES = Path(__file__).parent / "fixtures"

@responses.activate
def test_osrm_returns_normalized_segment():
    responses.add(
        responses.GET,
        responses.matchers.url_matcher(lambda u: "router.project-osrm.org" in u),
        json=json.loads((FIXTURES / "osrm_chicago_to_stl.json").read_text()),
        status=200,
    )
    router = OSRMRouter()
    seg = router.route(
        GeoPoint(lat=41.8781, lon=-87.6298, label="Chicago"),
        GeoPoint(lat=38.6270, lon=-90.1994, label="St. Louis"),
    )
    assert 280 < seg.distance_miles < 310
    assert 4.0 < seg.duration_hours < 5.5
    assert all(len(p) == 2 for p in seg.polyline)
    assert seg.polyline[0] == (41.8781, -87.6298) or abs(seg.polyline[0][0] - 41.8781) < 0.1
```

To capture the fixture once:
```bash
curl "https://router.project-osrm.org/route/v1/driving/-87.6298,41.8781;-90.1994,38.6270?overview=full&geometries=geojson" \
  > backend/tests/fixtures/osrm_chicago_to_stl.json
```

## Caching strategy

| Concern | TTL | Backend |
|---|---|---|
| OSRM route results | 24h | Django cache (Redis in prod, LocMem locally) |
| Nominatim geocoding | 7d | Django cache |
| Nominatim autocomplete | 7d | Client-side react-query cache (`staleTime: 1000 * 60 * 60`) |

Addresses and routes for the same points rarely change. Aggressive caching is cheap correctness.

## Frontend autocomplete (Nominatim direct from browser)

Hitting Nominatim directly from the browser keeps geocoding off the backend's 1-req/sec budget:

```tsx
// frontend/src/api/geocoding.ts
export async function searchPlaces(q: string, signal?: AbortSignal): Promise<Place[]> {
  if (q.trim().length < 3) return [];
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", q);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "5");
  const resp = await fetch(url, {
    headers: { "Accept": "application/json" },
    signal,
  });
  if (!resp.ok) throw new Error("geocoding_failed");
  const data = await resp.json();
  return data.map((r: any) => ({
    label: r.display_name,
    lat: parseFloat(r.lat),
    lon: parseFloat(r.lon),
  }));
}
```

Debounce calls (300ms) and cancel in-flight requests via AbortController. The `LocationAutocomplete` component handles this via react-query with a dynamic query key.

## Common pitfalls

- **Lon/lat swap.** OSRM URLs: `lon,lat`. GeoJSON: `[lon, lat]`. Leaflet: `[lat, lon]`. Nominatim: `lat`, `lon` as separate fields. Normalize once at the adapter boundary; never again.
- **Units.** OSRM distance = meters, duration = seconds. Convert once in the adapter.
- **Empty polyline.** If `overview=full&geometries=geojson` isn't set, OSRM returns no geometry and the map has nothing to draw.
- **Nominatim missing User-Agent.** Will intermittently 403 without a clear error. Always send it.
- **Nominatim 1-req/sec limit.** Public server. If you spam it, you'll get blocked and the whole app stops working.
- **OSRM demo server downtime.** It's free, not SLA-backed. Fallback to ORS (or a mock) if you want resilience. Mention this tradeoff in the Loom.
- **Caching key collisions.** Round coordinates when cache-keying, or slight floating-point drift misses cache on identical requests.
- **Forgetting to `raise_for_status()`.** `requests` returns a 500 response as a truthy object; you need explicit error checking.
