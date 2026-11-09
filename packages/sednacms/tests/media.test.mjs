import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { createMediaApi } from '../dist/api/media.js';
import { createPool } from '../dist/db/client.js';
import { s3Storage, uploadthingStorage } from '../dist/storage/config.js';

const origin = 'https://cms.example.com';
const session = async () => ({
  session: {},
  headers: new Headers({ 'Set-Cookie': 'sedna=refreshed' }),
});
const request = (path, method = 'GET', body, headers = {}) =>
  new Request(`${origin}/api/cms/${path}`, {
    method,
    headers: { origin, 'content-type': 'application/json', ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
const noDatabase = {
  connect() {
    throw new Error('Database must not be accessed');
  },
};

test('media require a session and same-origin writes before accessing the database', async () => {
  const denied = createMediaApi({
    db: noDatabase,
    origin,
    getSession: async () => ({ session: null, headers: new Headers() }),
  });
  for (const [path, method, body] of [
    ['media', 'GET'],
    [`media/${randomUUID()}`, 'DELETE'],
    ['media-folders', 'POST', { name: 'Photos' }],
    [`media/${randomUUID()}`, 'PATCH', { folder_id: null }],
  ])
    assert.equal((await denied(request(path, method, body))).status, 401);
  const handle = createMediaApi({ db: noDatabase, origin, getSession: session });
  for (const supplied of ['', 'https://attacker.example.com'])
    assert.equal(
      (await handle(request('media-folders', 'POST', { name: 'Photos' }, { origin: supplied })))
        .status,
      403,
    );
  assert.equal((await handle(request('media', 'DELETE'))).status, 405);
});

test('media validation rejects external links, invalid folders, and malformed requests without fetching files', async (t) => {
  const previous = process.env.SEDNA_S3_PUBLIC_URL;
  process.env.SEDNA_S3_PUBLIC_URL = 'https://images.example.com/media';
  t.after(() => {
    if (previous === undefined) delete process.env.SEDNA_S3_PUBLIC_URL;
    else process.env.SEDNA_S3_PUBLIC_URL = previous;
  });
  t.mock.method(globalThis, 'fetch', () => {
    throw new Error('No remote fetch expected');
  });
  const handle = createMediaApi({
    db: noDatabase,
    storage: s3Storage(),
    origin,
    getSession: session,
  });
  const file = {
    name: 'Photo',
    src: `https://images.example.com/media/sedna/${randomUUID()}.jpg`,
    type: 'image/jpeg',
    size: 10,
    width: 100,
    height: 100,
  };
  const cases = [
    ['media?folder=invalid', 'GET', undefined, 400],
    ['media?offset=-1', 'GET', undefined, 400],
    ['media?offset=1.5', 'GET', undefined, 400],
    ['media?type=document', 'GET', undefined, 400],
    ['media?type=invalid', 'GET', undefined, 400],
    [`media?q=${'x'.repeat(256)}`, 'GET', undefined, 400],
    ['media/not-an-id', 'PATCH', { folder_id: null }, 400],
    ['media-folders', 'POST', { name: ' ' }, 400],
    ['media-folders', 'POST', { name: 'x'.repeat(256) }, 400],
    ['media-folders', 'POST', [], 400],
    ['media', 'POST', { ...file, folder_id: 'bad' }, 400],
    ['media', 'POST', { ...file, src: 'https://remote.example.com/photo.jpg' }, 400],
    ['media', 'POST', { ...file, src: 'http://127.0.0.1/photo.jpg' }, 400],
    [
      'media',
      'POST',
      { ...file, src: `https://images.example.com/media/sedna/../${randomUUID()}.jpg` },
      400,
    ],
    ['media', 'POST', { ...file, type: 'text/html' }, 400],
    ['media', 'POST', { ...file, type: 'application/pdf' }, 400],
    ['media', 'POST', { ...file, type: 'image/svg+xml' }, 400],
    ['media', 'POST', { ...file, type: 'video/mp4', size: 100 * 1024 * 1024 + 1 }, 400],
    ['media-folders', 'POST', { name: 'Uncategorized' }, 400],
    ['media', 'POST', { ...file, width: 0 }, 400],
    ['media', 'POST', { ...file, size: 0 }, 400],
    ['media', 'POST', { ...file, size: 32 * 1024 * 1024 + 1 }, 400],
    [`media/${randomUUID()}`, 'PATCH', {}, 400],
  ];
  for (const [path, method, body, status] of cases) {
    const response = await handle(request(path, method, body));
    assert.equal(
      response.status,
      status,
      JSON.stringify({ path, body, response: await response.clone().json() }),
    );
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.match(response.headers.get('set-cookie'), /sedna=refreshed/);
  }
  assert.equal(
    (await handle(request('media', 'POST', file, { 'content-type': 'text/plain' }))).status,
    415,
  );
  assert.equal(
    (
      await handle(
        new Request(`${origin}/api/cms/media`, {
          method: 'POST',
          headers: { origin, 'content-type': 'application/json' },
          body: '{',
        }),
      )
    ).status,
    400,
  );
  const unconfigured = createMediaApi({ db: noDatabase, origin, getSession: session });
  assert.equal((await unconfigured(request('media', 'POST', file))).status, 503);
});

test('UploadThing registration rejects files from other apps', async (t) => {
  const previous = process.env.UPLOADTHING_TOKEN;
  process.env.UPLOADTHING_TOKEN = Buffer.from(JSON.stringify({ appId: 'this-app' })).toString(
    'base64',
  );
  t.after(() => {
    if (previous === undefined) delete process.env.UPLOADTHING_TOKEN;
    else process.env.UPLOADTHING_TOKEN = previous;
  });
  const handle = createMediaApi({
    db: noDatabase,
    storage: uploadthingStorage(),
    origin,
    getSession: session,
  });
  const response = await handle(
    request('media', 'POST', {
      name: 'Other photo',
      src: 'https://another-app.ufs.sh/f/key',
      type: 'image/jpeg',
      size: 10,
      width: 100,
      height: 100,
    }),
  );
  assert.equal(response.status, 400);
});

test('folders and media persist; moving and renaming preserve media URLs; image selection excludes videos', {
  skip: !process.env.SEDNA_TEST_DATABASE_URL,
  timeout: 60000,
}, async (t) => {
  const deletedKeys = [];
  t.mock.method(S3Client.prototype, 'send', async (command) => {
    assert.ok(command instanceof DeleteObjectCommand);
    deletedKeys.push(command.input.Key);
    return {};
  });
  for (const [key, value] of Object.entries({
    SEDNA_S3_ENDPOINT: 'https://s3.example.com',
    SEDNA_S3_BUCKET: 'media',
    SEDNA_S3_KEY: 'test-key',
    SEDNA_S3_SECRET: 'test-secret',
  })) {
    const previous = process.env[key];
    process.env[key] = value;
    t.after(() => {
      if (previous === undefined) delete process.env[key];
      else process.env[key] = previous;
    });
  }
  const admin = createPool(process.env.SEDNA_TEST_DATABASE_URL);
  const schema = `sedna_media_test_${randomUUID().replaceAll('-', '')}`;
  const pool = createPool(process.env.SEDNA_TEST_DATABASE_URL, 1);
  let client;
  const query = (...args) => client.query(...args);
  const db = { query, connect: async () => ({ query, release() {} }) };
  const previous = process.env.SEDNA_S3_PUBLIC_URL;
  process.env.SEDNA_S3_PUBLIC_URL = 'https://images.example.com';
  t.after(() => {
    if (previous === undefined) delete process.env.SEDNA_S3_PUBLIC_URL;
    else process.env.SEDNA_S3_PUBLIC_URL = previous;
  });
  const handle = createMediaApi({ db, storage: s3Storage(), origin, getSession: session });
  const call = async (path, method, body, status = 200) => {
    const response = await handle(request(path, method, body));
    const data = response.status === 204 ? null : await response.json();
    assert.equal(response.status, status, JSON.stringify(data));
    return data;
  };
  try {
    await admin.query(`create schema ${schema}`);
    client = await pool.connect();
    await client.query(`set search_path to ${schema}`);
    assert.deepEqual(await call('media'), {
      media: [],
      folders: [],
      imageCounts: {},
      hasMore: false,
    });
    const { folder } = await call('media-folders', 'POST', { name: 'Photos' }, 201);
    await call('media-folders', 'POST', { name: 'Photos' }, 409);
    const image = {
      name: 'Photo.jpg',
      src: `https://images.example.com/sedna/${randomUUID()}.jpg`,
      type: 'image/jpeg',
      size: 100,
      width: 800,
      height: 600,
    };
    const { media } = await call('media', 'POST', image, 201);
    await call(
      'media',
      'POST',
      {
        name: 'Clip.mp4',
        src: `https://images.example.com/sedna/${randomUUID()}.mp4`,
        type: 'video/mp4',
        size: 20,
      },
      201,
    );
    assert.equal((await call('media')).media.length, 2);
    assert.equal((await call('media?type=video')).media[0].name, 'Clip.mp4');
    assert.equal((await call('media?type=image')).media[0].id, media.id);
    await call('media?type=audio', 'GET', undefined, 400);
    assert.equal((await call('media?q=PHOTO')).media[0].id, media.id);
    assert.equal((await call('media?q=%25')).media.length, 0);
    assert.deepEqual(
      (await call('media?images=true')).media.map((item) => item.id),
      [media.id],
    );
    const moved = (await call(`media/${media.id}`, 'PATCH', { folder_id: folder.id })).media;
    assert.equal(moved.src, image.src);
    assert.equal(moved.id, media.id);
    assert.equal((await call('media?images=true')).media.length, 0);
    assert.equal((await call('media?folder=all')).media.length, 2);
    assert.deepEqual((await call('media?folder=all')).imageCounts, { [folder.id]: 1 });
    assert.equal((await call('media?folder=all&q=photo&type=image')).media[0].id, media.id);
    assert.equal((await call(`media?folder=${folder.id}&images=true`)).media[0].src, image.src);
    await call(`media-folders/${folder.id}`, 'PATCH', { name: 'Product photos' });
    assert.equal((await call(`media?folder=${folder.id}`)).folders[0].name, 'Product photos');
    // Repeating completion must not create a second file or undo a folder move.
    const repeated = (await call('media', 'POST', image, 201)).media;
    assert.equal(repeated.id, media.id);
    assert.equal(repeated.folder_id, folder.id);
    await call(`media/${media.id}`, 'PATCH', { folder_id: randomUUID() }, 404);
    await call(`media/${randomUUID()}`, 'PATCH', { folder_id: null }, 404);
    await call(`media?folder=${randomUUID()}`, 'GET', undefined, 404);
    const fresh = createMediaApi({ db, storage: s3Storage(), origin, getSession: session });
    const persisted = await (await fresh(request(`media?folder=${folder.id}`))).json();
    assert.equal(persisted.media[0].src, image.src);
    await call(`media/${media.id}`, 'PATCH', { folder_id: null });
    // Exercise pagination using real rows rather than a SQL stub.
    await db.query(`insert into sedna__media (name, src, type, size, width, height)
      select 'File ' || i, 'https://images.example.com/test/' || i, 'image/jpeg', 1, 1, 1 from generate_series(1, 49) i`);
    const first = await call('media');
    const next = await call('media?offset=48');
    assert.equal(first.media.length, 48);
    assert.equal(first.hasMore, true);
    assert.equal(next.hasMore, false);
    assert.equal(next.media.length, 3);
    assert.equal(new Set([...first.media, ...next.media].map((item) => item.id)).size, 51);
    assert.deepEqual((await call('media?folder=all&q=Photo')).imageCounts, { '': 50 });
    await call(`media/${media.id}`, 'DELETE', undefined, 204);
    assert.deepEqual(deletedKeys, [new URL(image.src).pathname.slice(1)]);
    assert.deepEqual((await call('media?folder=all')).imageCounts, { '': 49 });
    await call(`media/${media.id}`, 'DELETE', undefined, 404);
    // Deletion does not silently rewrite content references to another file.
    assert.equal(image.src, moved.src);
  } finally {
    client?.release();
    await pool.end();
    await admin.query(`drop schema if exists ${schema} cascade`);
    await admin.end();
  }
});
