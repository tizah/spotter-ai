export type DutyStatus =
  | 'off_duty'
  | 'sleeper_berth'
  | 'driving'
  | 'on_duty_not_driving';

export interface GeoPoint {
  lat: number;
  lon: number;
  label: string;
}

export interface RouteSegment {
  start: GeoPoint;
  end: GeoPoint;
  distance_miles: number;
  duration_hours: number;
  polyline: [number, number][];
}

export interface DutyEvent {
  start: string;
  end: string;
  status: DutyStatus;
  note: string;
  location: GeoPoint | null;
  miles: number;
}

export interface DailyLog {
  date: string;
  events: DutyEvent[];
  totals: Record<DutyStatus, number>;
  total_miles: number;
  remarks: { time: string; location: GeoPoint }[];
}

export interface TripSummary {
  total_distance_miles: number;
  total_duration_hours: number;
  total_driving_hours: number;
  total_on_duty_hours: number;
  cycle_hours_before: number;
  cycle_hours_after: number;
  cycle_hours_remaining: number;
  shifts_count: number;
  warnings: string[];
}

export interface TripPlan {
  id: string;
  input: {
    current_location: GeoPoint;
    pickup_location: GeoPoint;
    dropoff_location: GeoPoint;
    cycle_hours_used: number;
    start_datetime: string;
  };
  segments: RouteSegment[];
  events: DutyEvent[];
  daily_logs: DailyLog[];
  summary: TripSummary;
}
