import { cache } from 'virtual:sedna/cache';
import { platform } from 'virtual:sedna/platform';
import { requestScoped } from 'virtual:sedna/runtime';
import type { MiddlewareHandler } from 'astro';
import { createCacheMiddleware } from './cache.js';
import { createCdnCache } from './cdn.js';
import { withRequestResources } from './runtime.js';

const withoutCdn = createCacheMiddleware(cache);
let withCdn: ReturnType<typeof createCacheMiddleware> | undefined;

export const onRequest: MiddlewareHandler = (context, next) => {
  const run = async () => handle(context, next);
  return requestScoped && !context.isPrerendered ? withRequestResources(run) : run();
};

const handle: ReturnType<typeof createCacheMiddleware> = (context, next) => {
  // Static pages cannot use the CDN cache and should not need runtime purge secrets.
  if (context.isPrerendered || !cache) return withoutCdn(context, next);
  withCdn ??= createCacheMiddleware(cache, createCdnCache(platform));
  return withCdn(context, next);
};
