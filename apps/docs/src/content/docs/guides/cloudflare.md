---

title: Deploy to Cloudflare Workers
description: Keep static Astro pages alongside live Sedna routes on Cloudflare Workers.
---

Use `@astrojs/cloudflare` with Node compatibility. Workers runs your live content
pages, admin, and CMS API; static marketing pages remain build output. This guide
targets Workers. It does not establish compatibility with Cloudflare Pages.
See the [official adapter guide](https://docs.astro.build/en/guides/integrations-guide/cloudflare/).

## Configure Workers

Run these commands in your Astro project:

```sh
npm install sednacms
npx astro add cloudflare
```

Keep `output` unset:

```js title="astro.config.mjs"
import cloudflare from '@astrojs/cloudflare';
import { defineConfig } from 'astro/config';
import sedna from 'sednacms';

export default defineConfig({
  adapter: cloudflare(),
  integrations: [sedna()],
});
```

Keep the Wrangler configuration generated for your adapter version. Enable
`nodejs_compat` and use a current compatibility date. For example:

```json title="wrangler.jsonc"
{
  "name": "my-sedna-site",
  "main": "@astrojs/cloudflare/entrypoints/server",
  "compatibility_date": "2026-11-22",
  "compatibility_flags": ["nodejs_compat"],
  "assets": { "binding": "ASSETS", "directory": "./dist" }
}
```

Add `export const prerender = false` to live content pages. Sedna registers its
admin and API routes automatically. See [Static pages with live content](/guides/hybrid/).

## Configure Postgres and secrets

Use a pooled Postgres URL reachable from Workers. Sedna uses `pg` through Node
compatibility and creates request-local database resources on Cloudflare.
Connections close after page frontmatter and request handlers finish; read CMS
content before streaming. Workers cannot reuse a database socket created by a
different request. Successful schema setup is retained per database; connections
and pending setup work stay request-local. See [Cloudflare's connection lifecycle guidance](https://developers.cloudflare.com/hyperdrive/concepts/connection-lifecycle/).

Set `SEDNA_DATABASE_URL`, `SEDNA_SECRET`, `SEDNA_URL`, and `SEDNA_SETUP_TOKEN`
as Worker secrets. For example, Wrangler prompts for each value:

```sh
npx wrangler secret put SEDNA_DATABASE_URL
npx wrangler secret put SEDNA_SECRET
npx wrangler secret put SEDNA_URL
npx wrangler secret put SEDNA_SETUP_TOKEN
```

Use your production HTTPS origin for `SEDNA_URL`. Generate the two secrets
independently, with at least 32 characters each. Keep the session secret stable.
Use separate databases and origins for previews. `nodejs_compat` with the date
above exposes Worker text bindings and secrets through `process.env`.

For local development, set the same values in an ignored `.dev.vars` file in the
site root. Use a development database and `http://localhost:4321` as the local
origin. Static routes do not require database or auth secrets to build.

## Build and test before deployment

```sh
npm run build
npm run preview
```

The adapter previews the application in `workerd`. If preview uses a different
port, update the local `SEDNA_URL` to match it. Check your static pages, live
content routes, and `/admin`, then publish and edit a post. Repeat requests and open the blog in
multiple tabs to catch connection lifetime problems.

## Deploy and verify the host

```sh
npx wrangler deploy
```

Create your first account at `/admin`, then delete the setup secret:

```sh
npx wrangler secret delete SEDNA_SETUP_TOKEN
```

The repository verifies builds, auth, publishing, and concurrent reads locally
in Workers. Production database networking, real storage uploads, and CDN
purging require the [deployed-site checks](/guides/deployment/#check-the-deployed-site).
In particular, SVG uploads use server-side DOM parsing and are not covered by
the Workers compatibility check. Verify your upload paths before relying on them.

Leave caching disabled until the basic flow works. The
[Cloudflare caching guide](/guides/caching/#cloudflare) describes a CDN in front
of a Node origin; it does not configure a Workers response cache for you.
