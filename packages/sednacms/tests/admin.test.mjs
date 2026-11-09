import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { resolveAdminFavicon } from '../dist/admin/favicon.js';
import { resolveSiteName } from '../dist/admin/site-name.js';
import { createAdminDom } from './helpers/admin-dom.mjs';

function publicDirectory(t) {
  const directory = mkdtempSync(join(tmpdir(), 'sedna-favicon-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return pathToFileURL(`${directory}/`);
}

test('admin falls back to Sedna without a site icon', (t) => {
  const directory = publicDirectory(t);
  assert.match(resolveAdminFavicon(directory, '/'), /^data:image\/svg\+xml,/);
  // A directory named favicon.svg is not an icon.
  mkdirSync(new URL('favicon.svg', directory));
  assert.match(resolveAdminFavicon(directory, '/'), /^data:image\/svg\+xml,/);
  assert.match(resolveAdminFavicon(new URL('missing/', directory), '/'), /^data:image\/svg\+xml,/);
});

test('admin discovers site icons in SVG, ICO, PNG order', (t) => {
  const directory = publicDirectory(t);
  for (const extension of ['png', 'ico', 'svg']) {
    const name = `favicon.${extension}`;
    writeFileSync(new URL(name, directory), 'icon fixture');
    assert.equal(resolveAdminFavicon(directory, '/'), `/${name}`);
    assert.equal(resolveAdminFavicon(directory, '/site/'), `/site/${name}`);
    assert.equal(resolveAdminFavicon(directory, '/site'), `/site/${name}`);
  }
});

test('explicit admin favicon overrides discovery and fallback', (t) => {
  const directory = publicDirectory(t);
  for (const override of ['/custom.svg', 'https://example.com/brand.png']) {
    assert.equal(resolveAdminFavicon(directory, '/', override), override);
    writeFileSync(new URL('favicon.svg', directory), 'icon fixture');
    assert.equal(resolveAdminFavicon(directory, '/site/', override), override);
  }
});

test('admin reads the rendered website title, including HTML entities', async (t) => {
  const { dom, restore } = createAdminDom();
  t.after(restore);
  t.mock.method(globalThis, 'fetch', async (path, options) => {
    assert.equal(path, '/website/');
    assert.equal(options.headers.Accept, 'text/html');
    return new Response(
      '<title>  My site &amp; studio  </title><script>window.executed = true</script>',
    );
  });
  assert.equal(await resolveSiteName('/website/'), 'My site & studio');
  assert.equal(dom.window.executed, undefined);
});

test('admin falls back to Sedna when the website title is missing or unavailable', async (t) => {
  const { restore } = createAdminDom();
  t.after(restore);
  for (const html of ['<title>  </title>', '<html><head></head></html>']) {
    t.mock.method(globalThis, 'fetch', async () => new Response(html));
    assert.equal(await resolveSiteName('/'), 'Sedna');
  }
  t.mock.method(
    globalThis,
    'fetch',
    async () => new Response('<title>Error</title>', { status: 500 }),
  );
  assert.equal(await resolveSiteName('/'), 'Sedna');
  t.mock.method(globalThis, 'fetch', async () => {
    throw new Error('Offline');
  });
  assert.equal(await resolveSiteName('/'), 'Sedna');
});

test('homepage title lookup can be cancelled when the admin unmounts', async (t) => {
  const controller = new AbortController();
  controller.abort();
  t.mock.method(globalThis, 'fetch', async (path, { signal }) => {
    assert.equal(signal, controller.signal);
    signal.throwIfAborted();
  });
  assert.equal(await resolveSiteName('/', controller.signal), 'Sedna');
});
