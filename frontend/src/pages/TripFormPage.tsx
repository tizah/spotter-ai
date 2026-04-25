import { Box, Typography, Paper, Stack, Chip, GlobalStyles, Link } from '@mui/material';
import {
  Truck, Shield, Fuel, BedDouble,
  MapPin, CalendarCheck, Download,
} from 'lucide-react';
import TripForm from '../components/TripForm';
import type { TripPlan } from '../types';

interface Props {
  onPlanned: (plan: TripPlan) => void;
}

/* ── Dashed-line animation for route preview ── */
const routeAnimationStyles = (
  <GlobalStyles
    styles={{
      '@keyframes drawRoute': {
        from: { strokeDashoffset: 260 },
        to: { strokeDashoffset: 0 },
      },
      '.route-line': {
        animation: 'drawRoute 2s ease-out forwards',
      },
    }}
  />
);

/* ── Route preview SVG — larger, with animation ── */
function RoutePreviewSvg() {
  return (
    <svg
      viewBox="0 0 360 80"
      width="100%"
      style={{ maxWidth: 280, display: 'block' }}
      aria-label="Route preview: truck to pickup to dropoff"
      role="img"
    >
      {/* Animated road line */}
      <line
        className="route-line"
        x1="45"
        y1="45"
        x2="320"
        y2="45"
        stroke="#cbd5e1"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray="8 6"
      />

      {/* Truck icon (start) */}
      <g transform="translate(10, 24)">
        <rect x="0" y="10" width="28" height="16" rx="3" fill="#1e40af" />
        <rect x="20" y="5" width="16" height="22" rx="3" fill="#3b82f6" />
        <circle cx="9" cy="28" r="4" fill="#334155" />
        <circle cx="30" cy="28" r="4" fill="#334155" />
      </g>

      {/* Pickup flag (midpoint) */}
      <g transform="translate(166, 10)">
        <line x1="5" y1="8" x2="5" y2="40" stroke="#0891b2" strokeWidth="2.5" />
        <polygon points="8,8 28,16 8,24" fill="#0891b2" opacity="0.85" />
      </g>
      <text x="180" y="72" textAnchor="middle" fontSize="10" fill="#94a3b8" fontFamily="Inter, sans-serif" fontWeight="500">Pickup</text>

      {/* Dropoff flag (end) */}
      <g transform="translate(304, 10)">
        <line x1="5" y1="8" x2="5" y2="40" stroke="#16a34a" strokeWidth="2.5" />
        <polygon points="8,8 28,16 8,24" fill="#16a34a" opacity="0.85" />
      </g>
      <text x="318" y="72" textAnchor="middle" fontSize="10" fill="#94a3b8" fontFamily="Inter, sans-serif" fontWeight="500">Dropoff</text>
    </svg>
  );
}

/* ── Feature chip for hero panel ── */
function FeatureChip({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <Chip
      icon={<Box sx={{ display: 'flex', ml: 0.5 }}>{icon}</Box>}
      label={label}
      variant="outlined"
      size="small"
      sx={{
        borderColor: 'rgba(255,255,255,0.2)',
        color: 'rgba(255,255,255,0.85)',
        '& .MuiChip-icon': { color: 'rgba(255,255,255,0.7)' },
        fontSize: '0.75rem',
      }}
    />
  );
}

/* ── How-it-works step card ── */
function StepCard({ step, icon, title, description }: { step: number; icon: React.ReactNode; title: string; description: string }) {
  return (
    <Paper
      sx={{
        p: 3,
        pt: 4,
        flex: 1,
        minWidth: 200,
        textAlign: 'center',
        position: 'relative',
        boxShadow: '0 4px 24px rgba(15,23,42,0.06)',
      }}
    >
      {/* Circled step number */}
      <Box
        sx={{
          position: 'absolute',
          top: -14,
          left: 'calc(50% - 14px)',
          width: 28,
          height: 28,
          borderRadius: '50%',
          bgcolor: 'primary.main',
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '0.8rem',
          fontWeight: 700,
        }}
      >
        {step}
      </Box>

      {/* Tinted icon circle */}
      <Box
        sx={{
          width: 56,
          height: 56,
          borderRadius: '50%',
          bgcolor: 'rgba(30, 64, 175, 0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          mx: 'auto',
          mb: 2,
          color: 'primary.main',
        }}
      >
        {icon}
      </Box>

      <Typography variant="body1" fontWeight={600} gutterBottom>
        {title}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {description}
      </Typography>
    </Paper>
  );
}

/* ── Main page ── */
export default function TripFormPage({ onPlanned }: Props) {
  return (
    <>
      {routeAnimationStyles}

      {/* ── Hero + Form row ── */}
      <Box
        sx={{
          display: 'flex',
          flexDirection: { xs: 'column', md: 'row' },
          alignItems: 'stretch',
          flex: 1,
          minHeight: { md: '100vh' },
        }}
      >
        {/* Left: Hero Panel */}
        <Box
          sx={{
            flex: { md: '0 0 58%' },
            background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 50%, #1e40af 100%)',
            color: '#fff',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            px: { xs: 4, md: 8 },
            py: { xs: 6, md: 0 },
          }}
        >
          <Stack spacing={4} sx={{ maxWidth: 520 }}>
            <Box>
              <Typography
                variant="h1"
                sx={{
                  fontSize: { xs: '1.75rem', md: '2.25rem' },
                  fontWeight: 700,
                  letterSpacing: '-0.02em',
                  lineHeight: 1.2,
                  color: '#fff',
                }}
              >
                Trip
                <Box component="span" sx={{ color: 'secondary.light' }}> Planner</Box>
              </Typography>
              <Typography
                sx={{
                  mt: 2,
                  fontSize: { xs: '1rem', md: '1.125rem' },
                  color: 'rgba(255,255,255,0.75)',
                  lineHeight: 1.6,
                  maxWidth: 440,
                }}
              >
                Plan your route with automatic rest stops, fuel stops, and
                Driver&apos;s Daily Logs — all compliant with FMCSA Hours of Service rules.
              </Typography>
            </Box>

            {/* Route preview SVG */}
            <Box sx={{ py: 2 }}>
              <RoutePreviewSvg />
              <Typography
                variant="caption"
                sx={{
                  display: 'block',
                  mt: 2,
                  color: 'rgba(255,255,255,0.45)',
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  fontSize: '0.65rem',
                }}
              >
                FMCSA 70-hour / 8-day compliant &bull; Fuel + rest stops auto-planned
              </Typography>
            </Box>

            {/* Feature chips */}
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              <FeatureChip icon={<Shield size={14} />} label="HOS compliant" />
              <FeatureChip icon={<Fuel size={14} />} label="Auto fuel stops" />
              <FeatureChip icon={<BedDouble size={14} />} label="Rest planning" />
              <FeatureChip icon={<Truck size={14} />} label="70h / 8-day" />
            </Stack>
          </Stack>
        </Box>

        {/* Right: Form Panel */}
        <Box
          sx={{
            flex: { md: '0 0 42%' },
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            px: { xs: 3, md: 5 },
            py: { xs: 4, md: 0 },
            background: 'linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)',
          }}
        >
          <Paper
            sx={{
              p: { xs: 3, md: 4 },
              width: '100%',
              maxWidth: 480,
              boxShadow: '0 4px 24px rgba(15,23,42,0.06)',
            }}
          >
            <Typography variant="h3" gutterBottom>
              Plan a trip
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              Where are you, where&apos;s the load, and where&apos;s it going?
            </Typography>

            <TripForm onPlanned={onPlanned} />
          </Paper>
        </Box>
      </Box>

      {/* ── How It Works section ── */}
      <Box sx={{ px: { xs: 3, md: 8 }, py: 10, bgcolor: '#f8fafc' }}>
        <Typography
          variant="h2"
          textAlign="center"
          sx={{ mb: 6, color: 'text.primary' }}
        >
          How it works
        </Typography>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={{ xs: 5, sm: 0 }}
          sx={{
            maxWidth: 960,
            mx: 'auto',
            /* Arrow connectors between cards — desktop only */
            '& > .step-wrapper': {
              flex: 1,
              position: 'relative',
            },
            '& > .step-wrapper:not(:last-child)::after': {
              content: '""',
              display: { xs: 'none', sm: 'block' },
              position: 'absolute',
              top: '50%',
              right: -18,
              width: 36,
              borderTop: '2px dotted',
              borderColor: 'divider',
              zIndex: 1,
            },
            '& > .step-wrapper:not(:last-child)::before': {
              content: '"›"',
              display: { xs: 'none', sm: 'flex' },
              position: 'absolute',
              top: '50%',
              right: -24,
              transform: 'translateY(-50%)',
              width: 16,
              height: 16,
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.1rem',
              fontWeight: 700,
              color: 'text.secondary',
              zIndex: 2,
            },
          }}
        >
          <Box className="step-wrapper" sx={{ px: { sm: 2 } }}>
            <StepCard
              step={1}
              icon={<MapPin size={32} />}
              title="Tell us your trip"
              description="Enter your current location, pickup, drop-off, and cycle hours already used."
            />
          </Box>
          <Box className="step-wrapper" sx={{ px: { sm: 2 } }}>
            <StepCard
              step={2}
              icon={<CalendarCheck size={32} />}
              title="We plan the stops"
              description="Rest breaks, fuel stops, and shift resets are inserted automatically under HOS rules."
            />
          </Box>
          <Box className="step-wrapper" sx={{ px: { sm: 2 } }}>
            <StepCard
              step={3}
              icon={<Download size={32} />}
              title="Download your logs"
              description="Get FMCSA-compliant Driver's Daily Log sheets as PDF or PNG, ready to print."
            />
          </Box>
        </Stack>
      </Box>

      {/* ── Footer strip ── */}
      <Box
        component="footer"
        sx={{
          py: 2,
          px: 3,
          textAlign: 'center',
          bgcolor: '#f1f5f9',
          borderTop: 1,
          borderColor: 'divider',
        }}
      >
        <Typography variant="body2" color="text.secondary">
          Built with Django + React &bull;{' '}
          <Link
            href="https://github.com/tizah/spotter-ai"
            target="_blank"
            rel="noopener"
            underline="hover"
            color="primary"
          >
            View on GitHub &rarr;
          </Link>
        </Typography>
      </Box>
    </>
  );
}
