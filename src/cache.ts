import { AsyncLocalStorage } from 'node:async_hooks';
import type { MiddlewareHandler } from 'astro';
import { type CdnCache, collectionTag } from './cdn.js';

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

const requests = new AsyncLocalStorage<{
  used: boolean;
  failed: boolean;
  collections: Set<string>;
}>();

function disableCdnCaching(headers: Headers) {
  for (const name of [
    'CDN-Cache-Control',
    'Netlify-CDN-Cache-Control',
    'Vercel-CDN-Cache-Control',
    'Cloudflare-CDN-Cache-Control',
  ])
    headers.set(name, 'no-store');
  for (const name of ['Cache-Tag', 'Netlify-Cache-Tag', 'Vercel-Cache-Tag']) headers.delete(name);
}

/** Called by the live loader, including for empty collections and missing entries. */
export function markContentRequest(failed = false, collection?: string) {
  const state = requests.getStore();
  if (state) {
    state.used = true;
    state.failed ||= failed;
    if (collection) state.collections.add(collection);
  }
}

// Prerendered routes already warned about, so each route warns once per process.
const warnedRoutes = new Set<string>();

export function createCacheMiddleware(
  cache?: false | CacheOptions,
  cdn?: CdnCache,
): MiddlewareHandler {
  validateCache(cache);
  return async (context, next) => {
    if (context.isPrerendered) {
      // Prerendered pages are never cached here, but a CMS read means the content is frozen at build.
      const state = { used: false, failed: false, collections: new Set<string>() };
      return requests.run(state, async () => {
        const response = await next();
        const route = context.routePattern ?? new URL(context.request.url).pathname;
        if (state.collections.size && !warnedRoutes.has(route)) {
          warnedRoutes.add(route);
          console.warn(
            `[sednacms] ${route} is prerendered but reads Sedna collection ${[...state.collections].map((c) => `"${c}"`).join(', ')}. Its content is frozen at build time. Add \`export const prerender = false\` to the page.`,
          );
        }
        return response;
      });
    }
    const state = { used: false, failed: false, collections: new Set<string>() };
    return requests.run(state, async () => {
      const response = await next();
      const path = new URL(context.request.url).pathname;
      const admin = /^\/(?:admin(?:\/|$)|api\/cms(?:\/|$))/.test(path);
      if (!state.used && !admin) return response;
      // Clone headers so responses returned by fetch() can be handled too.
      const headers = new Headers(response.headers);
      if (cache) {
        const vary = new Set(
          (headers.get('Vary') ?? '')
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean),
        );
        // Vercel refuses to cache Vary: Cookie. Opt-in pages there must be identical
        // for all visitors. Preserve any explicit Cookie variation supplied by the page.
        for (const name of cdn?.platform === 'vercel'
          ? ['Authorization']
          : ['Cookie', 'Authorization']) {
          if (![...vary].some((value) => value.toLowerCase() === name.toLowerCase()))
            vary.add(name);
        }
        headers.set('Vary', [...vary].join(', '));
      }
      const privateResponse =
        admin ||
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
        disableCdnCaching(headers);
      } else if (!headers.has('Cache-Control')) {
        // A host may honor these standard headers or serve every request from the origin.
        headers.set('Cache-Control', `public, max-age=0, s-maxage=${cache.ttl}, must-revalidate`);
        if (cdn && state.collections.size) {
          headers.set(
            cdn.controlHeader,
            `public, ${cdn.platform === 'netlify' ? 'durable, ' : ''}max-age=${cache.ttl}, must-revalidate`,
          );
          const tags = new Set(
            (headers.get(cdn.tagHeader) ?? '')
              .split(',')
              .map((tag) => tag.trim())
              .filter(Boolean),
          );
          for (const collection of state.collections) tags.add(collectionTag(collection));
          headers.set(cdn.tagHeader, [...tags].join(','));
        }
      } else {
        // A page's own policy opts out of Sedna-managed CDN caching. Targeted
        // headers must not override a private/no-store page policy.
        disableCdnCaching(headers);
      }
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    });
  };
}
