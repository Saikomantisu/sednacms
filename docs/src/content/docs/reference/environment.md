---

title: Environment variables
description: Server environment variables for database, sessions, uploads, and caching.
---

Keep secrets in your server environment. Do not prefix them with `PUBLIC_` or include them in client code. Sedna loads `.env` during development; configure runtime variables on your production host.

## Database and authentication

| Variable                               | Purpose                                                                                    |
| -------------------------------------- | ------------------------------------------------------------------------------------------ |
| `SEDNA_DATABASE_URL`                   | Pooled Postgres connection string.                                                         |
| `SEDNA_URL`                            | Exact site origin, such as `http://localhost:4321` or `https://example.com`.               |
| `SEDNA_SECRET`                         | Random secret of at least 32 characters for sessions.                                      |
| `SEDNA_SETUP_TOKEN`                    | Separate random token of at least 32 characters for first-admin setup. Remove after setup. |
| `SEDNA_DATABASE_POOL_MAX`              | Positive integer per runtime pool. Default `5`.                                            |
| `SEDNA_DATABASE_CONNECTION_TIMEOUT_MS` | Timeout for acquiring or opening a connection. Default `10000`.                            |

Generate the two secrets independently with `openssl rand -hex 32`.

The live loader, authentication, and content API each use their own pool per server process.
Each pool defaults to five connections. Set `SEDNA_DATABASE_POOL_MAX` to a positive
integer to change that limit. Count all three pools across every server process and instance when planning
your connection limit. For example, a limit of 10 permits up to 30 runtime
connections per process.
Startup table synchronization uses a separate single-connection pool temporarily.

`SEDNA_DATABASE_CONNECTION_TIMEOUT_MS` defaults to `10000`. It limits how long a request can wait
for a pool connection or for a new connection to open. It does not impose a query execution timeout or cancel running SQL.
Sedna reads both settings when it creates the pools. Restart the server after
changing either setting.
Increase pool size only after checking the database connection budget and measuring load.

## Uploads

Use one storage adapter. See [Image uploads](/guides/uploads/) for setup and CORS requirements.

| Adapter       | Variables                                                                                                           |
| ------------- | ------------------------------------------------------------------------------------------------------------------- |
| UploadThing   | `UPLOADTHING_TOKEN`                                                                                                 |
| S3-compatible | `SEDNA_S3_ENDPOINT`, `SEDNA_S3_BUCKET`, `SEDNA_S3_KEY`, `SEDNA_S3_SECRET`, `SEDNA_S3_REGION`, `SEDNA_S3_PUBLIC_URL` |

Use your bucket's region for Amazon S3, or `auto` where your S3-compatible provider supports it. Set `SEDNA_S3_PUBLIC_URL` during both builds and runtime so Astro can authorize the image host.

## Optional CDN caching

Sedna reads these credentials only when caching is enabled for the corresponding platform. Configuration fails if required credentials are missing.

| Platform       | Required                                             | Optional or host-provided                                                                                               |
| -------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Netlify        | `SEDNA_NETLIFY_TOKEN`                                | `SEDNA_NETLIFY_SITE_ID`, or host-provided `SITE_ID`, is also required.                                                  |
| Vercel         | `SEDNA_VERCEL_TOKEN`                                 | `SEDNA_VERCEL_PROJECT_ID` or `VERCEL_PROJECT_ID` is required. `SEDNA_VERCEL_TEAM_ID` or `VERCEL_ORG_ID` selects a team. |
| Cloudflare CDN | `SEDNA_CLOUDFLARE_TOKEN`, `SEDNA_CLOUDFLARE_ZONE_ID` | Public HTML cache rules and a compatible Node origin.                                                                   |

See [Caching](/guides/caching/) for purge behavior, provider setup, and private-route rules.
