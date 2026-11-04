# Sedna CMS documentation

This Astro Starlight site builds the Sedna documentation as static HTML. You do
not need a database, CMS credentials, or a server adapter to run it.

From the repository root:

```sh
npm ci
npm run docs:dev      # development server
npm run docs:check    # Astro and TypeScript diagnostics
npm run docs:build    # static output in apps/docs/dist/
npm run docs:preview  # serve the production build locally
```

Or run the matching `npm run dev`, `check`, `build`, and `preview` commands inside `apps/docs/`.

## Editing

Pages live in `src/content/docs/`. Use Markdown or MDX with `title` and
`description` frontmatter. Add routes to the sidebar in `astro.config.mjs`.
Starlight handles search, navigation, page outlines, and theme switching.
The Sedna colors and typography live in `src/styles/custom.css`.

The `SPEC*.md` files are internal product specs. They are outside the content collection and
are not published as part of this site. Document implemented behavior in the published pages. The specs can include
planned features.

## Hosting

Set the hosting project's base directory to `apps/docs`, build with `npm run build`,
and publish `dist`. Most hosts detect the workspace and install from the repository
root. Otherwise, from the repository root, install with `npm ci`, build with
`npm run docs:build`, and publish `apps/docs/dist`.

When a production domain is chosen, add its URL as Astro's `site` option in
`astro.config.mjs`. The current routes assume hosting at the domain root.
