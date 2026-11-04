import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { test } from 'node:test';
import { prepareImage } from '../dist/admin/image-processing.js';
import { uploadImage } from '../dist/admin/uploads.js';
import { createUploadApi } from '../dist/api/uploads.js';
import {
  MAX_IMAGE_BYTES,
  resolveImageProcessing,
  s3Storage,
  uploadthingStorage,
} from '../dist/storage/config.js';

function setEnv(t, key, value) {
  const previous = process.env[key];
  process.env[key] = value;
  t.after(() => {
    if (previous === undefined) delete process.env[key];
    else process.env[key] = previous;
  });
}

const origin = 'https://cms.example.com';
const session = async () => ({
  session: { user: { id: 'editor' } },
  headers: new Headers({ 'Set-Cookie': 'sedna=refreshed; HttpOnly' }),
});
function request(body, { method = 'POST', path = '', headers = {} } = {}) {
  return new Request(origin + '/api/cms/uploads' + path, {
    method,
    headers: { origin, 'content-type': 'application/json', ...headers },
    ...(method === 'GET' ? {} : { body: JSON.stringify(body) }),
  });
}
const file = { type: 'image/jpeg', size: 8 * 1024 * 1024 };

test('uploads require authentication and same-origin writes before accessing storage', async () => {
  const signedOut = createUploadApi({
    storage: s3Storage(),
    origin,
    getSession: async () => ({ session: null, headers: new Headers() }),
  });
  assert.equal((await signedOut(request(file))).status, 401);
  assert.equal((await signedOut(request(null, { method: 'GET' }))).status, 401);
  const handle = createUploadApi({ storage: s3Storage(), origin, getSession: session });
  for (const suppliedOrigin of ['', 'https://attacker.example.com']) {
    assert.equal(
      (await handle(request(file, { headers: { origin: suppliedOrigin } }))).status,
      403,
    );
  }
  assert.equal(
    (await handle(request(file, { headers: { 'uploadthing-hook': 'callback' } }))).status,
    503,
  );
});

test('upload configuration refreshes cookies and is never cached', async () => {
  const handle = createUploadApi({ storage: uploadthingStorage(), origin, getSession: session });
  const response = await handle(request(null, { method: 'GET' }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.match(response.headers.get('set-cookie'), /sedna=refreshed/);
  assert.deepEqual(await response.json(), {
    provider: 'uploadthing',
    maxBytes: MAX_IMAGE_BYTES,
    types: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'],
    image: { format: 'webp', maxWidth: 2560, maxHeight: 2560, quality: 0.8 },
  });
  const unconfigured = createUploadApi({ origin, getSession: session });
  assert.equal((await unconfigured(request(file))).status, 503);
});

test('S3 rejects invalid files before issuing signed URLs', async () => {
  const handle = createUploadApi({ storage: s3Storage(), origin, getSession: session });
  for (const body of [
    null,
    [],
    {},
    { ...file, type: 'image/svg+xml' },
    { ...file, type: 'text/html' },
    { ...file, size: 0 },
    { ...file, size: -1 },
    { ...file, size: '20' },
    { ...file, size: 1.5 },
    { ...file, size: MAX_IMAGE_BYTES + 1 },
  ]) {
    assert.equal((await handle(request(body))).status, 400, JSON.stringify(body));
  }
  assert.equal((await handle(request(file, { method: 'DELETE' }))).status, 405);
  assert.equal(
    (await handle(request(file, { headers: { 'content-type': 'image/jpeg' } }))).status,
    415,
  );
  const invalidJson = new Request(origin + '/api/cms/uploads', {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json' },
    body: '{',
  });
  assert.equal((await handle(invalidJson)).status, 400);
});

test('S3 signs unique object keys, exact size and type, with a five-minute expiry', async (t) => {
  for (const [key, value] of Object.entries({
    SEDNA_S3_ENDPOINT: 'https://s3.example.com',
    SEDNA_S3_BUCKET: 'images',
    SEDNA_S3_REGION: 'us-east-1',
    SEDNA_S3_KEY: 'test-access-key',
    SEDNA_S3_SECRET: 'test-secret-key',
    SEDNA_S3_PUBLIC_URL: 'https://images.example.com/media',
  }))
    setEnv(t, key, value);
  const handle = createUploadApi({ storage: s3Storage(), origin, getSession: session });
  const response = await handle(request(file));
  assert.equal(response.status, 200);
  const signed = await response.json();
  const url = new URL(signed.url);
  assert.equal(url.hostname, 's3.example.com');
  assert.match(url.pathname, /^\/images\/sedna\/[0-9a-f-]+\.jpg$/);
  assert.equal(url.searchParams.get('X-Amz-Expires'), '300');
  assert.equal(url.searchParams.get('X-Amz-SignedHeaders'), 'content-length;content-type;host');
  assert.equal(
    signed.src,
    'https://images.example.com/media' + url.pathname.replace('/images', ''),
  );
  assert.deepEqual(signed.headers, { 'Content-Type': 'image/jpeg' });
  assert.ok(!JSON.stringify(signed).includes('test-secret-key'));
  const next = await (await handle(request(file))).json();
  assert.notEqual(next.src, signed.src);
  // Independently reconstruct SigV4 to verify that changing the advertised size invalidates the signature.
  const hmac = (key, value) => createHmac('sha256', key).update(value).digest();
  const date = url.searchParams.get('X-Amz-Date');
  const scope = `${date.slice(0, 8)}/us-east-1/s3/aws4_request`;
  const query = new URLSearchParams(url.searchParams);
  const signature = query.get('X-Amz-Signature');
  query.delete('X-Amz-Signature');
  const canonicalQuery = [...query]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
  const { createHash } = await import('node:crypto');
  const sha = (value) => createHash('sha256').update(value).digest('hex');
  const canonical = [
    'PUT',
    url.pathname,
    canonicalQuery,
    `content-length:${file.size}\ncontent-type:${file.type}\nhost:${url.host}\n`,
    'content-length;content-type;host',
    'UNSIGNED-PAYLOAD',
  ].join('\n');
  const signingKey = hmac(
    hmac(hmac(hmac('AWS4test-secret-key', date.slice(0, 8)), 'us-east-1'), 's3'),
    'aws4_request',
  );
  const expected = createHmac('sha256', signingKey)
    .update(`AWS4-HMAC-SHA256\n${date}\n${scope}\n${sha(canonical)}`)
    .digest('hex');
  assert.equal(signature, expected);
});

test('UploadThing rejects unauthenticated signing and forged provider callbacks', async (t) => {
  setEnv(t, 'SEDNA_URL', origin);
  setEnv(
    t,
    'UPLOADTHING_TOKEN',
    Buffer.from(
      JSON.stringify({
        apiKey: 'sk_test_not_a_real_secret',
        appId: 'sednatest',
        regions: ['sea1'],
      }),
    ).toString('base64'),
  );
  const handle = createUploadApi({ storage: uploadthingStorage(), origin, getSession: session });
  const response = await handle(
    request(
      {},
      {
        path: '?slug=image',
        headers: {
          'uploadthing-hook': 'callback',
          'x-uploadthing-signature': 'hmac-sha256=forged',
        },
      },
    ),
  );
  assert.equal(response.status, 400);
  assert.match(await response.text(), /Invalid signature/);
  const denied = createUploadApi({
    storage: uploadthingStorage(),
    origin,
    getSession: async () => ({ session: null, headers: new Headers() }),
  });
  assert.equal(
    (await denied(request({ files: [file] }, { path: '?slug=image&actionType=upload' }))).status,
    401,
  );
});

test('UploadThing signs a phone photo and registers metadata without transferring file bytes', async (t) => {
  setEnv(t, 'SEDNA_URL', origin);
  setEnv(t, 'NODE_ENV', 'production');
  setEnv(
    t,
    'UPLOADTHING_TOKEN',
    Buffer.from(
      JSON.stringify({
        apiKey: 'sk_test_not_a_real_secret',
        appId: 'sednatest',
        regions: ['sea1'],
      }),
    ).toString('base64'),
  );
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    assert.match(String(url), /^https:\/\/sea1\.ingest\.uploadthing\.com\/route-metadata$/);
    calls.push(JSON.parse(new TextDecoder().decode(init.body)));
    return Response.json({ ok: true });
  });
  const handle = createUploadApi({ storage: uploadthingStorage(), origin, getSession: session });
  const payload = { files: [{ name: 'phone-photo.jpg', ...file }], input: null };
  const response = await handle(request(payload, { path: '?slug=image&actionType=upload' }));
  assert.equal(response.status, 200, await response.clone().text());
  const [signed] = await response.json();
  const url = new URL(signed.url);
  assert.equal(url.searchParams.get('x-ut-file-size'), String(file.size));
  assert.equal(decodeURIComponent(url.searchParams.get('x-ut-file-type')), file.type);
  assert.ok(url.searchParams.get('signature'));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].callbackUrl, origin + '/api/cms/uploads');
  assert.equal(calls[0].awaitServerData, false);
  assert.equal(calls[0].fileKeys[0], signed.key);
  const tooLarge = { ...payload, files: [{ ...payload.files[0], size: MAX_IMAGE_BYTES + 1 }] };
  assert.equal(
    (await handle(request(tooLarge, { path: '?slug=image&actionType=upload' }))).status,
    400,
  );
  assert.equal(calls.length, 1);
});

function browserImage(t, { width = 4032, height = 3024, failWorker = false, fail = false } = {}) {
  const calls = { revoked: [], draws: [], encodes: [], fills: [], terminated: 0 };
  const context = {
    fillRect: (...args) => calls.fills.push(args),
    drawImage: (...args) => calls.draws.push(args),
    getImageData: () => ({ data: new Uint8ClampedArray(4), width, height }),
  };
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => context,
  };
  for (const [key, value] of Object.entries({
    Worker: class {
      constructor(url, options) {
        assert.match(String(url), /image-worker\.js$/);
        assert.equal(options.type, 'module');
      }
      postMessage({ image, options }) {
        calls.encodes.push(options);
        const scale = Math.min(1, options.maxWidth / image.width, options.maxHeight / image.height);
        queueMicrotask(() =>
          this.onmessage({
            data: failWorker
              ? { error: 'failed' }
              : {
                  buffer: new TextEncoder().encode('encoded image').buffer,
                  width: Math.max(1, Math.round(image.width * scale)),
                  height: Math.max(1, Math.round(image.height * scale)),
                },
          }),
        );
      }
      terminate() {
        calls.terminated++;
      }
    },
    Image: class {
      naturalWidth = width;
      naturalHeight = height;
      async decode() {
        if (fail) throw new Error('decode failed');
      }
    },
    document: { createElement: () => canvas },
  })) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
    t.after(() => {
      if (previous) Object.defineProperty(globalThis, key, previous);
      else delete globalThis[key];
    });
  }
  t.mock.method(URL, 'createObjectURL', () => 'blob:photo');
  t.mock.method(URL, 'revokeObjectURL', (url) => calls.revoked.push(url));
  return { calls, canvas };
}

test('image processing defaults and overrides are validated for both adapters', () => {
  for (const adapter of [s3Storage, uploadthingStorage]) {
    assert.deepEqual(adapter().image, {
      format: 'webp',
      maxWidth: 2560,
      maxHeight: 2560,
      quality: 0.8,
    });
    assert.deepEqual(adapter({ image: { quality: 0, maxWidth: 1920 } }).image, {
      format: 'webp',
      maxWidth: 1920,
      maxHeight: 2560,
      quality: 0,
    });
    assert.equal(adapter({ image: false }).image, false);
    for (const image of [
      { maxWidth: 0 },
      { maxHeight: 1.5 },
      { maxWidth: 16385 },
      { quality: -1 },
      { quality: 1.1 },
      { quality: NaN },
      { format: 'png' },
      { format: 'jpeg' },
      { format: '' },
      { maxHeight: Infinity },
    ])
      assert.throws(() => adapter({ image }));
  }
});

test('upload configuration exposes image overrides and opt-out', async () => {
  for (const image of [
    false,
    ...['webp', 'jpg', 'avif'].map((format) => ({
      format,
      maxWidth: 1920,
      maxHeight: 1080,
      quality: 0.9,
    })),
  ]) {
    const handle = createUploadApi({ storage: s3Storage({ image }), origin, getSession: session });
    assert.deepEqual((await (await handle(request(null, { method: 'GET' }))).json()).image, image);
  }
});

for (const [width, height, expectedWidth, expectedHeight] of [
  [4032, 3024, 2560, 1920],
  [3024, 4032, 1920, 2560],
  [400, 200, 400, 200],
  [1, 10000, 1, 2560],
]) {
  test(`processing ${width}x${height} produces WebP with correct dimensions`, async (t) => {
    const { calls, canvas } = browserImage(t, { width, height });
    const result = await prepareImage(
      new File(['original'], 'phone.photo.png', { type: 'image/png' }),
      resolveImageProcessing(),
    );
    assert.equal(result.width, expectedWidth);
    assert.equal(result.height, expectedHeight);
    assert.equal(result.file.name, 'phone.photo.webp');
    assert.equal(result.file.type, 'image/webp');
    assert.equal(await result.file.text(), 'encoded image');
    assert.deepEqual(calls.encodes, [resolveImageProcessing()]);
    assert.deepEqual(calls.draws[0].slice(1), [0, 0]);
    assert.equal(calls.terminated, 1);
    assert.deepEqual(calls.revoked, ['blob:photo']);
    assert.equal(canvas.width, 0);
    assert.equal(canvas.height, 0);
  });
}

test('custom dimensions and quality are used when encoding', async (t) => {
  const { calls } = browserImage(t);
  const result = await prepareImage(new File(['photo'], 'photo.jpg', { type: 'image/jpeg' }), {
    maxWidth: 1920,
    maxHeight: 1080,
    format: 'webp',
    quality: 0.9,
  });
  assert.deepEqual([result.width, result.height], [1440, 1080]);
  assert.equal(calls.encodes[0].quality, 0.9);
});

test('disabled processing preserves the original file and dimensions', async (t) => {
  const { calls } = browserImage(t);
  const original = new File(['animation'], 'animation.gif', { type: 'image/gif' });
  const result = await prepareImage(original, false);
  assert.equal(result.file, original);
  assert.deepEqual([result.width, result.height], [4032, 3024]);
  assert.equal(calls.encodes.length, 0);
  assert.deepEqual(calls.revoked, ['blob:photo']);
});

for (const settings of [{ fail: true }, { failWorker: true }, { width: 0 }]) {
  test(`failed image processing cleans up and refuses fallback uploads: ${JSON.stringify(settings)}`, async (t) => {
    const { calls, canvas } = browserImage(t, settings);
    await assert.rejects(
      prepareImage(
        new File(['photo'], 'photo.jpg', { type: 'image/jpeg' }),
        resolveImageProcessing(),
      ),
      /could not|Could not/,
    );
    assert.deepEqual(calls.revoked, ['blob:photo']);
    assert.equal(canvas.width, 0);
  });
}

test('unsupported and empty input files are rejected before decoding', async (t) => {
  const { calls } = browserImage(t);
  for (const file of [
    new File(['svg'], 'photo.svg', { type: 'image/svg+xml' }),
    new File([], 'photo.jpg', { type: 'image/jpeg' }),
  ])
    await assert.rejects(prepareImage(file, resolveImageProcessing()), /Choose a JPEG/);
  assert.deepEqual(calls.revoked, []);
});

test('S3 admin upload signs and transfers the processed file and saves its dimensions', async (t) => {
  browserImage(t);
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    requests.push({ url, init });
    if (!init.body) return Response.json({ provider: 's3', image: resolveImageProcessing() });
    return Response.json({
      url: 'https://bucket.example.com/put',
      src: 'https://images.example.com/photo.webp',
      headers: { 'Content-Type': 'image/webp' },
    });
  });
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'XMLHttpRequest');
  let uploaded;
  class XHR {
    upload = {};
    status = 200;
    open(method, url) {
      assert.equal(method, 'PUT');
      assert.equal(url, 'https://bucket.example.com/put');
    }
    setRequestHeader(key, value) {
      assert.deepEqual([key, value], ['Content-Type', 'image/webp']);
    }
    send(file) {
      uploaded = file;
      this.upload.onprogress({ lengthComputable: false, loaded: 0, total: 0 });
      this.upload.onprogress({ lengthComputable: true, loaded: 1, total: 2 });
      this.upload.onload();
      this.onload();
    }
  }
  Object.defineProperty(globalThis, 'XMLHttpRequest', { value: XHR, configurable: true });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'XMLHttpRequest', previous);
    else delete globalThis.XMLHttpRequest;
  });
  const progress = [];
  const result = await uploadImage(
    new File(['original'], 'photo.jpg', { type: 'image/jpeg' }),
    (update) => progress.push(update),
  );
  assert.deepEqual(progress, [
    { stage: 'preparing' },
    { stage: 'uploading', percent: 0 },
    { stage: 'uploading', percent: undefined },
    { stage: 'uploading', percent: 50 },
    { stage: 'finalizing' },
  ]);
  assert.deepEqual(JSON.parse(requests[1].init.body), { type: 'image/webp', size: uploaded.size });
  assert.equal(uploaded.name, 'photo.webp');
  assert.equal(await uploaded.text(), 'encoded image');
  assert.deepEqual(result, {
    src: 'https://images.example.com/photo.webp',
    width: 2560,
    height: 1920,
    alt: '',
  });
});

for (const format of ['webp', 'jpg', 'avif']) {
  test(`${format} export uses the selected filename, MIME type, and quality`, async (t) => {
    const { calls } = browserImage(t);
    const result = await prepareImage(
      new File(['photo'], 'photo.png', { type: 'image/png' }),
      resolveImageProcessing({ format, quality: 0.65 }),
    );
    assert.equal(result.file.name, `photo.${format}`);
    assert.equal(result.file.type, format === 'jpg' ? 'image/jpeg' : `image/${format}`);
    assert.equal(calls.encodes[0].quality, 0.65);
    assert.equal(calls.encodes[0].format, format);
    assert.equal(calls.fills.length, format === 'jpg' ? 1 : 0);
  });
}

test('real jSquash codecs resize and encode valid WebP, JPG, and AVIF files', async (t) => {
  const { readFile } = await import('node:fs/promises');
  const { default: sharp } = await import('sharp');
  const { processPixels } = await import('../dist/admin/image-codecs.js');
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'ImageData');
  Object.defineProperty(globalThis, 'ImageData', {
    configurable: true,
    writable: true,
    value: class {
      constructor(data, width, height) {
        Object.assign(this, { data, width, height });
      }
    },
  });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'ImageData', previous);
    else delete globalThis.ImageData;
  });
  const paths = {
    webp: '@jsquash/webp/codec/enc/webp_enc.wasm',
    jpg: '@jsquash/jpeg/codec/enc/mozjpeg_enc.wasm',
    avif: '@jsquash/avif/codec/enc/avif_enc.wasm',
    resize: '@jsquash/resize/lib/resize/pkg/squoosh_resize_bg.wasm',
  };
  const pixels = new Uint8ClampedArray(64 * 48 * 4);
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = (i * 17) % 256;
    pixels[i + 1] = (i * 7) % 256;
    pixels[i + 2] = (i * 13) % 256;
    pixels[i + 3] = 200;
  }
  for (const format of ['webp', 'jpg', 'avif']) {
    const results = [];
    for (const quality of [0.25, 0.9]) {
      const loaded = [];
      const output = await processPixels(
        new ImageData(pixels, 64, 48),
        resolveImageProcessing({ format, quality, maxWidth: 32 }),
        async (codec) => {
          loaded.push(codec);
          const bytes = await readFile(new URL(`../node_modules/${paths[codec]}`, import.meta.url));
          return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
        },
      );
      const data = Buffer.from(output.buffer);
      const metadata = await sharp(data).metadata();
      assert.deepEqual([output.width, output.height], [32, 24]);
      assert.deepEqual([metadata.width, metadata.height], [32, 24]);
      assert.equal(
        metadata.format,
        format === 'jpg' ? 'jpeg' : format === 'avif' ? 'heif' : 'webp',
      );
      assert.deepEqual(loaded, ['resize', format]);
      if (format !== 'jpg') assert.equal(metadata.hasAlpha, true);
      results.push(data);
    }
    assert.notDeepEqual(results[0], results[1], `${format} must apply the selected quality`);
  }
});
