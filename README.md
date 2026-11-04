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

Requires Astro 6+, a compatible server adapter, and Postgres.

## Get started

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

Follow the [installation guide](docs/src/content/docs/getting-started/installation.md) to connect Postgres and set up your admin account. Then [define your first collection](docs/src/content/docs/getting-started/first-collection.md) and render it on demand.

## Documentation

- [Fields](docs/src/content/docs/reference/fields.md)
- [Image uploads](docs/src/content/docs/guides/uploads.md)
- [Caching](docs/src/content/docs/guides/caching.md)
- [Deployment](docs/src/content/docs/guides/deployment.md)
- [Add Sedna with a coding agent](skills/add-sednacms/SKILL.md)

## Development

```sh
npm install
npm run build
npm install --prefix playground
cp playground/.env.example playground/.env
npm run dev --prefix playground
```

Fill in `playground/.env` before starting the playground. Rebuild the package after changing its source. Run `npm run check` for formatting and lint checks.

See [docs/README.md](docs/README.md) to run the documentation site locally.

## License

[MIT](LICENSE)
