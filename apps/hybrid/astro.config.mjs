import { defineConfig } from 'astro/config';
import sedna from 'sednacms';

const host = process.env.SEDNA_HOST ?? 'node';
const adapters = {
  node: async () => (await import('@astrojs/node')).default({ mode: 'standalone' }),
  vercel: async () => (await import('@astrojs/vercel')).default(),
  cloudflare: async () => (await import('@astrojs/cloudflare')).default(),
};
if (!Object.hasOwn(adapters, host)) throw new Error(`Unknown SEDNA_HOST: ${host}`);

export default defineConfig({
  // Static is Astro's default. Only the blog, admin, and API run on demand.
  adapter: await adapters[host](),
  integrations: [sedna()],
});
