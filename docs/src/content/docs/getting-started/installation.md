---

title: Installation
description: Install Sedna in an Astro site and configure the database and admin account.
---

This guide uses the Node adapter. If your site already has a compatible server adapter, keep it.

## Install the integration

Run these commands inside your Astro project:

```sh
npm install sednacms
npx astro add node
```

Add Sedna to `astro.config.mjs`:

```js title="astro.config.mjs"
import node from '@astrojs/node';
import { defineConfig } from 'astro/config';
import sedna from 'sednacms';

export default defineConfig({
  adapter: node({ mode: 'standalone' }),
  integrations: [sedna()],
});
```

## Connect Postgres

Create a `.env` file in the Astro project root:

```dotenv title=".env"
SEDNA_DATABASE_URL=postgres://user:password@host-pooler/database?sslmode=require
SEDNA_URL=http://localhost:4321
SEDNA_SECRET=replace-with-a-random-secret-at-least-32-characters-long
SEDNA_SETUP_TOKEN=replace-with-a-separate-random-token-at-least-32-characters-long
```

Use a pooled connection string from your database provider. Generate each secret independently with:

```sh
openssl rand -hex 32
```

Keep `.env` out of version control. Set `SEDNA_URL` to your site's exact origin, including the port during development. In production, set these variables in your host's server environment.

## Add content and start the server

[Define your first collection](/getting-started/first-collection/), then run:

```sh
npm run dev
```

Sedna creates missing collection tables when the dev server starts. Restart after changing `src/live.config.ts`. Without `SEDNA_DATABASE_URL`, development logs a warning and returns empty collections.

## Create the first admin

Open `/admin`. On an empty database, enter your name, email, a password of 12 to 128 characters, and your setup token. Then sign in.

Setup only works while the database has no accounts. Later attempts return a conflict. Remove `SEDNA_SETUP_TOKEN` from your environment after setup and restart the server. Public registration is disabled.

You can now create and publish entries. See [Edit and publish](/guides/admin/) for instructions on editing content and [Deployment](/guides/deployment/) before going live.
