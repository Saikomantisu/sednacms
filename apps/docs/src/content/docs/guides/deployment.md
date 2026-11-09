---

title: Deployment
description: Deploy Sedna with a Node-compatible adapter, runtime variables, and Postgres.
---

Sedna uses your site's Astro server adapter. It needs Node-compatible APIs and a reachable Postgres database. Sedna leaves adapter selection and dependency bundling to your site configuration. Hosting-provider credentials are needed only if you enable CDN caching.

The examples use standalone Node. For a managed host, use its Astro adapter.

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

## Cloudflare Workers compatibility

Cloudflare Workers with `nodejs_compat` is experimental. Local build and basic route
checks pass, but database connection reuse, auth flows, publishing, uploads, and
CDN purging still need verification. Keep caching disabled during compatibility
testing. The [Cloudflare caching guide](/guides/caching/#cloudflare) covers a CDN
in front of a Node origin.
