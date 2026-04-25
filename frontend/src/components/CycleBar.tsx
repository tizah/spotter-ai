import { Paper, Typography, Box, Stack, Tooltip } from '@mui/material';
import type { TripSummary } from '../types';

const CYCLE_LIMIT = 70;

interface Props {
  summary: TripSummary;
}

export default function CycleBar({ summary }: Props) {
  const before = summary.cycle_hours_before;
  const tripUsage = summary.cycle_hours_after - before;
  const remaining = Math.max(0, CYCLE_LIMIT - summary.cycle_hours_after);
  const overLimit = summary.cycle_hours_after > CYCLE_LIMIT;

  const pctBefore = (before / CYCLE_LIMIT) * 100;
  const pctTrip = Math.min((tripUsage / CYCLE_LIMIT) * 100, 100 - pctBefore);
  const pctRemaining = Math.max(0, 100 - pctBefore - pctTrip);

  return (
    <Paper sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>
        70-Hour Cycle Usage
      </Typography>

      {/* Bar */}
      <Box
        sx={{
          height: 32,
          borderRadius: 1,
          overflow: 'hidden',
          display: 'flex',
          bgcolor: 'grey.100',
          border: 1,
          borderColor: 'divider',
        }}
      >
        {pctBefore > 0 && (
          <Tooltip title={`Previously used: ${before.toFixed(1)}h`}>
            <Box
              sx={{
                width: `${pctBefore}%`,
                bgcolor: 'grey.400',
                transition: 'width 0.3s ease',
              }}
            />
          </Tooltip>
        )}
        {pctTrip > 0 && (
          <Tooltip title={`This trip: ${tripUsage.toFixed(1)}h`}>
            <Box
              sx={{
                width: `${pctTrip}%`,
                bgcolor: overLimit ? 'error.main' : 'primary.main',
                transition: 'width 0.3s ease',
              }}
            />
          </Tooltip>
        )}
        {pctRemaining > 0 && (
          <Tooltip title={`Remaining: ${remaining.toFixed(1)}h`}>
            <Box
              sx={{
                width: `${pctRemaining}%`,
                bgcolor: remaining < 10 ? 'warning.light' : 'success.light',
                transition: 'width 0.3s ease',
                opacity: 0.5,
              }}
            />
          </Tooltip>
        )}
      </Box>

      {/* Legend */}
      <Stack direction="row" spacing={3} sx={{ mt: 2, flexWrap: 'wrap' }}>
        <LegendItem color="grey.400" label="Previously used" value={`${before.toFixed(1)}h`} />
        <LegendItem
          color={overLimit ? 'error.main' : 'primary.main'}
          label="This trip"
          value={`${tripUsage.toFixed(1)}h`}
        />
        <LegendItem
          color={remaining < 10 ? 'warning.light' : 'success.light'}
          label="Remaining"
          value={`${remaining.toFixed(1)}h`}
        />
        <Box sx={{ flex: 1 }} />
        <Typography variant="body2" color="text.secondary" sx={{ alignSelf: 'center' }}>
          {summary.cycle_hours_after.toFixed(1)} / {CYCLE_LIMIT}h used
        </Typography>
      </Stack>
    </Paper>
  );
}

function LegendItem({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <Stack direction="row" spacing={1} alignItems="center">
      <Box sx={{ width: 12, height: 12, borderRadius: 0.5, bgcolor: color }} />
      <Typography variant="body2" color="text.secondary">
        {label}:
      </Typography>
      <Typography variant="body2" fontWeight={600}>
        {value}
      </Typography>
    </Stack>
  );
}
