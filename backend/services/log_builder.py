from __future__ import annotations

from datetime import datetime, timedelta, tzinfo

from services.geocoding import to_short_label
from services.types import DailyLog, DutyEvent, DutyStatus, GeoPoint, Remark


def build_daily_logs(
    events: list[DutyEvent], tz: tzinfo | None
) -> list[DailyLog]:
    """Split a list of duty events into per-calendar-day DailyLog entries.

    Events that span midnight are clipped at the boundary and appear in both
    days. Each DailyLog's totals sum to 24 hours (padding with off_duty for
    partial days at the start/end of the trip).
    """
    if not events:
        return []

    # Determine the range of calendar days covered
    first_dt = events[0].start.astimezone(tz) if tz else events[0].start
    last_dt = events[-1].end.astimezone(tz) if tz else events[-1].end

    first_date = first_dt.date()
    last_date = last_dt.date()
    # If the last event ends exactly at midnight, it belongs to the previous day
    if last_dt.hour == 0 and last_dt.minute == 0 and last_dt.second == 0:
        last_date = (last_dt - timedelta(seconds=1)).date()

    days: list[DailyLog] = []
    current_date = first_date

    while current_date <= last_date:
        # Midnight boundaries for this calendar day
        day_start = datetime(
            current_date.year,
            current_date.month,
            current_date.day,
            tzinfo=tz,
        )
        day_end = day_start + timedelta(days=1)

        clipped_events: list[DutyEvent] = []
        remarks: list[Remark] = []
        total_miles = 0.0

        for ev in events:
            # Check overlap with this calendar day
            ev_start = ev.start
            ev_end = ev.end
            if ev_end <= day_start or ev_start >= day_end:
                continue

            # Clip to day boundaries
            clip_start = max(ev_start, day_start)
            clip_end = min(ev_end, day_end)

            if clip_end <= clip_start:
                continue

            # Compute proportional miles for driving events
            ev_dur = (ev_end - ev_start).total_seconds()
            clip_dur = (clip_end - clip_start).total_seconds()
            frac = clip_dur / ev_dur if ev_dur > 0 else 0.0
            clip_miles = ev.miles * frac if ev.status == "driving" else 0.0

            clipped_events.append(
                DutyEvent(
                    start=clip_start,
                    end=clip_end,
                    status=ev.status,
                    note=ev.note,
                    location=ev.location,
                    miles=clip_miles,
                )
            )

            total_miles += clip_miles

            # Track location changes for remarks — emit at every
            # status transition that has a location within this day
            if ev.location:
                short = to_short_label(ev.location.label)
                # Avoid duplicate remarks at the same time + location
                dup = any(
                    r.time == clip_start and r.location.label == short
                    for r in remarks
                )
                if not dup:
                    remarks.append(
                        Remark(
                            time=clip_start,
                            location=GeoPoint(
                                lat=ev.location.lat,
                                lon=ev.location.lon,
                                label=short,
                            ),
                        )
                    )

        # Compute totals per status
        totals: dict[DutyStatus, float] = {
            "off_duty": 0.0,
            "sleeper_berth": 0.0,
            "driving": 0.0,
            "on_duty_not_driving": 0.0,
        }
        for ev in clipped_events:
            totals[ev.status] += ev.duration_hours

        # Pad with off_duty to reach 24 hours
        accounted = sum(totals.values())
        remainder = 24.0 - accounted
        if remainder > 1e-9:
            totals["off_duty"] += remainder

        days.append(
            DailyLog(
                date=current_date.isoformat(),
                events=clipped_events,
                totals=totals,
                total_miles=total_miles,
                remarks=remarks,
            )
        )

        current_date += timedelta(days=1)

    return days
