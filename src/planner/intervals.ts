import { TimeSlot, PlannerEvent, PlannerPreferences } from "./types.js";

/**
 * Calculates work window [workStart, workEnd] in UTC for a specific date (YYYY-MM-DD)
 * and IANA timezone (e.g. Asia/Kolkata).
 */
export function getWorkWindow(
  dateStr: string,
  preferences: PlannerPreferences
): { start: Date; end: Date; totalMinutes: number } {
  const [year, month, day] = dateStr.split("-").map(Number);
  const [startH, startM] = preferences.workStartTime.split(":").map(Number);
  const [endH, endM] = preferences.workEndTime.split(":").map(Number);

  // Offset in minutes from UTC for timezone
  let offsetMinutes = 330; // default Asia/Kolkata (+05:30)
  try {
    const probe = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
    const dtf = new Intl.DateTimeFormat("en-US", {
      timeZone: preferences.timezone,
      timeZoneName: "shortOffset",
    });
    const parts = dtf.formatToParts(probe);
    const tzPart = parts.find((p) => p.type === "timeZoneName")?.value;
    if (tzPart) {
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

  const startUtcMs = Date.UTC(year, month - 1, day, startH, startM, 0, 0) - offsetMinutes * 60 * 1000;
  const endUtcMs = Date.UTC(year, month - 1, day, endH, endM, 0, 0) - offsetMinutes * 60 * 1000;

  const start = new Date(startUtcMs);
  const end = new Date(endUtcMs);
  const totalMinutes = Math.max(0, Math.round((endUtcMs - startUtcMs) / 60000));

  return { start, end, totalMinutes };
}

/**
 * Normalizes and merges overlapping busy intervals (e.g. calendar events + buffers).
 */
export function mergeBusyIntervals(
  events: PlannerEvent[],
  windowStart: Date,
  windowEnd: Date,
  bufferMinutes: number = 0
): Array<{ start: Date; end: Date; event?: PlannerEvent }> {
  if (events.length === 0) return [];

  // Map events to interval clamped within or overlapping the work window
  const intervals: Array<{ start: Date; end: Date; event: PlannerEvent }> = [];

  for (const evt of events) {
    const rawStart = new Date(evt.startTime);
    const rawEnd = new Date(evt.endTime);

    // Apply buffer before and after event
    const startMs = Math.max(windowStart.getTime(), rawStart.getTime() - bufferMinutes * 60000);
    const endMs = Math.min(windowEnd.getTime(), rawEnd.getTime() + bufferMinutes * 60000);

    if (endMs > startMs) {
      intervals.push({
        start: new Date(startMs),
        end: new Date(endMs),
        event: evt,
      });
    }
  }

  // Sort by start time
  intervals.sort((a, b) => a.start.getTime() - b.start.getTime());

  // Merge overlapping intervals
  const merged: Array<{ start: Date; end: Date; event?: PlannerEvent }> = [];
  let current = intervals[0];

  for (let i = 1; i < intervals.length; i++) {
    const next = intervals[i];
    if (next.start.getTime() <= current.end.getTime()) {
      // Overlap or contiguous: merge
      current = {
        start: current.start,
        end: new Date(Math.max(current.end.getTime(), next.end.getTime())),
        event: current.event,
      };
    } else {
      merged.push(current);
      current = next;
    }
  }
  if (current) {
    merged.push(current);
  }

  return merged;
}

/**
 * Calculates free time intervals within the work window, subtracting merged busy intervals.
 */
export function calculateFreeSlots(
  windowStart: Date,
  windowEnd: Date,
  busyIntervals: Array<{ start: Date; end: Date }>
): TimeSlot[] {
  const freeSlots: TimeSlot[] = [];
  let currentPointer = windowStart.getTime();

  for (const busy of busyIntervals) {
    const busyStartMs = busy.start.getTime();
    const busyEndMs = busy.end.getTime();

    if (busyStartMs > currentPointer) {
      const durationMinutes = Math.round((busyStartMs - currentPointer) / 60000);
      if (durationMinutes > 0) {
        freeSlots.push({
          start: new Date(currentPointer),
          end: new Date(busyStartMs),
          durationMinutes,
        });
      }
    }

    currentPointer = Math.max(currentPointer, busyEndMs);
  }

  if (currentPointer < windowEnd.getTime()) {
    const durationMinutes = Math.round((windowEnd.getTime() - currentPointer) / 60000);
    if (durationMinutes > 0) {
      freeSlots.push({
        start: new Date(currentPointer),
        end: windowEnd,
        durationMinutes,
      });
    }
  }

  return freeSlots;
}
