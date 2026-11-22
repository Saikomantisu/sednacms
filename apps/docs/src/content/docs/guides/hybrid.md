---

title: Static pages with live content
description: Keep marketing pages static and render your Sedna blog on demand.
---

Keep Astro's default `output: 'static'`. An adapter enables on-demand rendering
for selected routes; it does not make every page run on a server. See
[Astro's on-demand rendering guide](https://docs.astro.build/en/guides/on-demand-rendering/).

The adapter powers your live content pages, admin, and CMS API. A typical site has:

| Route          | Rendering                           |
| -------------- | ----------------------------------- |
| `/`            | Static marketing homepage           |
| `/about`       | Static                              |
| `/blog`        | On demand, reads a Sedna collection |
| `/blog/[slug]` | On demand, reads a Sedna entry      |
| `/admin/*`     | On demand, registered by Sedna      |
| `/api/cms/*`   | On demand, registered by Sedna      |

## Keep marketing pages static

Use a [compatible adapter](/guides/deployment/) and add `sedna()` to your
integrations. Leave `output` unset. Marketing pages need no rendering export:

```astro title="src/pages/index.astro"
<html lang="en">
  <head>
    <title>Studio</title>
  </head>
  <body>
    <h1>Websites for small teams.</h1>
    <a href="/blog">Read our latest posts</a>
  </body>
</html>
```

## Opt content pages into on-demand rendering

After [defining your collection](/getting-started/first-collection/), load it in
page frontmatter:

```astro title="src/pages/blog/index.astro"
---
export const prerender = false;
import { getLiveCollection } from 'astro:content';

const { entries, error } = await getLiveCollection('posts');
if (error) Astro.response.status = 503;
---

<h1>Blog</h1>
{error ? <p>Posts are temporarily unavailable.</p> : (
  <ul>{entries?.map(({ id, data }) => (
    <li><a href={`/blog/${encodeURIComponent(id)}`}>{data.title}</a></li>
  ))}</ul>
)}
```

Use the same export on `blog/[slug].astro` and call `getLiveEntry()`. You do not
need `getStaticPaths()` for an on-demand route. A newly published slug works
without a rebuild. See [Render live content](/guides/live-content/) for the
complete entry example and missing-entry handling.

Fetch Sedna content in the page's frontmatter and pass the results to layouts
and components as props. Do not fetch inside a layout or component: Astro may
render it after streaming begins, when Workers has already closed the request's
database resources. Put `prerender = false` in the page. Keep shared navigation
static if you want the marketing pages to stay static.

With caching disabled, published content changes appear on the next request.
Static pages update when you rebuild. Shared CDN caching is a separate
[opt-in setting](/guides/caching/).

## Run the complete example

The repository's
[hybrid example](https://github.com/Saikomantisu/sednacms/tree/main/apps/hybrid)
contains the static homepage, About page, shared layout, collection, and both blog
routes. From the repository root:

```sh
npm install
npm run build
npm run dev -w sednacms-hybrid
```

Set the [runtime variables](/reference/environment/) in `apps/hybrid/.env` first.
Open `/admin` to create your account and publish a post. Choose Node, Vercel, or
Cloudflare with `SEDNA_HOST`; the example defaults to standalone Node. Follow
the host's deployment guide before going live.
