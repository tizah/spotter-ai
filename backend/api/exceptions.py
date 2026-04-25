from __future__ import annotations

from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import exception_handler

from services.exceptions import GeocodingError, RoutingError, ServiceError


def service_aware_exception_handler(exc: Exception, context: dict) -> Response | None:
    if isinstance(exc, GeocodingError):
        return Response(
            {"error": "geocoding_failed", "detail": str(exc)},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if isinstance(exc, RoutingError):
        return Response(
            {"error": "routing_failed", "detail": str(exc)},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )
    if isinstance(exc, ServiceError):
        return Response(
            {"error": "service_error", "detail": str(exc)},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )
    return exception_handler(exc, context)
