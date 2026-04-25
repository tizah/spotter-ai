import { useRef, useState, useCallback } from 'react';
import {
  Stack,
  Button,
  Typography,
  Alert,
  CircularProgress,
} from '@mui/material';
import Grid from '@mui/material/Grid2';
import DownloadIcon from '@mui/icons-material/Download';
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera';
import type { TripPlan } from '../types';
import SummaryCard from '../components/SummaryCard';
import MapView from '../components/MapView';
import EventTimeline from '../components/EventTimeline';
import CycleBar from '../components/CycleBar';
import LogSheet from '../components/LogSheet';
import {
  downloadLogSheetPng,
  downloadAllLogSheetsPdf,
} from '../utils/download';

interface Props {
  plan: TripPlan;
  onReset: () => void;
}

export default function TripResultPage({ plan, onReset }: Props) {
  const logSheetRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pngLoading, setPngLoading] = useState<number | null>(null);

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
      await downloadAllLogSheetsPdf(elements, 'daily-logs.pdf');
    } finally {
      setPdfLoading(false);
    }
  };

  const handleDownloadPng = async (index: number, date: string) => {
    const el = logSheetRefs.current.get(index);
    if (!el) return;

    setPngLoading(index);
    try {
      await downloadLogSheetPng(el, `log-${date}.png`);
    } finally {
      setPngLoading(null);
    }
  };

  const { cycle_hours_remaining, warnings } = plan.summary;
  const showBanner = cycle_hours_remaining < 10 || warnings.length > 0;
  const bannerSeverity = cycle_hours_remaining < 5 ? 'error' : 'warning';

  return (
    <Stack spacing={3}>
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Typography variant="h2">Trip Plan</Typography>
        <Button variant="outlined" onClick={onReset}>New trip</Button>
      </Stack>

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

      <SummaryCard summary={plan.summary} />

      <Grid container spacing={3}>
        {/* Map — left 7/12 on desktop, full width on mobile */}
        <Grid size={{ xs: 12, md: 7 }}>
          <MapView plan={plan} />
        </Grid>

        {/* Cycle bar + timeline — right 5/12 on desktop */}
        <Grid size={{ xs: 12, md: 5 }}>
          <Stack spacing={3}>
            <CycleBar summary={plan.summary} />
            <EventTimeline events={plan.events} />
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
        <Button
          variant="contained"
          startIcon={
            pdfLoading ? <CircularProgress size={18} color="inherit" /> : <DownloadIcon />
          }
          disabled={pdfLoading}
          onClick={handleDownloadPdf}
        >
          Download All (PDF)
        </Button>
      </Stack>
      {/* Print-only heading (without buttons) */}
      <Typography variant="h3" sx={{ display: 'none', '@media print': { display: 'block' } }}>
        Driver&apos;s Daily Logs
      </Typography>

      {plan.daily_logs.map((day, i) => (
        <Stack key={day.date} spacing={1}>
          <Button
            size="small"
            variant="text"
            className="no-print"
            startIcon={
              pngLoading === i
                ? <CircularProgress size={16} color="inherit" />
                : <PhotoCameraIcon fontSize="small" />
            }
            disabled={pngLoading === i}
            onClick={() => handleDownloadPng(i, day.date)}
            sx={{ alignSelf: 'flex-end' }}
          >
            Save as PNG
          </Button>
          <LogSheet
            ref={setLogSheetRef(i)}
            day={day}
            carrier={{ name: 'Spotter Demo Carrier', mainOfficeAddress: 'Chicago, IL' }}
            driver={{ fullName: 'Demo Driver' }}
            vehicleNumbers="Tractor 1234 / Trailer 5678"
          />
        </Stack>
      ))}
    </Stack>
  );
}
