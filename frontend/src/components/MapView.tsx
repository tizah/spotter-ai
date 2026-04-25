import { useMemo } from 'react';
import { Paper, Box } from '@mui/material';
import { MapContainer, TileLayer, Polyline, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { TripPlan } from '../types';

// Fix Leaflet default marker icons under Vite bundling
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const LEG_COLORS = ['#1e40af', '#0891b2'];

interface Props {
  plan: TripPlan;
}

export default function MapView({ plan }: Props) {
  const bounds = useMemo(() => {
    const pts = plan.segments.flatMap((s) => s.polyline);
    if (pts.length === 0) return undefined;
    return L.latLngBounds(pts.map(([lat, lon]) => L.latLng(lat, lon))).pad(0.1);
  }, [plan]);

  const stopMarkers = plan.events.filter(
    (e) => e.status !== 'driving' && e.location,
  );

  if (!bounds) return null;

  return (
    <Paper sx={{ overflow: 'hidden', height: { xs: 400, md: 600 } }}>
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
          {stopMarkers.map((ev, i) => (
            <Marker key={i} position={[ev.location!.lat, ev.location!.lon]}>
              <Popup>
                <strong>{ev.note}</strong>
                <br />
                {new Date(ev.start).toLocaleString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                })}
                <br />
                <em>{ev.status.replace(/_/g, ' ')}</em>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </Box>
    </Paper>
  );
}
