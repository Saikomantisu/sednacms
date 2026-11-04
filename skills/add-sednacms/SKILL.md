---

name: add-sednacms
description: Add SednaCMS to an existing Astro project, including live collections, server rendering, admin setup, and optional image storage. Use when users ask to install or integrate sednacms or make an Astro site's repeating content editable with Sedna.
---

# Add SednaCMS to Astro

Add `sednacms` to the user's existing Astro site. Keep its design, URLs, integrations, and unrelated content. Sedna manages repeating content such as posts and testimonials. Arbitrary page text cannot be edited inline.

Read [references/integration.md](references/integration.md) for API examples and setup details before editing. Check the installed version's exports and peer dependencies before using the examples. Consult the [upstream source](https://github.com/Saikomantisu/sednacms) if its API differs.

## Inspect the target project

- Read project instructions, `package.json`, the lockfile, Astro config, content configs, middleware, and affected routes and components. Account for custom `root`, `srcDir`, and base paths.
- Identify the Astro version, package manager, hosting runtime, adapter, and existing `/admin` or `/api/cms/*` routes. Resolve any route conflicts before adding Sedna.
- Choose collections and fields from the request and existing content. Ask when it is unclear which content should be editable or where the site will run. While waiting for credentials, finish the code and configuration.
- Sedna requires Astro 6+ and a Node-compatible server adapter. Explain any required major Astro upgrade and check that it is within the requested scope. Keep an existing compatible adapter. For local use without one, use Node standalone. For deployment, match the adapter to the host. Cloudflare Workers and other edge-only runtimes are unsupported because Sedna uses Node dependencies, including `pg`.

## Install and configure

1. Install `sednacms` using the project's package manager and update its lockfile. Check that the version is available and exports the APIs used below. If no registry release is available, use a user-provided checkout or a built local package for development and explain that production needs a distributable release. Do not substitute a mock CMS or commit a dependency on a developer's absolute path or an unbuilt Git checkout.
2. Merge `sedna()` into the existing Astro `integrations` array. Add a compatible server adapter if needed. Sedna injects its own admin and API routes and middleware. Its admin needs no copied source or additional React integration.
3. Create or extend `<srcDir>/live.config.ts`, keeping existing live collections in the `collections` export. Use `defineLiveCollection` from `astro:content` with `sednaLoader` and `fields` from `sednacms`. Leave unrelated build-time collections in their current content config.
4. Define fields with Sedna's helpers. Keep collection and field names stable, and avoid reserved system-column names. For detail pages, use a slug sourced from the title. Check optional values for null before rendering them.
5. Add placeholders to `.env.example` and ignore local secret files in Git. Configure `SEDNA_DATABASE_URL`, `SEDNA_URL`, `SEDNA_SECRET`, and the temporary `SEDNA_SETUP_TOKEN` as described in the reference. Keep secrets server-side, with no `PUBLIC_` prefix. Keep existing values. Generate each missing secret separately and write it to an ignored file without printing it. Use secure input for missing database or storage credentials when available.

## Connect the site's pages

- Replace reads only for the collections being moved to Sedna. Fetch with `getLiveCollection` or `getLiveEntry` in page frontmatter before streaming. Mark every affected route `export const prerender = false`. Keep unrelated pages static. The affected routes can render on demand without globally setting `output: 'server'`.
- For a dynamic detail route, replace a build-time `getStaticPaths` flow with request-time lookup. Preserve existing URL patterns and slug values. Handle missing entries separately from database failures. Return an error status and message when the loader fails.
- Reuse the site's components and styles. Render returned `entry.data` fields, rich-text HTML, and image descriptors using the reference. Replace sample arrays in those pages with the live query results.
- Only published entries appear through the public loader. Show an empty state when there are no entries and an error state when loading fails. Keep caching off unless the user accepts updates being delayed by the cache TTL. `pages` is reserved and does not invalidate caches.
- Installing Sedna does not import Markdown, MDX, local arrays, or another CMS's records. Preserve source content until a requested migration has been verified. When migration is requested, map fields and slugs, convert Markdown or MDX to rich-text HTML, and import through authenticated API writes. Check for existing records before retrying. Do not drop content or silently publish imported drafts.

## Optional uploads

If the site needs uploads, read the reference's storage section and configure `uploadthingStorage()` or `s3Storage()`. Keep an existing provider choice. Editors can also paste image URLs with dimensions, so an image field alone does not require a storage account. Only change external buckets or their CORS rules when authorized.

## Verify and hand off

- Run the project's checks and production build with its package manager. Restart the dev server after changing the integration or schema. If credentials are missing, finish the code and configuration, then list the runtime checks you could not run.
- With an authorized development or test database, confirm table setup, load `/admin`, create the first admin if needed, sign in, and create an entry. Verify a draft is absent publicly, publish it, and confirm the public listing and detail page shows it. Edit and unpublish it, checking the next request without rebuilding. Do not create test records in a production database without authorization.
- Check affected CMS responses use `Cache-Control: no-store` by default and no proxy or route cache freezes them. If uploads were configured, verify an image upload and its public rendering.
- Sedna creates missing tables and columns during development startup and on the first production read. It does not rename or drop columns, or change their types. Renaming a field needs a data migration. A successful build does not verify database connectivity or that published edits reach the page.
- Report what changed, what you verified, and what remains to configure. Tell the user to open `/admin` and create the first account with the setup token and a password of 12 to 128 characters. Remind them to remove `SEDNA_SETUP_TOKEN` afterward. Keep secrets out of the handoff and only report deployment if it was completed.
