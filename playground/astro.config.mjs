import netlify from '@astrojs/netlify';
import node from '@astrojs/node';
import { defineConfig } from 'astro/config';
import sedna, { uploadthingStorage } from 'sednacms';

// Local development and API tests do not need Netlify's emulation or purge credentials.
const localServer =
  !process.env.NETLIFY &&
  (process.env.NODE_ENV === 'development' || Boolean(process.env.SEDNA_TEST_DATABASE_URL));

export default defineConfig({
  adapter: localServer ? node({ mode: 'standalone' }) : netlify(),
  integrations: [
    sedna({
      storage: uploadthingStorage(),
      cache: localServer ? false : { ttl: 3600 },
    }),
  ],
});
