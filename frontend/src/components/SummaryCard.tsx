import { Paper, Typography, Stack, Divider, Alert, Chip } from '@mui/material';
import type { TripSummary } from '../types';

function fmt(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

interface Props {
  summary: TripSummary;
}

export default function SummaryCard({ summary }: Props) {
  return (
    <Paper sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>
        Trip Summary
      </Typography>

      {summary.warnings.map((w, i) => (
        <Alert key={i} severity={w.includes('34-hour') ? 'error' : 'warning'} sx={{ mb: 2 }}>
          {w}
        </Alert>
      ))}

      <Stack spacing={1.5}>
        <Row label="Total distance" value={`${Math.round(summary.total_distance_miles).toLocaleString()} mi`} />
        <Row label="Total time" value={fmt(summary.total_duration_hours)} />
        <Divider />
        <Row label="Driving time" value={fmt(summary.total_driving_hours)} />
        <Row label="On-duty time" value={fmt(summary.total_on_duty_hours)} />
        <Row label="Shifts" value={String(summary.shifts_count)} />
        <Divider />
        <Row label="Cycle before" value={`${summary.cycle_hours_before.toFixed(1)} hr`} />
        <Row label="Cycle after" value={`${summary.cycle_hours_after.toFixed(1)} hr`} />
        <Row
          label="Remaining"
          value={`${summary.cycle_hours_remaining.toFixed(1)} hr`}
          chip={summary.cycle_hours_remaining < 10 ? 'Low' : undefined}
        />
      </Stack>
    </Paper>
  );
}

function Row({ label, value, chip }: { label: string; value: string; chip?: string }) {
  return (
    <Stack direction="row" justifyContent="space-between" alignItems="center">
      <Typography variant="body2" color="text.secondary">{label}</Typography>
      <Stack direction="row" spacing={1} alignItems="center">
        <Typography variant="body1" fontWeight={600}>{value}</Typography>
        {chip && <Chip label={chip} size="small" color="warning" />}
      </Stack>
    </Stack>
  );
}
