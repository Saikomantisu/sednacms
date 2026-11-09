---

title: Configuration
description: Integration options and the sednaLoader collection configuration.
---

## Astro integration

```js title="astro.config.mjs"
import sedna, { uploadthingStorage } from 'sednacms';

// In defineConfig({ integrations: [...] })
sedna({
  cache: { ttl: 3600 },
  storage: uploadthingStorage(),
  admin: { siteName: 'My site', favicon: '/favicon.svg' },
});
```

Start with `sedna()` and add options as your site needs them.

| Option           | Default                       | Behavior                                                                            |
| ---------------- | ----------------------------- | ----------------------------------------------------------------------------------- |
| `platform`       | Automatic                     | Override adapter detection with `netlify`, `vercel`, `cloudflare`, or `none`.       |
| `cache`          | Disabled                      | Use `{ ttl: positiveIntegerSeconds }` for shared caching, or `false` to disable it. |
| `storage`        | None                          | `uploadthingStorage()` or `s3Storage()` for image uploads.                          |
| `admin.siteName` | Homepage title, then Sedna    | Override the website title used in admin page titles.                               |
| `admin.favicon`  | Site favicon, then Sedna icon | URL used as written, including any base path.                                       |

The `platform` option selects caching behavior. You still need to install an adapter that supports Sedna's runtime requirements. Sedna detects Node and unknown adapters as `none`. Cloudflare Workers with Node compatibility is [experimental](/guides/deployment/#cloudflare-workers-compatibility). See [Caching](/guides/caching/) for provider credentials and limitations.

Without an explicit favicon, Sedna checks `favicon.svg`, `favicon.ico`, then `favicon.png` in Astro's public directory. It uses Astro's `publicDir` and `base` settings to find the file and build its URL.

## Collection loader

```ts
sednaLoader({
  collection: 'posts',
  fields: {
    title: fields.text({ required: true }),
    slug: fields.slug({ from: 'title' }),
  },
});
```

`collection` sets the database collection name. `fields` defines the editor form and data types. Export live collections from `src/live.config.ts`. The `pages` option is reserved and has no effect on caching.

Restart the dev server after changing collection or integration configuration. Sedna creates missing collection tables when the dev server starts and before the first production loader query. It does not drop existing data automatically. Review database schema changes before deploying.

## Storage adapters

Both adapters accept `image` processing options. See [Image uploads](/guides/uploads/) for formats, dimensions, quality, and environment configuration.
