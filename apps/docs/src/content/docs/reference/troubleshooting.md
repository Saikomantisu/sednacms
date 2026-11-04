---

title: Troubleshooting
description: Resolve missing content, setup errors, stale pages, and upload failures.
---

## Sedna needs a server adapter

Install and configure a Node-compatible Astro server adapter. Sedna's admin and API cannot run on a static-only host. Setting `platform` does not install an adapter.

## Collections are empty

Check that `SEDNA_DATABASE_URL` is available to the server process. In development, a missing URL logs a warning and returns empty collections.

Confirm that `src/live.config.ts` exports `collections`, and restart the dev server after schema changes. Public live collections return only published entries. Drafts are visible in `/admin` and the authenticated content API.

## Published changes do not appear

Check for `export const prerender = false` on the page. Prerendered content is fixed at build time. Load CMS content before the response starts streaming.

With CDN caching enabled, a purge warning means the write succeeded but cached pages may be stale. Check purge credentials and provider configuration. The pages refresh after a later successful purge or when their cache lifetime expires. Direct SQL changes do not trigger purges.

## Setup or write requests fail

`SEDNA_URL` must match the request's origin, including protocol and port. Write requests need an `Origin` header. First-admin setup also needs the separate `SEDNA_SETUP_TOKEN`, and each secret must have at least 32 characters.

A setup conflict means an account already exists. Use the login screen. Editor invitations and password reset email delivery are not implemented yet.

## Image uploads fail

Configure a storage adapter and its server-side credentials. For S3, check the public URL and bucket CORS permissions for your exact origin, `PUT`, and `Content-Type`. Set `SEDNA_S3_PUBLIC_URL` at build time and runtime.

Inputs must be JPEG, PNG, WebP, GIF, or AVIF and at most 32 MB. If your site sets a Content Security Policy, it must allow same-origin workers and WebAssembly compilation for image processing. See [Image uploads](/guides/uploads/) for details.

## Too many database connections

Sedna has separate loader, authentication, and content API pools per server process. Each defaults to five connections. Budget across all processes and instances before increasing `SEDNA_DATABASE_POOL_MAX`. The connection timeout does not cancel running queries.
