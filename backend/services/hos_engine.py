from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Protocol

from services.log_builder import build_daily_logs
from services.types import (
    DailyLog,
    DutyEvent,
    GeoPoint,
    RouteSegment,
    TripInput,
    TripPlan,
    TripSummary,
)

# ── HOS constants ──────────────────────────────────────────────────────
DRIVING_LIMIT_HOURS = 11.0
SHIFT_WINDOW_HOURS = 14.0
BREAK_AFTER_DRIVING_HOURS = 8.0
BREAK_DURATION_HOURS = 0.5
OFF_DUTY_RESET_HOURS = 10.0
CYCLE_LIMIT_HOURS = 70.0
FUEL_INTERVAL_MILES = 1000.0
FUEL_STOP_HOURS = 0.5
PICKUP_HOURS = 1.0
DROPOFF_HOURS = 1.0
EPSILON = 1e-9


# ── Router protocol ────────────────────────────────────────────────────
class Router(Protocol):
    def route(self, origin: GeoPoint, destination: GeoPoint) -> RouteSegment: ...


# ── Internal mutable state ─────────────────────────────────────────────
@dataclass
class _ShiftState:
    start: datetime
    driving_hours: float = 0.0
    elapsed_hours: float = 0.0
    hours_since_break: float = 0.0


@dataclass
class _LegState:
    remaining_hours: float
    remaining_miles: float
    avg_mph: float
    consumed_miles: float
    index: int
    polyline: list[tuple[float, float]]
    total_miles: float

    def consume(self, hours: float, miles: float) -> None:
        self.remaining_hours -= hours
        self.remaining_miles -= miles
        self.consumed_miles += miles

    def position_at_miles(self, miles: float) -> GeoPoint:
        """Interpolate position along the polyline at a given mileage."""
        if not self.polyline or len(self.polyline) < 2:
            lat, lon = self.polyline[0] if self.polyline else (0.0, 0.0)
            return GeoPoint(lat=lat, lon=lon)

        frac = miles / self.total_miles if self.total_miles > 0 else 0.0
        frac = max(0.0, min(1.0, frac))

        total_segments = len(self.polyline) - 1
        segment_float = frac * total_segments
        seg_idx = min(int(segment_float), total_segments - 1)
        seg_frac = segment_float - seg_idx

        lat1, lon1 = self.polyline[seg_idx]
        lat2, lon2 = self.polyline[seg_idx + 1]
        lat = lat1 + (lat2 - lat1) * seg_frac
        lon = lon1 + (lon2 - lon1) * seg_frac
        return GeoPoint(lat=lat, lon=lon)


def _make_leg(segment: RouteSegment, index: int) -> _LegState:
    avg_mph = (
        segment.distance_miles / segment.duration_hours
        if segment.duration_hours > 0
        else 0.0
    )
    return _LegState(
        remaining_hours=segment.duration_hours,
        remaining_miles=segment.distance_miles,
        avg_mph=avg_mph,
        consumed_miles=0.0,
        index=index,
        polyline=list(segment.polyline),
        total_miles=segment.distance_miles,
    )


def _new_shift(start: datetime) -> _ShiftState:
    return _ShiftState(start=start)


# ── Fuel mark helpers ──────────────────────────────────────────────────
def _compute_fuel_marks(segments: list[RouteSegment]) -> list[float]:
    total_miles = sum(s.distance_miles for s in segments)
    marks: list[float] = []
    mark = FUEL_INTERVAL_MILES
    while mark < total_miles - EPSILON:
        marks.append(mark)
        mark += FUEL_INTERVAL_MILES
    return marks


def _hours_until_next_fuel(
    miles_driven: float, avg_mph: float, fuel_marks: list[float]
) -> float:
    """Hours of driving until the next uncleared fuel mark."""
    for mark in fuel_marks:
        if miles_driven < mark - EPSILON:
            miles_to_mark = mark - miles_driven
            return miles_to_mark / avg_mph if avg_mph > 0 else float("inf")
    return float("inf")


def _at_fuel_mark(miles_driven: float, fuel_marks: list[float]) -> bool:
    for mark in fuel_marks:
        if abs(miles_driven - mark) < 1.0:  # within 1 mile tolerance
            return True
    return False


# ── Main entry point ───────────────────────────────────────────────────
def plan_trip(trip_input: TripInput, router: Router) -> TripPlan:
    # 1. Route both legs
    leg1_segment = router.route(
        trip_input.current_location, trip_input.pickup_location
    )
    leg2_segment = router.route(
        trip_input.pickup_location, trip_input.dropoff_location
    )
    segments = [leg1_segment, leg2_segment]

    # 2. Compute fuel marks over cumulative distance
    fuel_marks = _compute_fuel_marks(segments)

    # 3. Build leg queue (skip zero-distance leg1)
    legs: list[_LegState] = []
    terminal_events: list[str] = []
    miles_offset = 0.0  # cumulative miles before the current leg queue

    if leg1_segment.distance_miles > EPSILON:
        legs.append(_make_leg(leg1_segment, index=1))
        terminal_events.append("pickup")
    else:
        # current == pickup: skip driving, still need pickup event
        terminal_events.append("pickup_only")

    legs.append(_make_leg(leg2_segment, index=2))
    terminal_events.append("dropoff")

    # 4. Simulate forward
    events: list[DutyEvent] = []
    clock = trip_input.start_datetime
    cycle_used = trip_input.cycle_hours_used
    shift = _new_shift(start=clock)
    miles_driven_total = 0.0

    # Handle zero-distance leg1: emit pickup immediately
    if terminal_events and terminal_events[0] == "pickup_only":
        terminal_events.pop(0)
        pickup_end = clock + timedelta(hours=PICKUP_HOURS)
        events.append(
            DutyEvent(
                start=clock,
                end=pickup_end,
                status="on_duty_not_driving",
                note="Pickup",
                location=trip_input.pickup_location,
            )
        )
        clock = pickup_end
        cycle_used += PICKUP_HOURS
        shift.elapsed_hours += PICKUP_HOURS
        shift.hours_since_break = 0  # 1hr >= 30min, satisfies break

    while legs:
        leg = legs[0]

        # Compute driving budget
        hrs_until_11 = DRIVING_LIMIT_HOURS - shift.driving_hours
        hrs_until_14 = SHIFT_WINDOW_HOURS - shift.elapsed_hours
        hrs_until_break = BREAK_AFTER_DRIVING_HOURS - shift.hours_since_break
        hrs_until_fuel = _hours_until_next_fuel(
            miles_driven_total, leg.avg_mph, fuel_marks
        )
        hrs_until_leg_end = leg.remaining_hours

        drive_budget = min(
            hrs_until_11,
            hrs_until_14,
            hrs_until_break,
            hrs_until_fuel,
            hrs_until_leg_end,
        )

        # If we can't drive at all, we've hit a boundary with 0 budget
        if drive_budget <= EPSILON:
            # Determine which boundary and handle it
            if hrs_until_11 <= EPSILON or hrs_until_14 <= EPSILON:
                # 10-hour off-duty reset
                reset_end = clock + timedelta(hours=OFF_DUTY_RESET_HOURS)
                events.append(
                    DutyEvent(
                        start=clock,
                        end=reset_end,
                        status="off_duty",
                        note="10-hour off-duty (shift reset)",
                        location=leg.position_at_miles(leg.consumed_miles),
                    )
                )
                clock = reset_end
                shift = _new_shift(start=clock)
            elif hrs_until_break <= EPSILON:
                # 30-minute break
                break_end = clock + timedelta(hours=BREAK_DURATION_HOURS)
                events.append(
                    DutyEvent(
                        start=clock,
                        end=break_end,
                        status="off_duty",
                        note="30-minute rest break",
                        location=leg.position_at_miles(leg.consumed_miles),
                    )
                )
                clock = break_end
                shift.elapsed_hours += BREAK_DURATION_HOURS
                shift.hours_since_break = 0
            elif hrs_until_fuel <= EPSILON:
                # Fuel stop
                fuel_end = clock + timedelta(hours=FUEL_STOP_HOURS)
                events.append(
                    DutyEvent(
                        start=clock,
                        end=fuel_end,
                        status="on_duty_not_driving",
                        note="Fuel stop",
                        location=leg.position_at_miles(leg.consumed_miles),
                    )
                )
                clock = fuel_end
                cycle_used += FUEL_STOP_HOURS
                shift.elapsed_hours += FUEL_STOP_HOURS
                shift.hours_since_break = 0  # 30-min fuel satisfies break
            continue

        # Drive for drive_budget hours
        drive_end = clock + timedelta(hours=drive_budget)
        miles_this_drive = drive_budget * leg.avg_mph
        events.append(
            DutyEvent(
                start=clock,
                end=drive_end,
                status="driving",
                note=f"Driving — leg {leg.index}",
                location=leg.position_at_miles(leg.consumed_miles),
                miles=miles_this_drive,
            )
        )
        clock = drive_end
        miles_driven_total += miles_this_drive
        cycle_used += drive_budget
        shift.driving_hours += drive_budget
        shift.elapsed_hours += drive_budget
        shift.hours_since_break += drive_budget
        leg.consume(hours=drive_budget, miles=miles_this_drive)

        # Determine which boundary was hit
        hit_leg_end = leg.remaining_hours <= EPSILON
        hit_11 = shift.driving_hours >= DRIVING_LIMIT_HOURS - EPSILON
        hit_14 = shift.elapsed_hours >= SHIFT_WINDOW_HOURS - EPSILON
        hit_fuel = _at_fuel_mark(miles_driven_total, fuel_marks)
        hit_break = shift.hours_since_break >= BREAK_AFTER_DRIVING_HOURS - EPSILON

        # Priority: leg_end > 11hr/14hr reset > fuel > break
        if hit_leg_end:
            terminal = terminal_events.pop(0)
            if terminal == "pickup":
                dur = PICKUP_HOURS
                note = "Pickup"
                loc = trip_input.pickup_location
            else:
                dur = DROPOFF_HOURS
                note = "Drop-off"
                loc = trip_input.dropoff_location

            event_end = clock + timedelta(hours=dur)
            events.append(
                DutyEvent(
                    start=clock,
                    end=event_end,
                    status="on_duty_not_driving",
                    note=note,
                    location=loc,
                )
            )
            clock = event_end
            cycle_used += dur
            shift.elapsed_hours += dur
            shift.hours_since_break = 0  # >= 30min, satisfies break
            legs.pop(0)

        elif hit_11 or hit_14:
            # 10-hour off-duty reset
            reset_end = clock + timedelta(hours=OFF_DUTY_RESET_HOURS)
            events.append(
                DutyEvent(
                    start=clock,
                    end=reset_end,
                    status="off_duty",
                    note="10-hour off-duty (shift reset)",
                    location=leg.position_at_miles(leg.consumed_miles),
                )
            )
            clock = reset_end
            shift = _new_shift(start=clock)
            # NOTE: cycle_used is NOT reset by 10-hr rest

        elif hit_fuel:
            # Fuel stop
            fuel_end = clock + timedelta(hours=FUEL_STOP_HOURS)
            events.append(
                DutyEvent(
                    start=clock,
                    end=fuel_end,
                    status="on_duty_not_driving",
                    note="Fuel stop",
                    location=leg.position_at_miles(leg.consumed_miles),
                )
            )
            clock = fuel_end
            cycle_used += FUEL_STOP_HOURS
            shift.elapsed_hours += FUEL_STOP_HOURS
            shift.hours_since_break = 0  # 30-min fuel satisfies break

        elif hit_break:
            # 30-minute rest break
            break_end = clock + timedelta(hours=BREAK_DURATION_HOURS)
            events.append(
                DutyEvent(
                    start=clock,
                    end=break_end,
                    status="off_duty",
                    note="30-minute rest break",
                    location=leg.position_at_miles(leg.consumed_miles),
                )
            )
            clock = break_end
            shift.elapsed_hours += BREAK_DURATION_HOURS
            shift.hours_since_break = 0

    # 5. Compute summary
    total_driving = sum(
        e.duration_hours for e in events if e.status == "driving"
    )
    total_on_duty = sum(
        e.duration_hours
        for e in events
        if e.status in ("driving", "on_duty_not_driving")
    )
    total_duration = (clock - trip_input.start_datetime).total_seconds() / 3600.0

    warnings: list[str] = []
    if cycle_used > CYCLE_LIMIT_HOURS:
        warnings.append(
            f"Trip exceeds 70-hour/8-day cycle by "
            f"{cycle_used - CYCLE_LIMIT_HOURS:.1f} hours. "
            f"A 34-hour restart is required before completing this trip."
        )
    elif cycle_used > CYCLE_LIMIT_HOURS * 0.9:
        warnings.append(
            f"Trip will leave only "
            f"{CYCLE_LIMIT_HOURS - cycle_used:.1f} hours in the 70-hour cycle."
        )

    shifts_count = _count_shifts(events)

    summary = TripSummary(
        total_distance_miles=sum(s.distance_miles for s in segments),
        total_duration_hours=total_duration,
        total_driving_hours=total_driving,
        total_on_duty_hours=total_on_duty,
        cycle_hours_before=trip_input.cycle_hours_used,
        cycle_hours_after=cycle_used,
        cycle_hours_remaining=max(0.0, CYCLE_LIMIT_HOURS - cycle_used),
        shifts_count=shifts_count,
        warnings=warnings,
    )

    # 6. Assert invariants
    assert events[0].start == trip_input.start_datetime, "First event must start at trip start"
    for i in range(len(events) - 1):
        assert events[i].end == events[i + 1].start, f"Gap/overlap at index {i}"
    event_total = sum(e.duration_hours for e in events)
    assert abs(event_total - total_duration) < EPSILON, (
        f"Event durations ({event_total}) != total_duration ({total_duration})"
    )

    # 7. Build daily logs
    daily_logs = build_daily_logs(events, tz=trip_input.start_datetime.tzinfo)

    return TripPlan(
        input=trip_input,
        segments=segments,
        events=events,
        daily_logs=daily_logs,
        summary=summary,
    )


def _count_shifts(events: list[DutyEvent]) -> int:
    """Count the number of distinct shifts (separated by 10-hr off-duty)."""
    if not events:
        return 0
    count = 1
    for e in events:
        if e.status == "off_duty" and e.duration_hours >= OFF_DUTY_RESET_HOURS - EPSILON:
            count += 1
    return count
