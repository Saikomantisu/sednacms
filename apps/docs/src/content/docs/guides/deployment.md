---

title: Deployment
description: Deploy a static Astro site with live Sedna routes on Node, Vercel, Netlify, or Cloudflare Workers.
---

Sedna uses your site's Astro server adapter. It needs Node-compatible APIs and a reachable Postgres database. Sedna leaves adapter selection and dependency bundling to your site configuration. Hosting-provider credentials are needed only if you enable CDN caching.

Keep `output: 'static'`, Astro's default. Your adapter runs pages that opt into
on-demand rendering, plus Sedna's admin and API. Marketing pages that do not read
live content remain static HTML.

Choose the deployment guide for your host:

- [Vercel](/guides/vercel/) uses Node functions and serves static pages from its CDN.
- [Netlify](/guides/netlify/) uses Node functions alongside static pages.
- [Cloudflare Workers](/guides/cloudflare/) uses the Workers runtime with Node compatibility.
- Standalone Node uses the commands below.

## Build and run

After adding the [Node configuration](/getting-started/installation/), build and start the server:

```sh
npm run build
node ./dist/server/entry.mjs
```

Set [runtime environment variables](/reference/environment/) through your host or process manager before starting the server. Sedna's dev-server hook loads your development `.env`, but it does not run in a production Node process.

Use HTTPS and set `SEDNA_URL` to your production origin. Use a pooled database connection with a role that can create and update Sedna's tables. The loader checks collection tables before its first query; authentication migrates its system tables on first use.

## Render CMS pages on demand

Every page that reads CMS content needs:

```js
export const prerender = false;
```

Sedna injects `/admin` and `/api/cms/*` as server routes. Keep those routes uncached. Read CMS data in page frontmatter before streaming starts.

## Set up the admin

On a new production database, open `/admin` to create the first account with your setup token. Remove `SEDNA_SETUP_TOKEN` after setup and restart the process. If the database already has an account, sign in with it.

## Check the deployed site

1. Create a draft and confirm it does not appear publicly.
2. Publish it and refresh the public page without rebuilding.
3. Edit the published entry, then unpublish it and check the public page again.
4. If storage is enabled, upload an image and check it on a public page.

Caching is disabled by default. If you enable [CDN caching](/guides/caching/), check it on the deployed host. Confirm that pages produce cache hits, publishing purges cached content, pagination respects query strings, and private routes bypass the cache. Local Node development does not simulate a CDN.

You can put Cloudflare CDN in front of a compatible Node server with explicit cache rules.

## Verify the hybrid example

The [example site](https://github.com/Saikomantisu/sednacms/tree/main/apps/hybrid)
keeps its homepage and About page static and renders its blog on demand.
From the repository root, run:

```sh
SEDNA_TEST_DATABASE_URL=postgres://... npm run verify:hybrid
```

Use a disposable Postgres database with schema creation permissions. The check
creates and removes an isolated schema per adapter. It builds without runtime
secrets, checks the static HTML, and exercises setup, login, draft visibility,
publishing, editing, concurrent reads, unpublishing, and logout. Vercel's and
Netlify's generated functions run through a local HTTP bridge; Workers runs in `workerd` through
Wrangler. This does not verify a host's CDN, production database networking, or
real object-storage uploads. Run the deployed-site checks above after deployment.
