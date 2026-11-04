import { cache } from 'virtual:sedna/cache';
import { collections } from 'virtual:sedna/collections';
import { platform } from 'virtual:sedna/platform';
import { storage } from 'virtual:sedna/storage';
import type { APIRoute } from 'astro';
import { AuthConfigurationError, getAuthServer } from '../auth/server.js';
import { createCdnCache } from '../cdn.js';
import { createPool } from '../db/client.js';
import { isSednaLoader } from '../loader.js';
import { createContentApi } from './content.js';
import { createUploadApi } from './uploads.js';

export const prerender = false;
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
    content ??= createContentApi({
      collections: Object.values(collections)
        .map((value) => value.loader)
        .filter(isSednaLoader)
        .map((loader) => loader.sedna),
      db: createPool(process.env.SEDNA_DATABASE_URL!),
      origin: new URL(process.env.SEDNA_URL!).origin,
      getSession,
      invalidate: cache ? createCdnCache(platform)?.purge : undefined,
    });
    return await content(request);
  } catch (error) {
    if (error instanceof AuthConfigurationError) {
      console.error(error.message);
      return Response.json(
        { error: error.message },
        { status: 503, headers: { 'Cache-Control': 'no-store' } },
      );
    }
    // Never expose connection strings, SQL, or internal configuration to clients.
    console.error('[sednacms] API request failed. Check database and CMS configuration.');
    return Response.json(
      { error: 'CMS unavailable' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
};
