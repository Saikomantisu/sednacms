# Static marketing, live blog

`/`, `/about`, and `/404` are static. `/blog` and `/blog/[slug]` read Sedna on
demand. Sedna supplies the dynamic `/admin/*` and `/api/cms/*` routes. The shared
layout has no content reads, so it can serve both static and live pages.

## Contributor setup

This example runs inside Sedna's source repository and links to the local package.
Contributors build Sedna before running it. Users installing `sednacms` from npm
receive compiled code and only need to build their own Astro site.

From the repository root:

```sh
npm install
npm run build
npm run dev -w sednacms-hybrid
```

For Node, Vercel, or Netlify, put these variables in `apps/hybrid/.env` for development:

```dotenv
SEDNA_DATABASE_URL=postgres://user:password@host-pooler/database?sslmode=require
SEDNA_URL=http://localhost:4321
SEDNA_SECRET=replace-with-a-random-secret-of-at-least-32-characters
SEDNA_SETUP_TOKEN=replace-with-a-separate-random-token-of-at-least-32-characters
```

For Cloudflare, use `apps/hybrid/.dev.vars` instead and set
`SEDNA_HOST=cloudflare` in the shell. Never commit either secrets file.
Open `/admin` to create your first account, then create and publish a post.
Remove the setup token after setup.

Choose the adapter when building:

```sh
SEDNA_HOST=node npm run build -w sednacms-hybrid
SEDNA_HOST=vercel npm run build -w sednacms-hybrid
SEDNA_HOST=netlify npm run build -w sednacms-hybrid
SEDNA_HOST=cloudflare npm run build -w sednacms-hybrid
```

`SEDNA_HOST` is only this example's adapter selector. Use the same value for dev
and build. A real site can import its adapter directly without this variable.
Netlify does not support `astro preview` for this hybrid site. Use
`npm run verify:hybrid -- netlify` with `SEDNA_TEST_DATABASE_URL` to exercise its
generated function locally.

Node is the default. Start its built server with
`node apps/hybrid/dist/server/entry.mjs` and supply the variables in that process's
environment. Follow the [deployment guides](../docs/src/content/docs/guides/deployment.md)
for production secrets and host-specific checks. No adapter changes Astro's
static-by-default output policy.

Run the verification script against a disposable Postgres database:

```sh
SEDNA_TEST_DATABASE_URL=postgres://... npm run verify:hybrid
```

Optionally append `-- node`, `-- vercel`, `-- netlify`, or `-- cloudflare` to test one adapter.
The script builds without runtime secrets and verifies static output, admin
setup, login, drafts, publishing, editing, concurrent content reads, unpublishing,
and logout in isolated schemas. It runs Vercel's and Netlify's generated functions locally and
Cloudflare in Wrangler's Workers runtime. It does not deploy or test a CDN or
real storage uploads. Run it from a clean example checkout without local `.env`
or `.dev.vars` files so those cannot supply build-time secrets.

## Deploy this repository example to Netlify

These settings are for contributors deploying this monorepo example. For a site
using the npm package, follow the [Netlify guide](../docs/src/content/docs/guides/netlify.md).

Keep the base directory at the repository root, set the package directory to
`apps/hybrid`, and publish `apps/hybrid/dist`. Use this root build command:

```sh
npm run build && SEDNA_HOST=netlify npm run build -w sednacms-hybrid
```

The first command compiles Sedna's source; the second builds the example site.
See [Netlify's monorepo settings](https://docs.netlify.com/build/configure-builds/monorepos/)
for base, package, and publish directory behavior.

The root TypeScript 6 dependency supplies the JavaScript compiler API needed by
Netlify's dependency tracer. Sedna's package workspace keeps TypeScript 7.
