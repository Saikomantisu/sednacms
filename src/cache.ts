import { AsyncLocalStorage } from 'node:async_hooks';
import type { MiddlewareHandler } from 'astro';

export interface CacheOptions {
  /** Shared-cache lifetime in seconds. Browsers must revalidate every request. */
  ttl: number;
}

export function validateCache(cache?: false | CacheOptions) {
  if (
    cache !== undefined &&
    cache !== false &&
    (!cache || !Number.isSafeInteger(cache.ttl) || cache.ttl < 1)
  )
    throw new Error(
      'sednacms: cache.ttl must be a positive integer in seconds. Use cache: false to disable caching.',
    );
}

const requests = new AsyncLocalStorage<{ used: boolean; failed: boolean }>();

/** Called by the live loader, including for empty collections and missing entries. */
export function markContentRequest(failed = false) {
  const state = requests.getStore();
  if (state) {
    state.used = true;
    state.failed ||= failed;
  }
}

export function createCacheMiddleware(cache?: false | CacheOptions): MiddlewareHandler {
  validateCache(cache);
  return async (context, next) => {
    if (context.isPrerendered) return next();
    const state = { used: false, failed: false };
    return requests.run(state, async () => {
      const response = await next();
      if (!state.used) return response;
      // Clone headers so responses returned by fetch() can be handled too.
      const headers = new Headers(response.headers);
      if (cache) {
        const vary = new Set(
          (headers.get('Vary') ?? '')
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean),
        );
        for (const name of ['Cookie', 'Authorization']) {
          if (![...vary].some((value) => value.toLowerCase() === name.toLowerCase()))
            vary.add(name);
        }
        headers.set('Vary', [...vary].join(', '));
      }
      const privateResponse =
        state.failed ||
        response.status !== 200 ||
        !['GET', 'HEAD'].includes(context.request.method) ||
        context.request.headers.has('Cookie') ||
        context.request.headers.has('Authorization') ||
        headers.has('Set-Cookie') ||
        headers
          .get('Vary')
          ?.split(',')
          .some((value) => value.trim() === '*');
      if (!cache || privateResponse) {
        headers.set('Cache-Control', 'no-store');
      } else if (!headers.has('Cache-Control')) {
        // A host may honor these standard headers or serve every request from the origin.
        headers.set('Cache-Control', `public, max-age=0, s-maxage=${cache.ttl}, must-revalidate`);
      }
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    });
  };
}
