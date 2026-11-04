---

title: Introduction
description: How Sedna connects Astro, Postgres, and the content editor.
---

Sedna CMS is an open-source Astro integration for content you publish as entries, such as blog posts or testimonials. Define collections and fields in TypeScript, then let editors manage entries at `/admin`.

## How content reaches your pages

1. Define a collection with `sednaLoader()` in `src/live.config.ts`.
2. Sedna creates its Postgres table and generates an editor from your fields.
3. An editor saves a draft or publishes an entry.
4. Your Astro page reads published content with `getLiveCollection()` or `getLiveEntry()` when a visitor requests it.

By default, these responses use `Cache-Control: no-store`. Each request that reaches Astro reads Postgres. You can opt into [CDN caching](/guides/caching/) for public pages.

## What you need

- Astro 6 or newer, with a server adapter compatible with Sedna's Node dependencies.
- A Postgres database with a pooled connection string.
- UploadThing or S3-compatible storage if editors need to upload images.

Sedna's admin and API need a server. You cannot deploy them to a static-only host or Cloudflare Workers. You can use Cloudflare's CDN in front of a compatible Node server.

## Current scope

Editors can save drafts, publish and reorder entries, edit nested fields, and upload images. Login uses email and password. Each installation serves one site.

Sedna v1 does not include inline editing of individual page fields, version history, rollback, or a hosted CMS service.

Start with [installation](/getting-started/installation/), then [define a collection](/getting-started/first-collection/).
