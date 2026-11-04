# Sedna CMS v1 spec

## What it is

Sedna is an open-source Astro integration. Clients edit content at `/admin`. By default, published changes appear on the next request. Content lives in Postgres and images live in object storage. Pages that read CMS content render on demand. Shared response caching is optional; no particular host is required.

- npm package: `sednacms`
- Each installation serves one site. Multi-tenancy is outside v1.
- Clients use Sedna to add entries such as testimonials, blog posts, and travel packages. Editing individual page fields such as hero titles is outside v1.

## Why it exists

With a Git-based CMS such as Pages CMS or Decap, saving content commits to the repository. When commits trigger deployments, frequent edits consume hosting build credits. Sedna saves content to Postgres and reads it when a page renders. Publishing does not require a build.

The trade-off is that the site needs a server adapter.

## Technical decisions

| Area        | Decision                                                                                                                                                |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework   | Astro 6+, `astro` as a `peerDependency`                                                                                                                 |
| Content API | Astro live content collections (`defineLiveCollection`, `getLiveCollection`, `getLiveEntry`). Stable since Astro 6, no experimental flag needed.        |
| Database    | Any Postgres database with a pooled connection string. Use Neon for development.                                                                        |
| Storage     | Ship `s3Storage()` for S3-compatible buckets and `uploadthingStorage()`. Use UploadThing for development.                                               |
| Uploads     | The browser uploads directly to storage with presigned URLs or the UploadThing flow. File contents do not pass through the CMS API.                     |
| Admin UI    | Lives inside the same package (`src/admin/`), mounted with `injectRoute`. Builds forms from the schema endpoint.                                        |
| Hosting     | Requires an SSR adapter compatible with Sedna's Node dependencies. No hosting provider is required. Verify the portable behavior with the Node adapter. |

## Developer experience

### Install

```bash
npx astro add sednacms
npx astro add netlify   # any SSR adapter
```

### Environment variables

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

Supported helpers are `text`, `richText`, `number`, `image`, `boolean`, `date`, `slug`, `list`, and `object`. Slugs generate from another field and remain editable.

- `fields.list(item, options?)` stores ordered values of another field type. Editors can add, remove, and move items up or down.
- `fields.object(fields, options?)` groups named child fields. Lists and objects can nest, including lists of objects and images.
- Both accept `required`. A required list must contain at least one item at publication; a required object must be non-null. Sedna checks child requirements within present objects and list items. Drafts may be incomplete, but supplied values must match their field types. Every value can be null, including optional list items.
- Nested slugs generate from siblings within their object. Only top-level slugs have unique indexes or determine live entry IDs.
- API updates replace supplied lists and objects in full; omitted top-level fields remain unchanged.

### Admin (`/admin`)

- On an empty database, show a one-time setup screen to create the first admin account. Do not supply a default password.
- Use Better Auth for email/password login and logout. Sign the session cookie cache with `SEDNA_SECRET` and validate it locally for five minutes before rechecking the database. Logout clears browser cookies and revokes the stored session. Copied cookies can remain valid until the cache expires. Disable public registration.
- Invite additional editors.
- Let editors list, add, edit, delete, and drag to reorder entries in each collection. Support draft and published states.
- Image picker with upload.
- Before direct upload, resize images to fit 2560 × 2560 without upscaling and
  encode WebP at 80% quality by default. Both storage adapters accept dimension,
  quality, and format overrides, with WebP, JPG, or AVIF output, or `image: false`
  to keep original files. jSquash handles resizing and encoding in a browser
  worker; only processed files upload directly to storage. Saved dimensions
  describe the processed image. JPG flattens transparency onto white. Animations become
  still images when processing is enabled.

### API (`/api/cms/*`)

- `GET /api/cms/schema` returns collections and fields. The admin builds forms from this response without hard-coded collection definitions.
- CRUD + reorder + publish endpoints per collection.
- Upload signing endpoint.
- All write endpoints require an authenticated session.
- Export shared TypeScript request and response types. The admin uses type-only imports.

### Database

- On startup, create missing tables from the collection config. Never drop or overwrite existing data.
- Store each collection in a `sedna_<collection>` table with one column per field. Add `id` as a UUID, `status` as `draft` or `published`, `sort_order`, `created_at`, and `updated_at`. Reserve `sedna__<name>` for system tables. Collection names cannot start with `_`, which prevents name collisions.
- Use `text` columns for text, slugs, and rich-text HTML from the admin editor. Use `double precision` for numbers, `boolean` for booleans, and `jsonb` for lists, objects, and images. Images store `{ src, width, height, alt }` for `<Image>`. Dates use `date` columns and return `YYYY-MM-DD` strings. A calendar day has no timezone; converting it to a JavaScript `Date` could display the wrong day.
- Check `required` in the API when publishing. Do not add database constraints for required fields, because drafts may be incomplete.
- Create missing tables when the dev server starts. In production, the loader runs the same check once before its first query. Restart the dev server after changing `live.config.ts`.
- Version migrations for Sedna's system tables. Upgrades must work with an existing database.
- Loader only returns published entries; admin sees drafts.
- Public live collections accept optional `limit` and `offset` filters applied in SQL. `limit` accepts 1 to 100. Results are ordered by `sort_order`, `created_at`, then `id`. Without filters the full collection is returned. The playground demonstrates ten-item pages. Field selection is not supported.
- Entry lookups use indexed slug and typed UUID predicates without casting the ID column to text.
- Each runtime pool defaults to five connections, configurable with `SEDNA_DATABASE_POOL_MAX`. `SEDNA_DATABASE_CONNECTION_TIMEOUT_MS` defaults to 10000 for connection acquisition/opening; it does not cancel running queries. The loader, authentication, and content API have three separate pools per process.

### Caching

- Disabled by default. CMS loader responses use `Cache-Control: no-store`; the
  loader reads Postgres whenever a request reaches Astro.
- Opt in with `sedna({ cache: { ttl: 3600 } })`. TTL is a positive integer in seconds.
  `cache: false` disables caching. Only public pages that show the same content to every visitor may opt in.
- For recognized platforms, use CDN headers and REST purge APIs. This requires no
  experimental Astro cache provider, separate service, or additional dependency. Netlify sets
  `Netlify-CDN-Cache-Control` with `durable` and `Netlify-Cache-Tag`; Vercel sets
  `Vercel-CDN-Cache-Control` and `Vercel-Cache-Tag`; Cloudflare sets
  `Cloudflare-CDN-Cache-Control` and `Cache-Tag`. The browser-facing policy is
  `public, max-age=0, s-maxage=<ttl>, must-revalidate`, with no SWR window.
- Tag each page that reads a collection with `sedna:<collection>`, including
  empty results. Purge the collection after committing a published entry, editing
  published content, unpublishing, deleting a published entry, or reordering
  published entries. Draft-only changes and failed writes do not purge.
  Requests await the purge attempt. Direct SQL changes do not trigger purges.
- Netlify requires `SEDNA_NETLIFY_TOKEN` and `SEDNA_NETLIFY_SITE_ID` or `SITE_ID`.
  Vercel requires `SEDNA_VERCEL_TOKEN` and `SEDNA_VERCEL_PROJECT_ID` or
  `VERCEL_PROJECT_ID`, with optional `SEDNA_VERCEL_TEAM_ID` or `VERCEL_ORG_ID`.
  Cloudflare requires `SEDNA_CLOUDFLARE_TOKEN` and `SEDNA_CLOUDFLARE_ZONE_ID`.
  Keep secrets on the server. Fail configuration if required credentials are missing. Purges
  target the configured site/project/zone, including shared-database previews.
- Vercel uses hard tag deletion with a zero revalidation deadline so the next
  request regenerates rather than intentionally serving stale deleted content.
  Netlify and Cloudflare use tag purges. Calls have a five-second timeout and do
  not follow redirects. Failure details and credentials are never sent to clients.
- If a purge fails after a save commits, keep the success status and add
  `X-Sedna-Cache: purge-failed`. Show a persistent warning in the admin. Use a finite
  TTL to limit how long cached content remains outdated. There is no retry job.
  Purges take time to reach all caches, and renders already in progress can race
  with them. A successful purge does not guarantee immediate updates everywhere.
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

### Integration hooks and configuration checks

- Platform detection: `sedna({ platform: 'none' | 'cloudflare' | 'vercel' | 'netlify' })`
  explicitly overrides detection from the final Astro adapter name in `astro:config:done`.
  When omitted, the official Netlify, Vercel, and Cloudflare adapter names select
  their platforms; no adapter, Node, and unknown adapters resolve to `none`.
  Expose the detected platform internally as `virtual:sedna/platform` and log it
  when configuration finishes. It does not install an adapter or change runtime support.
  With caching enabled it selects CDN headers and purge behavior. No experimental
  APIs are used.

- `astro:config:setup`: inject `/admin/[...path]` and `/api/cms/[...path]`; add the storage domain to `image.remotePatterns`.
- `astro:config:done`: if no adapter is configured, throw: `sednacms needs a server adapter. Run: npx astro add netlify (or vercel, cloudflare, node)`.
- Build-time warning when a prerendered page imports a Sedna collection (its content would be frozen at build).
- If `SEDNA_DATABASE_URL` is missing in dev, log a clear message and return empty collections instead of crashing.

## Out of scope for v1

Editing individual fields in `.astro` files, version history and rollback, multi-tenancy, a hosted CMS service, a `npx sednacms init` setup wizard, and Cloudflare Workers runtime support.

## Repository layout

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
│   ├── log.ts            # shared runtime logger in Astro's message format
│   └── middleware.ts     # injected Astro middleware
├── package.json          # name: sednacms
└── playground/           # normal Astro site, depends on "sednacms": "file:.."
```

## Build order

Start with the riskiest work. Each step must pass its check before the next begins.

1. Set up the repository and playground. Check that the playground runs with the integration installed and logs a startup message.
2. Read collection configuration and create tables in Neon. Check that the tables exist after `astro dev`.
3. Build the live loader. Insert a row directly in the database and reload a playground page. Check that the row appears without a rebuild.
4. Add the setup screen, login, and CRUD endpoints. Create an entry through the API and check that it appears on the page.
5. Build the admin list, schema-generated forms, reordering, and draft and publish actions. Check that a non-developer can create and publish a travel package.
6. Add UploadThing uploads, then S3 uploads. Upload a large phone photo and check that it renders with `<Image>`.
7. Add optional CDN caching with a shared-cache TTL and platform tag purges after published changes. Keep caching disabled by default. Run policy and provider contract tests, check purges after commits, and confirm that cache hits skip loader reads in a CDN simulation. Build the playground for production. Verify deployed providers separately.
8. Add the adapter check, prerender warning, and missing-database fallback. Check that each case shows its message.
