import { cache } from 'virtual:sedna/cache';
import { platform } from 'virtual:sedna/platform';
import { createCacheMiddleware } from './cache.js';
import { createCdnCache } from './cdn.js';

export const onRequest = createCacheMiddleware(cache, cache ? createCdnCache(platform) : undefined);
