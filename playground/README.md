# Playground

A plain sans-serif page for testing the real CMS. No custom favicon or bundled images.

Three collections:

- `posts`: title, slug, rich text, date, reading time, an optional image, tags, gallery and FAQs.
- `testimonials`: name, quote, role and company.
- `packages`: title, summary, a required list of highlights, and a required itinerary.
  Each itinerary item groups a title, description, and its own list of activities.

The homepage reads published content from the CMS, including package highlights and
numbered itinerary days in their saved order. Empty collections show an empty state.

## Run

Configure `.env` from `.env.example`, then run from the repository root:

```sh
npm run build
npm ci --prefix playground
npm run dev --prefix playground
```

Open `http://localhost:4321` or `/admin`. Edits and uploads persist.
The playground uses Vercel; API integration tests use standalone Node.

The local package is packed into `node_modules` through the playground's `.npmrc`.
After changing Sedna, rebuild it and repeat `npm ci --prefix playground` to refresh
the installed copy before testing.

CDN caching is disabled during development and uses a one-hour TTL in production.
Configure [Vercel purge credentials](../docs/src/content/docs/guides/caching.md#vercel)
before deploying with caching enabled.

Create and manage posts, testimonials and packages in `/admin`. Content tables are created
from the collection schema when the development server starts. No sample content
is added automatically.

To try the list editor, open **Packages** in `/admin`, add an entry, and fill in its
title, highlights and itinerary. Each day needs a title; activities are optional.
Move a highlight, day, or activity up or down, then publish and reload `/` to see the
saved order. A draft stays out of the frontend.

## Dummy content

After building the root package, add published dummy content to the configured database:

```sh
npm run seed --prefix playground
```

This adds three travel packages, two posts and three testimonials. They appear on the
homepage and can be edited in Admin. Sample data lives in `scripts/seed-data.ts` and is
never imported by the site. Rerunning the command skips content already seeded,
preserving your edits and other entries. The command reads `playground/.env` and creates
missing content tables if needed. Seeding runs only when explicitly requested, never
on server startup. Use `npm run seed:packages --prefix playground` to seed only packages.
