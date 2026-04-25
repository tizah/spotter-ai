from __future__ import annotations

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import pytest

from services.log_builder import build_daily_logs
from services.types import DutyEvent, GeoPoint

TZ = ZoneInfo("America/Chicago")
LOC = GeoPoint(lat=41.88, lon=-87.63, label="Chicago")


def _ev(
    start: datetime,
    hours: float,
    status: str = "driving",
    note: str = "",
    miles: float = 0.0,
) -> DutyEvent:
    return DutyEvent(
        start=start,
        end=start + timedelta(hours=hours),
        status=status,  # type: ignore[arg-type]
        note=note,
        location=LOC,
        miles=miles,
    )


def test_single_day_events():
    """Events entirely within one calendar day produce one DailyLog."""
    start = datetime(2026, 4, 24, 8, 0, 0, tzinfo=TZ)
    events = [
        _ev(start, 4.0, "driving", "drive", miles=200.0),
        _ev(start + timedelta(hours=4), 1.0, "on_duty_not_driving", "pickup"),
        _ev(start + timedelta(hours=5), 3.0, "driving", "drive", miles=150.0),
    ]
    logs = build_daily_logs(events, tz=TZ)

    assert len(logs) == 1
    assert logs[0].date == "2026-04-24"
    assert len(logs[0].events) == 3


def test_multi_day_split_at_midnight():
    """Events spanning midnight are split across two daily logs."""
    start = datetime(2026, 4, 24, 20, 0, 0, tzinfo=TZ)  # 8pm
    events = [
        _ev(start, 6.0, "driving", "drive", miles=300.0),  # 8pm to 2am next day
        _ev(start + timedelta(hours=6), 2.0, "off_duty", "rest"),
    ]
    logs = build_daily_logs(events, tz=TZ)

    assert len(logs) == 2
    assert logs[0].date == "2026-04-24"
    assert logs[1].date == "2026-04-25"

    # First day: 8pm to midnight = 4 hours of the driving event
    day1_driving = sum(
        e.duration_hours for e in logs[0].events if e.status == "driving"
    )
    assert day1_driving == pytest.approx(4.0, abs=0.01)

    # Second day: midnight to 2am = 2 hours driving, then 2 hours rest
    day2_driving = sum(
        e.duration_hours for e in logs[1].events if e.status == "driving"
    )
    assert day2_driving == pytest.approx(2.0, abs=0.01)


def test_totals_sum_to_24_hours():
    """Each daily log's totals must sum to 24 hours."""
    start = datetime(2026, 4, 24, 6, 0, 0, tzinfo=TZ)
    events = [
        _ev(start, 8.0, "driving", "drive", miles=400.0),
        _ev(start + timedelta(hours=8), 1.0, "on_duty_not_driving", "pickup"),
        _ev(start + timedelta(hours=9), 4.0, "driving", "drive", miles=200.0),
        _ev(start + timedelta(hours=13), 10.0, "off_duty", "rest"),
        _ev(start + timedelta(hours=23), 3.0, "driving", "drive", miles=150.0),
    ]
    logs = build_daily_logs(events, tz=TZ)

    for log in logs:
        total = sum(log.totals.values())
        assert total == pytest.approx(24.0, abs=0.01), (
            f"Day {log.date}: totals sum to {total}"
        )


def test_miles_tracked_per_day():
    """Driving miles are correctly attributed to each calendar day."""
    start = datetime(2026, 4, 24, 20, 0, 0, tzinfo=TZ)
    events = [
        _ev(start, 6.0, "driving", "drive", miles=300.0),  # 8pm to 2am
    ]
    logs = build_daily_logs(events, tz=TZ)

    assert len(logs) == 2
    # 4/6 of miles on day 1, 2/6 on day 2
    assert logs[0].total_miles == pytest.approx(200.0, abs=1.0)
    assert logs[1].total_miles == pytest.approx(100.0, abs=1.0)
