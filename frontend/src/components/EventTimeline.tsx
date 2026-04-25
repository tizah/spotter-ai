import { useState } from 'react';
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
  Button,
  Stack,
} from '@mui/material';
import type { DutyEvent } from '../types';
import { shortLabel } from '../utils/geo';

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

const COLLAPSED_LIMIT = 8;

function fmtTime(iso: string): string {
  const d = new Date(iso);
  const month = d.toLocaleString(undefined, { month: 'short' });
  const day = d.getDate();
  const time = d.toLocaleString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${month} ${day} \u00b7 ${time}`;
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
  maxHeight?: number;
}

export default function EventTimeline({ events, maxHeight }: Props) {
  const [expanded, setExpanded] = useState(false);
  const showToggle = events.length > COLLAPSED_LIMIT;
  const visibleEvents = expanded ? events : events.slice(0, COLLAPSED_LIMIT);

  return (
    <Paper sx={{ p: 3, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <Stack direction="row" justifyContent="space-between" alignItems="baseline" sx={{ mb: 1 }}>
        <Typography variant="h4">
          Event Timeline
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {events.length} events
        </Typography>
      </Stack>
      <TableContainer sx={{ maxHeight: expanded ? undefined : maxHeight, flex: 1 }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 600 }}>Time</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Duration</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Location</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Note</TableCell>
              <TableCell sx={{ fontWeight: 600 }} align="right">Miles</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {visibleEvents.map((ev, i) => (
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
                <TableCell sx={{ whiteSpace: 'nowrap', color: 'text.secondary', fontSize: '0.75rem' }}>
                  {ev.location ? shortLabel(ev.location.label) : '\u2014'}
                </TableCell>
                <TableCell>{ev.note}</TableCell>
                <TableCell align="right">
                  {ev.miles > 0 ? `${Math.round(ev.miles)}` : '\u2014'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      {showToggle && (
        <Button
          size="small"
          onClick={() => setExpanded(!expanded)}
          sx={{ mt: 1, alignSelf: 'center' }}
        >
          {expanded
            ? 'Collapse'
            : `Show all ${events.length} events`}
        </Button>
      )}
    </Paper>
  );
}
