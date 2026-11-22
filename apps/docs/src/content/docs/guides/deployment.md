---

title: Deployment
description: Deploy a static Astro site with live Sedna routes on Node, Vercel, Netlify, or Cloudflare Workers.
---

Sedna uses your site's Astro server adapter. It needs Node-compatible APIs and a reachable Postgres database. Sedna leaves adapter selection and dependency bundling to your site configuration. Hosting-provider credentials are needed only if you enable CDN caching.

Install Sedna from npm using the [installation guide](/getting-started/installation/).
The package is already compiled. The build commands below build your Astro site.

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
