import { cache } from 'virtual:sedna/cache';
import { createCacheMiddleware } from './cache.js';

export const onRequest = createCacheMiddleware(cache);
