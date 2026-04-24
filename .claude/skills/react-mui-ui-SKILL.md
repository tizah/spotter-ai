---
name: react-mui-ui
description: Use this skill whenever the user is creating, modifying, testing, or debugging React + Material UI components in frontend/src/ — the trip form, map view (react-leaflet), event timeline, summary card, cycle hours bar, location autocomplete, or any MUI theme, styling, or layout work. Trigger whenever the user mentions UI, frontend, React, MUI, Material UI, Vite, the form, autocomplete, the map, the timeline, styling, spacing, theming, colors, responsiveness, mobile layout, react-query, react-hook-form, or page layout. Also trigger for anything involving TypeScript types mirroring the backend, loading/error states, accessibility, or interactive polish. The JD explicitly says "Attention to detail: You care about alignment, spacing, and how the app feels to the user" — every styling decision in this project is part of the hiring signal.
---

# React + MUI Frontend Patterns

The frontend is a Vite + React 18 + TypeScript SPA with Material UI v5. It's deliberately small: one primary flow (form → results), a handful of components, no routing library (just conditional rendering). Keep it that way.

## Non-negotiable rules

1. **MUI theme tokens only — no hex codes in components.** `theme.palette.primary.main`, `theme.spacing(2)`, `theme.typography.h6`.
2. **8-point spacing grid.** `theme.spacing(n)` where `n * 8 = pixels`. Use 1 (8px), 2 (16px), 3 (24px), 4 (32px). Never 5px, 11px, 13px.
3. **No `any` without a justification comment.** TypeScript `strict: true`.
4. **No raw `fetch` in components.** All network calls go through react-query hooks in `src/api/`.
5. **No inline style objects.** Use the `sx` prop. `sx={{}}` compiles to a stable className.
6. **Every component has a default export and matching filename.** `TripForm.tsx` exports `TripForm`.
7. **Every interactive element is keyboard-accessible.** Don't wrap native buttons in `<div onClick>`.

## Theme definition

```tsx
// src/theme.ts
import { createTheme } from '@mui/material/styles';

export const theme = createTheme({
  palette: {
    mode: 'light',
    primary:   { main: '#1e40af', light: '#3b82f6', dark: '#1e3a8a', contrastText: '#ffffff' },
    secondary: { main: '#0891b2', light: '#22d3ee', dark: '#155e75' },
    success:   { main: '#16a34a' },
    warning:   { main: '#ea580c' },
    error:     { main: '#dc2626' },
    background: { default: '#f8fafc', paper: '#ffffff' },
    text: { primary: '#0f172a', secondary: '#475569' },
    divider: 'rgba(15, 23, 42, 0.08)',
  },
  shape: { borderRadius: 8 },
  typography: {
    fontFamily: 'Inter, -apple-system, "Segoe UI", Roboto, sans-serif',
    h1: { fontSize: '2.25rem', fontWeight: 700, letterSpacing: '-0.02em' },
    h2: { fontSize: '1.875rem', fontWeight: 700, letterSpacing: '-0.01em' },
    h3: { fontSize: '1.5rem', fontWeight: 600 },
    h4: { fontSize: '1.25rem', fontWeight: 600 },
    body1: { fontSize: '0.9375rem', lineHeight: 1.55 },
    body2: { fontSize: '0.8125rem', lineHeight: 1.55 },
    button: { textTransform: 'none', fontWeight: 600 },
  },
  components: {
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: { root: { borderRadius: 8, paddingInline: 18, paddingBlock: 8 } },
    },
    MuiPaper: { defaultProps: { elevation: 0 }, styleOverrides: { root: { border: '1px solid rgba(15, 23, 42, 0.08)' } } },
    MuiTextField: { defaultProps: { size: 'small', fullWidth: true } },
    MuiCard: { defaultProps: { elevation: 0, variant: 'outlined' } },
  },
});
```

Inter from Google Fonts in `index.html`:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
```

## App shell

```tsx
// src/App.tsx
import { useState } from 'react';
import { ThemeProvider, CssBaseline, Container, AppBar, Toolbar, Typography, Box } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { theme } from './theme';
import { TripFormPage } from './pages/TripFormPage';
import { TripResultPage } from './pages/TripResultPage';
import type { TripPlan } from './types';

const qc = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 1000 * 60 * 5 } },
});

export default function App() {
  const [plan, setPlan] = useState<TripPlan | null>(null);

  return (
    <QueryClientProvider client={qc}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <AppBar position="sticky" color="inherit" elevation={0}
                sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Toolbar>
            <Typography variant="h4" component="h1" sx={{ flex: 1 }}>
              Spotter Trip Planner
            </Typography>
          </Toolbar>
        </AppBar>
        <Container maxWidth="xl" sx={{ py: 3 }}>
          {!plan
            ? <TripFormPage onPlanned={setPlan} />
            : <TripResultPage plan={plan} onReset={() => setPlan(null)} />}
        </Container>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
```

## Types mirror the backend

```tsx
// src/types.ts
export type DutyStatus = 'off_duty' | 'sleeper_berth' | 'driving' | 'on_duty_not_driving';

export interface GeoPoint { lat: number; lon: number; label: string; }

export interface RouteSegment {
  start: GeoPoint; end: GeoPoint;
  distance_miles: number; duration_hours: number;
  polyline: [number, number][];   // [lat, lon]
}

export interface DutyEvent {
  start: string;   // ISO
  end: string;
  status: DutyStatus;
  note: string;
  location: GeoPoint | null;
  miles: number;
}

export interface DailyLog {
  date: string;    // YYYY-MM-DD
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
```

## API client

```tsx
// src/api/client.ts
const BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000';

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const resp = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  });
  if (!resp.ok) {
    const body = await resp.json().catch(() => ({}));
    throw new ApiError(body.error ?? 'request_failed', body.detail ?? resp.statusText, resp.status);
  }
  return resp.json() as Promise<T>;
}

export class ApiError extends Error {
  constructor(public code: string, public detail: string, public status: number) {
    super(`${code}: ${detail}`);
  }
}
```

```tsx
// src/api/trips.ts
import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from './client';
import type { TripPlan } from '../types';

export interface PlanTripInput {
  current_location: { label: string } | { lat: number; lon: number; label?: string };
  pickup_location:  { label: string } | { lat: number; lon: number; label?: string };
  dropoff_location: { label: string } | { lat: number; lon: number; label?: string };
  cycle_hours_used: number;
  start_datetime?: string;
  home_terminal_tz?: string;
}

export function usePlanTrip() {
  return useMutation({
    mutationFn: (input: PlanTripInput) =>
      api<TripPlan>('/api/trips', { method: 'POST', body: JSON.stringify(input) }),
  });
}

export function useTrip(id: string | undefined) {
  return useQuery({
    queryKey: ['trip', id], enabled: !!id,
    queryFn: () => api<TripPlan>(`/api/trips/${id}`),
  });
}
```

## Trip form

Use `react-hook-form` + `zod` for validation. MUI inputs with `{...register()}`.

```tsx
// src/components/TripForm.tsx
import { Stack, Button, TextField, Paper, Typography, Alert } from '@mui/material';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { LocationAutocomplete, type PlaceOption } from './LocationAutocomplete';
import { usePlanTrip } from '../api/trips';
import type { TripPlan } from '../types';

const schema = z.object({
  current_location: z.object({ label: z.string().min(2, 'Required') }).passthrough(),
  pickup_location:  z.object({ label: z.string().min(2, 'Required') }).passthrough(),
  dropoff_location: z.object({ label: z.string().min(2, 'Required') }).passthrough(),
  cycle_hours_used: z.coerce.number().min(0).max(70),
});

type FormValues = z.infer<typeof schema>;

export function TripForm({ onPlanned }: { onPlanned: (p: TripPlan) => void }) {
  const { control, handleSubmit, register, formState: { errors, isSubmitting } } =
    useForm<FormValues>({
      resolver: zodResolver(schema),
      defaultValues: { cycle_hours_used: 0 } as Partial<FormValues>,
    });
  const plan = usePlanTrip();

  const onSubmit = handleSubmit(async (values) => {
    const result = await plan.mutateAsync(values as any);
    onPlanned(result);
  });

  return (
    <Paper sx={{ p: 4, maxWidth: 640, mx: 'auto' }}>
      <Typography variant="h3" gutterBottom>Plan a trip</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Enter the three locations and your cycle hours already used.
        We'll plan rest, fuel, and pickup/dropoff stops under FMCSA 70-hour/8-day rules.
      </Typography>

      <Stack component="form" onSubmit={onSubmit} spacing={3}>
        <Controller name="current_location" control={control}
          render={({ field, fieldState }) => (
            <LocationAutocomplete label="Current location"
              value={field.value as PlaceOption | null} onChange={field.onChange}
              error={!!fieldState.error} helperText={fieldState.error?.message} />
          )} />
        <Controller name="pickup_location" control={control}
          render={({ field, fieldState }) => (
            <LocationAutocomplete label="Pickup location"
              value={field.value as PlaceOption | null} onChange={field.onChange}
              error={!!fieldState.error} helperText={fieldState.error?.message} />
          )} />
        <Controller name="dropoff_location" control={control}
          render={({ field, fieldState }) => (
            <LocationAutocomplete label="Drop-off location"
              value={field.value as PlaceOption | null} onChange={field.onChange}
              error={!!fieldState.error} helperText={fieldState.error?.message} />
          )} />
        <TextField label="Current cycle used (hours)" type="number"
          inputProps={{ min: 0, max: 70, step: 0.5 }}
          helperText="How many hours you've already used in the current 8-day window"
          error={!!errors.cycle_hours_used}
          {...register('cycle_hours_used', { valueAsNumber: true })} />

        {plan.isError && (
          <Alert severity="error">Could not plan trip: {(plan.error as any)?.detail ?? 'unknown error'}</Alert>
        )}

        <Button type="submit" variant="contained" size="large" disabled={isSubmitting}>
          {isSubmitting ? 'Planning…' : 'Plan trip'}
        </Button>
      </Stack>
    </Paper>
  );
}
```

## Location autocomplete

Hits Nominatim directly from the browser. Debounce + AbortController.

```tsx
// src/components/LocationAutocomplete.tsx
import { Autocomplete, TextField, CircularProgress } from '@mui/material';
import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

export interface PlaceOption { label: string; lat: number; lon: number; }

async function searchPlaces(q: string, signal: AbortSignal): Promise<PlaceOption[]> {
  if (q.trim().length < 3) return [];
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('q', q); url.searchParams.set('format', 'json'); url.searchParams.set('limit', '5');
  const r = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error('geocoding_failed');
  const data = await r.json();
  return data.map((row: any) => ({ label: row.display_name, lat: +row.lat, lon: +row.lon }));
}

function useDebounced<T>(value: T, delay = 300): T {
  const [v, setV] = useState(value);
  useMemo(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

interface Props {
  label: string;
  value: PlaceOption | null;
  onChange: (v: PlaceOption | null) => void;
  error?: boolean;
  helperText?: string;
}

export function LocationAutocomplete({ label, value, onChange, error, helperText }: Props) {
  const [input, setInput] = useState('');
  const debounced = useDebounced(input, 350);
  const { data = [], isFetching } = useQuery({
    queryKey: ['places', debounced],
    queryFn: ({ signal }) => searchPlaces(debounced, signal),
    enabled: debounced.length >= 3,
    staleTime: 1000 * 60 * 60,
  });

  return (
    <Autocomplete
      options={data}
      value={value}
      onChange={(_, v) => onChange(v)}
      onInputChange={(_, v) => setInput(v)}
      getOptionLabel={(o) => o.label}
      filterOptions={(x) => x}    // server-side filtering
      loading={isFetching}
      renderInput={(params) => (
        <TextField {...params} label={label} error={error} helperText={helperText}
          InputProps={{ ...params.InputProps,
            endAdornment: <>{isFetching ? <CircularProgress size={18} /> : null}{params.InputProps.endAdornment}</>,
          }} />
      )}
    />
  );
}
```

## Results page layout

Two columns on desktop (map left, details right), stacked on mobile:

```tsx
// src/pages/TripResultPage.tsx
import { Grid, Stack, Button, Typography } from '@mui/material';
import type { TripPlan } from '../types';
import { MapView } from '../components/MapView';
import { SummaryCard } from '../components/SummaryCard';
import { CycleBar } from '../components/CycleBar';
import { EventTimeline } from '../components/EventTimeline';
import { LogSheet } from '../components/LogSheet';

export function TripResultPage({ plan, onReset }: { plan: TripPlan; onReset: () => void }) {
  return (
    <Stack spacing={3}>
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Typography variant="h2">Trip plan</Typography>
        <Button variant="outlined" onClick={onReset}>New trip</Button>
      </Stack>

      <Grid container spacing={3}>
        <Grid item xs={12} md={7}>
          <MapView plan={plan} />
        </Grid>
        <Grid item xs={12} md={5}>
          <Stack spacing={3}>
            <SummaryCard summary={plan.summary} />
            <CycleBar before={plan.summary.cycle_hours_before} after={plan.summary.cycle_hours_after} limit={70} />
            <EventTimeline events={plan.events} />
          </Stack>
        </Grid>
      </Grid>

      <Typography variant="h3">Daily logs</Typography>
      <Stack spacing={3}>
        {plan.daily_logs.map((day) => (
          <LogSheet key={day.date} day={day}
            carrier={{ name: 'Spotter Demo Carrier', mainOfficeAddress: 'Chicago, IL' }}
            driver={{ fullName: 'Demo Driver' }}
            vehicleNumbers="Tractor 1234 / Trailer 5678"
            homeTerminalTimezone="America/Chicago" />
        ))}
      </Stack>
    </Stack>
  );
}
```

## MapView

```tsx
// src/components/MapView.tsx
import { Paper, Box } from '@mui/material';
import { MapContainer, TileLayer, Polyline, Marker, Popup } from 'react-leaflet';
import { useMemo } from 'react';
import type { TripPlan, DutyEvent } from '../types';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix default icon paths (Vite quirk)
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const COLORS = { leg1: '#1e40af', leg2: '#0891b2' };

export function MapView({ plan }: { plan: TripPlan }) {
  const bounds = useMemo(() => {
    const pts = plan.segments.flatMap((s) => s.polyline);
    if (pts.length === 0) return undefined;
    return L.latLngBounds(pts.map(([a, b]) => L.latLng(a, b))).pad(0.1);
  }, [plan]);

  const stopMarkers: DutyEvent[] = plan.events.filter(
    (e) => e.status !== 'driving' && e.location
  );

  return (
    <Paper sx={{ overflow: 'hidden', height: { xs: 400, md: 600 } }}>
      <Box sx={{ height: '100%', '& .leaflet-container': { height: '100%', width: '100%' } }}>
        <MapContainer bounds={bounds} scrollWheelZoom={false}>
          <TileLayer
            attribution='&copy; <a href="https://osm.org/copyright">OpenStreetMap</a>'
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
          {plan.segments.map((seg, i) => (
            <Polyline key={i} positions={seg.polyline}
              pathOptions={{ color: i === 0 ? COLORS.leg1 : COLORS.leg2, weight: 5, opacity: 0.85 }} />
          ))}
          {stopMarkers.map((ev, i) => (
            <Marker key={i} position={[ev.location!.lat, ev.location!.lon]}>
              <Popup>
                <strong>{ev.note}</strong><br />
                {new Date(ev.start).toLocaleString()} — {ev.duration_hours?.toFixed(1) ?? ''} hr<br />
                <em>{ev.status.replace(/_/g, ' ')}</em>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </Box>
    </Paper>
  );
}
```

## CycleBar — the component that signals senior craft

```tsx
// src/components/CycleBar.tsx
import { Paper, Stack, Typography, Box } from '@mui/material';

interface Props { before: number; after: number; limit: number; }

export function CycleBar({ before, after, limit }: Props) {
  const addedByTrip = Math.max(0, after - before);
  const overLimit = after > limit;
  const pctExisting = Math.min(100, (before / limit) * 100);
  const pctAdded    = Math.min(100 - pctExisting, (addedByTrip / limit) * 100);
  const remaining   = Math.max(0, limit - after);

  return (
    <Paper sx={{ p: 3 }}>
      <Stack spacing={1.5}>
        <Stack direction="row" justifyContent="space-between" alignItems="baseline">
          <Typography variant="h4">70-Hour Cycle</Typography>
          <Typography variant="body2" color={overLimit ? 'error.main' : 'text.secondary'}>
            {after.toFixed(1)} / {limit} hr
          </Typography>
        </Stack>
        <Box sx={{ height: 16, borderRadius: 1, overflow: 'hidden', bgcolor: 'grey.100', display: 'flex' }}>
          <Box sx={{ width: `${pctExisting}%`, bgcolor: 'error.main' }} />
          <Box sx={{ width: `${pctAdded}%`, bgcolor: 'warning.main' }} />
        </Box>
        <Stack direction="row" spacing={3}>
          <Legend color="error.main"   label="Already used"  value={`${before.toFixed(1)} hr`} />
          <Legend color="warning.main" label="This trip"     value={`+${addedByTrip.toFixed(1)} hr`} />
          <Legend color="grey.300"     label="Remaining"     value={`${remaining.toFixed(1)} hr`} />
        </Stack>
      </Stack>
    </Paper>
  );
}

function Legend({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <Stack direction="row" spacing={1} alignItems="center">
      <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: color }} />
      <Typography variant="body2" color="text.secondary">{label}</Typography>
      <Typography variant="body2" fontWeight={600}>{value}</Typography>
    </Stack>
  );
}
```

## Responsive behavior

- Desktop (`md+`): two-column layout, map left 7/12, details right 5/12
- Tablet (`sm`): map on top, details below, full-width
- Mobile (`xs`): same as tablet but with reduced map height (400px)
- Form is always single-column, `maxWidth: 640`, centered

Avoid fixed pixel widths — use `Grid` with breakpoints and `sx={{ maxWidth }}` on cards.

## Loading and error states

Every async surface has three states: loading, error, success. Never leave a page blank:

```tsx
if (plan.isPending) return <CircularProgress />;
if (plan.isError) return <Alert severity="error">...</Alert>;
return <TripResultPage plan={plan.data} />;
```

For the first submission with a cold Render backend, the POST can take 20-30s. Add a helpful toast:

```tsx
useEffect(() => {
  if (plan.isPending) {
    const t = setTimeout(() => setShowColdStart(true), 3000);
    return () => clearTimeout(t);
  }
  setShowColdStart(false);
}, [plan.isPending]);

{showColdStart && plan.isPending && (
  <Alert severity="info">Warming up the server — first request can take ~30s on the free tier.</Alert>
)}
```

## Accessibility checklist

- Every form input has a visible label (MUI handles this when you pass `label` prop)
- Error messages are announced via `helperText` + `aria-invalid` (MUI handles)
- Map has an accessible fallback: a readable text summary of the route near the map
- Color is never the only carrier of meaning (CycleBar uses position + labels too)
- Focus rings are visible — don't override MUI's focus styles
- `<LogSheet>` SVG has `role="img"` and a descriptive `aria-label`

## Testing

```tsx
// src/components/__tests__/CycleBar.test.tsx
import { render, screen } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { theme } from '../../theme';
import { CycleBar } from '../CycleBar';

function wrap(ui: React.ReactElement) {
  return <ThemeProvider theme={theme}>{ui}</ThemeProvider>;
}

test('shows remaining hours', () => {
  render(wrap(<CycleBar before={40} after={55} limit={70} />));
  expect(screen.getByText('15.0 hr')).toBeInTheDocument();    // remaining
  expect(screen.getByText('+15.0 hr')).toBeInTheDocument();   // this trip
});

test('applies error color when over limit', () => {
  render(wrap(<CycleBar before={60} after={75} limit={70} />));
  const display = screen.getByText(/75\.0 \/ 70/);
  // assert error color — exact assertion depends on your approach
});
```

## Common pitfalls

- **Leaflet CSS not imported.** The map renders with broken tiles. Add `import 'leaflet/dist/leaflet.css'` once, in `MapView.tsx` or `main.tsx`.
- **Leaflet default marker icon 404s under Vite.** Use the `mergeOptions` workaround shown in MapView above.
- **Autocomplete firing too many requests.** Always debounce (~300-400ms) and enable the query only when input is ≥ 3 chars.
- **`Grid item` deprecation warnings in MUI v6.** On MUI v5 use the API above; if upgrading, switch to the new `<Grid size={{ xs: 12, md: 7 }}>` syntax.
- **`text-transform: uppercase` on buttons.** Global override in theme (`textTransform: 'none'`) — don't let individual buttons revert.
- **Over-nesting `<Stack>`.** Each Stack is a flex container; nesting 4 deep creates layout ambiguity. Prefer `<Grid>` + `<Stack>` + `sx` gap.
- **Forgetting `<CssBaseline />`.** Without it, margin and box-sizing defaults vary by browser.
- **Mixing `sx` and `style`.** Pick one per component; `sx` is almost always the right choice.
- **Relying on MUI's default theme instead of defining one.** The default MUI look is recognizable as "default MUI" and reads as low-effort. Define a theme.
