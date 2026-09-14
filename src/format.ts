// Number and text formatting. Values stay in text tokens; these only produce strings.

const intFmt = new Intl.NumberFormat('en-US');

/** Full integer with thousands separators: 1,284. */
export function formatInt(n: number): string {
  return intFmt.format(Math.round(n));
}

/** Compact figure for tiles and bar tips: 987 / 1.3K / 12.9K / 4.2M. */
export function formatCompact(n: number): string {
  const abs = Math.abs(n);
  if (abs < 1000) return formatInt(n);
  if (abs < 10_000) return trim((n / 1000).toFixed(1)) + 'K';
  if (abs < 1_000_000) return trim((n / 1000).toFixed(0)) + 'K';
  if (abs < 10_000_000) return trim((n / 1_000_000).toFixed(1)) + 'M';
  return trim((n / 1_000_000).toFixed(0)) + 'M';
}

function trim(s: string): string {
  return s.replace(/\.0$/, '');
}

/** Share of a total as a percent string: 12.3% (one decimal below 10, none above). */
export function formatShare(part: number, total: number): string {
  if (total <= 0) return '0%';
  const pct = (part / total) * 100;
  if (pct >= 10) return `${Math.round(pct)}%`;
  if (pct >= 1) return `${pct.toFixed(1)}%`;
  if (pct === 0) return '0%';
  return pct < 0.1 ? '<0.1%' : `${pct.toFixed(1)}%`;
}

export interface Delta {
  /** Signed percent change, or null when the previous value was zero. */
  pct: number | null;
  /** Absolute change. */
  abs: number;
  direction: 'up' | 'down' | 'flat';
}

export function computeDelta(current: number, previous: number): Delta {
  const abs = current - previous;
  const direction = abs > 0 ? 'up' : abs < 0 ? 'down' : 'flat';
  const pct = previous === 0 ? null : (abs / previous) * 100;
  return { pct, abs, direction };
}

/** "+12%" / "-3%" / "0%" / "new" when there is no baseline. */
export function formatDelta(d: Delta): string {
  if (d.pct === null) return d.abs === 0 ? '0%' : 'new';
  const rounded = Math.abs(d.pct) >= 10 ? Math.round(d.pct) : Number(d.pct.toFixed(1));
  const sign = rounded > 0 ? '+' : rounded < 0 ? '-' : '';
  return `${sign}${Math.abs(rounded)}%`;
}

/** Round an axis maximum up to a clean tick ceiling and return tick values. */
export function niceTicks(max: number, count = 4): number[] {
  if (max <= 0) return [0, 1];
  const rough = max / count;
  const mag = 10 ** Math.floor(Math.log10(rough));
  const norm = rough / mag;
  // d3-style thresholds (sqrt(2), sqrt(10), sqrt(50)) pick the nearest clean step.
  const step = (norm >= 7.07 ? 10 : norm >= 3.16 ? 5 : norm >= 1.41 ? 2 : 1) * mag;
  const ticks: number[] = [];
  for (let v = 0; v < max + step; v += step) ticks.push(Number(v.toPrecision(12)));
  return ticks;
}
