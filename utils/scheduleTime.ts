/**
 * Builds the accessible day-button label used by the date picker, e.g.
 * "Today, Tuesday, July 7th," for the current date, or
 * "Wednesday, July 8th," for any other date -- matching the pattern in
 * the original hardcoded locator, but computed dynamically so it doesn't
 * go stale the day after it's written.
 *
 * ASSUMPTION: the calendar's accessible-name format stays consistent
 * (weekday, month, ordinal day, trailing comma, "Today, " prefix only
 * for the current date). If the picker library changes its label
 * format, re-check this against the accessibility tree (Playwright
 * codegen or the browser's Accessibility panel) and adjust.
 */
export function formatCalendarDayLabel(date: Date): string {
  const isToday = isSameCalendarDay(date, new Date());
  const weekday = date.toLocaleDateString('en-US', { weekday: 'long' });
  const month = date.toLocaleDateString('en-US', { month: 'long' });
  const day = ordinal(date.getDate());
  const prefix = isToday ? 'Today, ' : '';
  return `${prefix}${weekday}, ${month} ${day},`;
}

function isSameCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function ordinal(n: number): string {
  const suffixes = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${suffixes[(v - 20) % 10] ?? suffixes[v] ?? suffixes[0]}`;
}

/** 24-hour, zero-padded -- e.g. 14:00 -> "14", 09:00 -> "09". Confirmed via codegen: the hour column runs 00-23. */
export function formatHour24(date: Date): string {
  return String(date.getHours()).padStart(2, '0');
}

/** The picker only offers 10-minute increments: 00, 10, 20, 30, 40, 50 (confirmed via codegen). */
export const MINUTE_STEP = 10;

/**
 * Snaps a Date to the nearest available minute step, carrying overflow
 * into the hour (e.g. 14:56 -> 15:00). Use this BEFORE selecting the
 * time in the UI, and use the returned value (not the original target)
 * as the actual scheduled time for any later assertions/polling --
 * otherwise the test waits for a moment that was never really selected.
 */
export function snapToMinuteStep(date: Date, step: number = MINUTE_STEP): Date {
  const snapped = new Date(date);
  const rounded = Math.round(date.getMinutes() / step) * step;
  if (rounded === 60) {
    snapped.setHours(snapped.getHours() + 1, 0, 0, 0);
  } else {
    snapped.setMinutes(rounded, 0, 0);
  }
  return snapped;
}

/**
 * Resolves the target scheduled time from env, so it (or its offset) can
 * be changed without touching code.
 *
 *  - SCHEDULE_AT: absolute ISO datetime, e.g. "2026-07-09T15:30:00" --
 *    takes priority if set.
 *  - SCHEDULE_OFFSET_MINUTES: minutes from "now" (when this is called),
 *    used if SCHEDULE_AT isn't set. Defaults to 10.
 */
export function resolveScheduledTime(referenceTime: Date = new Date()): {
  scheduledTime: Date;
  offsetMinutes: number;
} {
  const explicit = process.env.SCHEDULE_AT;
  if (explicit) {
    const scheduledTime = new Date(explicit);
    if (Number.isNaN(scheduledTime.getTime())) {
      throw new Error(`SCHEDULE_AT is not a valid date/time: "${explicit}"`);
    }
    const offsetMinutes = Math.round((scheduledTime.getTime() - referenceTime.getTime()) / 60_000);
    return { scheduledTime, offsetMinutes };
  }

  const raw = process.env.SCHEDULE_OFFSET_MINUTES ?? '10';
  const offsetMinutes = Number(raw);
  if (!Number.isFinite(offsetMinutes) || offsetMinutes <= 0) {
    throw new Error(`SCHEDULE_OFFSET_MINUTES must be a positive number, got "${raw}"`);
  }

  const scheduledTime = new Date(referenceTime.getTime() + offsetMinutes * 60_000);
  return { scheduledTime, offsetMinutes };
}