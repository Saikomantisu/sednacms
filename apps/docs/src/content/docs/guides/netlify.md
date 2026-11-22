---

title: Deploy to Netlify
description: Serve static marketing pages and live Sedna content with Netlify's Astro adapter.
---

Use `@astrojs/netlify` to run live content pages, admin, and the CMS API in Node
functions. Other pages stay static. You do not need to manage a long-running
Node process. See the [official adapter guide](https://docs.astro.build/en/guides/integrations-guide/netlify/).

## Configure the adapter

```sh
npx astro add netlify
```

Keep Astro's default `output: 'static'` by leaving `output` unset:

```js title="astro.config.mjs"
import netlify from '@astrojs/netlify';
import { defineConfig } from 'astro/config';
import sedna from 'sednacms';

export default defineConfig({
  adapter: netlify(),
  integrations: [sedna()],
});
```

Replace any previous server adapter. Only pages that read Sedna content need
`export const prerender = false`. Fetch in page frontmatter and pass data to
layouts and components. Sedna registers its admin and API as on-demand routes.
See the [mixed static and live example](/guides/hybrid/).

## Set runtime variables

In your Netlify site's environment settings, add:

- `SEDNA_DATABASE_URL`: a pooled Postgres URL reachable from Netlify functions.
- `SEDNA_URL`: the exact production HTTPS origin, including your custom domain.
- `SEDNA_SECRET`: a stable random secret of at least 32 characters.
- `SEDNA_SETUP_TOKEN`: a separate random token of at least 32 characters for first-admin setup.

Make the variables available to Functions. Use separate databases for production
and deploy previews, and set the matching `SEDNA_URL` in each context. Static
marketing pages do not need a database connection at build time.

Allow schema creation and alteration for the database role. Keep the pool maximum
at its default of `5` initially; authentication migrations need more than one
connection. Each function instance can have its own pools, so account for all
instances when planning your database connection budget.

For [image storage](/guides/uploads/), add the storage provider's server-only
variables too. With S3, supply `SEDNA_S3_PUBLIC_URL` at build time as well as
runtime so Astro can authorize the image host.

## Deploy and verify

Connect the site repository in Netlify. For a standard Astro site, build with
`npm run build` and publish `dist`. Keep the adapter's generated routing and
function output so `/admin/*`, `/api/cms/*`, and your content pages reach the
function.

For this repository's example, keep the base directory at the repository root,
set the package directory to `apps/hybrid`, and publish `apps/hybrid/dist`.
Use this build command from the root:

```sh
npm run build && SEDNA_HOST=netlify npm run build -w sednacms-hybrid
```

The first command builds the Sedna package; the second builds the site. See
[Netlify's monorepo settings](https://docs.netlify.com/build/configure-builds/monorepos/)
for the distinction between base, package, and publish directories.

Open `/admin`, create your first account, then remove `SEDNA_SETUP_TOKEN` and
redeploy. Keep `SEDNA_SECRET` stable. Follow the
[deployed-site checks](/guides/deployment/#check-the-deployed-site), including
publishing a new slug without a rebuild.

Leave caching disabled initially. To enable it, follow the
[Netlify caching guide](/guides/caching/#netlify), then verify cache hits and
publishing purges on the deployed site. Admin and API routes must stay uncached.

From the repository root, run
`SEDNA_TEST_DATABASE_URL=postgres://... npm run verify:hybrid -- netlify`
to check static output and the generated function locally against Postgres.
This does not emulate Netlify's CDN, deployed database networking, or real
storage uploads.

The Netlify adapter does not provide an `astro preview` entry point for this
hybrid site. Use the verification command above for its built function.

## TypeScript compiler API error

If building fails with `Cannot read properties of undefined (reading 'Intrinsic')`
from `ts-api-utils`, Netlify's dependency tracer may be resolving TypeScript 7's
native compiler package. The tracer needs TypeScript's JavaScript compiler API.
Install TypeScript 6 in the build environment and rebuild:

```sh
npm install -D typescript@6.0.3
npm run build
```

The repository supplies TypeScript 6 at its root for build tooling and keeps
Sedna's TypeScript 7 compiler in the package workspace.
