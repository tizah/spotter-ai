import {
  Paper,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Box,
} from '@mui/material';
import type { DutyEvent } from '../types';

const STATUS_COLORS: Record<string, 'success' | 'primary' | 'warning' | 'default'> = {
  driving: 'success',
  on_duty_not_driving: 'primary',
  off_duty: 'default',
  sleeper_berth: 'warning',
};

const STATUS_ICONS: Record<string, string> = {
  driving: 'D',
  on_duty_not_driving: 'ON',
  off_duty: 'OFF',
  sleeper_berth: 'SB',
};

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function fmtDuration(ev: DutyEvent): string {
  const ms = new Date(ev.end).getTime() - new Date(ev.start).getTime();
  const hrs = ms / 3_600_000;
  const h = Math.floor(hrs);
  const m = Math.round((hrs - h) * 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function statusLabel(status: string): string {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

interface Props {
  events: DutyEvent[];
}

export default function EventTimeline({ events }: Props) {
  return (
    <Paper sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>
        Event Timeline
      </Typography>
      <TableContainer sx={{ maxHeight: 480 }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 600 }}>Time</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Duration</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Note</TableCell>
              <TableCell sx={{ fontWeight: 600 }} align="right">Miles</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {events.map((ev, i) => (
              <TableRow
                key={i}
                sx={{
                  '&:last-child td': { borderBottom: 0 },
                  bgcolor: ev.status === 'driving' ? 'rgba(22,163,74,0.04)' : undefined,
                }}
              >
                <TableCell sx={{ whiteSpace: 'nowrap' }}>{fmtTime(ev.start)}</TableCell>
                <TableCell>{fmtDuration(ev)}</TableCell>
                <TableCell>
                  <Chip
                    label={
                      <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <Box
                          component="span"
                          sx={{
                            fontWeight: 700,
                            fontSize: '0.65rem',
                            opacity: 0.7,
                          }}
                        >
                          {STATUS_ICONS[ev.status] ?? ''}
                        </Box>
                        {statusLabel(ev.status)}
                      </Box>
                    }
                    size="small"
                    color={STATUS_COLORS[ev.status] ?? 'default'}
                    variant="outlined"
                  />
                </TableCell>
                <TableCell>{ev.note}</TableCell>
                <TableCell align="right">
                  {ev.miles > 0 ? `${Math.round(ev.miles)}` : '—'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );
}
