# Playground

A plain sans-serif page for testing the real CMS. No custom favicon or bundled images.

Three collections:

- `posts`: title, slug, rich text, date, reading time, an optional image, tags, gallery and FAQs.
- `testimonials`: name, quote, role and company.
- `packages`: title, summary, a required list of highlights, and a required itinerary.
  Each itinerary item groups a title, description, and its own list of activities.

The homepage displays package highlights and numbered itinerary days in their saved
order. When there are no published packages, it shows labelled example packages
from `src/examples/package.ts`. These previews are not stored in the database.

## Run

Configure `.env` from `.env.example`, then run from the repository root:

```sh
npm run build
npm run dev --prefix playground
```

Open `http://localhost:4321` or `/admin`. Edits and uploads persist.
Create and manage posts, testimonials and packages in `/admin`. Content tables are created
from the collection schema when the development server starts. No sample content
is added automatically.

To try the list editor, open **Packages** in `/admin`, add an entry, and fill in its
title, highlights and itinerary. Each day needs a title; activities are optional.
Move a highlight, day, or activity up or down, then publish and reload `/` to see the
saved order. A draft stays out of the frontend and does not replace the preview.

## Example packages

After building the root package, add three published examples to the configured database:

```sh
npm run seed:packages --prefix playground
```

This adds Edinburgh, Lake District and York packages with highlights and daily activities.
They appear on the homepage and can be edited in Admin. Rerunning the command skips
examples already seeded, preserving your edits and other entries. The command reads
`playground/.env` and creates the packages table if needed. Seeding runs only when
explicitly requested, never on server startup.
