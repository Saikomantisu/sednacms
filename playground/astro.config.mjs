import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import sedna from 'sednacms';

export default defineConfig({
  adapter: node({ mode: 'standalone' }),
  integrations: [sedna()],
});
