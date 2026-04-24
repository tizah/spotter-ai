---
name: hos-engine
description: Use this skill whenever the user is implementing, modifying, testing, or debugging the Hours of Service (HOS) simulation engine in backend/services/hos_engine.py — the core algorithm that converts a trip input (current/pickup/dropoff locations + cycle hours used) into a timeline of duty events (driving, breaks, resets, fuel stops, pickup/dropoff). Trigger whenever the user mentions HOS, Hours of Service, the 70-hour rule, 11-hour driving limit, 14-hour window, 30-minute break, 10-hour reset, 34-hour restart, cycle hours, duty events, trip planning logic, fuel stops, pickup/dropoff time, FMCSA rules, driver's daily log logic, or any file under services/ on the backend. Also trigger for questions about what the engine should output, how to test it, or why a plan contains a particular stop. The engine is the single most important part of this project and its accuracy is directly tested — always consult this skill before touching it.
---

# HOS Simulation Engine

The engine is a **pure Python function** that takes a `TripInput` and returns a `TripPlan`. It does not import from Django. It has no side effects beyond calling the routing adapter (which is injected as a dependency).

## Why this design

- **Pure** → trivially testable, deterministic (same input → same plan always)
- **Framework-free** → could be lifted into a Lambda, a script, or a Celery worker without modification
- **Dependency-injected router** → tests use a fake `Router`, production uses `OSRMRouter`
- **One function, many tests** → the simulation loop is complex; tests prove correctness rule-by-rule

## Data contract

These live in `services/types.py`. Define them exactly like this:

```python
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
    cycle_hours_used: float       # hours already on the 70/8 clock
    start_datetime: datetime      # tz-aware

@dataclass(frozen=True)
class TripSummary:
    total_distance_miles: float
    total_duration_hours: float   # wall-clock, including all rests
    total_driving_hours: float
    total_on_duty_hours: float
    cycle_hours_before: float
    cycle_hours_after: float
    cycle_hours_remaining: float  # 70 - cycle_hours_after
    shifts_count: int
    warnings: list[str] = field(default_factory=list)

@dataclass(frozen=True)
class DailyLog:
    date: str                      # YYYY-MM-DD in driver's home terminal tz
    events: list[DutyEvent]        # clipped to this calendar day
    totals: dict[DutyStatus, float]  # hours per status, must sum to 24
    total_miles: float
    remarks: list[tuple[datetime, GeoPoint]]  # location changes

@dataclass(frozen=True)
class TripPlan:
    input: TripInput
    segments: list[RouteSegment]
    events: list[DutyEvent]
    daily_logs: list[DailyLog]
    summary: TripSummary
```

## The rules the engine enforces

Constants defined at the top of `hos_engine.py`:

```python
DRIVING_LIMIT_HOURS = 11.0
SHIFT_WINDOW_HOURS = 14.0
BREAK_AFTER_DRIVING_HOURS = 8.0
BREAK_DURATION_HOURS = 0.5
OFF_DUTY_RESET_HOURS = 10.0
CYCLE_LIMIT_HOURS = 70.0         # 8-day total
FUEL_INTERVAL_MILES = 1000.0
FUEL_STOP_HOURS = 0.5            # on-duty-not-driving
PICKUP_HOURS = 1.0               # on-duty-not-driving
DROPOFF_HOURS = 1.0              # on-duty-not-driving
```

**Critical rule interpretation:**

The 30-minute break (FMCSA § 395.3(a)(3)(ii)) can be taken on-duty, off-duty, or in the sleeper berth. It only needs to be a consecutive 30+ minute *non-driving* period. Therefore:

- A 30-min fuel stop (on-duty-not-driving) **satisfies** the break
- A 30-min pickup wait **satisfies** the break
- A 10-hour off-duty reset **satisfies** the break (resets everything anyway)

The engine must reset `hours_since_last_break` whenever ANY non-driving event ≥ 30 minutes is completed. Do not insert a redundant 30-min break if one of these already covered it.

## The algorithm (event-timeline simulation)

Do NOT compute the plan analytically. Simulate forward in time, one mandatory-stop decision at a time. The simplest correct approach:

```python
def plan_trip(trip_input: TripInput, router: Router) -> TripPlan:
    # 1. Resolve routes
    leg1 = router.route(trip_input.current_location, trip_input.pickup_location)
    leg2 = router.route(trip_input.pickup_location, trip_input.dropoff_location)
    segments = [leg1, leg2]

    # 2. Plan fuel marks along the cumulative route
    fuel_marks_miles = _compute_fuel_marks([leg1, leg2])  # [1000.0, 2000.0, ...]

    # 3. Simulate
    events: list[DutyEvent] = []
    clock = trip_input.start_datetime
    cycle_used = trip_input.cycle_hours_used
    shift = _new_shift(start=clock)
    miles_driven_total = 0.0

    # Queue of legs to consume (each leg has remaining_hours, remaining_miles, avg_mph, polyline)
    legs = [_leg_state(leg1), _leg_state(leg2)]
    leg_terminal_events = ["pickup", "dropoff"]  # what to emit when each leg completes

    while legs:
        leg = legs[0]

        # Compute how long the driver can drive before the NEXT mandatory stop
        hrs_until_11 = DRIVING_LIMIT_HOURS - shift.driving_hours
        hrs_until_14 = SHIFT_WINDOW_HOURS - shift.elapsed_hours
        hrs_until_break = BREAK_AFTER_DRIVING_HOURS - shift.hours_since_break
        hrs_until_fuel = _hours_until_next_fuel(miles_driven_total, leg.avg_mph, fuel_marks_miles)
        hrs_until_leg_end = leg.remaining_hours

        drive_budget = min(
            hrs_until_11, hrs_until_14, hrs_until_break,
            hrs_until_fuel, hrs_until_leg_end,
        )

        if drive_budget <= 0:
            # We're already at a boundary — emit the mandatory stop (see below)
            ...
            continue

        # Drive for drive_budget hours
        drive_end = clock + timedelta(hours=drive_budget)
        miles_this_drive = drive_budget * leg.avg_mph
        events.append(DutyEvent(
            start=clock, end=drive_end, status="driving",
            note=f"Driving — leg {leg.index}",
            location=leg.position_at_miles(leg.consumed_miles),
            miles=miles_this_drive,
        ))
        clock = drive_end
        miles_driven_total += miles_this_drive
        cycle_used += drive_budget
        shift.driving_hours += drive_budget
        shift.elapsed_hours += drive_budget
        shift.hours_since_break += drive_budget
        leg.consume(hours=drive_budget, miles=miles_this_drive)

        # Decide which boundary we hit and emit the next non-driving event
        hit_leg_end   = leg.remaining_hours <= EPSILON
        hit_11        = shift.driving_hours   >= DRIVING_LIMIT_HOURS - EPSILON
        hit_14        = shift.elapsed_hours   >= SHIFT_WINDOW_HOURS  - EPSILON
        hit_break     = shift.hours_since_break >= BREAK_AFTER_DRIVING_HOURS - EPSILON
        hit_fuel      = _at_fuel_mark(miles_driven_total, fuel_marks_miles)

        if hit_leg_end:
            terminal = leg_terminal_events.pop(0)
            if terminal == "pickup":
                events.append(_on_duty_event(clock, PICKUP_HOURS, "Pickup", trip_input.pickup_location))
            else:  # dropoff
                events.append(_on_duty_event(clock, DROPOFF_HOURS, "Drop-off", trip_input.dropoff_location))
            _advance_clock_and_shift(..., hours=PICKUP_HOURS or DROPOFF_HOURS)
            cycle_used += <hours>
            # Pickup/dropoff ≥ 30 min, so reset the break counter
            shift.hours_since_break = 0
            legs.pop(0)
        elif hit_11 or hit_14:
            # Need a 10-hour off-duty reset
            events.append(DutyEvent(
                start=clock, end=clock + timedelta(hours=OFF_DUTY_RESET_HOURS),
                status="off_duty", note="10-hour off-duty (shift reset)",
                location=_current_location_on_leg(leg),
            ))
            clock += timedelta(hours=OFF_DUTY_RESET_HOURS)
            shift = _new_shift(start=clock)
            # NOTE: 10-hr reset does NOT reset cycle_used (that needs 34-hr restart, out of scope)
        elif hit_fuel:
            events.append(_on_duty_event(clock, FUEL_STOP_HOURS, "Fuel stop",
                                         _current_location_on_leg(leg)))
            clock += timedelta(hours=FUEL_STOP_HOURS)
            cycle_used += FUEL_STOP_HOURS
            shift.elapsed_hours += FUEL_STOP_HOURS
            shift.hours_since_break = 0   # 30-min fuel stop satisfies the break
        elif hit_break:
            events.append(DutyEvent(
                start=clock, end=clock + timedelta(hours=BREAK_DURATION_HOURS),
                status="off_duty", note="30-minute rest break",
                location=_current_location_on_leg(leg),
            ))
            clock += timedelta(hours=BREAK_DURATION_HOURS)
            shift.elapsed_hours += BREAK_DURATION_HOURS
            shift.hours_since_break = 0

    # 4. Compute summary with cycle warnings
    warnings = []
    if cycle_used > CYCLE_LIMIT_HOURS:
        warnings.append(
            f"Trip exceeds 70-hour/8-day cycle by {cycle_used - CYCLE_LIMIT_HOURS:.1f} hours. "
            f"A 34-hour restart is required before completing this trip."
        )
    elif cycle_used > CYCLE_LIMIT_HOURS * 0.9:
        warnings.append(f"Trip will leave only {CYCLE_LIMIT_HOURS - cycle_used:.1f} hours in the 70-hour cycle.")

    summary = TripSummary(
        total_distance_miles=sum(s.distance_miles for s in segments),
        total_duration_hours=(clock - trip_input.start_datetime).total_seconds() / 3600.0,
        total_driving_hours=sum(e.duration_hours for e in events if e.status == "driving"),
        total_on_duty_hours=sum(e.duration_hours for e in events if e.status in ("driving", "on_duty_not_driving")),
        cycle_hours_before=trip_input.cycle_hours_used,
        cycle_hours_after=cycle_used,
        cycle_hours_remaining=max(0.0, CYCLE_LIMIT_HOURS - cycle_used),
        shifts_count=_count_shifts(events),
        warnings=warnings,
    )

    # 5. Split events into daily logs (see log_builder.py)
    daily_logs = build_daily_logs(events, tz=trip_input.start_datetime.tzinfo)

    return TripPlan(
        input=trip_input, segments=segments, events=events,
        daily_logs=daily_logs, summary=summary,
    )
```

`EPSILON` should be something like `1e-9` hours to handle floating-point comparisons.

The "mandatory-stop minimum" — picking the smallest of five budgets — is the key insight. Every iteration drives exactly up to the next constraint and then handles it. This is what keeps the loop simple and correct.

## Edge cases the engine must handle

1. **Trip fits in a single shift.** No resets, ≤ 1 daily log. Most common case for short trips.
2. **Trip requires one or more 10-hour resets.** Daily logs will span multiple dates.
3. **Start time mid-day, trip spans midnight.** The log boundary splits the event for rendering, but internally it's still one `DutyEvent`. `build_daily_logs` handles the clipping.
4. **Fuel stop coincides with the 30-min break window.** Fuel stop satisfies the break — do not emit both.
5. **Fuel stop coincides with the 11-hour limit.** Reset wins: emit the 10-hour off-duty, not the fuel stop. The next leg will re-encounter the fuel mark.
6. **Pickup/dropoff at the very end of a shift.** The 1-hour pickup/dropoff time still counts against the 14-hour window. If it would push past 14 hours, the engine must NOT emit a reset during pickup/dropoff (it's a fixed on-duty event). Instead, post-pickup/dropoff, the engine checks and emits a reset before the next drive segment begins.
7. **`cycle_hours_used` already ≥ 70.** Return a plan with a loud warning; still compute the trip so the driver can see it, but `summary.warnings` must flag the violation.
8. **Zero-distance leg** (current_location == pickup_location). Skip leg1 entirely; still emit the 1-hour pickup event.
9. **`avg_mph` from routing adapter.** Compute it per-leg as `distance_miles / duration_hours`. Do not hardcode 55 mph — use whatever the router returns. (Routing APIs account for speed limits, terrain, traffic-free conditions.)

## Required tests (pytest)

Every rule gets a dedicated test. Put these in `tests/test_hos_engine.py`:

```python
def test_short_trip_fits_single_shift_no_resets():
    """200-mile trip with fresh cycle: no resets, no 30-min break, 1 log."""

def test_30min_break_inserted_at_8hr_driving_mark():
    """Trip with >8 hours continuous driving must insert a 30-min non-driving event."""

def test_fuel_stop_inserted_every_1000_miles():
    """2,500-mile trip has exactly 2 fuel stops (at mile 1000 and 2000)."""

def test_fuel_stop_satisfies_30min_break():
    """When fuel stop falls inside the break window, no redundant break is emitted."""

def test_10hr_reset_inserted_at_11hr_driving_limit():
    """Trip that would drive >11 hours straight gets a 10-hour off-duty event."""

def test_10hr_reset_inserted_at_14hr_shift_window():
    """Trip with 10 hours driving + 5 hours on-duty would breach 14hr, must reset."""

def test_pickup_and_dropoff_each_consume_1hr_on_duty():
    """Events list contains one 1-hour on_duty_not_driving event at pickup AND dropoff."""

def test_pickup_time_counts_against_14hr_window():
    """Pickup adds to elapsed_hours even though it's not driving."""

def test_cycle_hours_propagates_from_input():
    """cycle_hours_before equals trip_input.cycle_hours_used; cycle_hours_after equals before + on_duty_hours."""

def test_near_70hr_emits_warning():
    """cycle_hours_used=65 + 6hr trip → warning about <5 hours remaining."""

def test_over_70hr_emits_hard_violation_warning():
    """cycle_hours_used=68 + 10hr trip → warning includes '34-hour restart required'."""

def test_events_total_duration_equals_trip_duration():
    """INVARIANT: sum of all event durations == summary.total_duration_hours. Always."""

def test_events_have_no_gaps_or_overlaps():
    """INVARIANT: events[i].end == events[i+1].start for all i."""

def test_multi_day_trip_produces_multiple_daily_logs():
    """Trip starting 6am crossing into next day has 2 daily_logs, split at midnight."""

def test_daily_log_totals_sum_to_24_hours():
    """INVARIANT: for every daily log, sum(totals.values()) == 24.0 (within epsilon)."""

def test_deterministic_output():
    """Same input twice → byte-equal plans (after removing datetime identity)."""
```

The three INVARIANT tests are the highest-value — they catch off-by-one and floating-point bugs the rule-specific tests can miss.

## Router dependency injection

The engine takes a `Router` protocol — this keeps it decoupled from OSRM:

```python
from typing import Protocol

class Router(Protocol):
    def route(self, origin: GeoPoint, destination: GeoPoint) -> RouteSegment: ...
```

Tests use a `FakeRouter` returning canned segments:

```python
class FakeRouter:
    def __init__(self, segments: list[RouteSegment]):
        self._segments = list(segments)
    def route(self, origin, destination) -> RouteSegment:
        return self._segments.pop(0)
```

Production passes `OSRMRouter(base_url=settings.OSRM_URL)`.

## Common pitfalls to avoid

- **Naive datetimes.** The whole simulation is TZ-aware. Use `datetime.now(tz=ZoneInfo(...))`.
- **Mutating dataclasses.** They're frozen. Construct new ones.
- **Hardcoding 55 mph.** The router returns duration; derive avg_mph per leg.
- **Forgetting to reset `hours_since_break`** after any 30+ min non-driving event.
- **Forgetting to advance `cycle_used`** on on-duty-not-driving events (pickup, dropoff, fuel).
- **Forgetting that 10-hr reset does NOT reset cycle_used** — only a 34-hr restart does, and that's out of scope.
- **Computing fuel marks from wall-clock time instead of miles driven.** Fuel stops are per mile, not per hour.
- **Assuming the 30-min break must be off-duty.** It can be any non-driving status.

## Output invariants to assert at the end of `plan_trip`

Before returning, assert these in debug mode. If they fail, the engine has a bug.

```python
assert events[0].start == trip_input.start_datetime
for i in range(len(events) - 1):
    assert events[i].end == events[i + 1].start, f"Gap/overlap at index {i}"
total_hours = sum(e.duration_hours for e in events)
assert abs(total_hours - summary.total_duration_hours) < EPSILON
```

These should always hold. If a test fails with a violated invariant, fix the engine, don't relax the assertion.
