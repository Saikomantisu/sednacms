import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createCacheMiddleware, markContentRequest } from '../dist/cache.js';
import sedna from '../dist/index.js';

function context(headers = {}, method = 'GET') {
  return {
    request: new Request('https://site.example/packages', { method, headers }),
    isPrerendered: false,
  };
}
const response = (headers = {}, status = 200) => new Response('content', { status, headers });
const content = async (result = response()) => {
  markContentRequest();
  return result;
};

test('default CMS responses forbid storage, including empty and missing content', async () => {
  for (const cache of [undefined, false]) {
    const handle = createCacheMiddleware(cache);
    const result = await handle(context(), () =>
      content(response({ 'Cache-Control': 'public, max-age=3600' })),
    );
    assert.equal(result.headers.get('Cache-Control'), 'no-store');
    assert.equal(await result.text(), 'content');
  }
});

test('TTL caching applies only to anonymous successful content responses', async () => {
  const handle = createCacheMiddleware({ ttl: 17 });
  const cached = await handle(context(), () => content(response({ Vary: 'Accept-Language' })));
  assert.equal(
    cached.headers.get('Cache-Control'),
    'public, max-age=0, s-maxage=17, must-revalidate',
  );
  assert.equal(cached.headers.get('Vary'), 'Accept-Language, Cookie, Authorization');
  const head = await handle(context({}, 'HEAD'), () => content());
  assert.match(head.headers.get('Cache-Control'), /s-maxage=17/);
  for (const [requestContext, result] of [
    [context({ Cookie: 'session=private' }), response()],
    [context({ Authorization: 'Bearer private' }), response()],
    [context(), response({ 'Set-Cookie': 'session=private' })],
    [context({}, 'POST'), response()],
    [context(), response({}, 404)],
    [context(), response({}, 500)],
    [context(), response({ Vary: '*' })],
  ]) {
    const res = await handle(requestContext, () => content(result));
    assert.equal(res.headers.get('Cache-Control'), 'no-store');
  }
});

test('TTL caching preserves explicit page policies, cookies, redirects, and loader failures', async () => {
  const handle = createCacheMiddleware({ ttl: 60 });
  for (const policy of ['no-store', 'private, max-age=0']) {
    const result = await handle(context(), () => content(response({ 'Cache-Control': policy })));
    assert.equal(result.headers.get('Cache-Control'), policy);
  }
  const redirected = await handle(context(), () =>
    content(Response.redirect('https://site.example/404')),
  );
  assert.equal(redirected.status, 302);
  assert.equal(redirected.headers.get('Cache-Control'), 'no-store');
  const failed = await handle(context(), async () => {
    markContentRequest(true);
    return response();
  });
  assert.equal(failed.headers.get('Cache-Control'), 'no-store');
  const privatePage = await handle(context(), () =>
    content(response({ 'Set-Cookie': 'one=1; HttpOnly', 'Cache-Control': 'public' })),
  );
  assert.equal(privatePage.headers.get('Set-Cookie'), 'one=1; HttpOnly');
});

test('concurrent CMS and unrelated requests do not share cache policy', async () => {
  const handle = createCacheMiddleware();
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const cmsRequest = handle(context(), async () => {
    markContentRequest();
    await gate;
    return response();
  });
  const unrelated = await handle(context(), async () => {
    await Promise.resolve();
    release();
    return response({ 'Cache-Control': 'max-age=300' });
  });
  assert.equal(unrelated.headers.get('Cache-Control'), 'max-age=300');
  assert.equal((await cmsRequest).headers.get('Cache-Control'), 'no-store');
  const later = await handle(context(), () => response());
  assert.equal(later.headers.has('Cache-Control'), false);
});

test('prerendered pages reading collections warn once per route and stay uncached', async (t) => {
  const warnings = [];
  t.mock.method(console, 'warn', (message) => warnings.push(message));
  const handle = createCacheMiddleware({ ttl: 60 });
  const prerendered = (path) => ({
    request: new Request(`https://site.example${path}`),
    isPrerendered: true,
    routePattern: '/posts/[slug]',
  });
  for (const path of ['/posts/a', '/posts/b']) {
    const result = await handle(prerendered(path), async () => {
      markContentRequest(false, 'posts');
      return response();
    });
    assert.equal(result.headers.get('Cache-Control'), null);
  }
  await handle({ ...prerendered('/about'), routePattern: '/about' }, async () => response());
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /^\d\d:\d\d:\d\d \[WARN\] \[sednacms\] /);
  assert.equal(
    warnings[0].replace(/^.*?\[sednacms\] /, ''),
    [
      '`/posts/[slug]` is prerendered but reads Sedna collection "posts".',
      '  Hint:',
      '    Its content is frozen at build time, so CMS changes will not appear until the next build.',
      '',
      '    If this page should show live content, set `export const prerender = false;` in the page.',
    ].join('\n'),
  );
});

test('invalid cache configuration fails during integration setup', () => {
  for (const ttl of [0, -1, 1.5, NaN, Infinity, '60', Number.MAX_SAFE_INTEGER + 1])
    assert.throws(() => sedna({ cache: { ttl } }), /cache.ttl must be a positive integer/);
  assert.doesNotThrow(() => sedna({ cache: false }));
  assert.doesNotThrow(() => sedna({ cache: { ttl: 60 } }));
});
