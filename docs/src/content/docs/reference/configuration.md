---

title: Configuration
description: Integration options and the sednaLoader collection configuration.
---

## Astro integration

```js title="astro.config.mjs"
import sedna, { uploadthingStorage } from 'sednacms';

// In defineConfig({ integrations: [...] })
sedna({
  platform: 'netlify',
  cache: { ttl: 3600 },
  storage: uploadthingStorage(),
  admin: { favicon: '/favicon.svg' },
});
```

All options are optional. Start with `sedna()` and configure only what your site needs.

| Option          | Default                       | Behavior                                                                            |
| --------------- | ----------------------------- | ----------------------------------------------------------------------------------- |
| `platform`      | Automatic                     | Override adapter detection with `netlify`, `vercel`, `cloudflare`, or `none`.       |
| `cache`         | Disabled                      | Use `{ ttl: positiveIntegerSeconds }` for shared caching, or `false` to disable it. |
| `storage`       | None                          | `uploadthingStorage()` or `s3Storage()` for image uploads.                          |
| `admin.favicon` | Site favicon, then Sedna icon | URL used as written, including any base path.                                       |

Setting `platform` selects caching behavior. It does not install an adapter or let Sedna run in an otherwise unsupported runtime. Sedna detects Node and unknown adapters as `none`. Cloudflare Workers is not supported. See [Caching](/guides/caching/) for provider credentials and limitations.

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

`collection` names the database collection and `fields` defines the editor and data types. Export live collections from `src/live.config.ts`. The `pages` option is reserved and has no effect on caching.

Restart the dev server after changing collection or integration configuration. Sedna creates missing collection tables when the dev server starts and before the first production loader query. It does not drop existing data automatically. Review database schema changes before deploying.

## Storage adapters

Both adapters accept `image` processing options. See [Image uploads](/guides/uploads/) for formats, dimensions, quality, and environment configuration.
