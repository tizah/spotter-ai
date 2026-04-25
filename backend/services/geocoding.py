from __future__ import annotations

import logging
import time

import requests
from django.core.cache import cache

from services.exceptions import GeocodingError
from services.types import GeoPoint

logger = logging.getLogger(__name__)

_US_STATES: dict[str, str] = {
    "Alabama": "AL", "Alaska": "AK", "Arizona": "AZ", "Arkansas": "AR",
    "California": "CA", "Colorado": "CO", "Connecticut": "CT", "Delaware": "DE",
    "Florida": "FL", "Georgia": "GA", "Hawaii": "HI", "Idaho": "ID",
    "Illinois": "IL", "Indiana": "IN", "Iowa": "IA", "Kansas": "KS",
    "Kentucky": "KY", "Louisiana": "LA", "Maine": "ME", "Maryland": "MD",
    "Massachusetts": "MA", "Michigan": "MI", "Minnesota": "MN", "Mississippi": "MS",
    "Missouri": "MO", "Montana": "MT", "Nebraska": "NE", "Nevada": "NV",
    "New Hampshire": "NH", "New Jersey": "NJ", "New Mexico": "NM", "New York": "NY",
    "North Carolina": "NC", "North Dakota": "ND", "Ohio": "OH", "Oklahoma": "OK",
    "Oregon": "OR", "Pennsylvania": "PA", "Rhode Island": "RI",
    "South Carolina": "SC", "South Dakota": "SD", "Tennessee": "TN", "Texas": "TX",
    "Utah": "UT", "Vermont": "VT", "Virginia": "VA", "Washington": "WA",
    "West Virginia": "WV", "Wisconsin": "WI", "Wyoming": "WY",
    "District of Columbia": "DC",
}


def to_short_label(label: str) -> str:
    """Shorten a Nominatim label like 'Indianapolis, Marion County, Indiana,
    United States' to 'Indianapolis, IN'."""
    parts = [p.strip() for p in label.split(",")]
    for i, part in enumerate(parts):
        abbr = _US_STATES.get(part)
        if abbr is not None and i > 0:
            return f"{parts[0]}, {abbr}"
    # Fallback: first two comma-separated parts
    return ", ".join(parts[:2]) if len(parts) >= 2 else label


class NominatimGeocoder:
    """Forward-geocodes via the Nominatim public server.

    Enforces a 1 req/sec rate limit client-side.
    Response lat/lon are strings — converted to float.
    """

    _last_call_ts: float = 0.0  # class-level simple rate limiter

    def __init__(
        self,
        base_url: str = "https://nominatim.openstreetmap.org",
        user_agent: str = "spotter-planner/1.0",
        timeout_s: float = 15.0,
        cache_ttl_s: int = 60 * 60 * 24 * 7,
    ):
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

        cache_key = f"nominatim:{query.lower().replace(' ', '_')}:{limit}"
        cached = cache.get(cache_key)
        if cached is not None:
            return cached

        self._rate_limit()

        try:
            resp = requests.get(
                f"{self.base_url}/search",
                params={
                    "q": query,
                    "format": "json",
                    "limit": limit,
                    "addressdetails": 1,
                },
                headers={"User-Agent": self.user_agent},
                timeout=self.timeout_s,
            )
            resp.raise_for_status()
        except requests.RequestException as e:
            logger.exception("Nominatim request failed")
            raise GeocodingError(f"Geocoding service unavailable: {e}") from e

        points = [
            GeoPoint(
                lat=float(r["lat"]),
                lon=float(r["lon"]),
                label=r.get("display_name", query),
            )
            for r in resp.json()
        ]
        cache.set(cache_key, points, self.cache_ttl_s)
        return points

    @classmethod
    def _rate_limit(cls) -> None:
        elapsed = time.time() - cls._last_call_ts
        if elapsed < 1.0:
            time.sleep(1.0 - elapsed)
        cls._last_call_ts = time.time()
