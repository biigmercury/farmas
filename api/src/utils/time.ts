// Nigeria is UTC+1 all year (no daylight saving), so farm dates and reminder times are worked out in that zone.

const ZONE = "Africa/Lagos";
const OFFSET = "+01:00";
export const DAY_MS = 24 * 60 * 60 * 1000;

/** "Fri, 23 Oct" */
export function lagosDate(value: Date | string): string {
  return new Date(value).toLocaleDateString("en-NG", { weekday: "short", day: "numeric", month: "short", timeZone: ZONE });
}

/** "23 Oct 2026" */
export function lagosDateLong(value: Date | string): string {
  return new Date(value).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric", timeZone: ZONE });
}

/** "Fri, 23 Oct, 8:00 am" */
export function lagosDateTime(value: Date | string): string {
  const d = new Date(value);
  const time = d.toLocaleTimeString("en-NG", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: ZONE });
  return `${lagosDate(d)}, ${time}`;
}

/** "2026-10-23T08:00" (Nigeria local time) -> the real moment as a Date, or null if it is not a valid time. */
export function parseLagosLocal(raw?: string | null): Date | null {
  if (!raw) return null;
  const m = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(raw.trim());
  if (!m) return null;
  const date = new Date(`${m[1]}T${m[2] ?? "08"}:${m[3] ?? "00"}:00${OFFSET}`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** First moment of a Nigerian calendar day ("2026-09-01"). */
export function lagosDayStart(day: string): Date | null {
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? parseLagosLocal(`${day}T00:00`) : null;
}

/** First moment of the day AFTER the given Nigerian calendar day, so the whole last day is included. */
export function lagosDayAfter(day: string): Date | null {
  const start = lagosDayStart(day);
  return start ? new Date(start.getTime() + DAY_MS) : null;
}
