import { describe, expect, it } from 'vitest';
import { ApiError, GoatCounterClient, buildQuery } from '../src/api';
import { createLimiter } from '../src/ratelimit';

const fast = { limiter: createLimiter(10_000), slotsPerRequest: 1 };

describe('api', () => {
  it('builds queries with repeated array keys and skips empties', () => {
    expect(buildQuery({ start: '2026-09-01', end: '2026-09-13', limit: 20, group: 'day', exclude_paths: [1, 2] })).toBe(
      '?start=2026-09-01&end=2026-09-13&limit=20&group=day&exclude_paths=1&exclude_paths=2',
    );
    expect(buildQuery({ path_by_name: true, include_paths: ['/apply/'], offset: undefined, x: '' })).toBe('?path_by_name=true&include_paths=%2Fapply%2F');
    expect(buildQuery({ path_by_name: false })).toBe('');
  });

  it('sends the bearer header and parses JSON', async () => {
    const calls: { url: string; auth: string | undefined }[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const headers = init?.headers as Record<string, string>;
      calls.push({ url: String(input), auth: headers['Authorization'] });
      return new Response(JSON.stringify({ total: 5, total_events: 0, total_utc: 5, stats: [] }), { status: 200 });
    };
    const c = new GoatCounterClient({ host: 'neurodata-ai.goatcounter.com', token: 'abc', fetchImpl, ...fast });
    const r = await c.total({ start: '2026-09-01', end: '2026-09-13' }, { includePaths: ['/apply/'] });
    expect(r.total).toBe(5);
    expect(calls[0]?.url).toBe('https://neurodata-ai.goatcounter.com/api/v0/stats/total?start=2026-09-01T00%3A00%3A00Z&end=2026-09-13T23%3A00%3A00Z&path_by_name=true&include_paths=%2Fapply%2F');
    expect(calls[0]?.auth).toBe('Bearer abc');
  });

  it('uses the site timezone for day bounds', async () => {
    const urls: string[] = [];
    const fetchImpl: typeof fetch = async (input) => {
      urls.push(String(input));
      return new Response(JSON.stringify({ hits: [], total: 0, more: false }), { status: 200 });
    };
    const c = new GoatCounterClient({ host: 'x.goatcounter.com', token: 't', timezone: 'America/New_York', fetchImpl, ...fast });
    await c.hits({ start: '2026-09-13', end: '2026-09-13' });
    // Sep 13 in New York (EDT, UTC-4) runs from 04:00Z to 03:00Z the next day, inclusive hours.
    expect(urls[0]).toContain('start=2026-09-13T04%3A00%3A00Z&end=2026-09-14T03%3A00%3A00Z');
  });

  it('lifts error text out of GoatCounter HTML error pages', async () => {
    const html = '<html><body><div class="page"><h1>Error 400</h1><p>invalid query parameters: no suitable time formats</p></div></body></html>';
    const fetchImpl: typeof fetch = async () => new Response(html, { status: 400 });
    const c = new GoatCounterClient({ host: 'x.goatcounter.com', token: 't', fetchImpl, ...fast });
    await expect(c.me()).rejects.toThrow(/no suitable time formats/);
  });

  it('maps auth failures to a friendly ApiError', async () => {
    const fetchImpl: typeof fetch = async () => new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
    const c = new GoatCounterClient({ host: 'x.goatcounter.com', token: 'bad', fetchImpl, ...fast });
    await expect(c.me()).rejects.toMatchObject({ status: 401 });
    try {
      await c.me();
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      expect((e as ApiError).isAuth).toBe(true);
      expect((e as ApiError).message).toMatch(/Read statistics/);
    }
  });

  it('paginates allStats until more is false', async () => {
    let n = 0;
    const fetchImpl: typeof fetch = async () => {
      n++;
      const more = n < 3;
      return new Response(JSON.stringify({ stats: [{ id: String(n), name: `c${n}`, count: 1 }], more }), { status: 200 });
    };
    const c = new GoatCounterClient({ host: 'x.goatcounter.com', token: 't', fetchImpl, ...fast });
    const all = await c.allStats('locations', { start: '2026-09-01', end: '2026-09-13' });
    expect(all.map((s) => s.id)).toEqual(['1', '2', '3']);
  });
});

describe('rate limiting', () => {
  it('spaces request starts to the configured rate', async () => {
    const limiter = createLimiter(20); // 50ms per slot
    const t0 = Date.now();
    await Promise.all([limiter.acquire(1), limiter.acquire(1), limiter.acquire(1), limiter.acquire(1)]);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(140);
  });

  it('retries on 429 using retry-after', async () => {
    let n = 0;
    const fetchImpl: typeof fetch = async () => {
      n++;
      if (n === 1) return new Response('slow down', { status: 429, headers: { 'retry-after': '0' } });
      return new Response(JSON.stringify({ stats: [], more: false }), { status: 200 });
    };
    const c = new GoatCounterClient({ host: 'x.goatcounter.com', token: 't', fetchImpl, limiter: createLimiter(1000), slotsPerRequest: 1 });
    const r = await c.stats('browsers', { start: '2026-09-01', end: '2026-09-02' });
    expect(r.stats).toEqual([]);
    expect(n).toBe(2);
  });
});

describe('day-bucket ranges', () => {
  it('extends the end by a day for page stats only when the range ends today', async () => {
    const urls: string[] = [];
    const fetchImpl: typeof fetch = async (input) => {
      urls.push(String(input));
      return new Response(JSON.stringify({ stats: [], more: false }), { status: 200 });
    };
    const c = new GoatCounterClient({ host: 'x.goatcounter.com', token: 't', timezone: 'UTC', fetchImpl, ...fast });
    const today = new Date().toISOString().slice(0, 10);
    await c.stats('browsers', { start: today, end: today });
    await c.stats('browsers', { start: '2026-01-01', end: '2026-01-02' });
    expect(urls[0]).not.toContain(`end=${today}T23`);
    expect(urls[1]).toContain('start=2026-01-01T00%3A00%3A00Z&end=2026-01-02T23%3A00%3A00Z');
  });
});
