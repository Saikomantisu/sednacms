# Playground

A small blog for a made-up web developer, Maya Chen. It exists to test the real CMS.

Two collections:

- `posts`: title, slug, excerpt, cover image, rich text body, date, reading time and tags.
- `testimonials`: name, quote, role and company.

Pages:

- `/` is a light, single-page layout: intro, every published post as a card with its cover
  image (the newest is larger), services, testimonials and a contact panel.
- `/posts/<slug>` shows one post with its cover image, body and tags. A missing post
  redirects to `/404`.

Drafts stay out of the site. Manage content in `/admin`.

Styling uses Tailwind CSS v4 utility classes written directly in the `.astro` files, plus the
typography plugin (`prose`) for post bodies. `src/styles/site.css` only loads Tailwind.

## Run

Configure `.env` from `.env.example`, then run from the repository root:

```sh
npm install
npm run build
npm run playground:dev
```

Open `http://localhost:4321` or `/admin`. Content tables are created from the schema
when the dev server starts. No sample content is added automatically.

The playground depends on the `sednacms` workspace package, which npm links into
`node_modules`. After changing Sedna, run `npm run build` again. No reinstall is needed.

The playground deploys to Vercel; the API integration tests run it as a standalone Node
server. To deploy, set the project's root directory to `apps/playground`.

CDN caching is disabled during development and uses a one-hour TTL in production.
Configure [Vercel purge credentials](../docs/src/content/docs/guides/caching.md#vercel)
before deploying with caching enabled.

## Dummy content

To fill an empty database with four posts and three testimonials:

```sh
npm run playground:seed
```

Collections that already have entries are skipped, so rerunning never overwrites your
content. To get the sample posts after an older seed, delete the existing posts in Admin first. Sample data lives in `scripts/seed-data.ts` and is never imported by the site.
The post photos come from Unsplash, so `astro.config.mjs` allows `images.unsplash.com`.
Images you upload in Admin are allowed automatically.
