<h1 align="center">Sedna CMS</h1>

<p align="center">
  <a href="https://github.com/Saikomantisu/sednacms/actions/workflows/ci.yml"
    ><img
      src="https://shieldcn.dev/github/ci/Saikomantisu/sednacms.svg?workflow=ci.yml&amp;branch=main&amp;variant=secondary"
      alt="CI status"
    ></a
  >
  <a href="LICENSE"
    ><img
      src="https://shieldcn.dev/github/license/Saikomantisu/sednacms.svg?variant=secondary"
      alt="MIT license"
    ></a
  >
  <a href="https://github.com/Saikomantisu/sednacms/stargazers"
    ><img
      src="https://shieldcn.dev/github/stars/Saikomantisu/sednacms.svg?variant=secondary"
      alt="GitHub stars"
    ></a
  >
</p>

<p align="center"><strong>Give your clients an editor for your Astro site.</strong></p>

<p align="center">
  Sedna is an open-source CMS for Astro. Define your content fields in TypeScript, and Sedna builds
  the forms your clients use to edit and publish. Their changes appear on your site without a
  rebuild.
</p>

## Get started

Requires Astro 6+, a compatible server adapter, and Postgres.

Inside your Astro project:

```sh
npm install sednacms
npx astro add node
```

If you already use a compatible server adapter, keep it.

```js
// astro.config.mjs
import node from '@astrojs/node';
import { defineConfig } from 'astro/config';
import sedna from 'sednacms';

export default defineConfig({
  adapter: node({ mode: 'standalone' }),
  integrations: [sedna()],
});
```

Follow the [installation guide](apps/docs/src/content/docs/getting-started/installation.md) to connect Postgres and set up your admin account. Then [define your first collection](apps/docs/src/content/docs/getting-started/first-collection.md) and render it on demand.

## Documentation

- [Fields](apps/docs/src/content/docs/reference/fields.md)
- [Image uploads](apps/docs/src/content/docs/guides/uploads.md)
- [Caching](apps/docs/src/content/docs/guides/caching.md)
- [Deployment](apps/docs/src/content/docs/guides/deployment.md)
- [Add Sedna with a coding agent](skills/add-sednacms/SKILL.md)

## Development

This repository is an npm workspace:

```text
packages/sednacms/   the published package, with its tests
apps/playground/     Astro site for trying changes against a real database
apps/docs/           documentation site
skills/              agent skill for adding Sedna to a site
```

```sh
npm install
cp apps/playground/.env.example apps/playground/.env
npm run build
npm run playground:dev
```

Fill in `apps/playground/.env` before starting the playground. The playground links to the local package, so rebuild with `npm run build` after changing its source; no reinstall is needed. Run `npm run check` for formatting and lint checks, and `npm test` to build everything and run the tests.

See [apps/docs/README.md](apps/docs/README.md) to run the documentation site locally.

## License

[MIT](LICENSE)
