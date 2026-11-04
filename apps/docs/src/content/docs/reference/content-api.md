---

title: Content API
description: Authenticated endpoints for schemas, entries, publishing, and ordering.
---

All content endpoints require a logged-in session. Write requests also require
an `Origin` matching `SEDNA_URL`. Collections come from `src/live.config.ts`;
the API can only access configured collections.

- `GET /api/cms/schema`: collection names, fields, and page configuration.
- `GET /api/cms/collections/:collection`: entries including drafts, ordered by
  `sort_order`, then creation time and ID. Accepts `limit` from 1 to 100, defaulting to 100,
  and `offset`, defaulting to 0.
- `POST /api/cms/collections/:collection`: create an entry with
  `{ "data": { "title": "Summer trip" }, "status": "draft" }`.
- `GET /api/cms/collections/:collection/:id`: read an entry by its database UUID.
- `PATCH /api/cms/collections/:collection/:id`: update selected fields,
  change `status` to `published` or `draft`, or do both.
- `DELETE /api/cms/collections/:collection/:id`: delete an entry.
- `POST /api/cms/collections/:collection/reorder`: send `{ "ids": ["uuid", "uuid"] }`
  in the desired order. Assigns positions starting at zero to those entries.

Single-entry responses contain `{ entry }`; lists contain `{ entries }`. An entry
has its database UUID, status, sort order, timestamps, and a `data` object.
The public live loader uses the slug when the collection has one.
Shared request/response types are exported from `sednacms` for typed API clients.

Drafts may be incomplete. Publishing checks required fields and requires nonempty
slugs. The API checks the types of all supplied values, including draft values.
Sedna generates missing slugs from their configured source. Changing a title
preserves an existing slug.
The API rejects unknown fields and writes to system columns. Duplicate slugs return 409.

## Update an entry

Send same-origin requests from an authenticated session:

```js
const response = await fetch(`/api/cms/collections/posts/${id}`, {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    data: { title: 'Updated title' },
    status: 'published',
  }),
});
if (!response.ok) throw new Error('Could not save the entry');
const { entry } = await response.json();
```

Browsers supply the `Origin` header for these write requests. Other clients must provide it and retain the session cookie. Omitted top-level fields keep their values; supplied lists and objects replace their previous values in full.

Authentication and admin endpoints are always uncached. See [Authentication](/guides/authentication/) for setup and sign-in endpoints and [Image uploads](/guides/uploads/) for storage signing.
