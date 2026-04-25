import { useMemo, forwardRef } from 'react';
import { Paper, Typography, Stack, Box, Chip, GlobalStyles } from '@mui/material';
import type { DailyLog, DutyStatus } from '../types';
import { getDayStart, timeToX } from '../utils/time';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const VIEWBOX_W = 960;
const VIEWBOX_H = 380;
const GRID_X = 120;
const GRID_Y = 60;
const GRID_W = 720; // 30 px/hr × 24 hrs
const GRID_H = 120; // 30 px/row × 4 rows
const HOUR_W = 30;
const ROW_H = 30;

const ROW_ORDER: readonly DutyStatus[] = [
  'off_duty',
  'sleeper_berth',
  'driving',
  'on_duty_not_driving',
] as const;

const ROW_Y: Record<DutyStatus, number> = {
  off_duty: GRID_Y + ROW_H * 0.5,
  sleeper_berth: GRID_Y + ROW_H * 1.5,
  driving: GRID_Y + ROW_H * 2.5,
  on_duty_not_driving: GRID_Y + ROW_H * 3.5,
};

const ROW_LABELS: Record<DutyStatus, string> = {
  off_duty: 'Off Duty',
  sleeper_berth: 'Sleeper Berth',
  driving: 'Driving',
  on_duty_not_driving: 'On Duty',
};

const STATUS_LINE_COLORS: Record<DutyStatus, string> = {
  off_duty: '#9e9e9e',       // grey[500]
  sleeper_berth: '#616161',  // grey[700]
  driving: '#1e40af',        // primary.main
  on_duty_not_driving: '#ea580c', // warning.main
};

const HOUR_LABELS = [
  'Midnight', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11',
  'Noon', '13', '14', '15', '16', '17', '18', '19', '20', '21', '22', '23',
  'Midnight',
];

const TOTALS_X = 880;

/* ------------------------------------------------------------------ */
/*  Print CSS                                                          */
/* ------------------------------------------------------------------ */

const printStyles = (
  <GlobalStyles
    styles={{
      '@media print': {
        '.no-print': { display: 'none !important' },
        '.log-sheet': {
          pageBreakAfter: 'always',
          boxShadow: 'none',
          border: '1px solid #000',
        },
        '.log-sheet:last-child': { pageBreakAfter: 'auto' },
        '.log-sheet .status-line': { stroke: '#000 !important' },
        '@page': { size: 'letter landscape', margin: '0.5in' },
      },
    }}
  />
);

/* ------------------------------------------------------------------ */
/*  Sub-components (private)                                           */
/* ------------------------------------------------------------------ */

function GraphGrid() {
  const lines: React.ReactNode[] = [];

  // Outer border
  lines.push(
    <rect
      key="border"
      x={GRID_X}
      y={GRID_Y}
      width={GRID_W}
      height={GRID_H}
      fill="none"
      stroke="#000"
      strokeWidth={1.5}
    />,
  );

  // 3 row separators
  for (let r = 1; r <= 3; r++) {
    lines.push(
      <line
        key={`row-sep-${r}`}
        x1={GRID_X}
        y1={GRID_Y + r * ROW_H}
        x2={GRID_X + GRID_W}
        y2={GRID_Y + r * ROW_H}
        stroke="#000"
        strokeWidth={0.75}
      />,
    );
  }

  // 25 hour lines (0–24 inclusive) and quarter-hour ticks
  for (let h = 0; h <= 24; h++) {
    const x = GRID_X + h * HOUR_W;
    lines.push(
      <line
        key={`hr-${h}`}
        x1={x}
        y1={GRID_Y}
        x2={x}
        y2={GRID_Y + GRID_H}
        stroke="#000"
        strokeWidth={h === 0 || h === 24 ? 0 : 0.5}
      />,
    );

    // Quarter-hour ticks within the hour (except at boundaries)
    if (h < 24) {
      for (let q = 1; q <= 3; q++) {
        const qx = x + q * (HOUR_W / 4);
        const tickLen = q === 2 ? 6 : 4; // half-hour tick is longer
        for (let r = 0; r < 4; r++) {
          const rowTop = GRID_Y + r * ROW_H;
          lines.push(
            <line
              key={`tick-${h}-${q}-top-${r}`}
              x1={qx}
              y1={rowTop}
              x2={qx}
              y2={rowTop + tickLen}
              stroke="#999"
              strokeWidth={0.5}
            />,
          );
          lines.push(
            <line
              key={`tick-${h}-${q}-bot-${r}`}
              x1={qx}
              y1={rowTop + ROW_H}
              x2={qx}
              y2={rowTop + ROW_H - tickLen}
              stroke="#999"
              strokeWidth={0.5}
            />,
          );
        }
      }
    }
  }

  // Row labels (left of grid)
  ROW_ORDER.forEach((status, i) => {
    lines.push(
      <text
        key={`label-${status}`}
        x={GRID_X - 8}
        y={GRID_Y + i * ROW_H + ROW_H / 2}
        textAnchor="end"
        dominantBaseline="central"
        fontSize={9}
        fontFamily="Arial, sans-serif"
        fill="#333"
      >
        {ROW_LABELS[status]}
      </text>,
    );
  });

  // Hour labels (above grid)
  HOUR_LABELS.forEach((label, i) => {
    lines.push(
      <text
        key={`hour-${i}`}
        x={GRID_X + i * HOUR_W}
        y={GRID_Y - 8}
        textAnchor="middle"
        fontSize={7}
        fontFamily="Arial, sans-serif"
        fill="#555"
      >
        {label}
      </text>,
    );
  });

  return <g className="graph-grid">{lines}</g>;
}

function StatusLines({
  events,
  dayStart,
}: {
  events: DailyLog['events'];
  dayStart: Date;
}) {
  const elements: React.ReactNode[] = [];

  events.forEach((ev, i) => {
    const x1 = timeToX(ev.start, dayStart, GRID_X, HOUR_W);
    const x2 = timeToX(ev.end, dayStart, GRID_X, HOUR_W);
    const y = ROW_Y[ev.status];
    const color = STATUS_LINE_COLORS[ev.status] ?? '#1e40af';

    // Horizontal line for this event
    elements.push(
      <line
        key={`h-${i}`}
        className="status-line"
        x1={x1}
        y1={y}
        x2={x2}
        y2={y}
        stroke={color}
        strokeWidth={2.5}
        strokeLinecap="round"
      />,
    );

    // Vertical connector from previous event's row to this one
    if (i > 0) {
      const prevY = ROW_Y[events[i - 1].status];
      if (prevY !== y) {
        elements.push(
          <line
            key={`v-${i}`}
            className="status-line"
            x1={x1}
            y1={prevY}
            x2={x1}
            y2={y}
            stroke={color}
            strokeWidth={2.5}
            strokeLinecap="round"
          />,
        );
      }
    }
  });

  return <g className="status-lines">{elements}</g>;
}

function TotalsColumn({ totals }: { totals: DailyLog['totals'] }) {
  const grandTotal = ROW_ORDER.reduce((sum, s) => sum + totals[s], 0);

  return (
    <g className="totals-column">
      {/* Column header */}
      <text
        x={TOTALS_X}
        y={GRID_Y - 8}
        textAnchor="middle"
        fontSize={8}
        fontFamily="Arial, sans-serif"
        fontWeight="bold"
        fill="#333"
      >
        Total
      </text>

      {/* Per-status totals */}
      {ROW_ORDER.map((status, i) => (
        <text
          key={status}
          x={TOTALS_X}
          y={GRID_Y + i * ROW_H + ROW_H / 2}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={10}
          fontFamily="Arial, sans-serif"
          fill="#333"
        >
          {totals[status].toFixed(2)}
        </text>
      ))}

      {/* Grand total */}
      <text
        x={TOTALS_X}
        y={GRID_Y + GRID_H + 18}
        textAnchor="middle"
        fontSize={11}
        fontFamily="Arial, sans-serif"
        fontWeight="bold"
        fill="#000"
      >
        = {grandTotal.toFixed(2)}
      </text>
    </g>
  );
}

function Remarks({
  remarks,
  dayStart,
}: {
  remarks: DailyLog['remarks'];
  dayStart: Date;
}) {
  const baseY = GRID_Y + GRID_H + 30;

  return (
    <g className="remarks">
      {/* Section label */}
      <text
        x={GRID_X}
        y={baseY}
        fontSize={9}
        fontFamily="Arial, sans-serif"
        fontWeight="bold"
        fill="#333"
      >
        Remarks:
      </text>

      {remarks.map((r, i) => {
        const x = timeToX(r.time, dayStart, GRID_X, HOUR_W);
        const tickTop = GRID_Y + GRID_H;
        const labelY = baseY + 16 + i * 14;

        return (
          <g key={i}>
            {/* Tick from grid bottom */}
            <line
              x1={x}
              y1={tickTop}
              x2={x}
              y2={tickTop + 8}
              stroke="#999"
              strokeWidth={0.75}
            />
            {/* Rotated label */}
            <text
              x={x}
              y={labelY}
              fontSize={7}
              fontFamily="Arial, sans-serif"
              fill="#555"
              transform={`rotate(60, ${x}, ${labelY})`}
            >
              {r.location.label}
            </text>
          </g>
        );
      })}
    </g>
  );
}

function ContinuityCaptions({
  dayIndex,
  totalDays,
}: {
  dayIndex?: number;
  totalDays?: number;
}) {
  if (dayIndex == null || totalDays == null || totalDays <= 1) return null;
  const captionY = GRID_Y + GRID_H + 14;

  return (
    <g className="continuity-captions no-print">
      {dayIndex > 0 && (
        <text
          x={GRID_X + 4}
          y={captionY}
          fontSize={7}
          fontFamily="Arial, sans-serif"
          fill="#888"
        >
          {'\u2190'} from Day {dayIndex}
        </text>
      )}
      {dayIndex < totalDays - 1 && (
        <text
          x={GRID_X + GRID_W - 4}
          y={captionY}
          textAnchor="end"
          fontSize={7}
          fontFamily="Arial, sans-serif"
          fill="#888"
        >
          continues on Day {dayIndex + 2} {'\u2192'}
        </text>
      )}
    </g>
  );
}

/* ------------------------------------------------------------------ */
/*  LogHeader (MUI HTML above SVG)                                     */
/* ------------------------------------------------------------------ */

function LogHeader({
  day,
  carrier,
  driver,
  vehicleNumbers,
  dayIndex,
  totalDays,
}: {
  day: DailyLog;
  carrier?: { name: string; mainOfficeAddress: string };
  driver?: { fullName: string };
  vehicleNumbers?: string;
  dayIndex?: number;
  totalDays?: number;
}) {
  const dateLabel = new Date(day.date + 'T12:00:00Z').toLocaleDateString(
    'en-US',
    { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' },
  );

  return (
    <Stack spacing={1} sx={{ px: 2, pt: 2 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography variant="h4">Driver&apos;s Daily Log</Typography>
        {dayIndex != null && totalDays != null && (
          <Chip
            label={`Day ${dayIndex + 1} of ${totalDays}`}
            size="small"
            color="primary"
            variant="outlined"
          />
        )}
      </Stack>

      <Stack direction="row" spacing={4} flexWrap="wrap" sx={{ typography: 'body2' }}>
        <Box>
          <Typography variant="caption" color="text.secondary">
            Date
          </Typography>
          <Typography variant="body2" fontWeight={600}>
            {dateLabel}
          </Typography>
        </Box>
        <Box>
          <Typography variant="caption" color="text.secondary">
            Total Miles
          </Typography>
          <Typography variant="body2" fontWeight={600}>
            {Math.round(day.total_miles)}
          </Typography>
        </Box>
        {vehicleNumbers && (
          <Box>
            <Typography variant="caption" color="text.secondary">
              Vehicle Numbers
            </Typography>
            <Typography variant="body2">{vehicleNumbers}</Typography>
          </Box>
        )}
        {carrier && (
          <Box>
            <Typography variant="caption" color="text.secondary">
              Carrier
            </Typography>
            <Typography variant="body2">
              {carrier.name} — {carrier.mainOfficeAddress}
            </Typography>
          </Box>
        )}
        {driver && (
          <Box>
            <Typography variant="caption" color="text.secondary">
              Driver
            </Typography>
            <Typography variant="body2">{driver.fullName}</Typography>
          </Box>
        )}
      </Stack>
    </Stack>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

interface LogSheetProps {
  day: DailyLog;
  carrier?: { name: string; mainOfficeAddress: string };
  driver?: { fullName: string };
  vehicleNumbers?: string;
  homeTerminalTimezone?: string;
  dayIndex?: number;
  totalDays?: number;
}

const LogSheet = forwardRef<HTMLDivElement, LogSheetProps>(function LogSheet(
  {
    day,
    carrier,
    driver,
    vehicleNumbers,
    homeTerminalTimezone = 'America/Chicago',
    dayIndex,
    totalDays,
  },
  ref,
) {
  const dayStart = useMemo(
    () => getDayStart(day.date, homeTerminalTimezone),
    [day.date, homeTerminalTimezone],
  );

  const ariaLabel = `Driver's Daily Log for ${day.date}`;

  const totalsText = ROW_ORDER
    .map((s) => `${ROW_LABELS[s]}: ${day.totals[s].toFixed(2)}h`)
    .join(', ');

  return (
    <>
      {printStyles}
      <Paper ref={ref} className="log-sheet" sx={{ mb: 3, overflow: 'hidden' }}>
        <LogHeader
          day={day}
          carrier={carrier}
          driver={driver}
          vehicleNumbers={vehicleNumbers}
          dayIndex={dayIndex}
          totalDays={totalDays}
        />

        <Box sx={{ px: 2, pb: 2 }}>
          <svg
            viewBox={`0 0 ${VIEWBOX_W} ${VIEWBOX_H}`}
            width="100%"
            role="img"
            aria-label={ariaLabel}
            style={{ display: 'block', maxWidth: '100%', height: 'auto' }}
          >
            <title>{ariaLabel}</title>
            <desc>
              FMCSA-style duty status graph for {day.date}. {totalsText}.
            </desc>

            <GraphGrid />
            <StatusLines events={day.events} dayStart={dayStart} />
            <TotalsColumn totals={day.totals} />
            <ContinuityCaptions dayIndex={dayIndex} totalDays={totalDays} />
            <Remarks remarks={day.remarks} dayStart={dayStart} />
          </svg>

          {/* Visually-hidden text summary for screen readers */}
          <Box
            component="span"
            sx={{
              position: 'absolute',
              width: 1,
              height: 1,
              overflow: 'hidden',
              clip: 'rect(0,0,0,0)',
            }}
          >
            Log totals: {totalsText}. Grand total:{' '}
            {ROW_ORDER.reduce((s, k) => s + day.totals[k], 0).toFixed(2)} hours.
          </Box>
        </Box>
      </Paper>
    </>
  );
});

export default LogSheet;
