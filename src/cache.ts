// A small response cache so that revisiting a range, toggling compare, or
// reloading the page does not spend GoatCounter's per-token request budget
// again. Entries live in memory and in localStorage with a time-to-live.

const KEY = 'gcd.cache';
const MAX_ENTRIES = 120;

interface Entry {
  t: number;
  ttl: number;
  v: unknown;
}

let mem: Record<string, Entry> | null = null;

function load(): Record<string, Entry> {
  if (mem) return mem;
  try {
    mem = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, Entry>;
  } catch {
    mem = {};
  }
  return mem;
}

function persist(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(mem ?? {}));
  } catch {
    // Storage full or blocked: the in-memory copy still works for this session.
  }
}

export const cache = {
  get<T>(key: string, now = Date.now()): T | undefined {
    const e = load()[key];
    if (!e) return undefined;
    if (now - e.t > e.ttl) return undefined;
    return e.v as T;
  },
  set(key: string, value: unknown, ttl: number, now = Date.now()): void {
    const all = load();
    all[key] = { t: now, ttl, v: value };
    const keys = Object.keys(all);
    if (keys.length > MAX_ENTRIES) {
      keys
        .sort((a, b) => (all[a]?.t ?? 0) - (all[b]?.t ?? 0))
        .slice(0, keys.length - MAX_ENTRIES)
        .forEach((k) => delete all[k]);
    }
    persist();
  },
  /** Drop every entry whose key starts with the prefix (a site's API base). */
  clear(prefix = ''): void {
    const all = load();
    for (const k of Object.keys(all)) if (k.startsWith(prefix)) delete all[k];
    persist();
  },
};

export const MINUTE = 60_000;
