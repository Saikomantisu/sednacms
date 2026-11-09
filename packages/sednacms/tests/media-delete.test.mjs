import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { createMediaApi } from '../dist/api/media.js';
import { s3Storage, uploadthingStorage } from '../dist/storage/config.js';

const origin = 'https://cms.example.com';
const id = '3b945b11-fc9e-4b3d-8e30-627658be5a85';
const object = 'a19458c0-b441-4934-8f0e-e22c9446959f.png';
function environment(t) {
  for (const [key, value] of Object.entries({
    SEDNA_S3_ENDPOINT: 'https://s3.example.com',
    SEDNA_S3_BUCKET: 'media',
    SEDNA_S3_KEY: 'test-key',
    SEDNA_S3_SECRET: 'test-secret',
    SEDNA_S3_PUBLIC_URL: 'https://images.example.com/prefix',
    UPLOADTHING_TOKEN: Buffer.from(
      JSON.stringify({ appId: 'sednatest', apiKey: 'sk_test_dummy', regions: ['sea1'] }),
    ).toString('base64'),
  })) {
    const previous = process.env[key];
    process.env[key] = value;
    t.after(() => {
      if (previous === undefined) delete process.env[key];
      else process.env[key] = previous;
    });
  }
}
function database(src, events) {
  let file = src ? { id, src } : undefined;
  let snapshot;
  const query = async (sql, params) => {
    if (sql === 'begin') snapshot = file;
    if (sql === 'rollback') file = snapshot;
    if (sql.startsWith('select src from')) {
      events.push('select');
      return { rows: file && params[0] === file.id ? [file] : [] };
    }
    if (sql.startsWith('delete from')) {
      events.push('delete');
      file = undefined;
    }
    return { rows: [] };
  };
  return { query, connect: async () => ({ query, release() {} }), exists: () => !!file };
}
function request(headers = {}, body) {
  return new Request(`${origin}/api/cms/media/${id}`, {
    method: 'DELETE',
    headers: { origin, ...headers },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
const session = async () => ({
  session: {},
  headers: new Headers({ 'Set-Cookie': 'sedna=refreshed' }),
});

for (const provider of ['s3', 'uploadthing']) {
  test(`${provider} deletion uses the saved object key, keeps failed deletes retryable, and removes storage before the record`, async (t) => {
    environment(t);
    const events = [];
    const src =
      provider === 's3'
        ? `https://images.example.com/prefix/sedna/${object}`
        : 'https://sednatest.ufs.sh/f/savedFileKey';
    const db = database(src, events);
    let fail = true;
    if (provider === 's3')
      t.mock.method(S3Client.prototype, 'send', async (command) => {
        assert.ok(command instanceof DeleteObjectCommand);
        assert.deepEqual(command.input, { Bucket: 'media', Key: `sedna/${object}` });
        events.push('storage');
        if (fail) throw new Error('Storage unavailable');
        return {};
      });
    else
      t.mock.method(globalThis, 'fetch', async (url, init) => {
        assert.equal(String(url), 'https://api.uploadthing.com/v6/deleteFiles');
        const body =
          typeof init.body === 'string' ? init.body : new TextDecoder().decode(init.body);
        assert.deepEqual(JSON.parse(body), { fileKeys: ['savedFileKey'] });
        events.push('storage');
        return Response.json({ success: !fail, deletedCount: fail ? 0 : 1 });
      });
    const handle = createMediaApi({
      db,
      storage: provider === 's3' ? s3Storage() : uploadthingStorage(),
      origin,
      getSession: session,
    });
    const failure = await handle(request());
    assert.equal(failure.status, 503);
    assert.match((await failure.json()).error, /entry was kept/);
    assert.equal(db.exists(), true);
    assert.deepEqual(events, ['select', 'storage']);
    fail = false;
    events.length = 0;
    const success = await handle(
      request({}, { src: 'https://attacker.example.com/unrelated-file' }),
    );
    assert.equal(success.status, 204);
    assert.equal(success.headers.get('cache-control'), 'no-store');
    assert.match(success.headers.get('set-cookie'), /sedna=refreshed/);
    assert.equal(db.exists(), false);
    assert.deepEqual(events, ['select', 'storage', 'delete']);
    events.length = 0;
    assert.equal((await handle(request())).status, 404);
    assert.deepEqual(events, ['select']);
  });
}

test('deletion rejects foreign storage URLs, cross-origin requests and signed-out requests without deleting anything', async (t) => {
  environment(t);
  let calls = 0;
  t.mock.method(S3Client.prototype, 'send', async () => {
    calls++;
    return {};
  });
  const db = database('https://another-site.example.com/file.png', []);
  const handle = createMediaApi({ db, storage: s3Storage(), origin, getSession: session });
  assert.equal((await handle(request())).status, 400);
  assert.equal((await handle(request({ origin: 'https://attacker.example.com' }))).status, 403);
  const denied = createMediaApi({
    db,
    storage: s3Storage(),
    origin,
    getSession: async () => ({ session: null, headers: new Headers() }),
  });
  assert.equal((await denied(request())).status, 401);
  const unconfigured = createMediaApi({ db, origin, getSession: session });
  assert.equal((await unconfigured(request())).status, 503);
  assert.equal(calls, 0);
  assert.equal(db.exists(), true);
});

test('an already-missing UploadThing file can complete a retried deletion', async (t) => {
  environment(t);
  const db = database('https://sednatest.ufs.sh/f/missingFileKey', []);
  t.mock.method(globalThis, 'fetch', async () => Response.json({ success: true, deletedCount: 0 }));
  const handle = createMediaApi({ db, storage: uploadthingStorage(), origin, getSession: session });
  assert.equal((await handle(request())).status, 204);
  assert.equal(db.exists(), false);
});
