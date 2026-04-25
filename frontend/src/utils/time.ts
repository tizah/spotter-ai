/**
 * Shared time helpers for SVG log-sheet coordinate math.
 */

/**
 * Return midnight of the given YYYY-MM-DD in the target timezone.
 * Uses `Intl.DateTimeFormat` so no extra libraries are needed.
 */
export function getDayStart(dateStr: string, timezone: string): Date {
  // Build a formatter that resolves the offset for the target timezone
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  // Start from an approximate midnight UTC for the given date
  const approx = new Date(`${dateStr}T12:00:00Z`);
  const parts = Object.fromEntries(
    fmt.formatToParts(approx).map((p) => [p.type, p.value]),
  );

  // Reconstruct the wall-clock midnight in that timezone
  const wallMidnight = new Date(
    `${parts.year}-${parts.month}-${parts.day}T00:00:00`,
  );

  // Calculate the timezone offset by comparing wall-clock midnight to approx
  const diff =
    approx.getTime() -
    new Date(
      `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`,
    ).getTime();

  return new Date(wallMidnight.getTime() + diff);
}

/**
 * Convert an ISO timestamp to an SVG x-coordinate within the 24-hour grid.
 *
 * @param isoTime  ISO 8601 timestamp
 * @param dayStart Midnight Date for the log day (from `getDayStart`)
 * @param gridX    Left edge of the grid in SVG coords (e.g. 120)
 * @param hourWidth  Pixel width of one hour (e.g. 30)
 * @returns SVG x value, clamped to [gridX, gridX + 24 * hourWidth]
 */
export function timeToX(
  isoTime: string,
  dayStart: Date,
  gridX: number,
  hourWidth: number,
): number {
  const ms = new Date(isoTime).getTime() - dayStart.getTime();
  const hours = Math.max(0, Math.min(24, ms / 3_600_000));
  return Math.round((gridX + hours * hourWidth) * 100) / 100;
}
