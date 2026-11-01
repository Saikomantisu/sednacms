import node from '@astrojs/node';
import { defineConfig } from 'astro/config';
import sedna from 'sednacms';

export default defineConfig({
  adapter: node({ mode: 'standalone' }),
  integrations: [sedna()],
});
