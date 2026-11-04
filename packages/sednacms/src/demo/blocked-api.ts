import type { APIRoute } from 'astro';

export const prerender = false;
export const ALL: APIRoute = () =>
  Response.json(
    { error: 'The public demo has no server API. Edits and images stay in browser memory.' },
    { status: 403, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } },
  );
