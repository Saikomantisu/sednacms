---

title: Deploy to Vercel
description: Serve static marketing pages and live Sedna content with Vercel's Astro adapter.
---

Use `@astrojs/vercel` to run Sedna's content pages, admin, and API in Node
functions. Your other pages remain static. You do not need to manage a Node
process. See the [official adapter documentation](https://docs.astro.build/en/guides/integrations-guide/vercel/).

## Configure the adapter

```sh
npx astro add vercel
```

Keep `output` unset and add Sedna:

```js title="astro.config.mjs"
import vercel from '@astrojs/vercel';
import { defineConfig } from 'astro/config';
import sedna from 'sednacms';

export default defineConfig({
  adapter: vercel(),
  integrations: [sedna()],
});
```

Replace any previous server adapter. Add `export const prerender = false` only to
pages reading live content. Sedna registers its admin and API as on-demand routes.
The [hybrid example](/guides/hybrid/) shows both kinds of page together.

## Set runtime variables

In your Vercel project's environment settings, configure:

- `SEDNA_DATABASE_URL`: a pooled Postgres URL reachable from Vercel functions.
- `SEDNA_URL`: the exact HTTPS origin visitors use, including your custom domain.
- `SEDNA_SECRET`: a stable random secret of at least 32 characters.
- `SEDNA_SETUP_TOKEN`: a separate random token of at least 32 characters for first-admin setup.

Set these for the deployment environments you use, then deploy. Use a separate
database for previews so preview writes cannot alter production content. Give
each preview its own correct `SEDNA_URL`. Static marketing pages do not need a
database connection at build time.

Sedna creates tables at runtime. Allow schema creation and alteration for its
database role. Each function instance can create its own pools, so use a provider
pooler and adjust `SEDNA_DATABASE_POOL_MAX` to your database's connection budget.
Keep the default of `5` initially. Authentication migrations need more than one
connection from their pool, so do not set this to `1`.

If you enable [image storage](/guides/uploads/), add its server-only variables
too. Supply `SEDNA_S3_PUBLIC_URL` at build time as well as runtime when using S3
so Astro can authorize the image host.

## Deploy and verify

Import the site into Vercel and use the Astro framework preset. Build with
`npm run build`. For the repository example, build the Sedna package first and
set `SEDNA_HOST=vercel` when building `apps/hybrid`.

Open `/admin`, create the first account, then remove `SEDNA_SETUP_TOKEN` and
redeploy. Keep `SEDNA_SECRET` stable. Follow the
[deployed-site checks](/guides/deployment/#check-the-deployed-site), including
publishing a new slug without a rebuild.

Leave Vercel ISR and Sedna caching disabled initially. If you enable caching,
use the [Sedna Vercel caching guide](/guides/caching/#vercel) and verify purging
on your actual deployment. Admin and API routes must remain uncached.

The repository's `npm run verify:hybrid -- vercel` builds the example, checks its
static output, and executes the bundled function locally against Postgres.
It does not emulate Vercel's CDN or replace a deployed-site check.
