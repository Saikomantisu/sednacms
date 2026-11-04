# Sedna CMS: v1 Spec

## What it is

An open-source CMS for Astro, shipped as an integration. Clients edit content in an admin panel and published changes appear on the next request by default. Content lives in Postgres, images in object storage. Pages that show CMS content render on demand. Shared response caching is optional and does not require a particular host.

- npm package: `sednacms`
- Open source. One site per install (no multi-tenancy in v1).
- Primary users: clients adding repeating content (testimonials, blog posts, travel packages). One-off fields like hero titles are out of scope for v1.

## Why it exists

Git-based CMSs (Pages CMS, Decap) commit on every save, and every commit triggers a deploy. Frequent small client edits burn hosting build credits. Sedna stores content in a database instead, so a save is a database write, not a build.

Trade-off we accept: the site needs a server adapter.

## Tech decisions

| Area        | Decision                                                                                                                                                |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework   | Astro 6+, `astro` as a **peerDependency**                                                                                                               |
| Content API | Astro **live content collections** (`defineLiveCollection`, `getLiveCollection`, `getLiveEntry`). Stable since Astro 6, no experimental flag needed.    |
| Database    | Any Postgres via connection string (dev target: **Neon**). Require a pooled / serverless-friendly connection.                                           |
| Storage     | Adapter interface. Ship `s3Storage()` (any S3-compatible bucket) and `uploadthingStorage()`. Dev target: **UploadThing**.                               |
| Uploads     | Browser uploads directly to storage via presigned URL / UploadThing flow. Never stream files through our API.                                           |
| Admin UI    | Lives inside the same package (`src/admin/`), mounted with `injectRoute`. Builds forms from the schema endpoint.                                        |
| Hosting     | Requires an SSR adapter compatible with Sedna's Node dependencies. No hosting provider is required. Verify the portable behavior with the Node adapter. |

## Developer experience

### Install

```bash
npx astro add sednacms
npx astro add netlify   # any SSR adapter
```

### Env vars

```env
SEDNA_DATABASE_URL=postgres://...
SEDNA_SECRET=random-string        # at least 32 characters, signs sessions
SEDNA_URL=https://example.com      # site origin
SEDNA_SETUP_TOKEN=random-string   # separate 32+ character token; remove after first-admin setup
# storage, one of:
UPLOADTHING_TOKEN=...
SEDNA_S3_ENDPOINT= / SEDNA_S3_BUCKET= / SEDNA_S3_KEY= / SEDNA_S3_SECRET= / SEDNA_S3_PUBLIC_URL=
```

### Define collections

```ts
// src/live.config.ts
import { defineLiveCollection } from 'astro:content';
import { sednaLoader, fields } from 'sednacms';

const packages = defineLiveCollection({
  loader: sednaLoader({
    collection: 'packages',
    fields: {
      title: fields.text({ required: true }),
      slug: fields.slug({ from: 'title' }),
      price: fields.number(),
      cover: fields.image(),
      body: fields.richText(),
    },
  }),
});

// Astro reads live collections from this export only.
export const collections = { packages };
```

### Use in pages

```astro
---
export const prerender = false;
import { getLiveEntry } from 'astro:content';
const { entry } = await getLiveEntry('packages', Astro.params.slug);
if (!entry) return Astro.redirect('/404');
---

<h1>{entry.data.title}</h1>
```

## v1 features

### Field types

text, richText, number, image, boolean, date, slug (auto-generated from another field, editable), list, object.

- `fields.list(item, options?)` stores ordered values of another field type. The admin supports add, remove, and move up/down.
- `fields.object(fields, options?)` groups named child fields. Lists and objects can nest, including lists of objects and images.
- Both accept `required`. Publishing requires a nonempty required list and a non-null required object. Child requirements apply within present objects and list items. Drafts may be incomplete but provided values must have valid types. Every value can be null, including optional list items.
- Nested slugs generate from siblings within their object. Only top-level slugs have unique indexes or determine live entry IDs.
- API updates replace supplied lists and objects in full; omitted top-level fields remain unchanged.

### Admin (`/admin`)

- First run with empty DB: one-time setup screen to create the first admin account (no default password).
- Login / logout via Better Auth email/password, session cookie cache signed with `SEDNA_SECRET`, validated locally for five minutes before rechecking the database. Logout clears browser cookies and revokes the stored session; copied cookies can remain valid until the cache expires. Public registration disabled.
- Invite additional editors.
- Per collection: list, add, edit, delete, drag to reorder, draft vs published.
- Image picker with upload.
- Before direct upload, resize images to fit 2560 × 2560 without upscaling and
  encode WebP at 80% quality by default. Both storage adapters accept dimension,
  quality, and format overrides, with WebP, JPG, or AVIF output, or `image: false`
  to keep original files. jSquash handles resizing and encoding in a browser
  worker; only processed files upload directly to storage. Saved dimensions
  describe the processed image. JPG flattens transparency onto white. Animations become
  still images when processing is enabled.

### API (`/api/cms/*`)

- `GET /api/cms/schema`: collections and fields. The admin renders forms from this; it has no hard-coded knowledge of collections.
- CRUD + reorder + publish endpoints per collection.
- Upload signing endpoint.
- All write endpoints require an authenticated session.
- Export shared TypeScript types for request/response shapes; admin imports them type-only.

### Database

- On startup, create missing tables from the collection config. Never drop or overwrite existing data.
- One table per collection, `sedna_<collection>`, one column per field, plus `id` (uuid), `status` (`draft` | `published`), `sort_order`, `created_at`, `updated_at`. Sedna's system tables are `sedna__<name>`; collection names can't start with `_`, so they never collide.
- Column types: text, slug and richText → `text` (richText format is HTML, produced by the admin editor); number → `double precision`; list and object → `jsonb`; image → `jsonb` (`{src, width, height, alt}` for `<Image>`); boolean → `boolean`; date → `date`, returned as a `"YYYY-MM-DD"` string (a calendar day has no timezone, so a JS `Date` would show the wrong day somewhere).
- `required` is not a DB constraint (drafts may be incomplete); the API checks it when publishing; drafts may be incomplete.
- Tables are created when the dev server starts. Production has no such hook, so the loader runs the same check once, on its first query. Changing `live.config.ts` needs a dev server restart.
- Versioned migrations for Sedna's own system tables; assume an existing DB on every upgrade.
- Loader only returns published entries; admin sees drafts.
- Public live collections accept optional `limit` (1–100) and `offset` filters applied in SQL, ordered by `sort_order`, `created_at`, then `id`. Without filters the full collection is returned. The playground demonstrates ten-item pages. Field selection remains outside this change.
- Entry lookups use indexed slug and typed UUID predicates without casting the ID column to text.
- Each runtime pool defaults to five connections, configurable with `SEDNA_DATABASE_POOL_MAX`. `SEDNA_DATABASE_CONNECTION_TIMEOUT_MS` defaults to 10000 for connection acquisition/opening; it does not cancel running queries. The loader, authentication, and content API have three separate pools per process.

### Caching

- Disabled by default. CMS loader responses use `Cache-Control: no-store`; the
  loader reads Postgres whenever a request reaches Astro.
- Opt in with `sedna({ cache: { ttl: 3600 } })`. TTL is a positive integer in seconds.
  `cache: false` disables caching. Only public, visitor-independent pages may opt in.
- Recognized platforms use stable CDN headers and REST purge APIs. No experimental
  Astro cache provider, new service, or new dependency is required. Netlify sets
  `Netlify-CDN-Cache-Control` with `durable` and `Netlify-Cache-Tag`; Vercel sets
  `Vercel-CDN-Cache-Control` and `Vercel-Cache-Tag`; Cloudflare sets
  `Cloudflare-CDN-Cache-Control` and `Cache-Tag`. Browser-facing policy remains
  `public, max-age=0, s-maxage=<ttl>, must-revalidate`, with no SWR window.
- Every page reading a collection gets its `sedna:<collection>` tag, including
  empty results. Published creates, edits to published entries, unpublishes,
  published deletes, and reorders involving published rows purge that collection
  after successful commit. Draft-only changes and failed writes do not purge.
  Requests await the purge attempt. Direct SQL changes do not trigger purges.
- Netlify requires `SEDNA_NETLIFY_TOKEN` and `SEDNA_NETLIFY_SITE_ID` or `SITE_ID`.
  Vercel requires `SEDNA_VERCEL_TOKEN` and `SEDNA_VERCEL_PROJECT_ID` or
  `VERCEL_PROJECT_ID`, with optional `SEDNA_VERCEL_TEAM_ID` or `VERCEL_ORG_ID`.
  Cloudflare requires `SEDNA_CLOUDFLARE_TOKEN` and `SEDNA_CLOUDFLARE_ZONE_ID`.
  Secrets stay server-side and missing credentials fail configuration. Purges
  target the configured site/project/zone, including shared-database previews.
- Vercel uses hard tag deletion with a zero revalidation deadline so the next
  request regenerates rather than intentionally serving stale deleted content.
  Netlify and Cloudflare use tag purges. Calls have a five-second timeout and do
  not follow redirects. Failure details and credentials are never sent to clients.
- Purge failure does not turn a committed save into an error: the response retains
  its success status, adds `X-Sedna-Cache: purge-failed`, and the admin shows a
  persistent warning. A finite TTL bounds normal staleness; there is no retry job.
  Propagation and in-flight rendering can race with purges, so immediate global
  freshness is not guaranteed.
- Credential-bearing requests reaching Astro, responses setting cookies, errors,
  non-GET/HEAD requests, and loader failures send `no-store` for browser and targeted
  CDN headers. Admin/API routes are always uncached. Unrelated routes are unchanged.
  Explicit page `Cache-Control` policies opt out of Sedna-managed CDN caching.
- Netlify and Cloudflare vary by Cookie and Authorization. Vercel does not cache
  `Vary: Cookie`, so Sedna adds only Authorization there and preserves explicit page
  variation. Cookie-bearing visitors may receive cached public HTML on Vercel.
  Personalized content and previews must use separate uncached routes.
- Cloudflare CDN requires a proxied domain and public-HTML Cache Rules that respect
  origin headers and bypass private routes/cookies/authorization. This adds no
  Workers runtime support. Netlify and Vercel cache dynamic pages through headers.
- `platform: 'none'` retains generic TTL headers without purging or a response cache.
  Local Node development does not simulate a CDN. Check deployed hit/miss behavior.
  CMS reads must finish before streaming. Static prerendered pages remain build-time
  snapshots. The collection `pages` option remains reserved.

### Integration hooks and guardrails

- Platform identification: `sedna({ platform: 'none' | 'cloudflare' | 'vercel' | 'netlify' })`
  explicitly overrides detection from the final Astro adapter name in `astro:config:done`.
  When omitted, the official Netlify, Vercel, and Cloudflare adapter names select
  their platforms; no adapter, Node, and unknown adapters resolve to `none`.
  Identification is exposed internally as `virtual:sedna/platform` and logged at
  configuration completion. It does not install an adapter or change runtime support.
  With caching enabled it selects CDN headers and purge behavior. No experimental
  APIs are used.

- `astro:config:setup`: inject `/admin/[...path]` and `/api/cms/[...path]`; add the storage domain to `image.remotePatterns`.
- `astro:config:done`: if no adapter is configured, throw: `sednacms needs a server adapter. Run: npx astro add netlify (or vercel, cloudflare, node)`.
- Build-time warning when a prerendered page imports a Sedna collection (its content would be frozen at build).
- If `SEDNA_DATABASE_URL` is missing in dev, log a clear message and return empty collections instead of crashing.

## Out of scope for v1

Inline single fields in `.astro` files, version history / rollback, multi-tenancy, hosted cloud version, `npx sednacms init` setup wizard, Cloudflare Workers runtime support.

## Repo layout

```
sednacms/
├── src/
│   ├── index.ts          # integration
│   ├── loader.ts         # live collection loader
│   ├── fields.ts
│   ├── api/              # injected API routes
│   ├── admin/            # injected admin UI
│   ├── db/
│   ├── storage/          # s3, uploadthing adapters
│   ├── cache.ts          # request-scoped response cache policy
│   └── middleware.ts    # injected Astro middleware
├── package.json          # name: sednacms
└── playground/           # normal Astro site, depends on "sednacms": "file:.."
```

## Build order (riskiest first)

Each step ends with a check that must pass before moving on.

1. **Scaffold** repo + playground. Check: playground runs with the integration installed and logs a startup message.
2. **Config to DB**: read collection config, create tables in Neon. Check: tables exist after `astro dev`.
3. **Live loader**: insert a row by hand in the DB, reload a playground page. Check: row appears with no rebuild.
4. **API + auth**: setup screen, login, CRUD endpoints. Check: create an entry via API, see it on the page.
5. **Admin UI**: list, form from schema, reorder, draft/publish. Check: a non-developer can add a travel package end to end.
6. **Uploads**: UploadThing adapter, then S3 adapter. Check: upload a large phone photo, it renders via `<Image>`.
7. **CDN caching**: fresh responses by default, optional shared-cache TTL and platform tag purges after published changes. Check: policy and provider contract tests, post-commit invalidation, cached refreshes avoiding loader reads in a CDN simulation, and production playground builds. Deployed provider verification is separate.
8. **Guardrails**: adapter check, prerender warning, missing-DB fallback. Check: each case shows its message.
