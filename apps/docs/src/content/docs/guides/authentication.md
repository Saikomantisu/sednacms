---

title: Authentication
description: Configure first-admin setup, email login, and session cookies.
---

Sedna uses Better Auth for email/password login. It stores session records in
Postgres and caches session data in a signed, HttpOnly cookie. For five minutes,
Sedna validates requests against the cached session without querying Postgres.
It then rechecks the database and renews the cache.

Logout revokes the stored session and clears the browser's cookies. A copied
cookie can remain valid for up to five minutes after revocation.
Public registration is disabled. Sign in at `/admin`. Editor invitations are
not available yet.

Set `SEDNA_URL` to the site's origin. For `SEDNA_SECRET` and `SEDNA_SETUP_TOKEN`,
generate separate random values of at least 32 characters each.
Run `openssl rand -hex 32` separately for each value.
Use HTTPS in production. Set these as runtime environment variables on your host;
the playground also loads them from `.env` during development.

Create the first admin with `POST /api/cms/setup`, sending JSON with `name`,
`email`, and a `password` of 12 to 128 characters. Include `Origin: <SEDNA_URL>` and
`X-Sedna-Setup-Token: <SEDNA_SETUP_TOKEN>` headers. Setup creates the account but
does not sign the user in. Setup creates the first account in an atomic database operation.
Later setup attempts return 409.
Remove `SEDNA_SETUP_TOKEN` after setup.

Available auth endpoints:

- `POST /api/cms/auth/sign-in/email`: JSON `{ "email": "...", "password": "..." }`.
- `GET /api/cms/auth/get-session`: current session, or `null`.
- `POST /api/cms/auth/sign-out`: revoke the session.

Send requests from the same origin and keep the session cookie. Write requests require
an `Origin` header. Authentication responses are not cached. Sedna stores rate limits
in Postgres and identifies clients with Astro's client address. It ignores
caller-supplied IP headers for rate limiting.

Auth tables use the reserved `sedna__` prefix. On the first auth request per
process, Sedna applies Better Auth's schema migrations under a database lock.
Sedna pins Better Auth to an exact version so maintainers can review schema
changes during upgrades. Password reset email delivery is not configured yet.
