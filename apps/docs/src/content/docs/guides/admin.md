---

title: Edit and publish
description: Use the Sedna editor to create drafts, publish entries, and reorder content.
---

The admin uses `favicon.svg`, `favicon.ico`, or `favicon.png` from your Astro
public directory, in that order. If none exists, it uses the Sedna favicon.
To use a different icon, or a site favicon with another filename, set
`admin.favicon` to its URL:

```js
integrations: [sedna({ admin: { favicon: '/my-site-icon.svg' } })],
```

Sedna uses this URL as written. Include your site's base path if needed, or
use an absolute URL. When finding the favicon automatically, Sedna uses Astro's
`publicDir` and `base` settings.
Restart the dev server or rebuild after changing favicon configuration or files.

## Create an entry

Open `/admin` and sign in. Select a collection from the sidebar, then add an entry. Sedna generates the form from the collection's TypeScript fields.

Text, dates, numbers, rich text, and images have their own inputs. Lists let you add, remove, and move items. Objects group related fields. Configure storage to upload images, or paste an existing image URL with its dimensions.

## Drafts and publishing

Save an incomplete entry as a draft. Drafts stay in the editor and do not appear on the public site. Supplied values must still have the right type.

Publish when required fields are complete. By default, published changes appear on the next request to the server. To remove an entry from the public site while keeping its content, save it as a draft.

With [CDN caching](/guides/caching/) enabled, Sedna attempts to purge pages that read the changed collection. If a purge fails, the editor keeps a warning visible. Your content is saved, but cached pages may show the old version until the cache lifetime, or TTL, expires or a later purge succeeds.

## Ordering and deleting

Drag entries or use their arrow buttons to change their order. Reordering supports up to 1,000 entries per collection. Public collections use that order.

The editor asks you to confirm before deleting an entry or discarding unsaved changes. Removing an image or deleting an entry does not delete files from storage.
