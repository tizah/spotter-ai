import { useMemo } from 'react';
import { Paper, Box, Typography, Stack } from '@mui/material';
import { MapContainer, TileLayer, Polyline, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { TripPlan, DutyEvent } from '../types';
import { shortLabel } from '../utils/geo';

// Fix Leaflet default marker icons under Vite bundling
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const LEG_COLORS = ['#1e40af', '#0891b2'];

/* ------------------------------------------------------------------ */
/*  Icon SVG paths (from lucide-icons)                                 */
/* ------------------------------------------------------------------ */

const ICON_PATHS: Record<string, string> = {
  truck: '<path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/>',
  package: '<path d="M16.5 9.4 7.55 4.24"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.29 7 12 12 20.71 7"/><line x1="12" y1="22" x2="12" y2="12"/>',
  fuel: '<path d="M3 22V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v17"/><path d="M13 10h2a2 2 0 0 1 2 2v2a2 2 0 0 0 2 2h0a2 2 0 0 0 2-2V9.83a2 2 0 0 0-.59-1.42L18 6"/><line x1="3" y1="22" x2="13" y2="22"/><path d="M7 10h2"/>',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
  coffee: '<path d="M10 2v2"/><path d="M14 2v2"/><path d="M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a2 2 0 1 1 0 4h-1"/><path d="M6 2v2"/>',
  flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/>',
};

const ICON_COLORS: Record<string, string> = {
  truck: '#1e40af',
  package: '#0891b2',
  fuel: '#16a34a',
  moon: '#6366f1',
  coffee: '#ea580c',
  flag: '#16a34a',
};

const ICON_LABELS: Record<string, string> = {
  truck: 'Start',
  package: 'Pickup',
  fuel: 'Fuel Stop',
  moon: 'Rest',
  coffee: 'Break',
  flag: 'Dropoff',
};

function makeIcon(type: string): L.DivIcon {
  const color = ICON_COLORS[type] ?? '#666';
  const svgContent = ICON_PATHS[type] ?? '';
  return L.divIcon({
    className: '',
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -14],
    html: `<div style="width:28px;height:28px;background:${color};border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,0.3);border:2px solid #fff;">
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${svgContent}</svg>
    </div>`,
  });
}

interface MarkerInfo {
  lat: number;
  lon: number;
  type: string;
  note: string;
  start: string;
  status: string;
  locationLabel: string;
}

function classifyEvent(ev: DutyEvent, isFirstStart: boolean): string | null {
  if (ev.status === 'driving') return null;
  const note = ev.note.toLowerCase();
  if (isFirstStart) return 'truck';
  if (note.includes('pickup')) return 'package';
  if (note.includes('drop')) return 'flag';
  if (note.includes('fuel')) return 'fuel';
  if (note.includes('break')) return 'coffee';
  if (ev.status === 'off_duty' || ev.status === 'sleeper_berth') {
    const ms = new Date(ev.end).getTime() - new Date(ev.start).getTime();
    if (ms >= 8 * 3600_000) return 'moon';
    return 'coffee';
  }
  return null;
}

interface Props {
  plan: TripPlan;
}

export default function MapView({ plan }: Props) {
  const bounds = useMemo(() => {
    const pts = plan.segments.flatMap((s) => s.polyline);
    if (pts.length === 0) return undefined;
    return L.latLngBounds(pts.map(([lat, lon]) => L.latLng(lat, lon))).pad(0.1);
  }, [plan]);

  const markers = useMemo<MarkerInfo[]>(() => {
    const result: MarkerInfo[] = [];
    const seen = new Set<string>();

    plan.events.forEach((ev, i) => {
      if (!ev.location) return;
      const isFirstStart = i === 0 && plan.segments.length > 0;
      const type = classifyEvent(ev, isFirstStart);
      if (!type) return;

      // Deduplicate by location + type
      const key = `${ev.location.lat.toFixed(4)},${ev.location.lon.toFixed(4)},${type}`;
      if (seen.has(key)) return;
      seen.add(key);

      result.push({
        lat: ev.location.lat,
        lon: ev.location.lon,
        type,
        note: ev.note,
        start: ev.start,
        status: ev.status,
        locationLabel: shortLabel(ev.location.label),
      });
    });
    return result;
  }, [plan]);

  const legendItems = useMemo(() => {
    const types = new Set(markers.map((m) => m.type));
    return Array.from(types).map((t) => ({
      type: t,
      color: ICON_COLORS[t] ?? '#666',
      label: ICON_LABELS[t] ?? t,
    }));
  }, [markers]);

  if (!bounds) return null;

  return (
    <Paper sx={{ overflow: 'hidden', height: { xs: 400, md: 600 }, position: 'relative' }}>
      <Box sx={{ height: '100%', '& .leaflet-container': { height: '100%', width: '100%' } }}>
        <MapContainer bounds={bounds} scrollWheelZoom={false} style={{ height: '100%', width: '100%' }}>
          <TileLayer
            attribution='&copy; <a href="https://osm.org/copyright">OpenStreetMap</a>'
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {plan.segments.map((seg, i) => (
            <Polyline
              key={i}
              positions={seg.polyline.map(([lat, lon]) => [lat, lon] as [number, number])}
              pathOptions={{ color: LEG_COLORS[i % LEG_COLORS.length], weight: 5, opacity: 0.85 }}
            />
          ))}
          {markers.map((m, i) => (
            <Marker key={i} position={[m.lat, m.lon]} icon={makeIcon(m.type)}>
              <Popup>
                <strong>{m.note}</strong>
                <br />
                <span style={{ color: '#475569', fontSize: '0.8rem' }}>{m.locationLabel}</span>
                <br />
                {new Date(m.start).toLocaleString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </Box>

      {/* Legend overlay */}
      <Paper
        className="no-print"
        sx={{
          position: 'absolute',
          top: 12,
          right: 12,
          zIndex: 1000,
          px: 1.5,
          py: 1,
          bgcolor: 'rgba(255,255,255,0.92)',
          backdropFilter: 'blur(4px)',
        }}
      >
        <Typography variant="caption" fontWeight={700} sx={{ mb: 0.5, display: 'block' }}>
          Legend
        </Typography>
        <Stack spacing={0.5}>
          {legendItems.map((item) => (
            <Stack key={item.type} direction="row" spacing={1} alignItems="center">
              <Box
                sx={{
                  width: 14,
                  height: 14,
                  borderRadius: '50%',
                  bgcolor: item.color,
                  flexShrink: 0,
                }}
              />
              <Typography variant="caption">{item.label}</Typography>
            </Stack>
          ))}
        </Stack>
      </Paper>
    </Paper>
  );
}
