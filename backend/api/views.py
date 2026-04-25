from __future__ import annotations

import json
import logging
from dataclasses import asdict
from datetime import date, datetime
from zoneinfo import ZoneInfo

from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from services.exceptions import GeocodingError, RoutingError
from services.factories import get_geocoder, get_router
from services.hos_engine import plan_trip
from services.types import GeoPoint, TripInput

from .models import Trip
from .serializers import TripInputSerializer

logger = logging.getLogger(__name__)


# ── JSON helpers ───────────────────────────────────────────────────────
def _json_default(o: object) -> str:
    if isinstance(o, (datetime, date)):
        return o.isoformat()
    raise TypeError(f"Not serializable: {type(o).__name__}")


def _to_json_dict(obj: object) -> dict:
    return json.loads(json.dumps(asdict(obj), default=_json_default))


# ── Views ──────────────────────────────────────────────────────────────
class TripCreateView(APIView):
    @extend_schema(
        request=TripInputSerializer,
        responses={201: dict, 400: dict, 503: dict},
        description="Plan a trip under FMCSA Hours of Service rules.",
    )
    def post(self, request: object) -> Response:
        serializer = TripInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        payload = serializer.validated_data

        geocoder = get_geocoder()
        try:
            current = _resolve_point(payload["current_location"], geocoder)
            pickup = _resolve_point(payload["pickup_location"], geocoder)
            dropoff = _resolve_point(payload["dropoff_location"], geocoder)
        except GeocodingError as e:
            return Response(
                {"error": "geocoding_failed", "detail": str(e)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        tz = ZoneInfo(payload.get("home_terminal_tz", "America/Chicago"))
        start = payload.get("start_datetime") or datetime.now(tz=tz)
        if start.tzinfo is None:
            start = start.replace(tzinfo=tz)

        trip_input = TripInput(
            current_location=current,
            pickup_location=pickup,
            dropoff_location=dropoff,
            cycle_hours_used=payload["cycle_hours_used"],
            start_datetime=start,
        )

        try:
            plan = plan_trip(trip_input, router=get_router())
        except RoutingError as e:
            return Response(
                {"error": "routing_failed", "detail": str(e)},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        plan_dict = _to_json_dict(plan)
        trip = Trip.objects.create(
            input_payload=_to_json_dict(trip_input),
            plan_payload=plan_dict,
        )
        plan_dict["id"] = str(trip.id)
        return Response(plan_dict, status=status.HTTP_201_CREATED)


class TripRetrieveView(APIView):
    @extend_schema(responses={200: dict, 404: dict})
    def get(self, request: object, id: str) -> Response:
        try:
            trip = Trip.objects.get(id=id)
        except Trip.DoesNotExist:
            return Response(
                {"error": "not_found"}, status=status.HTTP_404_NOT_FOUND
            )
        data = trip.plan_payload
        data["id"] = str(trip.id)
        return Response(data)


class HealthView(APIView):
    @extend_schema(responses={200: dict})
    def get(self, request: object) -> Response:
        return Response({"status": "ok", "service": "spotter-planner"})


# ── Helpers ────────────────────────────────────────────────────────────
def _resolve_point(point_data: dict, geocoder: object) -> GeoPoint:
    if "lat" in point_data and "lon" in point_data:
        return GeoPoint(
            lat=point_data["lat"],
            lon=point_data["lon"],
            label=point_data.get("label", ""),
        )
    return geocoder.geocode(point_data["label"])
