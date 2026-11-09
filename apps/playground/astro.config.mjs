import node from '@astrojs/node';
import vercel from '@astrojs/vercel';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'astro/config';
import sedna, { uploadthingStorage } from 'sednacms';

// API integration tests start the standalone Node server directly.
const testServer = Boolean(process.env.SEDNA_TEST_DATABASE_URL);
const localServer = process.env.NODE_ENV === 'development' || testServer;

export default defineConfig({
  // The seed content uses Unsplash photos. Images you upload in Admin are allowed automatically.
  image: { domains: ['images.unsplash.com'] },
  vite: { plugins: [tailwindcss()] },
  adapter: testServer ? node({ mode: 'standalone' }) : vercel(),
  integrations: [
    sedna({
      storage: uploadthingStorage(),
      cache: localServer ? false : { ttl: 3600 },
    }),
  ],
});
