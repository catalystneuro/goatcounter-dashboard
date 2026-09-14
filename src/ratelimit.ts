// GoatCounter allows 4 API requests per second per token (x-rate-limit-limit: 4),
// and the browser's CORS preflight for the Authorization header counts as one
// of them. This scheduler spaces request starts so the dashboard never trips
// the limit, and callers retry on 429 with the server's retry-after.

export interface Limiter {
  /** Resolves when the caller may start a request that costs `slots`. */
  acquire(slots?: number, signal?: AbortSignal): Promise<void>;
}

export function createLimiter(perSecond: number): Limiter {
  const interval = 1000 / perSecond;
  let nextFree = 0;
  return {
    acquire(slots = 1, signal?: AbortSignal): Promise<void> {
      const now = Date.now();
      const start = Math.max(now, nextFree);
      nextFree = start + interval * slots;
      const wait = start - now;
      if (wait <= 0) return Promise.resolve();
      return new Promise((resolve, reject) => {
        const t = setTimeout(() => {
          signal?.removeEventListener('abort', onAbort);
          resolve();
        }, wait);
        const onAbort = () => {
          clearTimeout(t);
          reject(abortError());
        };
        signal?.addEventListener('abort', onAbort, { once: true });
      });
    },
  };
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(abortError());
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export function abortError(): Error {
  const e = new Error('Aborted');
  e.name = 'AbortError';
  return e;
}
