---

title: Authentication
description: Configure first-admin setup, email login, and session cookies.
---

Sedna uses Better Auth for email/password login. It stores session records in
Postgres and caches session data in a signed, HttpOnly cookie. For five minutes,
requests validate the cached session without querying Postgres. After that, they
recheck the database and renew the cache.

Logout revokes the stored session and clears the browser's cookies. A copied
cookie can remain valid for up to five minutes after revocation.
Public registration is disabled. Sign in at `/admin`. Editor invitations are
not available yet.

Configure `SEDNA_URL` with the site's origin, `SEDNA_SECRET` with a random secret
of at least 32 characters, and `SEDNA_SETUP_TOKEN` with a separate random token
of at least 32 characters. Generate each with `openssl rand -hex 32`.
Use HTTPS in production. Set these as runtime environment variables on your host;
the playground also loads them from `.env` during development.

Create the first admin with `POST /api/cms/setup`, sending JSON with `name`,
`email`, and a `password` of 12 to 128 characters. Include `Origin: <SEDNA_URL>` and
`X-Sedna-Setup-Token: <SEDNA_SETUP_TOKEN>` headers. Setup creates the account but
does not sign the user in. The database creates the first account atomically;
later setup attempts return 409.
Remove `SEDNA_SETUP_TOKEN` after setup.

Available auth endpoints:

- `POST /api/cms/auth/sign-in/email`: JSON `{ "email": "...", "password": "..." }`.
- `GET /api/cms/auth/get-session`: current session, or `null`.
- `POST /api/cms/auth/sign-out`: revoke the session.

Use same-origin requests and retain the session cookie. Write requests require
an `Origin` header. Authentication responses are not cached. Sedna stores rate limits
in Postgres and identifies clients with Astro's client address. It ignores
caller-supplied IP headers for rate limiting.

Auth tables use the reserved `sedna__` prefix. On the first auth request per
process, Sedna applies Better Auth's schema migrations under a database lock.
Sedna pins Better Auth to an exact version so maintainers can review schema
changes during upgrades. Password reset email delivery is not configured yet.
