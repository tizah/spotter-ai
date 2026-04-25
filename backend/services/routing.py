from __future__ import annotations

import logging

import requests
from django.core.cache import cache

from services.exceptions import RoutingError
from services.types import GeoPoint, RouteSegment

logger = logging.getLogger(__name__)

METERS_PER_MILE = 1609.344
SECONDS_PER_HOUR = 3600.0


class OSRMRouter:
    """Routes via the OSRM public demo server.

    OSRM URL format uses lon,lat (not lat,lon).
    Response distances are meters, durations are seconds.
    GeoJSON coordinates are [lon, lat] — swapped to (lat, lon) for Leaflet.
    """

    def __init__(
        self,
        base_url: str = "https://router.project-osrm.org",
        timeout_s: float = 15.0,
        cache_ttl_s: int = 60 * 60 * 24,
    ):
        self.base_url = base_url.rstrip("/")
        self.timeout_s = timeout_s
        self.cache_ttl_s = cache_ttl_s

    def route(self, origin: GeoPoint, destination: GeoPoint) -> RouteSegment:
        cache_key = self._cache_key(origin, destination)
        cached = cache.get(cache_key)
        if cached is not None:
            return cached

        # OSRM expects lon,lat
        url = (
            f"{self.base_url}/route/v1/driving/"
            f"{origin.lon},{origin.lat};{destination.lon},{destination.lat}"
            f"?overview=full&geometries=geojson"
        )
        try:
            resp = requests.get(
                url,
                timeout=self.timeout_s,
                headers={"User-Agent": "spotter-planner/1.0"},
            )
            resp.raise_for_status()
        except requests.RequestException as e:
            logger.exception("OSRM request failed")
            raise RoutingError(f"Routing service unavailable: {e}") from e

        data = resp.json()
        if data.get("code") != "Ok" or not data.get("routes"):
            raise RoutingError(
                f"No route returned: {data.get('message', data.get('code'))}"
            )

        r = data["routes"][0]
        # GeoJSON [lon, lat] → (lat, lon) for Leaflet
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
        return f"osrm:{a.lat:.4f},{a.lon:.4f}->{b.lat:.4f},{b.lon:.4f}"
