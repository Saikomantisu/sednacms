---

title: Caching
description: Configure optional CDN caching and collection tag purges.
---

By default, responses that read Sedna content send `Cache-Control: no-store`.
The live loader queries Postgres on every request, so publishing, editing,
reordering, unpublishing, or deleting content takes effect on the next request
that reaches your server. You do not need to rebuild or configure a host-specific purge API. Pages must render on demand, with `export const prerender = false`.
A prerendered page that reads a Sedna collection logs a warning, because its
content is frozen when the page is built.
Load CMS content in page frontmatter before the response starts streaming.

Enable CDN caching for public CMS pages in `astro.config.mjs`:

```js
integrations: [
  sedna({ cache: { ttl: 3600 } }),
],
```

Omit `platform` to let Sedna detect it from Astro's adapter. Set `ttl` to a positive
integer in seconds. Sedna uses the platform's CDN without experimental Astro APIs
or a separate cache service.

On a cache miss, Astro reads Postgres, renders the page, and tags it with every
Sedna collection it read, including empty collections and missing entries.
Netlify or Vercel then serves cached HTML without invoking Astro or Postgres.
Netlify also uses its durable cache. Cloudflare requires additional cache rules.

When you publish, edit published content, unpublish, or delete a published entry,
Sedna requests a purge for the collection's tag. Reordering also triggers a purge
if it involves published entries. The request waits for the purge attempt after
the database commits the change.

The purge covers every page that read the collection, including lists, detail
pages, and paginated results. The next cache miss renders updated HTML. Draft-only
changes, failed or rolled-back writes, and direct SQL changes do not trigger purges.

## Provider setup

Set these variables in the deployment's server environment, never in client code
or in the `sedna()` options. Sedna reads them only when caching is enabled for a
recognized platform. Configuration fails if required credentials are missing.

### Netlify

```dotenv
SEDNA_NETLIFY_TOKEN=your-netlify-personal-access-token
# Optional if Netlify provides SITE_ID in the function environment:
SEDNA_NETLIFY_SITE_ID=your-site-id
```

The token must have access to the site. Sedna uses Netlify's
[cache-tag purge API](https://docs.netlify.com/build/caching/caching-overview/#on-demand-invalidation).
The request targets all deploys of that site so previews sharing its database are
also refreshed.

### Vercel

```dotenv
SEDNA_VERCEL_TOKEN=your-vercel-access-token
# Can be omitted if the corresponding VERCEL_PROJECT_ID / VERCEL_ORG_ID is available:
SEDNA_VERCEL_PROJECT_ID=your-project-id
SEDNA_VERCEL_TEAM_ID=your-team-id
```

The team ID is optional for personal projects. Sedna uses the
[tag deletion API](https://vercel.com/docs/rest-api/edge-cache/dangerously-delete-by-tag)
with a zero revalidation deadline. This requests a fresh render after an unpublish
or delete instead of serving the old content while revalidating. Purges cover production and
preview caches in the project.

Vercel [does not cache responses with `Vary: Cookie`](https://vercel.com/changelog/vary-cookie-responses-no-longer-cached).
Sedna therefore does not add Cookie variation on Vercel, but preserves any explicit
`Vary` headers from the page. Enable caching there only for pages whose public
output is identical regardless of cookies. Cookie-bearing visitors may receive an
already cached public page. Put personalized content and previews on separate,
uncached routes. An explicit `Vary: Cookie` keeps the page uncached on Vercel.

### Cloudflare

```dotenv
SEDNA_CLOUDFLARE_TOKEN=your-api-token-with-zone-cache-purge-permission
SEDNA_CLOUDFLARE_ZONE_ID=your-zone-id
```

Use this with Cloudflare's CDN in front of a compatible Node deployment.
Caching Worker-generated responses has not been verified. For a Node origin, proxy the domain through
Cloudflare and configure a Cache Rule making public HTML eligible for caching,
respecting origin cache-control headers and query strings. Bypass `/admin`,
`/api/cms`, and requests containing Cookie or Authorization headers. Do not force
an edge TTL that overrides `no-store`. Cloudflare does not cache HTML by default;
headers alone will not activate it. Sedna uses the global
[tag purge API](https://developers.cloudflare.com/cache/how-to/purge-cache/purge-by-tags/),
not the region-local Cache API's `delete()`.

## Cache policies and limits

Requests reaching Astro with cookies or authorization, responses setting cookies,
redirects, errors, and loader failures use `no-store`, including platform-targeted
cache-control headers. Admin and CMS API responses stay uncached. On Netlify and
Cloudflare, Sedna adds `Vary: Cookie, Authorization`; Vercel gets Authorization
variation only. Other existing `Vary` values are preserved.

Cache only public pages that show the same content to every visitor. Sedna cannot change a CDN response
that never reaches its middleware. Explicit page `Cache-Control` policies are
preserved and opt out of Sedna-managed CDN caching. Unrelated routes keep their
existing headers. Load CMS content before streaming begins. Prerendered pages
remain fixed until rebuilt. The collection `pages` option is still reserved.

With `platform: 'none'`, Sedna sets generic HTTP cache headers but does not
request provider purges. Standalone Node does not supply a response cache. Local development
does not simulate the hosting platform's CDN, so local refreshes still query Postgres.

A database commit and its cache purge are separate operations. A purge can take
time to reach every cache, and a render already in progress can race with it. Cache eviction, expiration, and deploys
also cause new reads. Keep a finite TTL as a fallback. If a purge fails or times out,
the content remains saved, the API sends `X-Sedna-Cache: purge-failed`, and the
dashboard shows a persistent warning. Cached pages may remain outdated until their
TTL expires or a later successful purge. There is no background retry job.
