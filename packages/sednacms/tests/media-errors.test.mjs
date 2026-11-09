import assert from 'node:assert/strict';
import { test } from 'node:test';
import { api, RequestError } from '../dist/admin/api.js';
import { createMediaApi } from '../dist/api/media.js';
import { log } from '../dist/log.js';

test('media failures explain the cause without exposing database details and allow retry', async (t) => {
  t.mock.method(log, 'error', () => {});
  for (const [code, expected] of [
    ['42501', /permission/],
    ['28P01', /credentials/],
    ['42P01', /not set up correctly/],
    ['ECONNREFUSED', /Could not connect/],
    ['08006', /Could not connect/],
    [undefined, /server logs/],
  ]) {
    let failed = true;
    const handle = createMediaApi({
      origin: 'https://cms.example.com',
      getSession: async () => ({ session: {}, headers: new Headers() }),
      db: {
        connect: async () => {
          if (failed) throw Object.assign(new Error('secret database details'), { code });
          return { query: async () => ({ rows: [] }), release() {} };
        },
        query: async () => ({ rows: [] }),
      },
    });
    const request = () => new Request('https://cms.example.com/api/cms/media');
    const response = await handle(request());
    assert.equal(response.status, 503);
    const body = await response.json();
    assert.match(body.error, expected);
    assert.doesNotMatch(body.error, /secret database details/);
    failed = false;
    assert.equal((await handle(request())).status, 200);
  }
});

test('API preserves HTTP errors for non-JSON responses and rejects malformed successful responses', async (t) => {
  for (const status of [401, 403, 502]) {
    t.mock.method(
      globalThis,
      'fetch',
      async () => new Response('<html>proxy error</html>', { status }),
    );
    await assert.rejects(api('media'), (error) => {
      assert.ok(error instanceof RequestError);
      assert.equal(error.status, status);
      assert.doesNotMatch(error.message, /JSON|Unexpected token|<html>/);
      return true;
    });
  }
  t.mock.method(globalThis, 'fetch', async () => new Response('invalid'));
  await assert.rejects(api('media'), /invalid response/);
  t.mock.method(globalThis, 'fetch', async () => Response.json(null));
  assert.equal(await api('auth/get-session'), null);
});
