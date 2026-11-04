---

title: Your first collection
description: Define posts in TypeScript and show published entries on an Astro page.
---

Create a live collection configuration in your Astro site's `src/` directory. Sedna reads the named `collections` export from this file.

```ts title="src/live.config.ts"
import { defineLiveCollection } from 'astro:content';
import { fields, sednaLoader } from 'sednacms';

const posts = defineLiveCollection({
  loader: sednaLoader({
    collection: 'posts',
    fields: {
      title: fields.text({ required: true }),
      slug: fields.slug({ from: 'title', required: true }),
      date: fields.date(),
      body: fields.richText(),
      cover: fields.image(),
    },
  }),
});

export const collections = { posts };
```

Sedna creates database columns and admin inputs from these fields and infers the entry types. It generates the slug from the title. Editors can change the slug, but changing the title leaves an existing slug in place.

## Render the posts

```astro title="src/pages/posts/index.astro"
---
import { getLiveCollection } from 'astro:content';

export const prerender = false;
const { entries, error } = await getLiveCollection('posts');
if (error) Astro.response.status = 503;
---

<html lang="en">
  <head>
    <title>Posts</title>
  </head>
  <body>
    <h1>Posts</h1>
    {error ? <p>Posts are temporarily unavailable.</p> : (
      <ul>
        {entries?.map((post) => (
          <li><a href={`/posts/${encodeURIComponent(post.id)}/`}>{post.data.title}</a></li>
        ))}
      </ul>
    )}
  </body>
</html>
```

Add a [detail page](/guides/live-content/#load-one-entry) for these links. Use your site's layout in place of the HTML shell if you have one.

## Publish an entry

Restart the dev server to load the new schema. Open `/admin`, select `posts`, and add an entry. Save a draft first, then publish it and reload `/posts/`.

Public live collections return only published entries. Drafts can leave required fields empty; publishing checks those fields and slugs.

:::tip[Render on demand]
Keep `export const prerender = false` on every page that reads CMS content. A prerendered page captures content during the build and needs a rebuild to change.
:::

## Naming rules

Collection names start with a lowercase letter and contain lowercase letters, digits, and underscores. Field names start with a letter and contain letters, digits, and underscores. Top-level fields cannot use `id`, `status`, `sort_order`, `created_at`, `updated_at`, or `published_at`.

See the [fields reference](/reference/fields/) for repeatable lists and grouped fields.
