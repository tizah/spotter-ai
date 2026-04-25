from __future__ import annotations

from django.conf import settings
from django.utils.module_loading import import_string

from services.geocoding import NominatimGeocoder
from services.routing import OSRMRouter


def get_router() -> OSRMRouter:
    cls = import_string(settings.ROUTER_CLASS)
    return cls(base_url=settings.OSRM_BASE_URL)


def get_geocoder() -> NominatimGeocoder:
    cls = import_string(settings.GEOCODER_CLASS)
    return cls(user_agent=settings.NOMINATIM_USER_AGENT)
