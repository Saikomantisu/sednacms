import assert from 'node:assert/strict';
import { test } from 'node:test';
import sedna from '../dist/index.js';

async function configure(adapterName, options = {}) {
  const integration = sedna(options);
  const root = new URL('../playground/', import.meta.url);
  let update;
  const messages = [];
  const logger = { info: (message) => messages.push(message) };
  const config = {
    root,
    srcDir: new URL('src/', root),
    publicDir: new URL('public/', root),
    base: '/',
    image: { remotePatterns: [] },
    vite: {},
  };
  await integration.hooks['astro:config:setup']({
    config,
    logger,
    updateConfig: (value) => {
      update = value;
    },
    injectRoute() {},
    addMiddleware() {},
  });
  // Adapter integrations install the adapter after Sedna's setup hook can run.
  if (adapterName) config.adapter = { name: adapterName };
  await integration.hooks['astro:config:done']({ config, logger });
  const plugin = update.vite.plugins[0];
  const source = plugin.load(plugin.resolveId('virtual:sedna/platform'));
  const { platform } = await import(`data:text/javascript,${encodeURIComponent(source)}`);
  return { platform, messages };
}

test('identifies the final Astro adapter without an explicit platform', async () => {
  for (const [adapter, expected] of [
    ['@astrojs/netlify', 'netlify'],
    ['@astrojs/vercel', 'vercel'],
    ['@astrojs/cloudflare', 'cloudflare'],
    ['@astrojs/node', 'none'],
    ['custom-adapter', 'none'],
    ['toString', 'none'],
  ]) {
    const { platform, messages } = await configure(adapter);
    assert.equal(platform, expected);
    assert.ok(messages.includes(`Platform: ${expected} (automatic)`));
  }
});

test('explicit platform overrides detection, including opting out', async () => {
  for (const explicit of ['none', 'netlify', 'vercel', 'cloudflare']) {
    for (const adapter of ['@astrojs/node', '@astrojs/netlify']) {
      const { platform, messages } = await configure(adapter, { platform: explicit });
      assert.equal(platform, explicit);
      assert.ok(messages.includes(`Platform: ${explicit} (explicit)`));
    }
  }
});

test('requires a server adapter, even with an explicit platform', async () => {
  for (const options of [{}, { platform: 'none' }, { platform: 'netlify' }]) {
    await assert.rejects(
      configure(undefined, options),
      new Error(
        'sednacms needs a server adapter. Run: npx astro add netlify (or vercel, cloudflare, node)',
      ),
    );
  }
});

test('rejects invalid platform values before configuring Astro', () => {
  for (const platform of ['', 'auto', 'node', 'Netlify', null, false, 1, {}]) {
    assert.throws(
      () => sedna({ platform }),
      /platform must be none, cloudflare, vercel, or netlify/,
    );
  }
});
