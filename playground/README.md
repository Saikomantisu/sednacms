# Playground

A plain sans-serif page for testing the real CMS. No custom favicon or bundled images.

Two collections:

- `posts`: title, slug, rich text, date, reading time and an optional image.
- `testimonials`: name, quote, role and company.

## Run

Configure `.env` from `.env.example`, then run from the repository root:

```sh
npm run build
npm run dev --prefix playground
```

Open `http://localhost:4321` or `/admin`. Edits and uploads persist.
Create and manage posts and testimonials in `/admin`. Content tables are created
from the collection schema when the development server starts. No sample content
is added automatically.
