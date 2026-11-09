import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ALL } from '../dist/demo/blocked-api.js';
import demo from '../dist/demo/index.js';

function setup(integrations = []) {
  const routes = [];
  let update;
  demo({ adapter: new URL('./fixtures/demo-adapter.ts', import.meta.url) }).hooks[
    'astro:config:setup'
  ]({
    config: {
      integrations,
      root: new URL('../../../apps/playground/', import.meta.url),
      publicDir: new URL('../../../apps/playground/public/', import.meta.url),
      base: '/',
    },
    injectRoute: (route) => routes.push(route),
    updateConfig: (config) => {
      update = config;
    },
  });
  return { routes, update };
}

test('demo installs the existing editor with the supplied browser adapter and a blocked API', () => {
  const { routes, update } = setup();
  assert.equal(routes.length, 2);
  assert.match(routes[0].entrypoint, /admin\/index\.astro$/);
  assert.match(routes[1].entrypoint, /demo\/blocked-api\.js$/);
  const plugin = update.vite.plugins[0];
  assert.match(
    plugin.load(plugin.resolveId('virtual:sedna/adapter')),
    /fixtures\/demo-adapter\.ts/,
  );
  assert.match(plugin.load(plugin.resolveId('virtual:sedna/admin')), /disposableDemo = true/);
});

test('demo refuses to coexist with live database and upload routes', () => {
  assert.throws(() => setup([{ name: 'sednacms' }]), /cannot be installed alongside/);
});

test('demo API rejects reads, writes, authentication and upload callbacks', async () => {
  for (const path of ['setup', 'auth/get-session', 'uploads', 'collections/posts']) {
    for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
      const response = await ALL({
        request: new Request(`https://demo.invalid/api/cms/${path}`, { method }),
      });
      assert.equal(response.status, 403);
      assert.equal(response.headers.get('cache-control'), 'no-store');
    }
  }
});

test('browser adapter handles content and images without calling fetch', async (t) => {
  const { setAdminAdapter } = await import('../dist/admin/adapter.js');
  const { api, RequestError } = await import('../dist/admin/api.js');
  const { uploadImage } = await import('../dist/admin/uploads.js');
  const image = { src: 'blob:https://demo.invalid/local', width: 1, height: 1, alt: '' };
  t.mock.method(globalThis, 'fetch', () => {
    throw new Error('Unexpected network request');
  });
  setAdminAdapter({
    async request(path) {
      return path === 'schema'
        ? Response.json({ collections: [] })
        : Response.json({ error: 'Demo failure' }, { status: 400 });
    },
    async uploadImage() {
      return image;
    },
  });
  t.after(() => setAdminAdapter(null));
  assert.deepEqual(await api('schema'), { collections: [] });
  await assert.rejects(
    api('invalid'),
    (error) => error instanceof RequestError && error.status === 400,
  );
  assert.deepEqual(await uploadImage(new File(['test'], 'test.png'), () => {}), image);
});
