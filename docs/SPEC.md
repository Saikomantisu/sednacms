# Sedna CMS: v1 Spec

## What it is
An open-source CMS for Astro, shipped as an integration. Clients edit content in an admin panel and changes go live within seconds. Content lives in Postgres, images in object storage. Pages that show CMS content render on demand and are cached at the CDN, so visitors get static-like speed.

- npm package: `sednacms`
- Open source. One site per install (no multi-tenancy in v1).
- Primary users: clients adding repeating content (testimonials, blog posts, travel packages). One-off fields like hero titles are out of scope for v1.

## Why it exists
Git-based CMSs (Pages CMS, Decap) commit on every save, and every commit triggers a deploy. Frequent small client edits burn hosting build credits. Sedna stores content in a database instead, so a save is a database write, not a build.

Trade-off we accept: the site needs a server adapter.

## Tech decisions
| Area | Decision |
|---|---|
| Framework | Astro 6+, `astro` as a **peerDependency** |
| Content API | Astro **live content collections** (`defineLiveCollection`, `getLiveCollection`, `getLiveEntry`). Stable since Astro 6, no experimental flag needed. |
| Database | Any Postgres via connection string (dev target: **Neon**). Require a pooled / serverless-friendly connection. |
| Storage | Adapter interface. Ship `s3Storage()` (any S3-compatible bucket) and `uploadthingStorage()`. Dev target: **UploadThing**. |
| Uploads | Browser uploads directly to storage via presigned URL / UploadThing flow. Never stream files through our API. |
| Admin UI | Lives inside the same package (`src/admin/`), mounted with `injectRoute`. Builds forms from the schema endpoint. |
| Hosting | Requires an SSR adapter. Test on **Netlify** and **Node** from the start. |

## Developer experience

### Install
```bash
npx astro add sednacms
npx astro add netlify   # any SSR adapter
```

### Env vars
```env
SEDNA_DATABASE_URL=postgres://...
SEDNA_SECRET=random-string        # signs sessions
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
    pages: ['/', '/packages'],   // pages that list this collection (for cache purge)
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
text, richText, number, image, boolean, date, slug (auto-generated from another field, editable).

### Admin (`/admin`)
- First run with empty DB: one-time setup screen to create the first admin account (no default password).
- Login / logout, session cookie signed with `SEDNA_SECRET`.
- Invite additional editors.
- Per collection: list, add, edit, delete, drag to reorder, draft vs published.
- Image picker with upload.

### API (`/api/cms/*`)
- `GET /api/cms/schema`: collections and fields. The admin renders forms from this; it has no hard-coded knowledge of collections.
- CRUD + reorder + publish endpoints per collection.
- Upload signing endpoint.
- All write endpoints require an authenticated session.
- Export shared TypeScript types for request/response shapes; admin imports them type-only.

### Database
- On startup, create missing tables from the collection config. Never drop or overwrite existing data.
- One table per collection, `sedna_<collection>`, one column per field, plus `id` (uuid), `status` (`draft` | `published`), `sort_order`, `created_at`, `updated_at`. Sedna's system tables are `sedna__<name>`; collection names can't start with `_`, so they never collide.
- Column types: text, slug and richText → `text` (richText format, HTML or Markdown, decided with the admin editor); number → `double precision`; image → `jsonb` (`{src, width, height, alt}` for `<Image>`); boolean → `boolean`; date → `date` (calendar date).
- `required` is not a DB constraint (drafts may be incomplete); the API checks it on save.
- Tables are created when the dev server starts. Production has no such hook, so the loader runs the same check once, on its first query. Changing `live.config.ts` needs a dev server restart.
- Versioned migrations for Sedna's own system tables; assume an existing DB on every upgrade.
- Loader only returns published entries; admin sees drafts.

### Caching
- Default on every CMS-rendered page: `Cache-Control: public, s-maxage=60, stale-while-revalidate=86400`. Works on any host, no purge code needed.
- Optional purge adapters, called after every successful write:
  - `netlifyPurge()`: pages send `Netlify-Cache-Tag: <collection names>`; on save call `purgeCache({ tags: [collection] })`.
  - `cloudflarePurge({ zoneId, token })`: purge by URL using the collection's `pages` list plus the entry's own URL.

### Integration hooks and guardrails
- `astro:config:setup`: inject `/admin/[...path]` and `/api/cms/[...path]`; add the storage domain to `image.remotePatterns`.
- `astro:config:done`: if no adapter is configured, throw: `sednacms needs a server adapter. Run: npx astro add netlify (or vercel, cloudflare, node)`.
- Build-time warning when a prerendered page imports a Sedna collection (its content would be frozen at build).
- If `SEDNA_DATABASE_URL` is missing in dev, log a clear message and return empty collections instead of crashing.

## Out of scope for v1
Inline single fields in `.astro` files, version history / rollback, image resizing, multi-tenancy, hosted cloud version, `npx sednacms init` setup wizard, Cloudflare Workers runtime support.

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
│   └── purge/            # netlify, cloudflare adapters
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
7. **Caching + purge**: headers, Netlify adapter, Cloudflare adapter. Check: deployed on Netlify, new entry appears on the list page within seconds.
8. **Guardrails**: adapter check, prerender warning, missing-DB fallback. Check: each case shows its message.
