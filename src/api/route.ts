import type { APIRoute } from 'astro';
import { getAuthServer } from '../auth/server.js';

export const prerender = false;
export const ALL: APIRoute = async ({ request, clientAddress }) => {
  try {
    const headers = new Headers(request.headers);
    // Overwrite incoming values so callers cannot spoof their rate-limit bucket.
    headers.set('x-sedna-client-ip', clientAddress);
    return await getAuthServer().handle(new Request(request, { headers }));
  } catch {
    // Never expose connection strings, SQL, or internal auth configuration to clients.
    console.error('[sednacms] Authentication request failed. Check database and auth configuration.');
    return Response.json({ error: 'Authentication unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
};
