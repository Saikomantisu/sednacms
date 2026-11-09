---

title: Render live content
description: Read collections, load entries by slug, and paginate published content.
---

Read content in Astro page frontmatter before the response starts streaming. Sedna returns published entries only; use the authenticated [content API](/reference/content-api/) to access drafts.

## Load a collection

```astro
---
import { getLiveCollection } from 'astro:content';

export const prerender = false;
const { entries, error } = await getLiveCollection('posts');
if (error) Astro.response.status = 503;
---

{error ? <p>Content is temporarily unavailable.</p> : (
  <ul>{entries?.map(({ data }) => <li>{data.title}</li>)}</ul>
)}
```

Entries are ordered by `sort_order`, then `created_at`, then database ID. Without filters, the loader returns the full collection.

## Load one entry

If a collection has a top-level slug field, pass its slug to `getLiveEntry()`. Without a slug field, use the database UUID.

```astro title="src/pages/posts/[slug].astro"
---
import { getLiveEntry } from 'astro:content';

export const prerender = false;
const slug = Astro.params.slug;
if (!slug) return Astro.redirect('/404');

const { entry, error } = await getLiveEntry('posts', slug);
if (!entry && (!error || error.name === 'LiveEntryNotFoundError')) {
  return Astro.redirect('/404');
}
if (error) Astro.response.status = 503;
---

<html lang="en">
  <head>
    <title>{entry?.data.title ?? 'Post unavailable'}</title>
  </head>
  <body>
    {error ? <p>This post is temporarily unavailable.</p> : entry && (
      <article>
        <h1>{entry.data.title}</h1>
        {entry.data.body && <div set:html={entry.data.body} />}
      </article>
    )}
  </body>
</html>
```

Add a `/404` page to your site. If the loader returns an error, show an unavailable message so visitors can distinguish it from an empty collection.

Rich-text fields contain HTML. The admin editor sanitizes the HTML it produces. Sanitize HTML from other API clients before rendering it.

## Paginate a collection

Pass `limit` and `offset` to `getLiveCollection` to paginate in SQL:

```ts
const { entries, error } = await getLiveCollection('posts', {
  limit: 11,
  offset: (page - 1) * 10,
});
const hasNext = (entries?.length ?? 0) > 10;
const visibleEntries = entries?.slice(0, 10);
```

This fetches 11 entries and displays 10. The extra entry tells you whether to show
a Next link without running a count query. `limit` must be an integer from 1 to 100.
Use a nonnegative safe integer for `offset`; values greater than zero also require
a limit. Invalid filters return a loader error, so validate page numbers from the
URL before calculating offsets. Entries follow `sort_order`, `created_at`, then
`id`. Edits between requests can still move entries between pages.
Omit the filters to load the full collection. Each entry includes all configured
fields; the loader does not support field selection.

## Render images

Image fields contain `src`, `width`, `height`, and `alt`:

```astro
---
import { Image } from 'astro:assets';
// After loading an entry:
const cover = entry?.data.cover;
---

{cover && <Image {...cover} />}
```

Sedna configures allowed hosts for its storage adapters. For other image hosts, configure Astro's remote image permissions. See [Image uploads](/guides/uploads/).
