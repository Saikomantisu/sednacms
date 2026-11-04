import type { SednaPlatform } from './index.js';

export const collectionTag = (collection: string) => `sedna:${collection}`;

export interface CdnCache {
  platform: Exclude<SednaPlatform, 'none'>;
  controlHeader: string;
  tagHeader: string;
  purge: (collection: string) => Promise<void>;
}

/** Server-only configuration. Credentials must never be emitted into virtual modules. */
export function createCdnCache(
  platform: SednaPlatform,
  env: Record<string, string | undefined> = process.env,
  request: typeof fetch = fetch,
): CdnCache | undefined {
  if (platform === 'none') return undefined;
  const required = (name: string, fallback?: string) => {
    const value = env[name] || (fallback && env[fallback]);
    if (!value)
      throw new Error(`sednacms: ${name} is required for ${platform} cache invalidation.`);
    return value;
  };
  let url: URL;
  let token: string;
  let body: (tag: string) => object;
  let controlHeader: string;
  let tagHeader: string;
  if (platform === 'netlify') {
    token = required('SEDNA_NETLIFY_TOKEN');
    const site = required('SEDNA_NETLIFY_SITE_ID', 'SITE_ID');
    url = new URL('https://api.netlify.com/api/v1/purge');
    body = (tag) => ({ site_id: site, cache_tags: [tag] });
    controlHeader = 'Netlify-CDN-Cache-Control';
    tagHeader = 'Netlify-Cache-Tag';
  } else if (platform === 'vercel') {
    token = required('SEDNA_VERCEL_TOKEN');
    const project = required('SEDNA_VERCEL_PROJECT_ID', 'VERCEL_PROJECT_ID');
    url = new URL('https://api.vercel.com/v1/edge-cache/dangerously-delete-by-tags');
    url.searchParams.set('projectIdOrName', project);
    const team = env.SEDNA_VERCEL_TEAM_ID || env.VERCEL_ORG_ID;
    if (team) url.searchParams.set('teamId', team);
    // Omit target to invalidate both preview and production when they share a database.
    // A hard purge avoids knowingly serving stale content after an unpublish/delete.
    body = (tag) => ({ tags: [tag], revalidationDeadlineSeconds: 0 });
    controlHeader = 'Vercel-CDN-Cache-Control';
    tagHeader = 'Vercel-Cache-Tag';
  } else {
    token = required('SEDNA_CLOUDFLARE_TOKEN');
    const zone = required('SEDNA_CLOUDFLARE_ZONE_ID');
    url = new URL(
      `https://api.cloudflare.com/client/v4/zones/${encodeURIComponent(zone)}/purge_cache`,
    );
    body = (tag) => ({ tags: [tag] });
    controlHeader = 'Cloudflare-CDN-Cache-Control';
    tagHeader = 'Cache-Tag';
  }
  return {
    platform,
    controlHeader,
    tagHeader,
    async purge(collection) {
      const response = await request(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body(collectionTag(collection))),
        signal: AbortSignal.timeout(5000),
        redirect: 'error',
      });
      // Do not include provider error bodies, credentials, or request URLs in errors.
      if (!response.ok)
        throw new Error(`sednacms: ${platform} cache purge failed (${response.status}).`);
      if (platform === 'cloudflare') {
        const result = (await response.json()) as { success?: boolean };
        if (result.success !== true) throw new Error('sednacms: cloudflare cache purge failed.');
      } else {
        await response.body?.cancel();
      }
    },
  };
}
