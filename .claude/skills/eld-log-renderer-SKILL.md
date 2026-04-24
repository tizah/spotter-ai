---
name: eld-log-renderer
description: Use this skill whenever the user is creating, modifying, testing, or debugging the Driver's Daily Log sheet SVG renderer in frontend/src/components/LogSheet.tsx. This component draws FMCSA-compliant daily logs visually matching the paper DOT form — the 24-hour graph grid with four duty-status tracks (Off Duty, Sleeper Berth, Driving, On Duty Not Driving), status lines, remarks section with city/state labels, totals column, header fields, and print/download formatting. Trigger whenever the user mentions log sheet, ELD, daily log, driver's log, RODS, 24-hour grid, duty status line, the FMCSA graph, the paper log form, remarks, log totals, log download, or SVG log rendering. Also trigger for requests about making the log printable, exporting as PNG/PDF, or ensuring visual fidelity to the FMCSA template. The log sheet is the second most visible output after the map — visual accuracy directly affects whether Spotter trusts the submission.
---

# ELD Daily Log Sheet Renderer

The `<LogSheet>` component renders one full 24-hour FMCSA-style daily log as inline SVG, driven by a `DailyLog` object from the backend. It is a pure presentational component — all math (totals, status durations) comes pre-computed from the backend. Frontend only draws pixels.

## Why SVG, not Canvas

- **DOM identity** — each element is addressable, testable, stylable via CSS
- **Crisp at any zoom or print size** — vector, not raster
- **Themeable** — CSS variables / MUI tokens just work
- **Straightforward to export** — `html-to-image` for PNG, `svg2pdf.js` for PDF
- **Accessible** — `<title>` and `<desc>` elements for screen readers

Canvas would be faster but offers none of the above advantages. Speed is not a concern here (one component, rendered on user action).

## Visual reference

Match the FMCSA blank log template the user has in the repo (`docs/blank-driver-log.png` if saved). The key visual elements, top to bottom:

1. **Header strip** — "Driver's Daily Log", date (month/day/year), total miles driving today, vehicle numbers, carrier name, main office address, driver signature, co-driver name
2. **The 24-hour graph grid** — 4 rows × 24 hour columns, with 15-min sub-ticks; hours labeled above (Midnight, 2, 3, 4, ... Noon, 13, 14, ..., Midnight)
3. **Status lines** — solid horizontal lines in the appropriate row for each event, with vertical connectors at status changes
4. **Total hours column** — on the right edge, one number per row, summing to 24
5. **Remarks section** — below the grid, with labels at the x-position of each status change (city, state)
6. **Shipping documents** — bottom strip (optional for v1)
7. **Recap** — 70-hour / 8-day totals (optional for v1)

## Component API

```typescript
export interface LogSheetProps {
  day: DailyLog;              // from backend API
  carrier: {
    name: string;
    mainOfficeAddress: string;
  };
  driver: {
    fullName: string;
    signature?: string;       // defaults to fullName in italic
  };
  coDriverName?: string;
  vehicleNumbers: string;     // e.g., "Tractor 1234 / Trailer 5678"
  homeTerminalTimezone: string; // IANA tz, e.g., "America/Chicago"
}

export function LogSheet(props: LogSheetProps): JSX.Element;
```

Keep it a single default-exported component. No internal state; fully driven by props.

## SVG coordinate system

Design the SVG with a **fixed viewBox** so it scales cleanly and the geometry math stays simple:

```tsx
const VIEW_W = 960;
const VIEW_H = 520;

// Grid area (the 24-hour graph)
const GRID_X = 120;
const GRID_Y = 200;
const GRID_W = 720;     // 30px per hour → 24 * 30 = 720
const GRID_H = 120;     // 30px per row  → 4 * 30 = 120
const HOUR_W = GRID_W / 24;     // 30
const ROW_H = GRID_H / 4;       // 30

// Row centers (where status lines are drawn)
const ROW_Y = {
  off_duty:           GRID_Y + ROW_H * 0.5,
  sleeper_berth:      GRID_Y + ROW_H * 1.5,
  driving:            GRID_Y + ROW_H * 2.5,
  on_duty_not_driving:GRID_Y + ROW_H * 3.5,
};
```

With this, the x-coordinate for any time `t` (a `Date`) within the log's 24-hour window is:

```tsx
function timeToX(t: Date, dayStart: Date): number {
  const hours = (t.getTime() - dayStart.getTime()) / 3_600_000;
  return GRID_X + hours * HOUR_W;
}
```

Where `dayStart` is midnight of the log's date in the driver's home terminal timezone.

## Drawing the status lines

For every event in `day.events`, draw:
1. A horizontal line at the event's status row, from `timeToX(event.start)` to `timeToX(event.end)`
2. A vertical connector from the previous event's row to this event's row at `timeToX(event.start)` (if statuses differ)

```tsx
function StatusLines({ events, dayStart }: { events: DutyEvent[]; dayStart: Date }) {
  const strokeWidth = 2.5;
  const stroke = 'var(--log-line, #1a1a1a)';

  return (
    <g className="status-lines">
      {events.map((ev, i) => {
        const x1 = timeToX(new Date(ev.start), dayStart);
        const x2 = timeToX(new Date(ev.end), dayStart);
        const y = ROW_Y[ev.status];

        // Horizontal line for this event
        const horiz = (
          <line key={`h-${i}`} x1={x1} y1={y} x2={x2} y2={y}
                stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="square" />
        );

        // Vertical connector from previous status (if different)
        let vert: JSX.Element | null = null;
        if (i > 0) {
          const prevStatus = events[i - 1].status;
          if (prevStatus !== ev.status) {
            const yPrev = ROW_Y[prevStatus];
            vert = (
              <line key={`v-${i}`} x1={x1} y1={yPrev} x2={x1} y2={y}
                    stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="square" />
            );
          }
        }

        return <React.Fragment key={i}>{vert}{horiz}</React.Fragment>;
      })}
    </g>
  );
}
```

## Drawing the grid itself

The grid is static geometry; extract it as its own component:

```tsx
function GraphGrid() {
  const rows = ['Off Duty', 'Sleeper Berth', 'Driving', 'On Duty (Not Driving)'];
  const hourLabels = ['Midnight', '1','2','3','4','5','6','7','8','9','10','11',
                      'Noon','13','14','15','16','17','18','19','20','21','22','23','Midnight'];

  return (
    <g className="graph-grid">
      {/* Outer border */}
      <rect x={GRID_X} y={GRID_Y} width={GRID_W} height={GRID_H}
            fill="none" stroke="#1a1a1a" strokeWidth={1.5} />

      {/* Row lines + labels */}
      {rows.map((label, i) => (
        <g key={label}>
          {i > 0 && (
            <line x1={GRID_X} y1={GRID_Y + i * ROW_H}
                  x2={GRID_X + GRID_W} y2={GRID_Y + i * ROW_H}
                  stroke="#1a1a1a" strokeWidth={0.75} />
          )}
          <text x={GRID_X - 8} y={GRID_Y + i * ROW_H + ROW_H / 2}
                textAnchor="end" dominantBaseline="middle"
                fontSize={10} fontFamily="Arial, sans-serif">
            {label}
          </text>
        </g>
      ))}

      {/* Hour columns: major ticks every hour, minor ticks every 15 min */}
      {Array.from({ length: 25 }).map((_, h) => (
        <line key={`h-${h}`} x1={GRID_X + h * HOUR_W} y1={GRID_Y}
              x2={GRID_X + h * HOUR_W} y2={GRID_Y + GRID_H}
              stroke="#1a1a1a" strokeWidth={h % 6 === 0 ? 1.25 : 0.5} />
      ))}
      {Array.from({ length: 24 * 4 + 1 }).map((_, q) => {
        if (q % 4 === 0) return null;  // skip hour lines
        const x = GRID_X + q * (HOUR_W / 4);
        return (
          <line key={`q-${q}`} x1={x} y1={GRID_Y + GRID_H - 4}
                x2={x} y2={GRID_Y + GRID_H}
                stroke="#1a1a1a" strokeWidth={0.5} />
        );
      })}

      {/* Hour labels above the grid */}
      {hourLabels.map((lbl, h) => (
        <text key={`l-${h}`} x={GRID_X + h * HOUR_W} y={GRID_Y - 6}
              textAnchor="middle" fontSize={8} fontFamily="Arial, sans-serif">
          {lbl}
        </text>
      ))}
    </g>
  );
}
```

## Totals column

Draw each row's total to the right of the grid, from `day.totals`:

```tsx
<g className="totals">
  <text x={GRID_X + GRID_W + 40} y={GRID_Y - 10} fontSize={9} textAnchor="end">Total Hours</text>
  {(['off_duty','sleeper_berth','driving','on_duty_not_driving'] as DutyStatus[]).map((status, i) => (
    <text key={status}
          x={GRID_X + GRID_W + 40} y={GRID_Y + i * ROW_H + ROW_H / 2}
          textAnchor="end" dominantBaseline="middle" fontSize={11}>
      {day.totals[status].toFixed(2)}
    </text>
  ))}
  {/* Grand total (must be 24) */}
  <text x={GRID_X + GRID_W + 40} y={GRID_Y + GRID_H + 16}
        textAnchor="end" fontSize={11} fontWeight="bold">
    = {Object.values(day.totals).reduce((a,b) => a+b, 0).toFixed(2)}
  </text>
</g>
```

## Remarks — city/state labels at status transitions

Place labels below the grid, rotated 60° for readability (matches the FMCSA template):

```tsx
<g className="remarks">
  {day.remarks.map((remark, i) => {
    const x = timeToX(new Date(remark.time), dayStart);
    return (
      <g key={i} transform={`translate(${x}, ${GRID_Y + GRID_H + 8})`}>
        <line x1={0} y1={-8} x2={0} y2={0} stroke="#1a1a1a" strokeWidth={0.75} />
        <text transform="rotate(60) translate(4, 0)"
              fontSize={9} fontFamily="Arial, sans-serif">
          {remark.location.label}
        </text>
      </g>
    );
  })}
</g>
```

## Header fields

Render the header block with real HTML (not SVG) for easier form-style layout, then nest the SVG below:

```tsx
<Paper elevation={1} sx={{ p: 3 }}>
  <Stack spacing={2}>
    <HeaderRow>
      <Field label="Date" value={day.date} />
      <Field label="Total Miles Today" value={day.total_miles.toFixed(1)} />
      <Field label="Vehicle Numbers" value={vehicleNumbers} />
    </HeaderRow>
    <HeaderRow>
      <Field label="Carrier" value={carrier.name} flex={2} />
      <Field label="Driver's Signature" value={driver.signature ?? driver.fullName} signature />
    </HeaderRow>
    <HeaderRow>
      <Field label="Main Office Address" value={carrier.mainOfficeAddress} flex={2} />
      <Field label="Co-Driver" value={coDriverName ?? '—'} />
    </HeaderRow>

    <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} width="100%" role="img"
         aria-label={`Driver's daily log for ${day.date}`}>
      <title>Driver's Daily Log — {day.date}</title>
      <desc>FMCSA-compliant 24-hour duty status graph for {driver.fullName}</desc>
      <GraphGrid />
      <StatusLines events={day.events} dayStart={new Date(`${day.date}T00:00:00`)} />
      {/* totals + remarks */}
    </svg>
  </Stack>
</Paper>
```

## Download: PNG and PDF

Add two buttons at the top-right of the sheet:

```tsx
import { toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';
import 'svg2pdf.js';

async function downloadPng(node: HTMLElement, filename: string) {
  const dataUrl = await toPng(node, { pixelRatio: 2, backgroundColor: '#ffffff' });
  const link = document.createElement('a');
  link.download = filename;
  link.href = dataUrl;
  link.click();
}

async function downloadPdf(svgEl: SVGSVGElement, filename: string) {
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' });
  await pdf.svg(svgEl, { x: 20, y: 20, width: 752, height: 572 });
  pdf.save(filename);
}
```

## Print styles

Add a print stylesheet in `src/theme.ts` or a dedicated `print.css`:

```css
@media print {
  body { background: white; }
  .no-print { display: none !important; }
  .log-sheet { page-break-after: always; box-shadow: none; border: 1px solid #000; }
  .log-sheet:last-child { page-break-after: auto; }
  @page { size: letter landscape; margin: 0.5in; }
}
```

Tag the download/action buttons with `className="no-print"`.

## Accessibility

- Use `role="img"` and a descriptive `aria-label` on the SVG
- Include `<title>` and `<desc>` inside the SVG
- Provide a non-visual summary next to the sheet (for screen readers): "Off duty 10 hours, sleeper berth 1.75 hours, driving 7.75 hours, on duty not driving 4.5 hours"
- Don't encode meaning in color alone — status lines are visually distinct by row position, not color

## Testing

```tsx
// frontend/src/components/__tests__/LogSheet.test.tsx
import { render } from '@testing-library/react';
import { LogSheet } from '../LogSheet';
import { mockDailyLog } from '../../test-fixtures/logs';

describe('LogSheet', () => {
  it('renders one horizontal line per duty event', () => {
    const { container } = render(<LogSheet day={mockDailyLog} ... />);
    const horizontalLines = container.querySelectorAll('.status-lines line[x1][x2]');
    expect(horizontalLines.length).toBeGreaterThanOrEqual(mockDailyLog.events.length);
  });

  it('renders the grand total as 24.00', () => {
    const { getByText } = render(<LogSheet day={mockDailyLog} ... />);
    expect(getByText('= 24.00')).toBeInTheDocument();
  });

  it('renders one remark label per status change', () => {
    const { container } = render(<LogSheet day={mockDailyLog} ... />);
    const remarks = container.querySelectorAll('.remarks text');
    expect(remarks.length).toBe(mockDailyLog.remarks.length);
  });
});
```

## Common pitfalls

- **Timezone drift.** `dayStart` must be midnight in the driver's home terminal timezone, not UTC. Mismatched timezones shift every line on the graph.
- **Events crossing midnight.** The backend `log_builder.py` must split these before sending. If a raw `DutyEvent` spans two days, the graph math breaks.
- **SVG coordinate precision.** Round x-coordinates to 2 decimal places to avoid sub-pixel fuzziness that shows up at high zoom.
- **Rotated remark labels overlapping.** When two status changes are within ~30 min of each other, labels collide. For v1, accept this. For polish, stagger the y-offset of adjacent labels.
- **`html-to-image` failing on webfonts.** Use system fonts (Arial) on the SVG to avoid this. MUI components outside the SVG can use whatever.
- **Print CSS not applying inside an iframe.** If you ever embed the sheet in an iframe, the print stylesheet must be in the iframe document, not the parent.
