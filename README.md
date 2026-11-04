# Sedna CMS

An open-source CMS for Astro. Clients edit content in an admin panel and changes go live within seconds. Content is stored in Postgres and served through Astro live content collections.

> Work in progress. See [docs/SPEC.md](docs/SPEC.md) for the v1 plan.

## Requirements

- Astro 6+ with a server adapter (Netlify, Node, ...)
- A Postgres database (pooled connection string, e.g. Neon)

## Usage

```js
// astro.config.mjs
import sedna from 'sednacms';

export default defineConfig({
  adapter: node({ mode: 'standalone' }),
  integrations: [sedna()],
});
```

```ts
// src/live.config.ts
import { defineLiveCollection } from 'astro:content';
import { fields, sednaLoader } from 'sednacms';

const posts = defineLiveCollection({
  loader: sednaLoader({
    collection: 'posts',
    fields: {
      title: fields.text({ required: true }),
      slug: fields.slug({ from: 'title' }),
      reading_time: fields.number(),
    },
  }),
});

export const collections = { posts };
```

Set `SEDNA_DATABASE_URL` in `.env`. Tables are created when the dev server starts.
Without it, the dev server logs a warning and collections are empty.

### Hosting platform

Sedna identifies Netlify, Vercel, or Cloudflare from the final Astro adapter configuration.
To override identification, set `platform` in `astro.config.mjs`:

```js
integrations: [sedna({ platform: 'netlify' })],
```

Accepted values are `'netlify'`, `'vercel'`, `'cloudflare'`, and `'none'`.
Omit the option for automatic identification. The Node adapter and unrecognized
adapters resolve to `'none'`. An explicit value takes precedence,
including `'none'` to opt out of platform-specific integration.

This option selects the platform used when caching is enabled. It does not install
or replace Astro's adapter or make an unsupported runtime compatible. Sedna still
requires a server adapter and stops with an error without one; Cloudflare Workers
support remains outside the current scope.

## Lists and grouped fields

Use `fields.list(item)` for ordered, repeatable values and `fields.object(fields)`
for groups of named fields. They compose with all existing field types and can nest:

```ts
fields: {
  tags: fields.list(fields.text({ required: true })),
  gallery: fields.list(fields.image({ required: true })),
  faqs: fields.list(fields.object({
    question: fields.text({ required: true }),
    answer: fields.richText({ required: true }),
  })),
  contact: fields.object({
    name: fields.text(),
    phone: fields.text(),
  }),
}
```

The admin lets editors add, remove, and move list items up or down. Grouped fields
can be added or cleared. Values retain their order and inferred TypeScript types
in live collections. Lists and objects use Postgres `jsonb` columns.

Both helpers accept `{ required: true }` as a second argument. A required list must
contain at least one item when publishing. An item's `required` option controls
whether that item may be empty. Required children of an object are checked when
the object is present; mark the object itself required to require the group.
Drafts may be incomplete, but supplied values must still match their field types.
Missing fields and empty scalar inputs become `null`; an empty list remains `[]`.
API updates replace a supplied list or object in full. Omitted top-level fields
keep their previous values. Nested slugs generate from sibling fields within their
object; only top-level slugs have a unique index and address live entries.

## Add Sedna with an agent

Use the [add-sednacms skill](skills/add-sednacms/SKILL.md) to have a coding agent
add Sedna to your Astro site while keeping its design and URLs. The instructions
cover live collections, server configuration, admin setup, optional uploads, and
checking that published edits appear without a rebuild.

Copy `skills/add-sednacms/` from this repository into your agent's skills directory.
For Codex, install it from a local Sedna checkout:

```sh
mkdir -p "${CODEX_HOME:-$HOME/.codex}/skills"
cp -R skills/add-sednacms "${CODEX_HOME:-$HOME/.codex}/skills/"
```

Then open the target Astro project and ask:

```text
Use $add-sednacms to make this site's blog posts editable in SednaCMS.
Keep the existing design and post URLs.
```

The skill uses standard `SKILL.md` instructions and can also be installed in other
agents that support that format. It does not provision a database or deploy the site.

## Paginating public collections

`getLiveCollection` accepts optional SQL pagination filters:

```ts
const { entries, error } = await getLiveCollection('posts', {
  limit: 11,
  offset: (page - 1) * 10,
});
const hasNext = (entries?.length ?? 0) > 10;
const visibleEntries = entries?.slice(0, 10);
```

The playground demonstrates a ten-item page with Previous/Next links. Fetching one
extra entry detects the next page without a count query. `limit` must be an integer
from 1 to 100. `offset` must be a nonnegative safe integer and requires a limit
when greater than zero. Invalid filters return a loader error. Validate page numbers
from the URL before calculating offsets. Ordering is `sort_order`, `created_at`, then
`id`; content edits between requests can still move entries between pages.
Omitting filters preserves the existing full-collection behavior. All configured
fields are still returned; field selection is not part of this change.

## Database connections

The live loader, authentication, and content API each use their own pool per server process.
Each pool defaults to five connections. Set `SEDNA_DATABASE_POOL_MAX` to a positive
integer to change that limit. Budget for all three pools across all processes/instances;
for example, a limit of 10 permits up to 30 runtime connections per process.
Startup table synchronization uses a separate single-connection pool temporarily.

`SEDNA_DATABASE_CONNECTION_TIMEOUT_MS` defaults to `10000`. It bounds waiting for
a pool connection and opening a connection, so overload does not queue requests
indefinitely. It does not impose a query execution timeout or cancel running SQL.
Both settings are read when pools are created; restart the server after changing them.
Increase pool size only after checking the database connection budget and measuring load.

## Freshness and optional caching

By default, responses that read Sedna content send `Cache-Control: no-store`.
The live loader queries Postgres on every request, so publishing, editing,
reordering, unpublishing, or deleting content takes effect on the next request
that reaches your server. No rebuild, host-specific configuration, or purge API
is required. Pages must render on demand, with `export const prerender = false`.
A prerendered page that reads a Sedna collection logs a warning, because its
content is frozen when the page is built.
Load CMS content in page frontmatter before the response starts streaming.

Enable CDN caching for public CMS pages in `astro.config.mjs`:

```js
integrations: [
  sedna({ platform: 'netlify', cache: { ttl: 3600 } }),
],
```

Omit `platform` to identify it from Astro's adapter. `ttl` is a positive integer in
seconds. No experimental Astro APIs or separate cache service are required.

On a cache miss, Astro reads Postgres, renders the page, and tags it with every
Sedna collection it read, including empty collections and missing entries.
Netlify or Vercel then serves cached HTML without invoking Astro or Postgres.
Netlify also uses its durable cache. Cloudflare requires additional cache rules.

After a successful publish, edit of published content, unpublish, published-entry
delete, or reorder involving published entries, Sedna awaits a purge for the
collection's tag. This refreshes all affected pages, including lists, detail pages,
and pagination variants. Draft-only changes do not purge. The next cache miss
renders updated HTML. Purges happen after database commits, never after failed or
rolled-back writes. Direct SQL changes do not trigger purges.

### Provider setup

Set these variables in the deployment's server environment, never in client code
or in the `sedna()` options. They are read only when caching is enabled with a
recognized platform. Missing credentials fail configuration rather than enabling
a cache that cannot be purged.

**Netlify**

```env
SEDNA_NETLIFY_TOKEN=your-netlify-personal-access-token
# Optional if Netlify provides SITE_ID in the function environment:
SEDNA_NETLIFY_SITE_ID=your-site-id
```

The token must have access to the site. Sedna uses Netlify's stable
[cache-tag purge API](https://docs.netlify.com/build/caching/caching-overview/#on-demand-invalidation).
The request targets all deploys of that site so previews sharing its database are
also refreshed.

**Vercel**

```env
SEDNA_VERCEL_TOKEN=your-vercel-access-token
# Can be omitted if the corresponding VERCEL_PROJECT_ID / VERCEL_ORG_ID is available:
SEDNA_VERCEL_PROJECT_ID=your-project-id
SEDNA_VERCEL_TEAM_ID=your-team-id
```

The team ID is optional for personal projects. Sedna uses the stable
[tag deletion API](https://vercel.com/docs/rest-api/edge-cache/dangerously-delete-by-tag)
with a zero revalidation deadline to request a fresh render rather than knowingly
serve stale content after an unpublish or delete. Purges cover production and
preview caches in the project.

Vercel [does not cache responses with `Vary: Cookie`](https://vercel.com/changelog/vary-cookie-responses-no-longer-cached).
Sedna therefore does not add Cookie variation on Vercel, but preserves any explicit
`Vary` headers from the page. Enable caching there only for pages whose public
output is identical regardless of cookies. Cookie-bearing visitors may receive an
already cached public page. Put personalized content and previews on separate,
uncached routes. An explicit `Vary: Cookie` keeps the page uncached on Vercel.

**Cloudflare**

```env
SEDNA_CLOUDFLARE_TOKEN=your-api-token-with-zone-cache-purge-permission
SEDNA_CLOUDFLARE_ZONE_ID=your-zone-id
```

This supports Cloudflare's CDN in front of a compatible Node deployment. It does
not add Cloudflare Workers runtime support to Sedna. Proxy the domain through
Cloudflare and configure a Cache Rule making public HTML eligible for caching,
respecting origin cache-control headers and query strings. Bypass `/admin`,
`/api/cms`, and requests containing Cookie or Authorization headers. Do not force
an edge TTL that overrides `no-store`. Cloudflare does not cache HTML by default;
headers alone will not activate it. Sedna uses the stable global
[tag purge API](https://developers.cloudflare.com/cache/how-to/purge-cache/purge-by-tags/),
not the region-local Cache API's `delete()`.

### Cache policies and limits

Requests reaching Astro with cookies or authorization, responses setting cookies,
redirects, errors, and loader failures use `no-store`, including platform-targeted
cache-control headers. Admin and CMS API responses stay uncached. On Netlify and
Cloudflare, Sedna adds `Vary: Cookie, Authorization`; Vercel gets Authorization
variation only. Other existing `Vary` values are preserved.

Cache only public, visitor-independent pages. Sedna cannot change a CDN response
that never reaches its middleware. Explicit page `Cache-Control` policies are
preserved and opt out of Sedna-managed CDN caching. Unrelated routes keep their
existing headers. Load CMS content before streaming begins. Prerendered pages
remain fixed until rebuilt. The collection `pages` option is still reserved.

With `platform: 'none'`, caching retains the generic HTTP header behavior, with no
provider purge. Standalone Node does not supply a response cache. Local development
does not simulate the hosting platform's CDN, so local refreshes still query Postgres.

Purges are not atomic with database commits and may take time to propagate.
An in-flight render can race with a purge. Cache eviction, expiration, and deploys
also cause new reads. Keep a finite TTL as a fallback. If a purge fails or times out,
the content remains saved, the API sends `X-Sedna-Cache: purge-failed`, and the
dashboard shows a persistent warning. Cached pages may remain outdated until their
TTL expires or a later successful purge. There is no background retry job.

Run `npm run test:cache` for policy, provider request, transaction, and CDN-boundary
simulation tests. The simulation verifies that cached refreshes skip loader queries
and published edits invalidate affected pages; it does not certify a deployed CDN.
The suite also builds and runs the playground with caching enabled, substituting
the database boundary to check real Astro response tags and private-route headers.
On the real host, verify cache hits, a miss after publishing, query-string handling,
and private-route bypasses. `npm run test:api` with `SEDNA_TEST_DATABASE_URL` checks
content changes through an isolated schema in the production playground server.

## Development

```bash
npm install
npm run dev                   # build the package in watch mode
cd playground && npm install
cp .env.example .env          # add your database URL
npm run dev
```

Run code quality commands from the repository root. They cover the package and
playground, respect `.gitignore`, and exclude npm lockfiles.

```bash
npm run check          # check formatting, lint rules, and import organization
npm run check:fix      # apply formatting and safe lint/import fixes
npm run lint           # check lint rules only
npm run lint:fix       # apply safe lint fixes
npm run format         # format files
npm run format:check   # check formatting without changing files
```

Biome uses two-space indentation and single quotes in JavaScript and TypeScript.
Astro markup formatting and linting use Biome's experimental full HTML support.

`npm install` installs the Husky Git hooks. Before each commit, `npm run check`
checks formatting, lint rules, and import organization across the repository.
Errors block the commit without changing files. Run `npm run check:fix` to apply
safe fixes, review and stage the changes, then commit again.

## License

MIT

## Authentication

Sedna uses Better Auth for email/password login with a signed, HttpOnly session
cookie cache. Requests validate the cached session locally for five minutes, then
recheck the database and renew the cache. Session records remain in Postgres for
expiry and revocation. Logout revokes the record and clears the browser's cookies;
a copied cookie can remain valid for up to five minutes after revocation.
Public registration is disabled. The admin UI is available at `/admin`; editor invitations are not implemented yet.

Configure `SEDNA_URL` with the site's origin, `SEDNA_SECRET` with a random secret
of at least 32 characters, and `SEDNA_SETUP_TOKEN` with a separate random token
of at least 32 characters. Generate each with `openssl rand -hex 32`.
Use HTTPS in production. Set these as runtime environment variables on your host;
the playground also loads them from `.env` during development.

Create the first admin with `POST /api/cms/setup`, sending JSON with `name`,
`email`, and `password` (12–128 characters). Include `Origin: <SEDNA_URL>` and
`X-Sedna-Setup-Token: <SEDNA_SETUP_TOKEN>` headers. This creates the account but
does not log it in. Setup is atomic and returns 409 once an account exists.
Remove `SEDNA_SETUP_TOKEN` after setup.

Available auth endpoints:

- `POST /api/cms/auth/sign-in/email`: JSON `{ "email": "...", "password": "..." }`.
- `GET /api/cms/auth/get-session`: current session, or `null`.
- `POST /api/cms/auth/sign-out`: revoke the session.

Use same-origin requests and retain the session cookie. Write requests require
an `Origin` header. Authentication responses are not cached. Rate limits are stored
in Postgres and use Astro's client address rather than caller-supplied IP headers.

Auth tables use the reserved `sedna__` prefix. On the first auth request per
process, Sedna applies Better Auth's schema migrations under a database lock.
Better Auth is pinned to an exact version so schema changes are reviewed with
package upgrades. Password reset email delivery is not configured yet.

Run the auth integration test with `SEDNA_TEST_DATABASE_URL` set to a test Postgres
connection and `npm run test:auth`. It creates and removes a temporary schema;
Neon tests use the direct endpoint because the pooler rejects `search_path` startup
options. Without a test connection, the test is skipped.

## Content API

All content endpoints require a logged-in session. Write requests also require
an `Origin` matching `SEDNA_URL`. Collections come from `src/live.config.ts`;
the API can only access configured collections.

- `GET /api/cms/schema`: collection names, fields, and page configuration.
- `GET /api/cms/collections/:collection`: entries including drafts, ordered by
  `sort_order`, then creation time and ID. Supports `limit` (1–100, default 100)
  and `offset` (default 0).
- `POST /api/cms/collections/:collection`: create an entry with
  `{ "data": { "title": "Summer trip" }, "status": "draft" }`.
- `GET /api/cms/collections/:collection/:id`: read an entry by its database UUID.
- `PATCH /api/cms/collections/:collection/:id`: update selected fields and/or
  change `status` to `published` or `draft`.
- `DELETE /api/cms/collections/:collection/:id`: delete an entry.
- `POST /api/cms/collections/:collection/reorder`: send `{ "ids": ["uuid", "uuid"] }`
  in the desired order. Assigns positions starting at zero to those entries.

Single-entry responses contain `{ entry }`; lists contain `{ entries }`. An entry
has its database UUID, status, sort order, timestamps, and a `data` object.
The public live loader still addresses entries by slug when one is configured.
Shared request/response types are exported from `sednacms` for the future admin UI.

Drafts may be incomplete. Publishing requires required fields and nonempty slugs.
All supplied values are type-checked even for drafts. Missing slugs are generated
from their configured source; changing a title preserves an existing slug.
Unknown fields and system-column writes are rejected. Duplicate slugs return 409.

Run `npm run test:api` with `SEDNA_TEST_DATABASE_URL` set to verify the production
Astro server against a temporary database schema, including publishing content
and seeing it on the playground without rebuilding.

## Admin UI

The admin uses `favicon.svg`, `favicon.ico`, or `favicon.png` from your Astro
public directory, in that order. If none exists, it uses the Sedna favicon.
To use a different icon, or a site favicon with another filename, set
`admin.favicon` to its URL:

```js
integrations: [sedna({ admin: { favicon: '/my-site-icon.svg' } })],
```

The override is used as written. Include your site's base path if needed, or
use an absolute URL. Automatic discovery respects Astro's `publicDir` and `base`.
Restart the dev server or rebuild after changing favicon configuration or files.

The admin UI uses React components written in TypeScript. Astro serves the page,
and React manages the screens, forms, and rich-text editor.

Open `/admin` to manage content. On a new database, the setup screen asks for
your name, email, password, and setup token. Once the first account exists,
Sedna shows the login screen instead.

The sidebar lists configured collections. Add an entry or select an existing
one to edit it. Forms are generated from the collection fields, with a basic
rich-text editor, date and number inputs, and image fields. Configure storage to
upload images, or paste an existing image URL with its dimensions.

Save incomplete entries as drafts, publish when ready, or save a published entry
as a draft to remove it from the public site. Drag entries or use their arrow
buttons to change the order. Reordering supports up to 1,000 entries per collection.
Deletion requires confirmation, and leaving an edited form prompts you to
discard unsaved changes.

`npm run build` compiles the package and copies the admin page and stylesheet
into `dist`. When changing those assets during package development, rerun the
build before refreshing the playground.

## Image uploads

Configure one storage adapter in `astro.config.mjs`:

```js
import sedna, { uploadthingStorage } from 'sednacms';

// Inside defineConfig:
integrations: [sedna({ storage: uploadthingStorage() })],
```

Set `UPLOADTHING_TOKEN` from your UploadThing dashboard in your server's runtime
environment. The playground uses this adapter and loads the token from `.env`
during development. Restart the dev server after changing storage configuration.
The SDK handles upload signatures and verifies provider callbacks at
`/api/cms/uploads`. Uploads finish without waiting for the callback, so local
development does not require a public tunnel.

Alternatively use `storage: s3Storage()`, importing `s3Storage` from `sednacms`,
and set these environment variables:

```env
SEDNA_S3_ENDPOINT=https://s3.example.com
SEDNA_S3_BUCKET=site-images
SEDNA_S3_KEY=your-access-key
SEDNA_S3_SECRET=your-secret-key
SEDNA_S3_REGION=auto
SEDNA_S3_PUBLIC_URL=https://images.example.com
```

For Amazon S3, use your bucket's region instead of `auto`. The bucket must allow
public reads through `SEDNA_S3_PUBLIC_URL`. This URL may include a path prefix.
Set it during builds as well as at runtime so Sedna can authorize the image host
for Astro's `<Image>`. UploadThing's `*.ufs.sh` image hosts are added automatically.
Configure your bucket's CORS rules for your site's exact origin, `PUT`, and the
`Content-Type` header, for example:

```json
[
  {
    "AllowedOrigins": ["https://your-site.example"],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["Content-Type"],
    "MaxAgeSeconds": 3600
  }
]
```

Editors can upload JPEG, PNG, WebP, GIF, and AVIF images up to 32 MB. The browser
resizes images to fit within 2560 × 2560 pixels without enlarging them, preserves
their proportions, and converts them to WebP at 80% quality by default before uploading
directly to storage. Saved dimensions describe the processed image. Transparency
is preserved for WebP and AVIF; JPG uses a white background. Animated images
become still images, and embedded metadata is removed.

Processing uses jSquash's resize and WebP, MozJPEG, and AVIF WebAssembly codecs
in a browser worker. Only the selected encoder and, when needed, the resizer
are downloaded on upload. The site serves these assets locally; no conversion
service receives the image. Processing times out after two minutes with an error.
If your site has a Content Security Policy, allow same-origin workers and
WebAssembly compilation, for example `worker-src 'self'` and
`script-src 'self' 'wasm-unsafe-eval'` alongside your existing directives.

Both adapters accept image settings:

```js
uploadthingStorage({
  image: { format: 'avif', quality: 0.85, maxWidth: 1920, maxHeight: 1920 },
});
s3Storage({ image: { format: 'jpg', quality: 0.9 } });
s3Storage({ image: false }); // Keep original files and animations.
```

`format` accepts `'webp'`, `'jpg'`, or `'avif'`. Quality is between 0 and 1 for all
formats, so `0.85` means 85%. Quality values are encoder-specific; equal numbers
across formats do not guarantee the same visual quality or file size.
Dimensions must be integers between 1 and 16384. Restart the dev server after
changing these settings.
These settings apply to new admin uploads. Existing images and pasted URLs stay
as they are. Processing runs in the admin browser; upload signing endpoints do
not enforce the image dimensions or output format.

The CMS receives file descriptors and signs uploads, never file
contents. Signing requires a session and a matching `Origin`. S3 signatures bind
the file size and content type and expire in five minutes.

The image field shows a progress bar with preparation, upload, and finishing
states and a preview, preserves the image description
when replacing a file, and saves `{ src, width, height, alt }` with the entry.
Removing an image clears the field. It does not delete the stored file, since
other entries may use it. Discarded entries can also leave unused files in storage.
There is no shared media library yet.

Run `npm run test:uploads` for image processing, authorization, validation, S3
signature verification, and UploadThing signing and callback tests. Codec tests
encode actual files in all three formats and independently decode them with Sharp.
Provider tests use test credentials and mock
the provider's metadata endpoint. They do not upload to a real account. The
playground post detail page renders its image with Astro's `<Image>`.

UploadThing currently pins an older Effect release. The npm override selects
Effect 3.22.4 to include its security fixes; upload tests exercise the SDK with
that version.

## Disposable public demos

The `playground/` app uses the real database and storage services for development.
Public demo applications should live in a separate repository and use
`sednacms/demo` in place of the live Sedna integration:

```js
import sednaDemo from 'sednacms/demo';

// Inside defineConfig({ integrations: [...] })
sednaDemo({ adapter: new URL('./src/demo/adapter.ts', import.meta.url) });
```

The adapter module exports a default object implementing `AdminAdapter` from
`sednacms/demo`. Its `request(path, method, body, headers)` method returns a
`Response`; `uploadImage(file, progress)` returns an `ImageValue`. Both run only
in the browser. Return normal API response shapes so the same Sedna editor can
create, edit, publish, delete and reorder content with your transport.

The demo integration installs the editor and an API route that always returns
403. It installs no authentication, database setup or upload handlers, and
refuses to run alongside the live integration. The application supplies its own
fixture loader, disposable adapter, preview UI and security headers. Do not give
the public deployment database or storage credentials. Import schema field
helpers from `sednacms/fields` in browser code to avoid server-only imports.
