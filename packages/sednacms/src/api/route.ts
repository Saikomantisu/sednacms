import { cache } from 'virtual:sedna/cache';
import { collections } from 'virtual:sedna/collections';
import { platform } from 'virtual:sedna/platform';
import { storage } from 'virtual:sedna/storage';
import type { APIRoute } from 'astro';
import { AuthConfigurationError, getAuthServer } from '../auth/server.js';
import { createCdnCache } from '../cdn.js';
import { createPool } from '../db/client.js';
import { isSednaLoader } from '../loader.js';
import { log, logOnce } from '../log.js';
import { createContentApi } from './content.js';
import { createMediaApi } from './media.js';
import { createUploadApi } from './uploads.js';

export const prerender = false;
let media: ReturnType<typeof createMediaApi> | undefined;
let db: ReturnType<typeof createPool> | undefined;
let content: ReturnType<typeof createContentApi> | undefined;
let uploads: ReturnType<typeof createUploadApi> | undefined;
export const ALL: APIRoute = async ({ request, clientAddress }) => {
  try {
    const authServer = getAuthServer();
    const path = new URL(request.url).pathname;
    if (path === '/api/cms/setup' || path.startsWith('/api/cms/auth/')) {
      const headers = new Headers(request.headers);
      // Overwrite incoming values so callers cannot spoof their rate-limit bucket.
      headers.set('x-sedna-client-ip', clientAddress);
      return await authServer.handle(new Request(request, { headers }));
    }
    const getSession = async (headers: Headers) => {
      await authServer.ensureReady();
      const { headers: responseHeaders, response: session } = await authServer.auth.api.getSession({
        headers,
        returnHeaders: true,
      });
      return { session, headers: responseHeaders };
    };
    if (path === '/api/cms/uploads') {
      uploads ??= createUploadApi({
        storage: storage ?? undefined,
        origin: new URL(process.env.SEDNA_URL!).origin,
        getSession,
      });
      return await uploads(request);
    }
    db ??= createPool(process.env.SEDNA_DATABASE_URL!);
    if (
      path === '/api/cms/media' ||
      path.startsWith('/api/cms/media/') ||
      path === '/api/cms/media-folders' ||
      path.startsWith('/api/cms/media-folders/')
    ) {
      media ??= createMediaApi({
        db,
        storage: storage ?? undefined,
        origin: new URL(process.env.SEDNA_URL!).origin,
        getSession,
      });
      return await media(request);
    }
    content ??= createContentApi({
      collections: Object.values(collections)
        .map((value) => value.loader)
        .filter(isSednaLoader)
        .map((loader) => loader.sedna),
      db,
      origin: new URL(process.env.SEDNA_URL!).origin,
      getSession,
      invalidate: cache ? createCdnCache(platform)?.purge : undefined,
    });
    return await content(request);
  } catch (error) {
    if (error instanceof AuthConfigurationError) {
      // The same configuration error repeats on every request until the server restarts.
      logOnce('error', { message: error.message, hint: error.hint });
      return Response.json(
        { error: error.message },
        { status: 503, headers: { 'Cache-Control': 'no-store' } },
      );
    }
    // Never expose connection strings, SQL, or internal configuration to clients.
    log.error({
      message: 'API request failed.',
      hint: 'Check SEDNA_DATABASE_URL, the database connection, and the CMS configuration in .env.',
    });
    return Response.json(
      { error: 'CMS unavailable' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
};
