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

const packages = defineLiveCollection({
  loader: sednaLoader({
    collection: 'packages',
    fields: {
      title: fields.text({ required: true }),
      slug: fields.slug({ from: 'title' }),
      price: fields.number(),
    },
  }),
});

export const collections = { packages };
```

Set `SEDNA_DATABASE_URL` in `.env`. Tables are created when the dev server starts.

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
rich-text editor, date and number inputs, and an image URL form. Images can use
existing URLs; uploading and browsing stored images are the next step.

Save incomplete entries as drafts, publish when ready, or save a published entry
as a draft to remove it from the public site. Drag entries or use their arrow
buttons to change the order. Reordering supports up to 1,000 entries per collection.
Deletion requires confirmation, and leaving an edited form prompts you to
discard unsaved changes.

`npm run build` compiles the package and copies the admin page and stylesheet
into `dist`. When changing those assets during package development, rerun the
build before refreshing the playground.
