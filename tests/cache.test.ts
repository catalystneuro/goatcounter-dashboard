import { describe, expect, it, beforeEach } from 'vitest';
import { cache } from '../src/cache';
import { GoatCounterClient } from '../src/api';
import { createLimiter } from '../src/ratelimit';

// Minimal localStorage for node.
const store = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: () => null,
  length: 0,
} as Storage;

const fast = { limiter: createLimiter(10_000), slotsPerRequest: 1 };

describe('response cache', () => {
  beforeEach(() => cache.clear());

  it('honours ttl', () => {
    cache.set('k', { a: 1 }, 1000, 0);
    expect(cache.get('k', 500)).toEqual({ a: 1 });
    expect(cache.get('k', 1500)).toBeUndefined();
  });

  it('serves repeated client calls from cache and clears per site', async () => {
    let n = 0;
    const fetchImpl: typeof fetch = async () => {
      n++;
      return new Response(JSON.stringify({ stats: [], more: false }), { status: 200 });
    };
    const c = new GoatCounterClient({ host: 'x.goatcounter.com', token: 't', fetchImpl, ...fast });
    const r = { start: '2026-01-01', end: '2026-01-02' };
    await c.stats('browsers', r);
    await c.stats('browsers', r);
    expect(n).toBe(1);
    c.clearCache();
    await c.stats('browsers', r);
    expect(n).toBe(2);
  });

  it('gives up immediately on a long rate-limit reset', async () => {
    const fetchImpl: typeof fetch = async () => new Response('', { status: 429, headers: { 'x-rate-limit-reset': '1177' } });
    const c = new GoatCounterClient({ host: 'x.goatcounter.com', token: 't', fetchImpl, ...fast });
    await expect(c.stats('browsers', { start: '2026-01-01', end: '2026-01-02' })).rejects.toThrow(/resets in about 20 minutes/);
  });
});
