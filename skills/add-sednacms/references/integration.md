# Integration reference

## Astro configuration

Use this Node configuration if the site has no server adapter. Otherwise, add `sedna()` to the existing integrations and keep the compatible adapter.

```js
import node from '@astrojs/node';
import { defineConfig } from 'astro/config';
import sedna from 'sednacms';

export default defineConfig({
  adapter: node({ mode: 'standalone' }),
  integrations: [sedna()],
});
```

Install `@astrojs/node` only if using that adapter. Choose a release compatible with the site's Astro version. No experimental live-content flag is needed on Astro 6+.

Sedna installs `/admin/[...path]`, `/api/cms/[...path]`, and middleware. Check that existing auth middleware allows requests to Sedna's login, setup, and auth handlers. Sedna protects its own content endpoints. Adjust overlapping middleware without disabling authentication elsewhere. Test URLs when the site uses a custom base path; CMS paths are not all configurable.

## Live collections

```ts
// src/live.config.ts, or the equivalent under a custom srcDir
import { defineLiveCollection } from 'astro:content';
import { fields, sednaLoader } from 'sednacms';

const posts = defineLiveCollection({
  loader: sednaLoader({
    collection: 'posts',
    fields: {
      title: fields.text({ required: true }),
      slug: fields.slug({ from: 'title' }),
      body: fields.richText(),
      date: fields.date(),
      cover: fields.image(),
    },
  }),
});

export const collections = { posts };
```

Adapt `posts` and its fields to the user's content. Page queries use the exported collection key. The loader's `collection` option names the Sedna table. Usually these names should match.

- Helpers: `text`, `richText`, `number`, `image`, `boolean`, `date`, `slug`. All accept `{ required: true }`; slug also accepts `{ from: 'title' }`.
- Collection names match `^[a-z][a-z0-9_]*$`. Field names match `^[a-zA-Z][a-zA-Z0-9_]*$`.
- Reserved fields: `id`, `status`, `sort_order`, `created_at`, `updated_at`, `published_at`.
- Rich text is HTML, not Markdown or an Astro renderable body. Date is a `YYYY-MM-DD` calendar-day string. Image is `{ src, width, height, alt }`. Every field can be null. Sedna checks required fields when publishing, so drafts can be incomplete.
- Tables are `sedna_<collection>`; internal auth tables use `sedna__`. Automatic schema setup only adds missing tables/columns. Slug fields receive unique indexes.
- A collection with a slug returns it as the public entry ID. Without a slug, the ID is the database UUID. Authenticated CRUD endpoints address entries by UUID. Avoid multiple slug fields unless the installed version documents their lookup behavior.

## Page queries

Listing example, to adapt inside the site's existing layout:

```astro
---
export const prerender = false;
import { getLiveCollection } from 'astro:content';

const { entries, error } = await getLiveCollection('posts');
if (error) Astro.response.status = 503;
---

{error ? <p role="status">Posts are temporarily unavailable.</p> : (
  entries?.length ? (
    <ul>
      {entries.map(({ id, data }) => (
        <li><a href={`/posts/${encodeURIComponent(id)}`}>{data.title}</a></li>
      ))}
    </ul>
  ) : <p>No posts yet.</p>
)}
```

Detail route example, such as `src/pages/posts/[slug].astro`:

```astro
---
export const prerender = false;
import { Image } from 'astro:assets';
import { getLiveEntry } from 'astro:content';

const slug = Astro.params.slug;
if (!slug) return Astro.redirect('/404');
const { entry, error } = await getLiveEntry('posts', slug);
if (!entry && (!error || error.name === 'LiveEntryNotFoundError')) {
  return Astro.redirect('/404');
}
if (error) Astro.response.status = 503;
const data = entry?.data;
---

{error ? <p role="status">This post is temporarily unavailable.</p> : data && (
  <article>
    <h1>{data.title}</h1>
    {data.cover && <Image {...data.cover} />}
    {data.body && <div set:html={data.body} />}
  </article>
)}
```

Use the site's existing missing-page convention and account for `base` in links and redirects. `set:html` is for CMS rich text saved through Sedna's sanitizing API, not arbitrary unsanitized imported HTML. Astro remote-image authorization may need configuring for manually pasted image URLs.

For large listings, `getLiveCollection('posts', { limit: 11, offset: 0 })` allows ten visible items and one next-page indicator. `limit` must be an integer 1–100; `offset` must be a nonnegative safe integer and a positive offset requires a limit. Validate URL pagination inputs. Ordering is `sort_order`, `created_at`, then `id`.

## Environment and first admin

Replace these placeholders with local values:

```dotenv
SEDNA_DATABASE_URL=postgres://USER:PASSWORD@HOST/DATABASE?sslmode=require
SEDNA_URL=http://localhost:4321
SEDNA_SECRET=
SEDNA_SETUP_TOKEN=
```

Use a pooled Postgres connection URL suitable for the hosting runtime. The database role needs permission to create Sedna's tables and columns. Development loads `.env` into the server environment. Set production variables in the runtime environment as well as anywhere they are needed during builds. Use the actual dev port in `SEDNA_URL`, and the HTTPS site origin in production.

Generate `SEDNA_SECRET` and `SEDNA_SETUP_TOKEN` independently, each with at least 32 characters, for example using `openssl rand -hex 32` for each. Keep the session secret stable across restarts. Do not use example database credentials as if they were configured.

Visit `/admin` on an empty database. The setup form needs a name, email, password of 12–128 characters, and the setup token. Remove `SEDNA_SETUP_TOKEN` from the runtime environment after the first account is created, then restart. Public signup is disabled. Editor invitations and password reset emails are not implemented.

For scripted setup, `POST /api/cms/setup` accepts JSON `{ name, email, password }` and requires `Origin: <SEDNA_URL>` plus `X-Sedna-Setup-Token`. It does not log the new account in and returns 409 if an account exists. Sign in through `/api/cms/auth/sign-in/email` with email/password and retain cookies. Subsequent authenticated writes require the same-origin header. Avoid putting passwords/tokens in shell arguments or logs.

For requested imports, use authenticated `POST /api/cms/collections/:collection` with `{ data: { ... }, status: 'draft' }`. Single-entry responses contain `{ entry }`, including its UUID. `PATCH /api/cms/collections/:collection/:id` changes fields or status. List responses contain `{ entries }` and include drafts. Fetch existing records and compare stable slugs before retrying an import. Publishing checks required fields and nonempty slugs. Existing slugs survive title edits.

## Optional storage and caching

UploadThing:

```js
import sedna, { uploadthingStorage } from 'sednacms';
// Within the existing integrations array:
sedna({ storage: uploadthingStorage() });
```

Set server-only `UPLOADTHING_TOKEN`. No public tunnel is needed for local uploads.

S3-compatible storage:

```js
import sedna, { s3Storage } from 'sednacms';
sedna({ storage: s3Storage() });
```

Set `SEDNA_S3_ENDPOINT`, `SEDNA_S3_BUCKET`, `SEDNA_S3_KEY`, `SEDNA_S3_SECRET`, `SEDNA_S3_REGION`, and `SEDNA_S3_PUBLIC_URL`. Use the actual region for AWS or `auto` where supported. The public URL must serve publicly readable objects. Supply it at build time as well as runtime for Astro image-host authorization. The bucket needs CORS allowing the site's exact origin, `PUT`, and `Content-Type`. UploadThing `*.ufs.sh` image hosts are authorized automatically.

Images default to browser-side resizing within 2560 × 2560 and WebP encoding at quality 0.8. Both adapters accept `{ image: { format: 'avif', quality: 0.85, maxWidth: 1920, maxHeight: 1920 } }` or `{ image: false }` to retain originals and animation. CSP may need `worker-src 'self'` and `script-src 'self' 'wasm-unsafe-eval'` added to existing directives. Removing an image field does not delete the stored object.

Default CMS responses use `Cache-Control: no-store`. Optional `sedna({ cache: { ttl: 60 } })` sends shared-cache headers for eligible anonymous requests, but writes do not purge caches. The standalone Node server has no shared response cache. Admin/API responses remain uncached. Use the main `sednacms` integration for a real site. `sednacms/demo` has no database or authentication backend.
