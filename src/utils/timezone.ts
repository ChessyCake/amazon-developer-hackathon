/**
 * Timezone and Date helper utilities for LifeOS
 * Default timezone: Asia/Kolkata (+05:30)
 */

export const DEFAULT_TIMEZONE = "Asia/Kolkata";

/**
 * Returns UTC Date range [startOfDay, endOfDay] for a given YYYY-MM-DD date string
 * in the specified IANA timezone (e.g. "Asia/Kolkata").
 */
export function getDayRangeInTimezone(
  dateStr: string,
  _timeZone: string = DEFAULT_TIMEZONE
): { start: Date; end: Date } {
  // Validate format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    throw new Error(`Invalid date format. Expected YYYY-MM-DD, received: ${dateStr}`);
  }

  const [year, month, day] = dateStr.split("-").map(Number);

  // Compute timezone offset for the given date and timezone
  // Asia/Kolkata is fixed UTC+05:30 (+330 minutes)
  let offsetMinutes = 330; // default for Asia/Kolkata

  try {
    const probe = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
    const dtf = new Intl.DateTimeFormat("en-US", {
      timeZone: _timeZone,
      timeZoneName: "shortOffset",
    });
    const parts = dtf.formatToParts(probe);
    const tzPart = parts.find((p) => p.type === "timeZoneName")?.value;
    if (tzPart) {
      // Formats like "GMT+5:30", "UTC+5:30", "GMT-4", "UTC"
      const match = tzPart.match(/([+-])(\d{1,2})(?::(\d{2}))?/);
      if (match) {
        const sign = match[1] === "-" ? -1 : 1;
        const hours = parseInt(match[2], 10);
        const mins = match[3] ? parseInt(match[3], 10) : 0;
        offsetMinutes = sign * (hours * 60 + mins);
      } else if (tzPart === "GMT" || tzPart === "UTC") {
        offsetMinutes = 0;
      }
    }
  } catch {
    offsetMinutes = 330;
  }

  // Local start of day: 00:00:00.000
  // In UTC: local time - offset
  const startMs = Date.UTC(year, month - 1, day, 0, 0, 0, 0) - offsetMinutes * 60 * 1000;
  // Local end of day: 23:59:59.999
  const endMs = Date.UTC(year, month - 1, day, 23, 59, 59, 999) - offsetMinutes * 60 * 1000;

  return {
    start: new Date(startMs),
    end: new Date(endMs),
  };
}

/**
 * Format a Date object to ISO string safely.
 */
export function formatIsoSafe(date: Date | null | undefined): string | null {
  if (!date) return null;
  return date.toISOString();
}
