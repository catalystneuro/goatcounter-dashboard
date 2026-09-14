import { matchPreset, presetRange, parseISODate, type DateRange, type PresetKey } from './dates';

export type ThemeName = 'neutral' | 'pine';
export type ColorScheme = 'system' | 'light' | 'dark';

export interface ViewState {
  site: string;
  range: DateRange;
  preset: PresetKey;
  goal: string;
  compare: boolean;
  theme: ThemeName;
}

export const DEFAULT_GOAL = '/apply/';
export const DEFAULT_THEME: ThemeName = 'neutral';

/** Normalize user input like "neurodata-ai", "neurodata-ai.goatcounter.com",
 *  "https://stats.example.com/" into the host used for API calls. */
export function normalizeSite(input: string): string {
  let s = input.trim().toLowerCase();
  s = s.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  if (!s) return '';
  if (!s.includes('.')) s = `${s}.goatcounter.com`;
  return s;
}

/** Short display name: the code for goatcounter.com sites, otherwise the host. */
export function siteDisplayName(host: string): string {
  return host.endsWith('.goatcounter.com') ? host.slice(0, -'.goatcounter.com'.length) : host;
}

export function apiBase(host: string): string {
  return `https://${host}/api/v0/`;
}

function normalizeGoal(g: string): string {
  const t = g.trim();
  if (!t) return '';
  return t.startsWith('/') ? t : `/${t}`;
}

/** Parse the shareable URL query. The token is never part of it. */
export function stateFromSearch(search: string, today = new Date()): ViewState {
  const q = new URLSearchParams(search);
  const site = normalizeSite(q.get('site') ?? '');
  const goal = normalizeGoal(q.get('goal') ?? '') || DEFAULT_GOAL;
  const compare = q.get('compare') === '1';
  const themeRaw = q.get('theme');
  const theme: ThemeName = themeRaw === 'pine' ? 'pine' : DEFAULT_THEME;

  let range: DateRange | null = null;
  const start = q.get('start');
  const end = q.get('end');
  if (start && end && parseISODate(start) && parseISODate(end) && start <= end) {
    range = { start, end };
  }
  const rangeKey = q.get('range');
  if (!range && rangeKey && rangeKey !== 'custom' && isPresetKey(rangeKey)) {
    range = presetRange(rangeKey, today);
  }
  if (!range) range = presetRange('30d', today);
  const preset = matchPreset(range, today);
  return { site, range, preset, goal, compare, theme };
}

function isPresetKey(k: string): k is Exclude<PresetKey, 'custom'> {
  return k === 'today' || k === '7d' || k === '30d' || k === '90d' || k === 'year';
}

/**
 * A token may be passed once in the URL (query or hash) to set up a browser from a
 * link. Returns it and a cleaned URL with the token removed from both places.
 */
export function extractUrlToken(search: string, hash: string): { token: string | null; search: string; hash: string } {
  const q = new URLSearchParams(search);
  const hq = new URLSearchParams(hash.replace(/^#/, ''));
  const token = (q.get('token') ?? hq.get('token') ?? '').trim() || null;
  q.delete('token');
  hq.delete('token');
  const qs = q.toString();
  const hs = hq.toString();
  return { token, search: qs ? `?${qs}` : '', hash: hs ? `#${hs}` : '' };
}

/** A one-time setup link: the shareable URL plus the token in the fragment. */
export function setupLink(base: string, s: ViewState, token: string): string {
  return `${base}${searchFromState(s)}#token=${encodeURIComponent(token)}`;
}

/** Build the query string for a state. Presets serialize as range=; custom as start/end. */
export function searchFromState(s: ViewState): string {
  const q = new URLSearchParams();
  if (s.site) q.set('site', siteDisplayName(s.site));
  if (s.preset !== 'custom') q.set('range', s.preset);
  else {
    q.set('start', s.range.start);
    q.set('end', s.range.end);
  }
  if (s.goal && s.goal !== DEFAULT_GOAL) q.set('goal', s.goal);
  if (s.compare) q.set('compare', '1');
  if (s.theme !== DEFAULT_THEME) q.set('theme', s.theme);
  const str = q.toString();
  return str ? `?${str}` : '';
}

// localStorage. Tokens are stored per site so one browser can hold several.
const TOKENS_KEY = 'gcd.tokens';
const LAST_SITE_KEY = 'gcd.lastSite';
const GOALS_KEY = 'gcd.goals';
const SCHEME_KEY = 'gcd.scheme';
const THEME_KEY = 'gcd.theme';

function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJSON(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode or blocked storage: the session still works, it just will not persist.
  }
}

export const storage = {
  getToken(site: string): string | null {
    return readJSON<Record<string, string>>(TOKENS_KEY, {})[site] ?? null;
  },
  setToken(site: string, token: string): void {
    const all = readJSON<Record<string, string>>(TOKENS_KEY, {});
    all[site] = token;
    writeJSON(TOKENS_KEY, all);
    writeJSON(LAST_SITE_KEY, site);
  },
  removeToken(site: string): void {
    const all = readJSON<Record<string, string>>(TOKENS_KEY, {});
    delete all[site];
    writeJSON(TOKENS_KEY, all);
    if (readJSON<string>(LAST_SITE_KEY, '') === site) writeJSON(LAST_SITE_KEY, '');
  },
  sites(): string[] {
    return Object.keys(readJSON<Record<string, string>>(TOKENS_KEY, {}));
  },
  lastSite(): string {
    return readJSON<string>(LAST_SITE_KEY, '');
  },
  getGoal(site: string): string | null {
    return readJSON<Record<string, string>>(GOALS_KEY, {})[site] ?? null;
  },
  setGoal(site: string, goal: string): void {
    const all = readJSON<Record<string, string>>(GOALS_KEY, {});
    all[site] = goal;
    writeJSON(GOALS_KEY, all);
  },
  getScheme(): ColorScheme {
    const v = readJSON<string>(SCHEME_KEY, 'system');
    return v === 'light' || v === 'dark' ? v : 'system';
  },
  setScheme(s: ColorScheme): void {
    writeJSON(SCHEME_KEY, s);
  },
  getTheme(): ThemeName | null {
    const v = readJSON<string>(THEME_KEY, '');
    return v === 'pine' || v === 'neutral' ? v : null;
  },
  setTheme(t: ThemeName): void {
    writeJSON(THEME_KEY, t);
  },
};
