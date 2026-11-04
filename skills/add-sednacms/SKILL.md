---

name: add-sednacms
description: Add SednaCMS to an existing Astro site. Use when users ask to install SednaCMS or make repeating content, such as posts or testimonials, editable with Sedna.
---

# Add SednaCMS to Astro

Add `sednacms` to the existing site. Preserve its design, URLs, integrations, and unrelated content. Sedna manages repeating content such as posts and testimonials. It cannot edit arbitrary page text inline.

Before editing, read [references/integration.md](references/integration.md) for setup and API examples. Check the installed package's exports and peer dependencies. If its API differs from the examples, consult the [upstream source](https://github.com/Saikomantisu/sednacms).

## Inspect the project

Read the project instructions, `package.json`, lockfile, Astro config, content configs, middleware, and affected pages and components. Account for custom `root`, `srcDir`, and base paths. Identify the Astro version, package manager, host, and adapter. Resolve conflicts with existing `/admin` or `/api/cms/*` routes before adding Sedna.

Choose collections and fields from the request and existing content. Ask if the editable content or hosting target is unclear. Missing credentials should not prevent you from finishing the code and configuration.

Sedna requires Astro 6+ and a Node-compatible server adapter. Explain any required major Astro upgrade and check that it fits the requested scope. Keep a compatible adapter already in use. Otherwise, use Node standalone for local use or an adapter that matches the deployment host. Cloudflare Workers with `nodejs_compat` is experimental; verify database connections, auth, publishing, uploads, and CDN purging before recommending it for production. Runtimes without the required Node APIs are unsupported.

## Install and configure

1. Install `sednacms` with the project's package manager and update the lockfile. Check that the release exists and exports the APIs you need. If no registry release is available, use a user-provided checkout or a built local package for development. Explain that production needs a distributable release. Do not substitute a mock CMS or commit a dependency on a developer's absolute path or an unbuilt Git checkout.
2. Add `sedna()` to the existing Astro `integrations` array and add a compatible server adapter if needed. Sedna supplies its admin routes, API routes, and middleware. Do not copy admin source or add a React integration for it.
3. Create or extend `<srcDir>/live.config.ts`. Keep existing live collections in the `collections` export. Use `defineLiveCollection` from `astro:content`, with `sednaLoader` and `fields` from `sednacms`. Leave unrelated build-time collections in their current content config.
4. Define fields with Sedna's helpers. Keep collection and field names stable, avoid reserved system-column names, and use a title-derived slug for detail pages. Check optional values for null before rendering.
5. Add placeholders to `.env.example` and ignore local secret files in Git. Configure `SEDNA_DATABASE_URL`, `SEDNA_URL`, `SEDNA_SECRET`, and the temporary `SEDNA_SETUP_TOKEN` as described in the reference. Preserve existing values. Keep secrets server-side without a `PUBLIC_` prefix. Generate each missing secret separately and write it to an ignored file without printing it. Use secure input for missing database or storage credentials when available.

## Connect the pages

Replace content reads for the collections moving to Sedna. Fetch with `getLiveCollection` or `getLiveEntry` in page frontmatter before streaming. Add `export const prerender = false` to each affected route. Unrelated pages can stay static, and these routes do not require a global `output: 'server'` setting.

For dynamic detail routes, replace `getStaticPaths` with a lookup on each request. Preserve URL patterns and slug values. Distinguish missing entries from database failures, and return an error status and message when the loader fails.

Reuse the site's components and styles. Replace sample arrays with live query results. Follow the reference when rendering `entry.data` fields, rich-text HTML, and image descriptors.

The public loader returns only published entries. Show an empty state when there are none and an error state when loading fails. Keep caching off unless the user accepts delays up to the cache TTL. The `pages` collection is reserved and does not invalidate caches.

Installing Sedna does not import Markdown, MDX, local arrays, or records from another CMS. Preserve source content until a requested migration is verified. For a migration, map fields and slugs, convert Markdown or MDX to rich-text HTML, and import through authenticated API writes. Check for existing records before retrying. Do not drop content or silently publish imported drafts.

## Configure uploads if needed

Read the reference's storage section and configure `uploadthingStorage()` or `s3Storage()`. Keep the existing provider choice. An image field does not require a storage account. Editors can paste image URLs with dimensions. Change external buckets or CORS rules only when authorized.

## Verify and hand off

Run the project's checks and production build with its package manager. Restart the dev server after integration or schema changes. If credentials are missing, finish the code and configuration and list the runtime checks you could not run.

With an authorized development or test database:

- Confirm table setup and load `/admin`.
- Create the first admin if needed, sign in, and create an entry.
- Confirm the draft is absent from public pages. Publish it and check the listing and detail page.
- Edit and unpublish the entry. Check that the next request reflects each change without rebuilding.

Do not create test records in production without authorization. Check that affected CMS responses use `Cache-Control: no-store` by default and that proxy or route caches do not serve stale content. If you configured uploads, test an upload and its public rendering.

Sedna creates missing tables and columns at development startup and on the first production read. It does not rename or drop columns or change their types. Renaming a field requires a data migration. A passing build does not verify database connectivity or confirm that published edits reach the page.

Report the changes, checks completed, and remaining configuration. Tell the user to open `/admin` and create the first account with the setup token and a password of 12 to 128 characters. Remind them to remove `SEDNA_SETUP_TOKEN` afterward. Keep secrets out of the handoff. Report deployment only if you completed it.
