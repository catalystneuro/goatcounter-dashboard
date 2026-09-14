// Typed client for the GoatCounter REST API (api/v0). Browser-only, no backend.
// Reference: https://<site>.goatcounter.com/api.json (OpenAPI 2.0).

import { cache, MINUTE } from './cache';
import { addDays, apiRange, todayIn, type DateRange } from './dates';
import { createLimiter, sleep, type Limiter } from './ratelimit';
import { apiBase } from './state';

export interface DayStat {
  day: string;
  daily: number;
  hourly: number[];
  weekly?: number;
  monthly?: number;
}

export interface TotalResponse {
  total: number;
  total_events: number;
  total_utc: number;
  stats: DayStat[];
}

export interface HitList {
  path: string;
  path_id: number;
  title: string;
  count: number;
  max: number;
  event: boolean;
  stats: DayStat[];
}

export interface HitsResponse {
  hits: HitList[];
  total: number;
  more: boolean;
}

export type RefScheme = 'h' | 'g' | 'c' | 'o';

export interface Stat {
  id?: string;
  name: string;
  count: number;
  ref_scheme?: RefScheme;
}

export interface StatsResponse {
  stats: Stat[];
  more: boolean;
}

export interface RefsResponse {
  refs: Stat[];
  more: boolean;
}

export interface MeResponse {
  token?: { name?: string; permissions?: unknown; created_at?: string; last_used_at?: string | null };
  user: { email: string; id: number; site: number; settings?: { timezone?: string; [k: string]: unknown } };
}

export type StatsPage = 'toprefs' | 'campaigns' | 'locations' | 'languages' | 'browsers' | 'systems' | 'sizes';

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    /** Seconds until the rate limit resets, when the server said. */
    public readonly retryAfter: number | null = null,
  ) {
    super(message);
    this.name = 'ApiError';
  }
  get isAuth(): boolean {
    return this.status === 401 || this.status === 403;
  }
  /** 429, or a network failure that is most likely a rate-limited preflight. */
  get isRateLimit(): boolean {
    return this.status === 429 || this.status === 0;
  }
}

export const RATE_LIMIT_MESSAGE =
  'GoatCounter is not accepting requests for this token right now. Its API allows 4 requests per second and a limited number per hour, and the browser cannot tell which limit was hit. Wait a few minutes and retry.';
export const OFFLINE_MESSAGE = 'You appear to be offline.';

export type QueryValue = string | number | boolean | undefined | null | (string | number)[];

/** Build a query string. Arrays repeat the key, which is how GoatCounter reads them. */
export function buildQuery(params: Record<string, QueryValue>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    if (Array.isArray(v)) {
      for (const item of v) q.append(k, String(item));
    } else if (typeof v === 'boolean') {
      if (v) q.set(k, 'true');
    } else {
      q.set(k, String(v));
    }
  }
  const s = q.toString();
  return s ? `?${s}` : '';
}

export interface ClientOptions {
  host: string;
  token: string;
  /** IANA timezone the site reports days in; defaults to UTC. */
  timezone?: string;
  fetchImpl?: typeof fetch;
  /** Request scheduler; defaults to one sized for GoatCounter's 4/s limit with preflights. */
  limiter?: Limiter;
  /** Slots one request costs against the limiter (2 = GET plus its CORS preflight). */
  slotsPerRequest?: number;
}

/** One shared scheduler per page, since the limit is per token, not per client. */
const defaultLimiter = createLimiter(4);

export class GoatCounterClient {
  private readonly base: string;
  private readonly token: string;
  private readonly fetchImpl: typeof fetch;
  private readonly limiter: Limiter;
  private readonly slots: number;
  timezone: string;

  constructor(opts: ClientOptions) {
    this.base = apiBase(opts.host);
    this.token = opts.token;
    this.timezone = opts.timezone ?? 'UTC';
    this.fetchImpl = opts.fetchImpl ?? ((input, init) => fetch(input, init));
    this.limiter = opts.limiter ?? defaultLimiter;
    this.slots = opts.slotsPerRequest ?? 2;
  }

  /** Hour-rounded UTC bounds for whole local days in the site's timezone. */
  rangeParams(r: DateRange): { start: string; end: string } {
    return apiRange(r, this.timezone);
  }

  /**
   * Bounds for the browser/system/location/referrer endpoints. GoatCounter stores
   * those per UTC day and matches buckets by the calendar dates of start and end in
   * the site's timezone, so a range ending today would miss this evening's visitors
   * west of UTC. Extending the end by a day when the range ends today fixes that
   * without admitting future data, since none exists yet.
   */
  dayBucketRangeParams(r: DateRange): { start: string; end: string } {
    const endsToday = r.end >= todayIn(this.timezone);
    return apiRange(endsToday ? { start: r.start, end: addDays(r.end, 1) } : r, this.timezone);
  }

  /**
   * GET with caching, pacing, and retries. `ttl` is how long a successful response
   * may be reused from the cache; 0 disables caching for this call.
   */
  async get<T>(path: string, params: Record<string, QueryValue> = {}, signal?: AbortSignal, ttl = 5 * MINUTE): Promise<T> {
    const url = this.base + path + buildQuery(params);
    if (ttl > 0) {
      const hit = cache.get<T>(url);
      if (hit !== undefined) return hit;
    }
    const maxAttempts = 3;
    for (let attempt = 1; ; attempt++) {
      await this.limiter.acquire(this.slots, signal);
      let res: Response;
      try {
        res = await this.fetchImpl(url, {
          headers: { Authorization: `Bearer ${this.token}`, Accept: 'application/json' },
          signal: signal ?? null,
        });
      } catch (e) {
        if ((e as Error).name === 'AbortError') throw e;
        if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new ApiError(OFFLINE_MESSAGE, 0);
        // A rate-limited CORS preflight surfaces as a network error. Retry briefly
        // for the per-second limit; give up quickly if the hourly budget is gone.
        if (attempt < maxAttempts) {
          await sleep(1500 * attempt, signal);
          continue;
        }
        throw new ApiError(RATE_LIMIT_MESSAGE, 0);
      }
      if (res.status === 429) {
        const reset = Number(res.headers.get('x-rate-limit-reset') ?? res.headers.get('retry-after') ?? '1');
        const seconds = Number.isFinite(reset) ? reset : 1;
        if (seconds <= 5 && attempt < maxAttempts) {
          await sleep(Math.max(500, seconds * 1000), signal);
          continue;
        }
        const mins = Math.max(1, Math.ceil(seconds / 60));
        throw new ApiError(`GoatCounter's request budget for this token is used up. It resets in about ${mins} minute${mins === 1 ? '' : 's'}.`, 429, seconds);
      }
      const value = await this.handle<T>(res);
      if (ttl > 0) cache.set(url, value, ttl);
      return value;
    }
  }

  /** Forget cached responses for this site so the next load asks GoatCounter again. */
  clearCache(): void {
    cache.clear(this.base);
  }

  /** Data for a range that has already ended does not change, so it can be kept much longer. */
  private ttlFor(r: DateRange): number {
    return r.end >= todayIn(this.timezone) ? 5 * MINUTE : 12 * 60 * MINUTE;
  }

  private async handle<T>(res: Response): Promise<T> {
    if (!res.ok) {
      let msg = `${res.status} ${res.statusText}`;
      try {
        const text = await res.text();
        try {
          const body = JSON.parse(text) as { error?: string; Error?: string; errors?: Record<string, string[]> };
          msg = body.error ?? body.Error ?? msg;
          if (body.errors) {
            msg += ': ' + Object.entries(body.errors).map(([k, v]) => `${k} ${v.join(', ')}`).join('; ');
          }
        } catch {
          // GoatCounter sends an HTML page for some errors; lift the message out of it.
          const m = /<p>\s*([^<]+?)\s*<\/p>/.exec(text);
          if (m?.[1]) msg = m[1];
        }
      } catch {
        // unreadable body
      }
      if (res.status === 401 || res.status === 403) msg = 'This token was rejected. It may be wrong, expired, or missing the "Read statistics" permission.';
      if (res.status === 429) msg = 'GoatCounter is rate-limiting requests. Try again in a moment.';
      throw new ApiError(msg, res.status);
    }
    return (await res.json()) as T;
  }

  me(signal?: AbortSignal): Promise<MeResponse> {
    return this.get<MeResponse>('me', {}, signal, 0);
  }

  total(r: DateRange, opts: { includePaths?: string[] } = {}, signal?: AbortSignal): Promise<TotalResponse> {
    const includePaths = opts.includePaths?.filter(Boolean);
    return this.get<TotalResponse>(
      'stats/total',
      {
        ...this.rangeParams(r),
        path_by_name: includePaths && includePaths.length > 0,
        include_paths: includePaths,
      },
      signal,
      this.ttlFor(r),
    );
  }

  hits(r: DateRange, opts: { limit?: number; excludePaths?: number[] } = {}, signal?: AbortSignal): Promise<HitsResponse> {
    return this.get<HitsResponse>(
      'stats/hits',
      { ...this.rangeParams(r), limit: opts.limit ?? 20, group: 'day', exclude_paths: opts.excludePaths },
      signal,
      this.ttlFor(r),
    );
  }

  pathRefs(r: DateRange, pathId: number, opts: { limit?: number; offset?: number } = {}, signal?: AbortSignal): Promise<RefsResponse> {
    return this.get<RefsResponse>(`stats/hits/${pathId}`, { ...this.rangeParams(r), limit: opts.limit ?? 20, offset: opts.offset }, signal, this.ttlFor(r));
  }

  stats(page: StatsPage, r: DateRange, opts: { limit?: number; offset?: number } = {}, signal?: AbortSignal): Promise<StatsResponse> {
    return this.get<StatsResponse>(`stats/${page}`, { ...this.dayBucketRangeParams(r), limit: opts.limit ?? 20, offset: opts.offset }, signal, this.ttlFor(r));
  }

  statDetail(page: StatsPage, id: string, r: DateRange, opts: { limit?: number; offset?: number } = {}, signal?: AbortSignal): Promise<StatsResponse> {
    return this.get<StatsResponse>(
      `stats/${page}/${encodeURIComponent(id)}`,
      { ...this.dayBucketRangeParams(r), limit: opts.limit ?? 20, offset: opts.offset },
      signal,
      this.ttlFor(r),
    );
  }

  /** Page through stats/{page} to collect every entry (capped to keep requests bounded). */
  async allStats(page: StatsPage, r: DateRange, signal?: AbortSignal, maxPages = 10): Promise<Stat[]> {
    const limit = 100;
    const out: Stat[] = [];
    for (let i = 0; i < maxPages; i++) {
      const res = await this.stats(page, r, { limit, offset: i * limit }, signal);
      out.push(...res.stats);
      if (!res.more || res.stats.length === 0) break;
    }
    return out;
  }
}
