from __future__ import annotations


class ServiceError(Exception):
    """Base for all external service errors."""


class RoutingError(ServiceError):
    pass


class GeocodingError(ServiceError):
    pass


class HOSViolation(ServiceError):
    pass
