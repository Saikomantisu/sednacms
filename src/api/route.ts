import { collections } from 'virtual:sedna/collections';
import type { APIRoute } from 'astro';
import { AuthConfigurationError, getAuthServer } from '../auth/server.js';
import { createPool } from '../db/client.js';
import { isSednaLoader } from '../loader.js';
import { createContentApi } from './content.js';

export const prerender = false;
let content: ReturnType<typeof createContentApi> | undefined;
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
    content ??= createContentApi({
      collections: Object.values(collections)
        .map((value) => value.loader)
        .filter(isSednaLoader)
        .map((loader) => loader.sedna),
      db: createPool(process.env.SEDNA_DATABASE_URL!),
      origin: new URL(process.env.SEDNA_URL!).origin,
      getSession: async (headers) => {
        await authServer.ensureReady();
        const { headers: responseHeaders, response: session } =
          await authServer.auth.api.getSession({ headers, returnHeaders: true });
        return { session, headers: responseHeaders };
      },
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
