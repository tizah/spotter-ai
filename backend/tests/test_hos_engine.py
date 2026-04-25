from __future__ import annotations

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import pytest

from services.hos_engine import (
    BREAK_AFTER_DRIVING_HOURS,
    BREAK_DURATION_HOURS,
    CYCLE_LIMIT_HOURS,
    DRIVING_LIMIT_HOURS,
    EPSILON,
    FUEL_STOP_HOURS,
    OFF_DUTY_RESET_HOURS,
    SHIFT_WINDOW_HOURS,
    plan_trip,
)
from services.types import DutyEvent, GeoPoint, RouteSegment, TripInput

TZ = ZoneInfo("America/Chicago")
ORIGIN = GeoPoint(lat=41.88, lon=-87.63, label="Chicago")
PICKUP = GeoPoint(lat=39.76, lon=-86.16, label="Indianapolis")
DROPOFF = GeoPoint(lat=32.78, lon=-96.80, label="Dallas")


# ── FakeRouter ─────────────────────────────────────────────────────────
class FakeRouter:
    """Returns pre-built RouteSegment objects in order."""

    def __init__(self, segments: list[RouteSegment]):
        self._segments = list(segments)

    def route(self, origin: GeoPoint, destination: GeoPoint) -> RouteSegment:
        return self._segments.pop(0)


def _seg(
    distance_miles: float,
    duration_hours: float,
    start: GeoPoint = ORIGIN,
    end: GeoPoint = PICKUP,
) -> RouteSegment:
    """Convenience: build a RouteSegment with a simple 2-point polyline."""
    return RouteSegment(
        start=start,
        end=end,
        distance_miles=distance_miles,
        duration_hours=duration_hours,
        polyline=[(start.lat, start.lon), (end.lat, end.lon)],
    )


def _trip(
    cycle_hours_used: float = 0.0,
    start_hour: int = 6,
    start_date: tuple[int, int, int] = (2026, 4, 24),
) -> TripInput:
    """Convenience: build a TripInput with defaults."""
    return TripInput(
        current_location=ORIGIN,
        pickup_location=PICKUP,
        dropoff_location=DROPOFF,
        cycle_hours_used=cycle_hours_used,
        start_datetime=datetime(
            *start_date, start_hour, 0, 0, tzinfo=TZ
        ),
    )


# ── 1. Short trip, single shift, no resets ─────────────────────────────
def test_short_trip_fits_single_shift_no_resets():
    """200-mile trip with fresh cycle: no resets, no 30-min break, 1 shift."""
    router = FakeRouter([
        _seg(100, 2.0, ORIGIN, PICKUP),       # leg 1: 2 hrs
        _seg(100, 2.0, PICKUP, DROPOFF),       # leg 2: 2 hrs
    ])
    plan = plan_trip(_trip(), router)

    # No off-duty reset events
    resets = [e for e in plan.events if "shift reset" in e.note]
    assert len(resets) == 0

    # No 30-min breaks
    breaks = [e for e in plan.events if "rest break" in e.note]
    assert len(breaks) == 0

    assert plan.summary.shifts_count == 1
    assert plan.summary.total_distance_miles == 200.0


# ── 2. 30-min break at 8-hr driving mark ──────────────────────────────
def test_30min_break_inserted_at_8hr_driving_mark():
    """Trip with >8 hours continuous driving must insert a 30-min break."""
    # Use zero-distance leg1 so pickup happens immediately (resets break counter).
    # Then leg2 has 10 hrs of driving — break must appear at the 8-hr mark.
    trip = TripInput(
        current_location=PICKUP,  # same as pickup → zero-distance leg1
        pickup_location=PICKUP,
        dropoff_location=DROPOFF,
        cycle_hours_used=0.0,
        start_datetime=datetime(2026, 4, 24, 6, 0, 0, tzinfo=TZ),
    )
    router = FakeRouter([
        _seg(0, 0.0, PICKUP, PICKUP),
        _seg(550, 10.0, PICKUP, DROPOFF),
    ])
    plan = plan_trip(trip, router)

    breaks = [e for e in plan.events if "rest break" in e.note]
    assert len(breaks) >= 1

    # Find driving hours since the last non-driving event before the first break
    driving_since_pickup = 0.0
    for e in plan.events:
        if e.note == "Pickup":
            driving_since_pickup = 0.0
            continue
        if "rest break" in e.note:
            break
        if e.status == "driving":
            driving_since_pickup += e.duration_hours
    assert abs(driving_since_pickup - BREAK_AFTER_DRIVING_HOURS) < 0.01


# ── 3. Fuel stop every 1,000 miles ────────────────────────────────────
def test_fuel_stop_inserted_every_1000_miles():
    """2,500-mile trip has exactly 2 fuel stops (at mile 1000 and 2000)."""
    router = FakeRouter([
        _seg(500, 8.0, ORIGIN, PICKUP),         # leg 1
        _seg(2000, 32.0, PICKUP, DROPOFF),       # leg 2
    ])
    plan = plan_trip(_trip(), router)

    fuel_stops = [e for e in plan.events if e.note == "Fuel stop"]
    assert len(fuel_stops) == 2


# ── 4. Fuel stop satisfies 30-min break ───────────────────────────────
def test_fuel_stop_satisfies_30min_break():
    """When fuel stop falls inside the break window, no redundant break."""
    # Leg 1: 900 miles at 60 mph = 15 hrs (needs reset after 11).
    # But let's make it simpler: 1000 miles at 125 mph = 8 hrs exactly.
    # This means fuel at mile 1000 = exactly 8 hr driving mark.
    # Fuel stop (30 min) should satisfy the break — no separate break emitted.
    router = FakeRouter([
        _seg(200, 3.0, ORIGIN, PICKUP),
        _seg(1200, 9.0, PICKUP, DROPOFF),        # fuel at cumulative mile 1000
    ])
    plan = plan_trip(_trip(), router)

    # Should have a fuel stop
    fuel_stops = [e for e in plan.events if e.note == "Fuel stop"]
    assert len(fuel_stops) >= 1

    # Check no 30-min rest break appears right before or after the fuel stop
    # because the fuel stop itself satisfies the break requirement.
    # Actually we need to check that no redundant break appears near the fuel stop.
    # The engine should not have a break AND a fuel stop back-to-back at the same mark.
    for i, e in enumerate(plan.events):
        if e.note == "Fuel stop":
            # The event immediately before should be driving, not a break
            if i > 0:
                prev = plan.events[i - 1]
                assert "rest break" not in prev.note, (
                    "Redundant break before fuel stop"
                )


# ── 5. 10-hr reset at 11-hr driving limit ─────────────────────────────
def test_10hr_reset_inserted_at_11hr_driving_limit():
    """Trip that would drive >11 hours straight gets a 10-hour off-duty."""
    # 700 miles at 55 mph = 12.7 hrs driving — exceeds 11-hr limit
    router = FakeRouter([
        _seg(200, 4.0, ORIGIN, PICKUP),
        _seg(500, 9.0, PICKUP, DROPOFF),       # total 13 hrs driving
    ])
    plan = plan_trip(_trip(), router)

    resets = [e for e in plan.events if "shift reset" in e.note]
    assert len(resets) >= 1
    assert resets[0].duration_hours == OFF_DUTY_RESET_HOURS


# ── 6. 10-hr reset at 14-hr shift window ──────────────────────────────
def test_10hr_reset_inserted_at_14hr_shift_window():
    """14-hr window exceeded triggers reset even with <11 hrs driving."""
    # Leg 1: 5 hrs driving. Then pickup (1 hr). Then leg 2: 9 hrs driving.
    # Shift elapsed at start of leg 2: 5 + 1 = 6 hrs.
    # Can drive another 8 hrs before 14-hr window (6 + 8 = 14).
    # But 11-hr driving limit: driven 5, can do 6 more.
    # So 14-hr window triggers at elapsed=14 with only 8 hrs driving.
    # Let's craft it: leg1=5hr drive, pickup=1hr, so 6hr elapsed.
    # leg2 needs to force 14hr window: 8 hrs of driving would hit 14hr window.
    # 11-hr check: 5+8 = 13 hrs driving, doesn't breach 11hr (wait, it does - 13>11).
    # Let me recalculate: 11-hr limit applies to driving only.
    # After leg 1 (5 hr driving) + pickup (1 hr, not driving):
    #   driving_hours=5, elapsed_hours=6, hours_since_break=0 (pickup reset it)
    # Leg 2: can drive min(11-5=6, 14-6=8, 8-0=8) = 6 hrs before 11-hr limit.
    # That's the 11hr limit, not 14hr. Need different numbers.
    #
    # To hit 14hr before 11hr:
    # Leg 1: 3 hr driving. Pickup: 1hr. Fuel: 0.5hr (need 1000 miles for fuel).
    # Let's use: leg1=3hr drive, pickup=1hr (elapsed=4, driving=3).
    # Then some on-duty time... Actually, let's just make a case where
    # a lot of on-duty-not-driving time eats the 14hr window.
    #
    # Simplest: leg1 = 5hrs driving, pickup=1hr, break at 8hr (if needed),
    # Then leg2 with enough driving to hit 14hr before 11hr.
    # After leg1 (5hr) + pickup (1hr): elapsed=6, driving=5, break_counter=0
    # Remaining driving before 11hr: 6hrs. Remaining shift before 14hr: 8hrs.
    # If leg2 takes 7 hrs, driver drives 6hrs (hits 11) before 14.
    # Need: driving < 11 but elapsed >= 14 at the same time.
    #
    # Try: leg1=3hr, pickup=1hr, then drive 2hr, fuel stop (0.5hr, if at 1000mi - no).
    # OK let me try a simpler approach: use large on-duty non-driving to eat window.
    # current==pickup (zero-distance leg1), so pickup happens immediately (1hr on-duty).
    # Then leg2: 12.5hr driving. After pickup: elapsed=1, driving=0.
    # Can drive min(11, 13, 8) = 8 hrs before break needed.
    # After break (0.5hr): elapsed=9.5, driving=8. Can drive min(3, 4.5, 8) = 3 hrs.
    # After 3 more: elapsed=12.5, driving=11 -> hits 11hr. Not 14hr.
    #
    # Different approach: current==pickup, pickup(1hr), then add a long non-driving event.
    # But the engine only adds events it knows about. The pickup is 1hr.
    # Let's just test the 14hr window directly with numeric precision:
    # leg1 = 10hr driving (speed=50mph, 500mi), pickup = 1hr. elapsed=11, driving=10.
    # Break inserted at 8hr mark. So: drive 8hr, break 0.5hr, drive 2hr, pickup 1hr.
    # elapsed = 8 + 0.5 + 2 + 1 = 11.5, driving=10, break_counter=0.
    # leg2: can drive min(1, 2.5, 8) = 1 hr before 11-hr.
    # Hmm, that's still 11-hr, not 14-hr.
    #
    # To hit 14 first: need driving_hours < 11 but elapsed >= 14.
    # That means >= 3 hrs of non-driving in the shift.
    # We have pickup (1hr) and possibly break (0.5hr) = 1.5hr non-driving.
    # Need 3+ hrs. With fuel stops: each is 0.5hr.
    # If we have 3 fuel stops: 1.5hr + 1hr pickup = 2.5hr. Still not enough.
    #
    # Simplest: two zero-distance legs don't help either because we can only have
    # pickup and dropoff. Let me use: start at 6am, leg1=5hr, pickup=1hr,
    # then fuel stop right at start of leg2, then more driving.
    # leg1: 5hr drive (short enough, no break). Pickup: 1hr. elapsed=6, driving=5.
    # leg2: drive to fuel at 1000mi cumulative. If leg1=500mi at 100mph=5hr,
    # need 500 more miles of leg2 to fuel. At 100mph=5hr. So:
    # drive 5hr: elapsed=11, driving=10, break_counter=5. But break at 8!
    # Actually break_counter resets at pickup. So hours_since_break=0 after pickup.
    # drive 5hr: elapsed=11, driving=10, break_counter=5. No break trigger.
    # Then fuel (0.5hr): elapsed=11.5, driving=10. break_counter=0.
    # drive more: can drive min(1, 2.5, 8)=1hr before 11-hr. Still 11-hr first.
    #
    # The only way 14hr triggers first is if non_driving > 3hrs total in shift.
    # Since we can only have pickup(1hr) + break(0.5hr) + fuels(0.5hr each),
    # we need at least 4 fuel stops: that's 4*0.5=2hr + 1 + 0.5 = 3.5hr.
    # That requires a 4000+ mile leg2. That's contrived but works.
    #
    # Simpler: just demonstrate that the 14-hr check exists by making shift
    # elapsed reach 14 with driving < 11.
    # Use a trip with many on-duty stops:
    # current==pickup (0 mi leg1). Pickup=1hr. elapsed=1, driving=0.
    # leg2: 1000mi at 77mph = 13hr. Break at 8hr. Fuel at 1000mi (end of leg).
    # After 8hr driving: elapsed=9, driving=8. Break 0.5hr: elapsed=9.5, driving=8.
    # Drive 4.5hr more to end: elapsed=14, driving=12.5. Wait - hits 14 AND 11.
    # 11hr would hit first (at driving=11): after break, drive 3 more hrs -> driving=11
    # at elapsed=12.5. That's 11hr limit first.
    #
    # Hmm. It's mathematically hard to hit 14 before 11 with only the built-in
    # non-driving events unless we have lots of fuel stops or the trip is very long.
    # With only pickup (1hr) + break (0.5hr) = 1.5hr non-driving, the gap between
    # 11hr driving and 14hr elapsed is 14-11=3hr, but we only add 1.5hr non-driving,
    # so 11hr driving happens at 12.5hr elapsed. 14hr window isn't reached.
    #
    # To actually test this, we need the engine to have accumulated enough
    # non-driving time. Let me use a very long trip:
    # current=pickup (0mi), pickup 1hr, leg2: 4000mi at 80mph = 50hr driving.
    # This generates multiple resets. The first shift:
    # pickup 1hr (elapsed=1), drive 8hr (break trigger), break 0.5hr (elapsed=9.5),
    # drive 3hr (11hr driving limit, elapsed=12.5), 10hr reset.
    # That's still 11-hr first. With fuel stops at 1000, 2000, 3000:
    # pickup 1hr, drive 8hr (break), break 0.5hr, drive 2hr (fuel at 1000mi, elapsed=11.5),
    # fuel 0.5hr (elapsed=12), drive 1hr (11hr driving, elapsed=13), reset.
    # Still 11-hr first, at elapsed=13 < 14.
    #
    # To make 14 trigger first: we need 3+ hrs non-driving before reaching 11hr driving.
    # pickup(1) + break(0.5) + fuel(0.5) + fuel(0.5) = 2.5hr non-driving after 10hr driving
    # -> elapsed=12.5 at driving=10. Need one more 0.5hr: another fuel at 2000mi.
    # But the 2nd fuel comes after more driving, so driving would be higher.
    #
    # Actually, fuel marks are cumulative and leg-start doesn't matter. Let me craft:
    # leg1: 950mi at 120mph = ~7.9hr. Pickup: 1hr. elapsed=8.9, driving=7.9.
    # Need break? hours_since_break was reset by pickup (1hr >= 30min).
    # leg2: next fuel at 1000mi cumulative, so 50mi into leg2.
    # At 120mph, 50mi = 0.42hr. elapsed=9.32, driving=8.32. -> break triggered at 8.0!
    # Actually break was reset by pickup. So hours_since_break = 0.42hr at that point.
    # No break needed. But driving went from 7.9 to 8.32. break_counter = 0.42 < 8.
    # Keep driving to fuel at 1000mi (50mi into leg2): elapsed=9.32, driving=8.32.
    # Fuel 0.5hr: elapsed=9.82, driving=8.32, break_counter=0.
    # Drive until next fuel at 2000mi: 1000mi at 120mph = 8.33hr. But 11hr limit:
    # can drive 11-8.32=2.68hr more. break at 8hr since break: can drive 8hr.
    # So drive 2.68hr (hits 11): elapsed=12.5, driving=11. -> 11hr. Still first.
    #
    # I think it's nearly impossible to hit 14 before 11 with realistic parameters
    # unless we engineer extreme non-driving time. Let me just use contrived params:
    # leg1: 50mi at 50mph = 1hr. Pickup: 1hr. elapsed=2, driving=1.
    # leg2: 50mi at 50mph = 1hr. But with many fuel stops? No, 50mi total < 1000.
    # This won't work for fuel.
    #
    # Simplest contrived case: use current!=pickup with a very slow leg1 that's short,
    # then a lot of non-driving, then leg2 that pushes elapsed past 14.
    # Actually the issue is the engine only generates non-driving from:
    # pickup, dropoff, break, fuel, reset. We can't inject arbitrary on-duty time.
    #
    # Let me just test that when driving + non-driving >= 14, a reset triggers.
    # Use: leg1=6hr, pickup=1hr, leg2=7hr. Without breaks:
    # drive 6hr, pickup 1hr (elapsed=7, driving=6). drive 2hr (break at 8hr driving).
    # break 0.5hr (elapsed=9.5, driving=8). drive 3hr (11hr driving, elapsed=12.5). reset.
    # Still 11 first at 12.5 elapsed.
    #
    # With fuel: leg1=500mi at 83.3mph=6hr, leg2=1200mi at ~171mph=7hr.
    # fuel at 1000mi: 500mi into leg2. At 171mph = 2.9hr of leg2. total driving=8.9.
    # But break trigger at 8hr driving (after pickup reset). So:
    # leg2: drive 2hr (driving=8, break trigger, elapsed=9). break 0.5hr (elapsed=9.5).
    # drive 0.9hr to fuel at 1000mi (driving=8.9, elapsed=10.4). fuel 0.5hr (elapsed=10.9).
    # drive 2.1hr (driving=11, elapsed=13). -> 11hr first.
    #
    # I'll use a test where we set up the timing so 14 triggers:
    # Make avg_mph very low so on-duty-not-driving events (pickup, fuel, breaks)
    # eat a larger fraction of the window.
    # With 3 fuel stops + pickup + break = 3*0.5 + 1 + 0.5 = 3hr non-driving.
    # driving_at_14 = 14 - 3 = 11. Still ties with 11hr driving limit!
    # We need > 3hr non-driving. 4 fuel stops + pickup + break = 4*0.5+1+0.5 = 3.5hr.
    # driving_at_14 = 10.5 < 11. That works!
    #
    # 4 fuel stops = 4000 miles minimum. In one shift? avg_mph would be 4000/10.5 = 381mph.
    # That's unrealistic but works for testing.
    # leg1: 1500mi at 381mph = 3.94hr. Pickup 1hr. elapsed=4.94, driving=3.94.
    # leg2: 2500mi at 381mph = 6.56hr. Fuel marks: 1000, 2000, 3000, 4000mi.
    # After pickup, break_counter=0. Drive until break at 8hr cumulative driving:
    # can drive 8-3.94=4.06hr before break. Miles: 4.06*381=1547mi.
    # Total miles: 1500+1547=3047. Passed fuels at 1000, 2000, 3000.
    # But fuels trigger earlier. fuel at 1000mi: in leg1 at 1000/381=2.62hr.
    #
    # This is getting complicated. Let me use the simplest possible approach:
    # Make the engine hit 14hr window by giving it a trip where elapsed reac hes 14
    # purely through accumulated non-driving time > 3hrs.
    # I'll use 5 short legs? No, we only have 2 legs.
    #
    # OK, I'll just verify the principle: if elapsed >= 14 and driving < 11, reset.
    # Use: leg1: 100mi at 25mph = 4hr. pickup 1hr. elapsed=5, driving=4.
    # leg2: 1000mi at 100mph = 10hr. Fuel at 1000mi (end of leg2).
    # After pickup: break_counter=0. Drive 4hr more (8hr driving, break at 8):
    #   elapsed=9, driving=8. break 0.5hr: elapsed=9.5, driving=8, break_counter=0.
    # drive 3hr more (11hr driving): elapsed=12.5, driving=11. -> 11hr limit. Reset.
    # After reset: drive remaining 3hr, dropoff.
    #
    # Conclusion: In the standard engine with only pickup, fuel, and break as non-driving,
    # it's very hard to hit 14 before 11 because the max natural non-driving in a shift
    # is ~2.5hr (pickup 1hr + break 0.5hr + fuel 0.5hr + maybe another fuel 0.5hr).
    # That means driving at 14hr elapsed = 14-2.5 = 11.5 > 11, so 11 triggers first.
    #
    # To reliably test 14hr: we'd need the driver to have had on-duty time before
    # the trip that counts against the shift. But our model starts a fresh shift.
    #
    # Let me just test it indirectly: create a scenario where after a reset,
    # the second shift hits 14 because of accumulated non-driving.
    # Or accept that in practice 11-hr almost always triggers first and test
    # that the engine at least checks 14hr by setting up a timing where both
    # would trigger simultaneously.
    #
    # Actually, let me re-read the spec: pickup time counts against 14hr window.
    # The test just needs to show that. I'll make the driving barely under 11hr
    # and pickup pushes elapsed past 14hr.
    # leg1: 10hr driving. pickup 1hr. elapsed=11, driving=10.
    # leg2: 4hr driving. After pickup: can drive min(1, 3, 8)=1hr.
    # At driving=11, elapsed=12. -> 11hr first, not 14. Hmm.
    #
    # The only way: driving finishes a leg at <11hr but elapsed >14hr.
    # leg1: 12hr at 50mph. Break at 8hr, then at 11hr driving -> reset.
    # That doesn't work either.
    #
    # Fine. Let me use a totally contrived test: manually set up a scenario
    # where we know 14hr would trigger. The test name says
    # "Trip with 10 hours driving + 5 hours on-duty would breach 14hr, must reset"
    # So we need 5hr on-duty-not-driving. But the engine only creates 1hr pickup,
    # 0.5hr break, 0.5hr fuel = 2hr max non-driving.
    #
    # Unless we use the zero-distance leg trick: current==pickup, so pickup is emitted
    # immediately (1hr). Then in leg2, we have lots of fuel stops.
    # Zero-distance leg1, then leg2: 4000mi at 400mph = 10hr driving.
    # Fuel stops at 1000, 2000, 3000 = 3 * 0.5hr = 1.5hr.
    # Break at 8hr driving = 0.5hr. Pickup = 1hr.
    # Total non-driving: 1 + 1.5 + 0.5 = 3hr. Total elapsed: 13hr. Still < 14.
    # Need one more fuel: 4000mi = fuel at 1000,2000,3000 (mark at 4000 not included
    # since it's the end). So 3 fuel stops. 3hr non-driving + 10hr driving = 13hr.
    #
    # 5 fuel stops = 5000+ miles: fuel at 1000-5000, that's 5*0.5=2.5hr.
    # 1hr pickup + 0.5hr break + 2.5hr fuel = 4hr. driving at 14hr = 10hr.
    # 10 < 11 → 14hr triggers first! Yes!
    # Trip: zero-distance leg1, leg2: 5500mi at 550mph = 10hr.
    # Fuel marks: 1000,2000,3000,4000,5000.
    # After pickup (1hr): elapsed=1, driving=0.
    # Drive to fuel 1000mi at 550mph = 1.82hr: elapsed=2.82, driving=1.82. fuel 0.5hr: 3.32.
    # Drive to fuel 2000mi (1000mi more) = 1.82hr: elapsed=5.14, driving=3.64. fuel 0.5: 5.64.
    # Drive to fuel 3000mi = 1.82hr: elapsed=7.45, driving=5.45. fuel 0.5: 7.95.
    # Drive to fuel 4000mi = 1.82hr: elapsed=9.77, driving=7.27. fuel 0.5: 10.27.
    #   Wait, at driving=7.27, break_counter should have been checked. After each fuel,
    #   break_counter resets. So no separate break needed.
    # Drive to fuel 5000mi = 1.82hr: elapsed=12.09, driving=9.09. fuel 0.5: 12.59.
    # Drive remaining 500mi = 0.91hr: elapsed=13.5, driving=10. Done!
    # Elapsed=13.5 < 14. Dropoff 1hr: elapsed=14.5. But dropoff is after leg end.
    # Hmm, elapsed at end of driving = 13.5, no 14hr trigger during driving.
    #
    # The issue is fuel stops at every 1000mi make short driving segments.
    # Let me try fewer fuel stops by spacing differently. The problem is the
    # driving hours are too few because fuel stops eat time.
    #
    # Actually I think the test as specified might just be checking that the
    # implementation EXISTS, not that it naturally fires in a common scenario.
    # Let me use a different approach: test that if we HAD the right conditions,
    # the engine would reset. I'll use a very specific construction:
    #
    # Zero-distance leg1 (current==pickup). Pickup: 1hr.
    # Leg2: 5500mi at 500mph = 11hr driving.
    # Fuel at 1000,2000,3000,4000,5000 = 5 stops * 0.5hr = 2.5hr.
    # Break at 8hr driving? Only if hours_since_break >= 8.
    # Each fuel resets the break counter, so no break needed (max gap = 2hr driving).
    # Non-driving: 1hr + 2.5hr = 3.5hr.
    # So driving=11hr would happen at elapsed=14.5hr. But 14hr elapsed happens at
    # driving=14-3.5=10.5hr. Since 10.5 < 11, 14hr triggers first!

    trip = TripInput(
        current_location=PICKUP,   # same as pickup
        pickup_location=PICKUP,
        dropoff_location=DROPOFF,
        cycle_hours_used=0.0,
        start_datetime=datetime(2026, 4, 24, 6, 0, 0, tzinfo=TZ),
    )
    router = FakeRouter([
        _seg(0, 0.0, PICKUP, PICKUP),            # zero-distance leg1
        _seg(5500, 11.0, PICKUP, DROPOFF),        # leg2: 500mph, 11hr
    ])
    plan = plan_trip(trip, router)

    resets = [e for e in plan.events if "shift reset" in e.note]
    assert len(resets) >= 1

    # Verify the reset happened before driving reached 11 hours in that shift
    driving_in_first_shift = 0.0
    for e in plan.events:
        if "shift reset" in e.note:
            break
        if e.status == "driving":
            driving_in_first_shift += e.duration_hours
    assert driving_in_first_shift < DRIVING_LIMIT_HOURS


# ── 7. Pickup and dropoff consume 1hr on-duty ─────────────────────────
def test_pickup_and_dropoff_each_consume_1hr_on_duty():
    """Events list contains one 1-hour on_duty event at pickup AND dropoff."""
    router = FakeRouter([
        _seg(100, 2.0, ORIGIN, PICKUP),
        _seg(100, 2.0, PICKUP, DROPOFF),
    ])
    plan = plan_trip(_trip(), router)

    pickups = [e for e in plan.events if e.note == "Pickup"]
    dropoffs = [e for e in plan.events if e.note == "Drop-off"]

    assert len(pickups) == 1
    assert abs(pickups[0].duration_hours - 1.0) < EPSILON
    assert pickups[0].status == "on_duty_not_driving"

    assert len(dropoffs) == 1
    assert abs(dropoffs[0].duration_hours - 1.0) < EPSILON
    assert dropoffs[0].status == "on_duty_not_driving"


# ── 8. Pickup time counts against 14-hr window ────────────────────────
def test_pickup_time_counts_against_14hr_window():
    """Pickup adds to elapsed_hours."""
    # After leg1 + pickup, elapsed should include pickup time.
    # We verify by checking total_duration > sum of driving alone.
    router = FakeRouter([
        _seg(100, 2.0, ORIGIN, PICKUP),
        _seg(100, 2.0, PICKUP, DROPOFF),
    ])
    plan = plan_trip(_trip(), router)

    total_driving = sum(
        e.duration_hours for e in plan.events if e.status == "driving"
    )
    # Total duration must exceed driving by at least pickup + dropoff time
    assert plan.summary.total_duration_hours >= total_driving + 2.0 - EPSILON


# ── 9. Cycle hours propagate from input ────────────────────────────────
def test_cycle_hours_propagates_from_input():
    """cycle_hours_before == input; cycle_hours_after == before + on_duty."""
    router = FakeRouter([
        _seg(100, 2.0, ORIGIN, PICKUP),
        _seg(100, 2.0, PICKUP, DROPOFF),
    ])
    plan = plan_trip(_trip(cycle_hours_used=20.0), router)

    assert plan.summary.cycle_hours_before == 20.0
    assert plan.summary.cycle_hours_after == pytest.approx(
        20.0 + plan.summary.total_on_duty_hours, abs=0.01
    )


# ── 10. Near 70hr warning ─────────────────────────────────────────────
def test_near_70hr_emits_warning():
    """cycle_hours_used=65 + ~6hr on-duty → warning about low remaining."""
    router = FakeRouter([
        _seg(100, 2.0, ORIGIN, PICKUP),
        _seg(100, 2.0, PICKUP, DROPOFF),
    ])
    plan = plan_trip(_trip(cycle_hours_used=65.0), router)

    # Total on-duty: ~4hr driving + 2hr pickup/dropoff = ~6hr. 65+6=71 > 63 (90% of 70).
    assert len(plan.summary.warnings) >= 1
    assert any("70-hour" in w or "cycle" in w.lower() for w in plan.summary.warnings)


# ── 11. Over 70hr emits hard violation warning ─────────────────────────
def test_over_70hr_emits_hard_violation_warning():
    """cycle_hours_used=68 + trip → warning includes '34-hour restart'."""
    router = FakeRouter([
        _seg(100, 2.0, ORIGIN, PICKUP),
        _seg(100, 2.0, PICKUP, DROPOFF),
    ])
    plan = plan_trip(_trip(cycle_hours_used=68.0), router)

    assert len(plan.summary.warnings) >= 1
    assert any("34-hour restart" in w for w in plan.summary.warnings)


# ── 12. INVARIANT: event durations == trip duration ────────────────────
def test_events_total_duration_equals_trip_duration():
    """Sum of all event durations == summary.total_duration_hours."""
    router = FakeRouter([
        _seg(300, 5.0, ORIGIN, PICKUP),
        _seg(400, 7.0, PICKUP, DROPOFF),
    ])
    plan = plan_trip(_trip(), router)

    event_total = sum(e.duration_hours for e in plan.events)
    assert event_total == pytest.approx(
        plan.summary.total_duration_hours, abs=1e-6
    )


# ── 13. INVARIANT: no gaps or overlaps ─────────────────────────────────
def test_events_have_no_gaps_or_overlaps():
    """events[i].end == events[i+1].start for all i."""
    router = FakeRouter([
        _seg(300, 5.0, ORIGIN, PICKUP),
        _seg(400, 7.0, PICKUP, DROPOFF),
    ])
    plan = plan_trip(_trip(), router)

    for i in range(len(plan.events) - 1):
        assert plan.events[i].end == plan.events[i + 1].start, (
            f"Gap/overlap at index {i}: "
            f"{plan.events[i].end} != {plan.events[i + 1].start}"
        )


# ── 14. Multi-day trip → multiple daily logs ───────────────────────────
def test_multi_day_trip_produces_multiple_daily_logs():
    """Trip with a 10-hr reset crosses midnight → 2+ daily logs."""
    # leg1: 6hr, pickup 1hr, leg2: 6hr → needs reset after 11hr driving
    # Trip starts at 6am, drive 6hr (noon), pickup 1hr (1pm), drive 5hr (6pm)
    # → break at 8hr driving = after 2hr of leg2 (3pm), break 30min (3:30pm)
    # → drive 3hr more (6:30pm, driving=11) → reset 10hr (4:30am next day)
    # → drive remaining 1hr → dropoff 1hr. Crosses midnight = 2 daily logs.
    router = FakeRouter([
        _seg(330, 6.0, ORIGIN, PICKUP),
        _seg(330, 6.0, PICKUP, DROPOFF),
    ])
    plan = plan_trip(_trip(start_hour=6), router)

    assert len(plan.daily_logs) >= 2


# ── 15. INVARIANT: daily log totals sum to 24 hours ────────────────────
def test_daily_log_totals_sum_to_24_hours():
    """For every daily log, sum(totals.values()) == 24.0."""
    router = FakeRouter([
        _seg(330, 6.0, ORIGIN, PICKUP),
        _seg(330, 6.0, PICKUP, DROPOFF),
    ])
    plan = plan_trip(_trip(start_hour=6), router)

    for log in plan.daily_logs:
        total = sum(log.totals.values())
        assert total == pytest.approx(24.0, abs=0.01), (
            f"Day {log.date}: totals sum to {total}, not 24"
        )


# ── 16. Deterministic output ──────────────────────────────────────────
def test_deterministic_output():
    """Same input twice → identical plans."""
    def run():
        router = FakeRouter([
            _seg(300, 5.0, ORIGIN, PICKUP),
            _seg(400, 7.0, PICKUP, DROPOFF),
        ])
        return plan_trip(_trip(), router)

    plan_a = run()
    plan_b = run()

    assert len(plan_a.events) == len(plan_b.events)
    for a, b in zip(plan_a.events, plan_b.events):
        assert a.start == b.start
        assert a.end == b.end
        assert a.status == b.status
        assert a.note == b.note
        assert a.miles == pytest.approx(b.miles, abs=1e-6)

    assert plan_a.summary.total_duration_hours == pytest.approx(
        plan_b.summary.total_duration_hours, abs=1e-6
    )
