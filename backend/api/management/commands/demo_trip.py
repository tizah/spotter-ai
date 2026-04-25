"""Quick CLI demo of the HOS engine. Run: python manage.py demo_trip"""
from __future__ import annotations

import json
from datetime import datetime
from zoneinfo import ZoneInfo

from django.core.management.base import BaseCommand

from services.hos_engine import plan_trip
from services.types import GeoPoint, RouteSegment, TripInput


class _DemoRouter:
    """Returns hardcoded segments for Chicago → Indianapolis → Dallas."""

    def route(self, origin: GeoPoint, destination: GeoPoint) -> RouteSegment:
        if "Chicago" in origin.label:
            return RouteSegment(
                start=origin, end=destination,
                distance_miles=185, duration_hours=3.0,
                polyline=[(origin.lat, origin.lon), (destination.lat, destination.lon)],
            )
        return RouteSegment(
            start=origin, end=destination,
            distance_miles=877, duration_hours=13.0,
            polyline=[(origin.lat, origin.lon), (destination.lat, destination.lon)],
        )


class Command(BaseCommand):
    help = "Run the HOS engine with a demo trip and print the plan as JSON"

    def handle(self, *args, **options):
        trip_input = TripInput(
            current_location=GeoPoint(41.88, -87.63, "Chicago"),
            pickup_location=GeoPoint(39.76, -86.16, "Indianapolis"),
            dropoff_location=GeoPoint(32.78, -96.80, "Dallas"),
            cycle_hours_used=10.0,
            start_datetime=datetime(2026, 4, 24, 6, 0, 0, tzinfo=ZoneInfo("America/Chicago")),
        )
        plan = plan_trip(trip_input, _DemoRouter())

        output = {
            "summary": {
                "total_distance_miles": plan.summary.total_distance_miles,
                "total_duration_hours": round(plan.summary.total_duration_hours, 2),
                "total_driving_hours": round(plan.summary.total_driving_hours, 2),
                "total_on_duty_hours": round(plan.summary.total_on_duty_hours, 2),
                "cycle_hours_before": plan.summary.cycle_hours_before,
                "cycle_hours_after": round(plan.summary.cycle_hours_after, 2),
                "cycle_hours_remaining": round(plan.summary.cycle_hours_remaining, 2),
                "shifts_count": plan.summary.shifts_count,
                "warnings": plan.summary.warnings,
            },
            "events": [
                {
                    "start": e.start.isoformat(),
                    "end": e.end.isoformat(),
                    "status": e.status,
                    "note": e.note,
                    "duration_hours": round(e.duration_hours, 2),
                    "miles": round(e.miles, 1),
                }
                for e in plan.events
            ],
            "daily_logs": [
                {"date": log.date, "totals": {k: round(v, 2) for k, v in log.totals.items()}}
                for log in plan.daily_logs
            ],
        }
        self.stdout.write(json.dumps(output, indent=2))
