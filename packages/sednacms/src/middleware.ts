import { cache } from 'virtual:sedna/cache';
import { platform } from 'virtual:sedna/platform';
import type { MiddlewareHandler } from 'astro';
import { createCacheMiddleware } from './cache.js';
import { createCdnCache } from './cdn.js';

const withoutCdn = createCacheMiddleware(cache);
let withCdn: MiddlewareHandler | undefined;

export const onRequest: MiddlewareHandler = (context, next) => {
  // Static pages cannot use the CDN cache and should not need runtime purge secrets.
  if (context.isPrerendered || !cache) return withoutCdn(context, next);
  withCdn ??= createCacheMiddleware(cache, createCdnCache(platform));
  return withCdn(context, next);
};
