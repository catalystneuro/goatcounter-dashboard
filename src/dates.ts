// Date helpers. All dates are handled as local calendar days in ISO "YYYY-MM-DD" form,
// which is what the GoatCounter API accepts for start/end.

export type PresetKey = 'today' | '7d' | '30d' | '90d' | 'year' | 'custom';

export interface DateRange {
  /** Inclusive start day, YYYY-MM-DD. */
  start: string;
  /** Inclusive end day, YYYY-MM-DD. */
  end: string;
}

export const PRESETS: { key: PresetKey; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: '7d', label: '7 days' },
  { key: '30d', label: '30 days' },
  { key: '90d', label: '90 days' },
  { key: 'year', label: 'Year' },
  { key: 'custom', label: 'Custom' },
];

export function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function parseISODate(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (Number.isNaN(d.getTime())) return null;
  // Reject things like 2026-02-31 that Date silently rolls over.
  return toISODate(d) === s ? d : null;
}

export function addDays(iso: string, days: number): string {
  const d = parseISODate(iso);
  if (!d) throw new Error(`bad date ${iso}`);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

/** Number of calendar days in an inclusive range. */
export function rangeLength(r: DateRange): number {
  const a = parseISODate(r.start);
  const b = parseISODate(r.end);
  if (!a || !b) throw new Error('bad range');
  return Math.round((b.getTime() - a.getTime()) / 86_400_000) + 1;
}

/** Every day in the range, inclusive, in order. */
export function eachDay(r: DateRange): string[] {
  const n = rangeLength(r);
  const out: string[] = [];
  for (let i = 0; i < n; i++) out.push(addDays(r.start, i));
  return out;
}

/** Resolve a preset against a reference "today". */
export function presetRange(key: Exclude<PresetKey, 'custom'>, today = new Date()): DateRange {
  const end = toISODate(today);
  switch (key) {
    case 'today':
      return { start: end, end };
    case '7d':
      return { start: addDays(end, -6), end };
    case '30d':
      return { start: addDays(end, -29), end };
    case '90d':
      return { start: addDays(end, -89), end };
    case 'year':
      return { start: addDays(end, -364), end };
  }
}

/** The period of equal length immediately before the given one. */
export function previousPeriod(r: DateRange): DateRange {
  const n = rangeLength(r);
  const end = addDays(r.start, -1);
  return { start: addDays(end, -(n - 1)), end };
}

/** Does this range match a preset for the given today? */
export function matchPreset(r: DateRange, today = new Date()): PresetKey {
  for (const p of PRESETS) {
    if (p.key === 'custom') continue;
    const pr = presetRange(p.key, today);
    if (pr.start === r.start && pr.end === r.end) return p.key;
  }
  return 'custom';
}

/** Hourly buckets are more useful than daily for very short ranges. */
export function isHourly(r: DateRange): boolean {
  return rangeLength(r) <= 2;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Sep 13" or "Sep 13, 2025" when the year differs from the reference. */
export function shortDate(iso: string, refYear?: number): string {
  const d = parseISODate(iso);
  if (!d) return iso;
  const base = `${MONTHS[d.getMonth()]} ${d.getDate()}`;
  return refYear !== undefined && d.getFullYear() !== refYear ? `${base}, ${d.getFullYear()}` : base;
}

export function weekdayShort(iso: string): string {
  const d = parseISODate(iso);
  if (!d) return '';
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()] ?? '';
}

/** "Aug 15 to Sep 13, 2026" */
export function rangeLabel(r: DateRange): string {
  const a = parseISODate(r.start);
  const b = parseISODate(r.end);
  if (!a || !b) return `${r.start} to ${r.end}`;
  if (r.start === r.end) return `${shortDate(r.start)}, ${b.getFullYear()}`;
  if (a.getFullYear() === b.getFullYear()) return `${shortDate(r.start)} to ${shortDate(r.end)}, ${b.getFullYear()}`;
  return `${shortDate(r.start)}, ${a.getFullYear()} to ${shortDate(r.end)}, ${b.getFullYear()}`;
}

export function hourLabel(h: number): string {
  if (h === 0) return '12am';
  if (h === 12) return '12pm';
  return h < 12 ? `${h}am` : `${h - 12}pm`;
}

// Timezone handling. GoatCounter reads start/end as UTC instants (hour granularity,
// both inclusive) and labels days in the account's timezone. To ask for whole local
// days we convert the local midnight of each day to a UTC instant.

function tzOffsetMinutes(date: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? '0');
  const asUTC = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'));
  return Math.round((asUTC - date.getTime()) / 60_000);
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** GoatCounter reports timezones like "US.America/New_York"; the IANA name follows the first dot. */
export function parseGoatCounterTimezone(raw: string | undefined | null): string {
  if (!raw) return 'UTC';
  const idx = raw.indexOf('.');
  const name = idx >= 0 ? raw.slice(idx + 1) : raw;
  return isValidTimeZone(name) ? name : 'UTC';
}

/** The UTC instant of local midnight at the start of `iso` in `tz`. */
export function zonedMidnightUTC(iso: string, tz: string): Date {
  const d = parseISODate(iso);
  if (!d) throw new Error(`bad date ${iso}`);
  const guess = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  let off = tzOffsetMinutes(new Date(guess), tz);
  const first = guess - off * 60_000;
  off = tzOffsetMinutes(new Date(first), tz);
  return new Date(guess - off * 60_000);
}

/** Today's calendar date in `tz`. */
export function todayIn(tz: string, now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Current hour (0-23) in `tz`. */
export function hourIn(tz: string, now = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', hour: '2-digit' }).formatToParts(now);
  return Number(parts.find((p) => p.type === 'hour')?.value ?? '0') % 24;
}

function isoHour(d: Date): string {
  return d.toISOString().slice(0, 13) + ':00:00Z';
}

/** API start/end for an inclusive local-day range in `tz`. */
export function apiRange(r: DateRange, tz: string): { start: string; end: string } {
  const start = zonedMidnightUTC(r.start, tz);
  const endExclusive = zonedMidnightUTC(addDays(r.end, 1), tz);
  const end = new Date(endExclusive.getTime() - 3_600_000);
  return { start: isoHour(start), end: isoHour(end) };
}
