import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import LogSheet from '../LogSheet';
import type { DailyLog } from '../../types';

/**
 * Mock fixture: 4 events spanning 24 h on 2025-06-15 (Central Time).
 *
 * off_duty  00:00–06:00  (6 h)
 * on_duty   06:00–07:00  (1 h)  — pickup
 * driving   07:00–16:00  (9 h)
 * off_duty  16:00–24:00  (8 h)
 *
 * Totals: off_duty 14, sleeper_berth 0, driving 9, on_duty 1 = 24.00
 */
const MOCK_DAY: DailyLog = {
  date: '2025-06-15',
  total_miles: 495,
  events: [
    {
      start: '2025-06-15T05:00:00Z', // 00:00 CDT
      end: '2025-06-15T11:00:00Z',   // 06:00 CDT
      status: 'off_duty',
      note: 'Rest',
      location: null,
      miles: 0,
    },
    {
      start: '2025-06-15T11:00:00Z', // 06:00 CDT
      end: '2025-06-15T12:00:00Z',   // 07:00 CDT
      status: 'on_duty_not_driving',
      note: 'Pickup',
      location: { lat: 41.88, lon: -87.63, label: 'Chicago, IL' },
      miles: 0,
    },
    {
      start: '2025-06-15T12:00:00Z', // 07:00 CDT
      end: '2025-06-15T21:00:00Z',   // 16:00 CDT
      status: 'driving',
      note: 'Drive to Dallas',
      location: { lat: 41.88, lon: -87.63, label: 'Chicago, IL' },
      miles: 495,
    },
    {
      start: '2025-06-15T21:00:00Z', // 16:00 CDT
      end: '2025-06-16T05:00:00Z',   // 24:00 CDT (midnight next day)
      status: 'off_duty',
      note: 'Rest',
      location: null,
      miles: 0,
    },
  ],
  totals: {
    off_duty: 14,
    sleeper_berth: 0,
    driving: 9,
    on_duty_not_driving: 1,
  },
  remarks: [
    { time: '2025-06-15T11:00:00Z', location: { lat: 41.88, lon: -87.63, label: 'Chicago, IL' } },
    { time: '2025-06-15T21:00:00Z', location: { lat: 32.78, lon: -96.8, label: 'Dallas, TX' } },
  ],
};

describe('LogSheet', () => {
  it('renders one horizontal line per duty event in .status-lines', () => {
    const { container } = render(
      <LogSheet day={MOCK_DAY} homeTerminalTimezone="America/Chicago" />,
    );
    const statusGroup = container.querySelector('.status-lines');
    expect(statusGroup).not.toBeNull();

    // Horizontal lines have different x1 and x2 (same y1 and y2)
    const allLines = statusGroup!.querySelectorAll('line');
    const horizontals = Array.from(allLines).filter(
      (l) => l.getAttribute('y1') === l.getAttribute('y2'),
    );
    expect(horizontals).toHaveLength(MOCK_DAY.events.length);
  });

  it('shows grand total "= 24.00"', () => {
    const { container } = render(
      <LogSheet day={MOCK_DAY} homeTerminalTimezone="America/Chicago" />,
    );
    const totalsGroup = container.querySelector('.totals-column');
    expect(totalsGroup).not.toBeNull();

    const texts = Array.from(totalsGroup!.querySelectorAll('text'));
    const grandTotal = texts.find((t) => t.textContent?.includes('= 24.00'));
    expect(grandTotal).toBeDefined();
  });

  it('renders correct number of remark labels', () => {
    const { container } = render(
      <LogSheet day={MOCK_DAY} homeTerminalTimezone="America/Chicago" />,
    );
    const remarksGroup = container.querySelector('.remarks');
    expect(remarksGroup).not.toBeNull();

    // Each remark produces a <g> with a tick line and rotated text
    const remarkGroups = remarksGroup!.querySelectorAll('g');
    expect(remarkGroups).toHaveLength(MOCK_DAY.remarks.length);
  });

  it('has role="img" and aria-label with the date', () => {
    render(
      <LogSheet day={MOCK_DAY} homeTerminalTimezone="America/Chicago" />,
    );
    const svg = screen.getByRole('img');
    expect(svg).toHaveAttribute(
      'aria-label',
      expect.stringContaining('2025-06-15'),
    );
  });

  it('hour labels include "Midnight" twice and "Noon" once', () => {
    const { container } = render(
      <LogSheet day={MOCK_DAY} homeTerminalTimezone="America/Chicago" />,
    );
    const gridGroup = container.querySelector('.graph-grid');
    expect(gridGroup).not.toBeNull();

    const texts = Array.from(gridGroup!.querySelectorAll('text')).map(
      (t) => t.textContent,
    );
    const midnights = texts.filter((t) => t === 'Midnight');
    const noons = texts.filter((t) => t === 'Noon');
    expect(midnights).toHaveLength(2);
    expect(noons).toHaveLength(1);
  });
});
