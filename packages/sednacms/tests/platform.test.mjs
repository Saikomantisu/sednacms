import assert from 'node:assert/strict';
import { test } from 'node:test';
import sedna from '../dist/index.js';

async function configure(adapterName, options = {}) {
  const integration = sedna(options);
  const root = new URL('../../../apps/playground/', import.meta.url);
  let update;
  const routes = [];
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
    injectRoute: (route) => routes.push(route),
    addMiddleware() {},
  });
  // Adapter integrations install the adapter after Sedna's setup hook can run.
  if (adapterName) config.adapter = { name: adapterName };
  await integration.hooks['astro:config:done']({ config, logger });
  const plugin = update.vite.plugins[0];
  const source = plugin.load(plugin.resolveId('virtual:sedna/platform'));
  const { platform } = await import(`data:text/javascript,${encodeURIComponent(source)}`);
  const cacheSource = plugin.load(plugin.resolveId('virtual:sedna/cache'));
  const { cache } = await import(`data:text/javascript,${encodeURIComponent(cacheSource)}`);
  return { platform, messages, cache, update, routes };
}

test('core CMS setup preserves the chosen adapter and disables provider caching by default', async () => {
  for (const adapter of [
    '@astrojs/node',
    '@astrojs/netlify',
    '@astrojs/vercel',
    'custom-adapter',
  ]) {
    const result = await configure(adapter);
    assert.equal(result.update.adapter, undefined);
    assert.equal(result.update.vite.ssr, undefined);
    assert.equal(result.cache, false);
    assert.deepEqual(
      result.routes.map((route) => route.pattern),
      ['/admin/[...path]', '/api/cms/[...path]'],
    );
    assert.ok(result.routes.every((route) => route.prerender === false));
  }
});

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
        'sednacms needs a Node-compatible Astro server adapter. Configure one for your deployment host.',
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
