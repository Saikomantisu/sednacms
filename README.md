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

## License

MIT

## Authentication

Sedna uses Better Auth for email/password login and database-backed sessions.
Public registration is disabled. The admin UI and editor invitations are not implemented yet.

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
