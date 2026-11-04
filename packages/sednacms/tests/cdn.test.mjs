import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Pool } from 'pg';
import { createContentApi } from '../dist/api/content.js';
import { createCacheMiddleware, markContentRequest } from '../dist/cache.js';
import { createCdnCache } from '../dist/cdn.js';
import { fields } from '../dist/fields.js';
import { sednaLoader } from '../dist/loader.js';

const env = {
  SEDNA_NETLIFY_TOKEN: 'netlify-secret',
  SITE_ID: 'site-id',
  SEDNA_VERCEL_TOKEN: 'vercel-secret',
  VERCEL_PROJECT_ID: 'project-id',
  VERCEL_ORG_ID: 'team-id',
  SEDNA_CLOUDFLARE_TOKEN: 'cloudflare-secret',
  SEDNA_CLOUDFLARE_ZONE_ID: 'zone-id',
};
const context = (headers = {}, path = '/blog') => ({
  request: new Request(`https://site.example${path}`, { headers }),
  isPrerendered: false,
});
const render = (headers = {}, status = 200) => {
  markContentRequest(false, 'posts');
  return new Response('HTML', { headers, status });
};

test('provider cache headers tag all collections and preserve page variations', async () => {
  for (const [platform, control, tags] of [
    ['netlify', 'Netlify-CDN-Cache-Control', 'Netlify-Cache-Tag'],
    ['vercel', 'Vercel-CDN-Cache-Control', 'Vercel-Cache-Tag'],
    ['cloudflare', 'Cloudflare-CDN-Cache-Control', 'Cache-Tag'],
  ]) {
    const cdn = createCdnCache(platform, env);
    const handle = createCacheMiddleware({ ttl: 300 }, cdn);
    const response = await handle(context(), () => {
      markContentRequest(false, 'authors');
      return render({ Vary: 'Accept-Language', [tags]: 'existing' });
    });
    assert.match(response.headers.get(control), /max-age=300/);
    assert.equal(response.headers.get(tags), 'existing,sedna:authors,sedna:posts');
    assert.match(response.headers.get('Vary'), /Accept-Language/);
    assert.equal(response.headers.get('Vary').includes('Cookie'), platform !== 'vercel');
    assert.equal(response.headers.get(control).includes('durable'), platform === 'netlify');
    const explicit = await handle(context(), () => render({ Vary: 'Cookie' }));
    assert.match(explicit.headers.get('Vary'), /Cookie/);
  }
});

test('private, failed, admin, and disabled responses override even targeted cache headers', async () => {
  for (const platform of ['netlify', 'vercel', 'cloudflare']) {
    const cdn = createCdnCache(platform, env);
    const handle = createCacheMiddleware({ ttl: 300 }, cdn);
    for (const [ctx, headers, status, failed] of [
      [context({ Cookie: 'sedna.session_token=private' }), {}, 200],
      [context({ Authorization: 'Bearer private' }), {}, 200],
      [context(), { 'Set-Cookie': 'private=1' }, 200],
      [context(), {}, 500],
      [context(), {}, 200, true],
      [context({}, '/admin'), {}, 200],
      [context({}, '/api/cms/schema'), {}, 200],
      [context(), { Vary: '*' }, 200],
    ]) {
      const result = await handle(ctx, () => {
        if (failed) markContentRequest(true);
        return render(
          { [cdn.controlHeader]: 'public, max-age=999', [cdn.tagHeader]: 'private', ...headers },
          status,
        );
      });
      assert.equal(result.headers.get('Cache-Control'), 'no-store');
      assert.equal(result.headers.get(cdn.controlHeader), 'no-store');
      assert.equal(result.headers.has(cdn.tagHeader), false);
    }
    for (const policy of ['private, max-age=0', 'no-store', 'public, max-age=12']) {
      const response = await handle(context(), () =>
        render({ 'Cache-Control': policy, [cdn.controlHeader]: 'public, max-age=999' }),
      );
      assert.equal(response.headers.get('Cache-Control'), policy);
      assert.equal(response.headers.get(cdn.controlHeader), 'no-store');
    }
    const disabled = await createCacheMiddleware(false, cdn)(context(), () => render());
    assert.equal(disabled.headers.get(cdn.controlHeader), 'no-store');
  }
});

test('collection dependencies do not cross concurrent requests', async () => {
  const cdn = createCdnCache('netlify', env);
  const handle = createCacheMiddleware({ ttl: 300 }, cdn);
  const results = await Promise.all(
    ['posts', 'authors'].map((collection) =>
      handle(context(), async () => {
        markContentRequest(false, collection);
        await Promise.resolve();
        return new Response(collection);
      }),
    ),
  );
  assert.deepEqual(
    results.map((result) => result.headers.get(cdn.tagHeader)),
    ['sedna:posts', 'sedna:authors'],
  );
});

test('purges use documented stable endpoints, authentication, tags, and bounded timeouts', async () => {
  for (const platform of ['netlify', 'vercel', 'cloudflare']) {
    const calls = [];
    const cdn = createCdnCache(platform, env, async (url, init) => {
      calls.push({ url: new URL(url), ...init });
      return platform === 'cloudflare'
        ? Response.json({ success: true })
        : new Response(null, { status: 202 });
    });
    await cdn.purge('posts');
    const call = calls[0];
    assert.equal(call.method, 'POST');
    assert.equal(call.headers.Authorization, `Bearer ${platform}-secret`);
    assert.equal(call.redirect, 'error');
    assert.ok(call.signal instanceof AbortSignal);
    const body = JSON.parse(call.body);
    if (platform === 'netlify') {
      assert.equal(call.url.href, 'https://api.netlify.com/api/v1/purge');
      assert.deepEqual(body, { site_id: 'site-id', cache_tags: ['sedna:posts'] });
    } else if (platform === 'vercel') {
      assert.equal(call.url.pathname, '/v1/edge-cache/dangerously-delete-by-tags');
      assert.equal(call.url.searchParams.get('projectIdOrName'), 'project-id');
      assert.equal(call.url.searchParams.get('teamId'), 'team-id');
      assert.deepEqual(body, { tags: ['sedna:posts'], revalidationDeadlineSeconds: 0 });
    } else {
      assert.equal(call.url.href, 'https://api.cloudflare.com/client/v4/zones/zone-id/purge_cache');
      assert.deepEqual(body, { tags: ['sedna:posts'] });
    }
    await assert.rejects(
      createCdnCache(
        platform,
        env,
        async () => new Response('provider-secret', { status: 429 }),
      ).purge('posts'),
      (error) => !error.message.includes('secret') && error.message.includes('429'),
    );
    await assert.rejects(
      createCdnCache(platform, env, async () => {
        throw new Error('network failure');
      }).purge('posts'),
    );
  }
  await assert.rejects(
    createCdnCache('cloudflare', env, async () => Response.json({ success: false })).purge('posts'),
  );
});

test('missing purge credentials fail before emitting cacheable responses', () => {
  assert.equal(createCdnCache('none', {}), undefined);
  for (const platform of ['netlify', 'vercel', 'cloudflare']) {
    assert.throws(() => createCdnCache(platform, {}), /is required/);
    assert.throws(
      () => createCdnCache(platform, { [`SEDNA_${platform.toUpperCase()}_TOKEN`]: 'secret' }),
      /is required/,
    );
  }
});

const origin = 'https://site.example';
const id = '00000000-0000-0000-0000-000000000001';
const config = { collection: 'posts', fields: { title: fields.text({ required: true }) } };

// Transaction-aware database boundary fixture. Public loader queries below use the
// same rows, allowing the test to observe reads and published output across saves.
function fixture(invalidate) {
  const rows = new Map();
  let snapshot;
  let active = false;
  let failCommit = false;
  const result = (rows = []) => ({ rows, rowCount: rows.length });
  const db = {
    async connect() {
      return { query: db.query, release() {} };
    },
    async query(sql, args = []) {
      const text = sql.trim().toLowerCase();
      if (text === 'begin') {
        active = true;
        snapshot = structuredClone(rows);
      } else if (text === 'commit') {
        if (failCommit) throw new Error('commit failed');
        active = false;
      } else if (text === 'rollback') {
        rows.clear();
        for (const [id, row] of snapshot) rows.set(id, row);
        active = false;
      } else if (text.startsWith('delete from')) {
        const row = rows.get(args[0]);
        rows.delete(args[0]);
        return result(row ? [row] : []);
      } else if (text.startsWith('select * from'))
        return result(rows.has(args[0]) ? [rows.get(args[0])] : []);
      else if (text.startsWith('select id, status from'))
        return result(args[0].flatMap((id) => (rows.has(id) ? [rows.get(id)] : [])));
      else if (
        text.startsWith('insert into') ||
        (text.startsWith('update ') && !text.includes('unnest'))
      ) {
        const previous = rows.get(id);
        const row = {
          id,
          title: args[0],
          status: args[1],
          sort_order: 0,
          created_at: new Date(),
          updated_at: new Date(),
          published_at: previous?.published_at ?? null,
        };
        rows.set(id, row);
        return result([row]);
      }
      return result();
    },
  };
  let session = true;
  const api = createContentApi({
    collections: [config],
    db,
    origin,
    getSession: async () => ({ session, headers: new Headers() }),
    invalidate: async (collection) => {
      assert.equal(active, false, 'purge runs after commit');
      await invalidate(collection);
    },
  });
  return {
    rows,
    api,
    failCommit: () => {
      failCommit = true;
    },
    signOut: () => {
      session = false;
    },
    call: (method, body, path = '', headers = {}) =>
      api(
        new Request(`${origin}/api/cms/collections/posts${path}`, {
          method,
          headers: { origin, 'content-type': 'application/json', ...headers },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        }),
      ),
  };
}

test('only committed changes affecting published content trigger invalidation', async () => {
  const purges = [];
  const f = fixture(async (collection) => purges.push(collection));
  assert.equal((await f.call('POST', { data: { title: 'Draft' } })).status, 201);
  assert.equal((await f.call('PATCH', { data: { title: 'Still draft' } }, `/${id}`)).status, 200);
  await f.call('POST', { ids: [id] }, '/reorder');
  assert.equal(purges.length, 0);
  for (const body of [
    { status: 'published' },
    { data: { title: 'Edited' } },
    { status: 'draft' },
  ]) {
    assert.equal((await f.call('PATCH', body, `/${id}`)).status, 200);
  }
  assert.equal(purges.length, 3, 'publish, edit, and unpublish');
  assert.equal((await f.call('DELETE', undefined, `/${id}`)).status, 204);
  assert.equal(purges.length, 3, 'deleting a draft leaves cache alone');
  assert.equal(
    (await f.call('POST', { data: { title: 'Published' }, status: 'published' })).status,
    201,
  );
  assert.equal((await f.call('POST', { ids: [id] }, '/reorder')).status, 200);
  assert.equal(purges.length, 5, 'published create and reorder');
  assert.equal((await f.call('DELETE', undefined, `/${id}`)).status, 204);
  assert.deepEqual(purges, Array(6).fill('posts'));
  assert.equal((await f.call('DELETE', undefined, `/${id}`)).status, 404);
  assert.equal((await f.call('POST', { status: 'published' })).status, 400);
  assert.equal(purges.length, 6);
});

test('unauthorized, invalid, and rolled-back operations never purge', async () => {
  let purges = 0;
  const f = fixture(async () => purges++);
  await f.call('POST', { data: { title: 'Draft' } });
  assert.equal(
    (await f.call('POST', { ids: [id, '00000000-0000-0000-0000-000000000002'] }, '/reorder'))
      .status,
    404,
  );
  assert.equal(
    (await f.call('PATCH', { status: 'published' }, `/${id}`, { origin: 'https://evil.example' }))
      .status,
    403,
  );
  f.failCommit();
  await assert.rejects(f.call('PATCH', { status: 'published' }, `/${id}`), /commit failed/);
  assert.equal(f.rows.get(id).status, 'draft');
  f.signOut();
  assert.equal((await f.call('PATCH', { status: 'published' }, `/${id}`)).status, 401);
  assert.equal(purges, 0);
});

test('purge failures preserve successful saves and deletes and report a warning', async (t) => {
  t.mock.method(console, 'warn', () => {});
  const f = fixture(async () => {
    throw new Error('credential-secret');
  });
  const saved = await f.call('POST', { data: { title: 'Saved' }, status: 'published' });
  assert.equal(saved.status, 201);
  assert.equal(saved.headers.get('X-Sedna-Cache'), 'purge-failed');
  assert.equal((await saved.json()).entry.data.title, 'Saved');
  const deleted = await f.call('DELETE', undefined, `/${id}`);
  assert.equal(deleted.status, 204);
  assert.equal(deleted.headers.get('X-Sedna-Cache'), 'purge-failed');
  assert.equal(f.rows.size, 0);
  assert.ok(!console.warn.mock.calls.some((call) => call.arguments.join().includes('secret')));
});

test('the dashboard warns about failed purges without treating saved content as an error', async (t) => {
  const { api } = await import('../dist/admin/api.js');
  const { setAdminAdapter } = await import('../dist/admin/adapter.js');
  const { toast } = await import('../dist/admin/toasts.js');
  const warning = t.mock.method(toast, 'warning', () => {});
  setAdminAdapter({
    async request(_path, method) {
      const headers = { 'X-Sedna-Cache': 'purge-failed' };
      return method === 'DELETE'
        ? new Response(null, { status: 204, headers })
        : Response.json({ entry: { id } }, { status: 201, headers });
    },
  });
  t.after(() => setAdminAdapter(null));
  assert.deepEqual(await api('collections/posts', 'POST', {}), { entry: { id } });
  assert.equal(await api(`collections/posts/${id}`, 'DELETE'), null);
  assert.equal(warning.mock.callCount(), 2);
  assert.equal(warning.mock.calls[0].arguments[1].duration, Infinity);
});

test('cached refreshes skip loader reads and publishing regenerates all affected pages', async (t) => {
  const stored = new Map();
  const cdn = createCdnCache('netlify', env, async (_url, init) => {
    const { cache_tags } = JSON.parse(init.body);
    for (const [url, response] of stored) {
      if (
        cache_tags.some((tag) => response.headers.get('Netlify-Cache-Tag').split(',').includes(tag))
      )
        stored.delete(url);
    }
    return new Response(null, { status: 202 });
  });
  const f = fixture(cdn.purge);
  await f.call('POST', { data: { title: 'Original' }, status: 'published' });
  const previous = process.env.SEDNA_DATABASE_URL;
  process.env.SEDNA_DATABASE_URL = 'postgres://localhost/unused';
  t.after(() => {
    if (previous === undefined) delete process.env.SEDNA_DATABASE_URL;
    else process.env.SEDNA_DATABASE_URL = previous;
  });
  let reads = 0;
  t.mock.method(Pool.prototype, 'query', async (sql) => {
    if (sql.startsWith('select "id"')) {
      reads++;
      return { rows: [...f.rows.values()].filter((row) => row.status === 'published') };
    }
    return { rows: [] };
  });
  const loader = sednaLoader(config);
  const middleware = createCacheMiddleware({ ttl: 300 }, cdn);
  // A CDN boundary simulator honors tags and only invokes Astro on cache misses.
  const visit = async (path) => {
    if (stored.has(path)) return stored.get(path).clone();
    const response = await middleware(context({}, path), async () => {
      const { entries } = await loader.loadCollection({});
      return new Response(entries.map((entry) => entry.data.title).join(','));
    });
    assert.match(response.headers.get(cdn.controlHeader), /max-age=300/);
    stored.set(path, response.clone());
    return response;
  };
  assert.equal(await (await visit('/blog')).text(), 'Original');
  await visit('/blog?page=2');
  for (let i = 0; i < 5; i++) assert.equal(await (await visit('/blog')).text(), 'Original');
  assert.equal(reads, 2, 'one read per cached URL, including query strings');
  await f.call('PATCH', { data: { title: 'Updated' } }, `/${id}`);
  assert.equal(stored.size, 0, 'publishing invalidates every page using the collection');
  assert.equal(await (await visit('/blog')).text(), 'Updated');
  await visit('/blog');
  assert.equal(reads, 3);
  await f.call('DELETE', undefined, `/${id}`);
  assert.equal(await (await visit('/blog')).text(), '');
  assert.equal(reads, 4);
  await f.call('POST', { data: { title: 'A draft' } });
  assert.equal(await (await visit('/blog')).text(), '');
  assert.equal(reads, 4, 'a draft save preserves the cached empty collection');
  await f.call('PATCH', { status: 'published' }, `/${id}`);
  assert.equal(await (await visit('/blog')).text(), 'A draft');
  assert.equal(reads, 5, 'publishing invalidates previously empty pages too');
});
