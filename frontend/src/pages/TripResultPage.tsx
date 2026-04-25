import { useRef, useState, useCallback } from 'react';
import {
  Stack,
  Button,
  ButtonGroup,
  Typography,
  Alert,
  CircularProgress,
  Paper,
  Box,
} from '@mui/material';
import Grid from '@mui/material/Grid2';
import DownloadIcon from '@mui/icons-material/Download';
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera';
import PrintIcon from '@mui/icons-material/Print';
import type { TripPlan } from '../types';
import MapView from '../components/MapView';
import EventTimeline from '../components/EventTimeline';
import CycleBar from '../components/CycleBar';
import LogSheet from '../components/LogSheet';
import {
  downloadAllLogSheetsPdf,
  downloadAllLogSheetsPng,
} from '../utils/download';
import { shortLabel } from '../utils/geo';

function fmt(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

interface Props {
  plan: TripPlan;
}

function StatTile({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <Paper sx={{ p: 2, textAlign: 'center' }}>
      <Typography
        variant="caption"
        sx={{
          color: 'text.secondary',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          fontWeight: 600,
        }}
      >
        {label}
      </Typography>
      <Box sx={{ mt: 0.5 }}>
        <Typography
          component="span"
          sx={{ fontSize: '1.5rem', fontWeight: 700, lineHeight: 1.2 }}
        >
          {value}
        </Typography>
        {unit && (
          <Typography
            component="span"
            sx={{ fontSize: '0.875rem', color: 'text.secondary', ml: 0.5 }}
          >
            {unit}
          </Typography>
        )}
      </Box>
    </Paper>
  );
}

export default function TripResultPage({ plan }: Props) {
  const logSheetRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pngLoading, setPngLoading] = useState(false);

  const setLogSheetRef = useCallback(
    (index: number) => (el: HTMLDivElement | null) => {
      if (el) {
        logSheetRefs.current.set(index, el);
      } else {
        logSheetRefs.current.delete(index);
      }
    },
    [],
  );

  const handleDownloadPdf = async () => {
    const elements: HTMLElement[] = [];
    for (let i = 0; i < plan.daily_logs.length; i++) {
      const el = logSheetRefs.current.get(i);
      if (el) elements.push(el);
    }
    if (elements.length === 0) return;

    setPdfLoading(true);
    try {
      await downloadAllLogSheetsPdf(elements, `trip-${shortId}-all-logs.pdf`);
    } finally {
      setPdfLoading(false);
    }
  };

  const handleDownloadAllPng = async () => {
    const elements: HTMLElement[] = [];
    for (let i = 0; i < plan.daily_logs.length; i++) {
      const el = logSheetRefs.current.get(i);
      if (el) elements.push(el);
    }
    if (elements.length === 0) return;

    setPngLoading(true);
    try {
      await downloadAllLogSheetsPng(elements, `trip-${shortId}`, plan.daily_logs.length);
    } finally {
      setPngLoading(false);
    }
  };

  const { summary, input } = plan;
  const shortId = plan.id.slice(0, 8);
  const { cycle_hours_remaining, warnings } = summary;
  const showBanner = cycle_hours_remaining < 10 || warnings.length > 0;
  const bannerSeverity = cycle_hours_remaining < 5 ? 'error' : 'warning';

  return (
    <Stack spacing={3}>
      {showBanner && (
        <Alert
          severity={bannerSeverity}
          variant="filled"
          className="no-print"
        >
          {cycle_hours_remaining < 10 && (
            <>
              Only <strong>{cycle_hours_remaining.toFixed(1)}</strong> hours
              remaining in your 70-hour/8-day cycle.
              {cycle_hours_remaining < 5
                ? ' You are critically low — plan a 34-hour restart soon.'
                : ' Consider scheduling a reset before your next trip.'}
            </>
          )}
          {warnings.length > 0 && (
            <>
              {cycle_hours_remaining < 10 && <br />}
              {warnings.map((w, i) => (
                <span key={i}>
                  {i > 0 && <br />}
                  {w}
                </span>
              ))}
            </>
          )}
        </Alert>
      )}

      {/* One-sentence summary */}
      <Typography variant="body1" color="text.secondary">
        This {Math.round(summary.total_distance_miles).toLocaleString()} mi trip from{' '}
        {shortLabel(input.current_location.label)} to {shortLabel(input.dropoff_location.label)} via{' '}
        {shortLabel(input.pickup_location.label)} will take {fmt(summary.total_duration_hours)} and use{' '}
        {summary.total_on_duty_hours.toFixed(1)} hours of your 70-hour cycle.
      </Typography>

      {/* Stat grid */}
      <Grid container spacing={2}>
        <Grid size={{ xs: 6, md: 4 }}>
          <StatTile
            label="Total Distance"
            value={Math.round(summary.total_distance_miles).toLocaleString()}
            unit="mi"
          />
        </Grid>
        <Grid size={{ xs: 6, md: 4 }}>
          <StatTile label="Total Time" value={fmt(summary.total_duration_hours)} />
        </Grid>
        <Grid size={{ xs: 6, md: 4 }}>
          <StatTile label="Driving Time" value={fmt(summary.total_driving_hours)} />
        </Grid>
        <Grid size={{ xs: 6, md: 4 }}>
          <StatTile label="On-Duty Time" value={fmt(summary.total_on_duty_hours)} />
        </Grid>
        <Grid size={{ xs: 6, md: 4 }}>
          <StatTile
            label="Cycle Before / After"
            value={`${summary.cycle_hours_before.toFixed(1)} \u2192 ${summary.cycle_hours_after.toFixed(1)}`}
            unit="h"
          />
        </Grid>
        <Grid size={{ xs: 6, md: 4 }}>
          <StatTile label="Shifts" value={String(summary.shifts_count)} />
        </Grid>
      </Grid>

      <Grid container spacing={3}>
        {/* Map — left 7/12 on desktop, full width on mobile */}
        <Grid size={{ xs: 12, md: 7 }}>
          <MapView plan={plan} />
        </Grid>

        {/* Cycle bar + timeline — right 5/12 on desktop, constrained to map height */}
        <Grid size={{ xs: 12, md: 5 }}>
          <Stack spacing={3} sx={{ maxHeight: { md: 600 }, overflow: 'hidden' }}>
            <CycleBar summary={summary} />
            <EventTimeline events={plan.events} maxHeight={380} />
          </Stack>
        </Grid>
      </Grid>

      {/* Driver's Daily Logs */}
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        className="no-print"
      >
        <Typography variant="h3">Driver&apos;s Daily Logs</Typography>
        <ButtonGroup variant="outlined" size="small">
          <Button
            variant="contained"
            startIcon={
              pdfLoading ? <CircularProgress size={18} color="inherit" /> : <DownloadIcon />
            }
            disabled={pdfLoading}
            onClick={handleDownloadPdf}
          >
            PDF
          </Button>
          <Button
            startIcon={
              pngLoading ? <CircularProgress size={18} color="inherit" /> : <PhotoCameraIcon />
            }
            disabled={pngLoading}
            onClick={handleDownloadAllPng}
          >
            PNG
          </Button>
          <Button
            startIcon={<PrintIcon />}
            onClick={() => window.print()}
          >
            Print
          </Button>
        </ButtonGroup>
      </Stack>
      {/* Print-only heading (without buttons) */}
      <Typography variant="h3" sx={{ display: 'none', '@media print': { display: 'block' } }}>
        Driver&apos;s Daily Logs
      </Typography>

      {plan.daily_logs.map((day, i) => (
        <LogSheet
          key={day.date}
          ref={setLogSheetRef(i)}
          day={day}
          dayIndex={i}
          totalDays={plan.daily_logs.length}
          carrier={{ name: 'Demo Carrier Co.', mainOfficeAddress: 'Chicago, IL' }}
          driver={{ fullName: 'Demo Driver' }}
          vehicleNumbers="Tractor 1234 / Trailer 5678"
        />
      ))}
    </Stack>
  );
}
