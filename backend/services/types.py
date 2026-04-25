from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Literal

DutyStatus = Literal["off_duty", "sleeper_berth", "driving", "on_duty_not_driving"]


@dataclass(frozen=True)
class GeoPoint:
    lat: float
    lon: float
    label: str = ""


@dataclass(frozen=True)
class RouteSegment:
    start: GeoPoint
    end: GeoPoint
    distance_miles: float
    duration_hours: float
    polyline: list[tuple[float, float]]  # [(lat, lon), ...]


@dataclass(frozen=True)
class DutyEvent:
    start: datetime
    end: datetime
    status: DutyStatus
    note: str
    location: GeoPoint | None = None
    miles: float = 0.0

    @property
    def duration_hours(self) -> float:
        return (self.end - self.start).total_seconds() / 3600.0


@dataclass(frozen=True)
class TripInput:
    current_location: GeoPoint
    pickup_location: GeoPoint
    dropoff_location: GeoPoint
    cycle_hours_used: float  # hours already on the 70/8 clock
    start_datetime: datetime  # tz-aware


@dataclass(frozen=True)
class TripSummary:
    total_distance_miles: float
    total_duration_hours: float  # wall-clock, including all rests
    total_driving_hours: float
    total_on_duty_hours: float
    cycle_hours_before: float
    cycle_hours_after: float
    cycle_hours_remaining: float  # 70 - cycle_hours_after
    shifts_count: int
    warnings: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class Remark:
    time: datetime
    location: GeoPoint


@dataclass(frozen=True)
class DailyLog:
    date: str  # YYYY-MM-DD in driver's home terminal tz
    events: list[DutyEvent]  # clipped to this calendar day
    totals: dict[DutyStatus, float]  # hours per status, must sum to 24
    total_miles: float
    remarks: list[Remark]  # location changes


@dataclass(frozen=True)
class TripPlan:
    input: TripInput
    segments: list[RouteSegment]
    events: list[DutyEvent]
    daily_logs: list[DailyLog]
    summary: TripSummary
