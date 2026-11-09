import assert from 'node:assert/strict';
import { test } from 'node:test';
import { S3Client } from '@aws-sdk/client-s3';
import { UTApi } from 'uploadthing/server';
import { createMediaApi } from '../dist/api/media.js';
import { createUploadApi } from '../dist/api/uploads.js';
import {
  MAX_SVG_BYTES,
  maxMediaBytes,
  s3Storage,
  uploadthingStorage,
} from '../dist/storage/config.js';
import { sanitizeSvg, svgReceipt, verifySvgReceipt } from '../dist/storage/svg.js';

const origin = 'https://cms.example.com';
const svg = (content = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 24">${content}</svg>`;
const session = async () => ({ session: {}, headers: new Headers() });
function env(t, values) {
  for (const [key, value] of Object.entries(values)) {
    const previous = process.env[key];
    process.env[key] = value;
    t.after(() => {
      if (previous === undefined) delete process.env[key];
      else process.env[key] = previous;
    });
  }
}
const request = (body, headers = {}) =>
  new Request(`${origin}/api/cms/uploads?kind=svg`, {
    method: 'POST',
    headers: {
      origin,
      'content-type': 'image/svg+xml',
      'x-sedna-filename': 'logo.svg',
      ...headers,
    },
    body,
  });

test('server SVG sanitisation preserves shapes and local gradients while removing executable content and external resources', async (t) => {
  t.mock.method(globalThis, 'fetch', () => {
    throw new Error('SVGs must not fetch external resources');
  });
  const result = await sanitizeSvg(
    svg(
      `<defs><linearGradient id="paint"><stop offset="0" stop-color="red"/></linearGradient></defs><rect width="32" height="24" fill="url(#paint)"/><script>alert(1)</script><foreignObject><div xmlns="http://www.w3.org/1999/xhtml" onload="alert(1)">bad</div></foreignObject><style>@import url(https://evil.example/style.css)</style><image href="https://evil.example/track"/><use href="https://evil.example/image.svg#id"/><animate attributeName="href" values="javascript:alert(1)"/><a href="javascript:alert(1)"><circle r="2" onclick="alert(1)"/></a>`,
    ),
  );
  assert.deepEqual([result.width, result.height], [32, 24]);
  assert.match(result.svg, /linearGradient/);
  assert.match(result.svg, /fill="url\(#paint\)"/);
  assert.match(result.svg, /<rect/);
  assert.doesNotMatch(
    result.svg,
    /script|foreignObject|<style|<image|<use|<animate|onload|onclick|href|https:\/\/evil/i,
  );
  assert.equal((await sanitizeSvg(result.svg)).svg, result.svg);
});

test('SVG sanitisation blocks encoded URLs, CSS escapes, namespace tricks and event attributes', async () => {
  for (const attribute of [
    'fill="url(https://evil.example/x)"',
    'stroke="url(//evil.example/x)"',
    'fill="url(&#x68;ttps://evil.example/x)"',
    'fill="u\\72l(https://evil.example/x)"',
    'onload="alert(1)"',
    'style="fill:url(https://evil.example/x)"',
  ]) {
    const result = await sanitizeSvg(svg(`<path d="M0 0h10v10z" ${attribute}/>`));
    assert.doesNotMatch(result.svg, /evil|onload|style=|\\72/);
    assert.match(result.svg, /<path/);
  }
  const result = await sanitizeSvg(
    svg('<g xmlns="http://www.w3.org/1999/xhtml"><script>alert(1)</script></g>'),
  );
  assert.doesNotMatch(result.svg, /script|xhtml|alert/);
});

test('SVG parsing rejects DTD/entity declarations, malformed XML, non-SVG documents, excessive complexity and invalid dimensions', async () => {
  for (const source of [
    '<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]>' + svg('<text>&x;</text>'),
    '<!DOCTYPE svg SYSTEM "https://evil.example/external.dtd">' + svg(),
    '<svg xmlns="http://www.w3.org/2000/svg"><g></svg>',
    '<html xmlns="http://www.w3.org/1999/xhtml"/>',
    '<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0"/>',
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 9999999 2"/>',
    svg('<g>'.repeat(70) + '</g>'.repeat(70)),
    svg('<path/>'.repeat(10001)),
    svg('x'.repeat(MAX_SVG_BYTES)),
  ])
    await assert.rejects(sanitizeSvg(source));
  const sized = await sanitizeSvg(
    '<svg xmlns="http://www.w3.org/2000/svg" width="48px" height="36px"><rect width="48" height="36"/></svg>',
  );
  assert.deepEqual([sized.width, sized.height], [48, 36]);
});

test('SVG upload stores only sanitised bytes in S3 and returns a tamper-resistant registration receipt', async (t) => {
  env(t, {
    SEDNA_SECRET: 'test-svg-secret',
    SEDNA_S3_ENDPOINT: 'https://s3.example.com',
    SEDNA_S3_BUCKET: 'images',
    SEDNA_S3_KEY: 'test-key',
    SEDNA_S3_SECRET: 'test-secret',
    SEDNA_S3_PUBLIC_URL: 'https://images.example.com',
  });
  const writes = [];
  t.mock.method(S3Client.prototype, 'send', async (command) => {
    writes.push(command.input);
    return {};
  });
  const handle = createUploadApi({ storage: s3Storage(), origin, getSession: session });
  const response = await handle(request(svg('<path onmouseover="alert(1)" d="M0 0h32v24z"/>')));
  assert.equal(response.status, 200, await response.clone().text());
  const file = await response.json();
  assert.equal(writes.length, 1);
  const stored = writes[0].Body.toString();
  assert.doesNotMatch(stored, /alert|onmouseover/);
  assert.match(stored, /<path/);
  assert.equal(writes[0].ContentType, 'image/svg+xml');
  assert.equal(file.size, Buffer.byteLength(stored));
  assert.equal(writes[0].ContentLength, file.size);
  assert.deepEqual([file.width, file.height], [32, 24]);
  assert.equal(verifySvgReceipt(file, file.svgProof), true);
  for (const changed of [
    { ...file, src: file.src + 'other' },
    { ...file, size: 1 },
    { ...file, width: 100 },
  ])
    assert.equal(verifySvgReceipt(changed, file.svgProof), false);
  assert.equal(verifySvgReceipt(file, 'forged'), false);
  // Direct signing never exposes an SVG PUT URL that could bypass the sanitizer.
  const signed = await handle(
    new Request(`${origin}/api/cms/uploads?kind=media`, {
      method: 'POST',
      headers: { origin, 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'image/svg+xml', size: 20 }),
    }),
  );
  assert.equal(signed.status, 400);
});

test('UploadThing server upload receives sanitised SVG bytes rather than the original', async (t) => {
  env(t, { SEDNA_SECRET: 'test-svg-secret' });
  let uploaded;
  t.mock.method(UTApi.prototype, 'uploadFiles', async (file) => {
    uploaded = file;
    return { data: { ufsUrl: 'https://this-app.ufs.sh/f/safe' }, error: null };
  });
  const handle = createUploadApi({ storage: uploadthingStorage(), origin, getSession: session });
  const response = await handle(request(svg('<script>alert(1)</script><circle r="4"/>')));
  assert.equal(response.status, 200, await response.clone().text());
  assert.equal(uploaded.type, 'image/svg+xml');
  assert.doesNotMatch(await uploaded.text(), /script|alert/);
  assert.match(await uploaded.text(), /circle/);
});

test('SVG requests enforce origin, authentication, stream size and validity before any storage write', async (t) => {
  let writes = 0;
  t.mock.method(S3Client.prototype, 'send', async () => {
    writes++;
    return {};
  });
  const handle = createUploadApi({ storage: s3Storage(), origin, getSession: session });
  assert.equal((await handle(request(svg(), { origin: 'https://evil.example' }))).status, 403);
  const denied = createUploadApi({
    storage: s3Storage(),
    origin,
    getSession: async () => ({ session: null, headers: new Headers() }),
  });
  assert.equal((await denied(request(svg()))).status, 401);
  const uploadthingDenied = createUploadApi({
    storage: uploadthingStorage(),
    origin,
    getSession: async () => ({ session: null, headers: new Headers() }),
  });
  assert.equal(
    (await uploadthingDenied(request(svg(), { 'uploadthing-hook': 'callback' }))).status,
    401,
  );
  assert.equal((await handle(request('x'.repeat(MAX_SVG_BYTES + 1)))).status, 413);
  assert.equal((await handle(request('<svg>'))).status, 400);
  assert.equal((await handle(request(svg(), { 'content-type': 'text/plain' }))).status, 415);
  assert.equal(writes, 0);
});

test('public media registration rejects SVGs without a valid sanitised-upload receipt', async (t) => {
  env(t, { SEDNA_S3_PUBLIC_URL: 'https://images.example.com', SEDNA_SECRET: 'test-svg-secret' });
  const file = {
    name: 'logo.svg',
    src: 'https://images.example.com/sedna/01d5f985-6267-47a6-b395-680c93294a6e.svg',
    type: 'image/svg+xml',
    size: 100,
    width: 32,
    height: 24,
  };
  const handle = createMediaApi({
    db: {
      connect() {
        throw new Error('Must not access the database');
      },
    },
    storage: s3Storage(),
    origin,
    getSession: session,
  });
  for (const svgProof of [undefined, 'forged', svgReceipt({ ...file, src: file.src + 'other' })]) {
    const response = await handle(
      new Request(`${origin}/api/cms/media`, {
        method: 'POST',
        headers: { origin, 'content-type': 'application/json' },
        body: JSON.stringify({ ...file, svgProof }),
      }),
    );
    assert.equal(response.status, 400);
  }
  assert.equal(maxMediaBytes('application/pdf'), 0);
});
