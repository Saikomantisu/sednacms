import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { test } from 'node:test';
import { Pool } from 'pg';
import { createContentApi } from '../dist/api/content.js';
import { createPool } from '../dist/db/client.js';
import { fields } from '../dist/fields.js';

const databaseURL = process.env.SEDNA_TEST_DATABASE_URL;
test('production Astro API creates and publishes live content', {
  skip: !databaseURL,
  timeout: 120000,
}, async () => {
  const admin = new Pool({ connectionString: databaseURL });
  const schema = 'sedna_test_' + randomUUID().replaceAll('-', '');
  const url = new URL(databaseURL);
  url.hostname = url.hostname.replace('-pooler.', '.');
  url.searchParams.set('options', `-c search_path=${schema}`);
  const origin = 'http://127.0.0.1:14329';
  const token = randomUUID();
  const password = randomUUID();
  let server;
  let logs = '';
  let cookie = '';
  const call = async (path, method = 'GET', body, headers = {}) => {
    const response = await fetch(origin + path, {
      method,
      headers: { origin, cookie, 'content-type': 'application/json', ...headers },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      redirect: 'manual',
    });
    // Apply refreshed and cleared cookies just as the browser does, including on logout.
    const jar = new Map(
      cookie
        .split('; ')
        .filter(Boolean)
        .map((value) => {
          const split = value.indexOf('=');
          return [value.slice(0, split), value.slice(split + 1)];
        }),
    );
    for (const value of response.headers.getSetCookie()) {
      const pair = value.split(';')[0];
      const split = pair.indexOf('=');
      const name = pair.slice(0, split);
      if (/Max-Age=0(?:;|$)/i.test(value)) jar.delete(name);
      else jar.set(name, pair.slice(split + 1));
    }
    cookie = Array.from(jar, ([name, value]) => name + '=' + value).join('; ');
    return response;
  };
  const expect = async (path, method, body, status = 200, headers) => {
    const response = await call(path, method, body, headers);
    assert.equal(
      response.status,
      status,
      `${method} ${path}: ${await response.clone().text()}\n${logs}`,
    );
    assert.equal(response.headers.get('cache-control'), 'no-store');
    return status === 204 ? null : response.json();
  };
  try {
    await admin.query(`CREATE SCHEMA ${schema}`);
    server = spawn(process.execPath, ['playground/dist/server/entry.mjs'], {
      env: {
        ...process.env,
        HOST: '127.0.0.1',
        PORT: '14329',
        SEDNA_DATABASE_URL: url.href,
        SEDNA_URL: origin,
        SEDNA_SECRET: randomUUID(),
        SEDNA_SETUP_TOKEN: token,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    server.stdout.on('data', (chunk) => {
      logs += chunk;
    });
    server.stderr.on('data', (chunk) => {
      logs += chunk;
    });
    for (let attempt = 0; ; attempt++) {
      try {
        await fetch(origin + '/');
        break;
      } catch {
        if (attempt > 100 || server.exitCode !== null)
          throw new Error('Server did not start: ' + logs);
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
    const adminPage = await fetch(origin + '/admin');
    assert.equal(adminPage.status, 200);
    assert.equal(adminPage.headers.get('cache-control'), 'no-store');
    assert.equal(adminPage.headers.get('x-frame-options'), 'DENY');
    const html = await adminPage.text();
    assert.match(html, /<title>Sedna/);
    const script = html.match(/<script[^>]+src="([^"]+)"/);
    assert.ok(script, 'admin client script is bundled');
    assert.equal((await fetch(origin + script[1])).status, 200);
    await expect('/api/cms/schema', 'GET', undefined, 401);
    await expect('/api/cms/uploads', 'GET', undefined, 401);
    await expect('/api/cms/collections/packages', 'POST', { data: { title: 'Unauthorized' } }, 401);
    await expect(
      '/api/cms/setup',
      'POST',
      { name: 'Test Admin', email: 'admin@example.com', password },
      201,
      { 'x-sedna-setup-token': token },
    );
    const login = await call('/api/cms/auth/sign-in/email', 'POST', {
      email: 'admin@example.com',
      password,
    });
    assert.equal(login.status, 200, await login.clone().text());
    cookie = login.headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; ');
    const config = await expect('/api/cms/schema', 'GET');
    assert.equal(config.collections[0].collection, 'packages');
    assert.equal(config.collections[0].fields.title.required, true);
    const uploadConfig = await expect('/api/cms/uploads', 'GET');
    assert.equal(uploadConfig.provider, 'uploadthing');
    await expect('/api/cms/uploads?slug=image&actionType=upload', 'POST', {}, 403, {
      origin: 'https://evil.example',
    });
    const base = '/api/cms/collections/packages';
    const { entry: blank } = await expect(base, 'POST', { data: {} }, 201);
    await expect(`${base}/${blank.id}`, 'PATCH', { status: 'published' }, 400);
    await expect(`${base}/${blank.id}`, 'DELETE', undefined, 204);
    await expect(base, 'POST', { data: { title: 'Bad', price: '123' } }, 400);
    await expect(base, 'POST', { data: { id: randomUUID() } }, 400);
    const { entry } = await expect(
      base,
      'POST',
      {
        data: {
          title: 'API Test Package',
          price: 123,
          cover: { src: 'https://example.com/photo.jpg', width: 800, height: 600, alt: 'Photo' },
        },
      },
      201,
    );
    assert.equal(entry.data.slug, 'api-test-package');
    assert.equal(entry.status, 'draft');
    assert.equal(entry.published_at, null);
    assert.equal(entry.data.cover.width, 800);
    assert.ok(!(await (await fetch(origin + '/')).text()).includes('API Test Package'));
    await expect(base, 'POST', { data: { title: 'API Test Package' } }, 409);
    const { entry: published } = await expect(
      `${base}/${entry.id}`,
      'PATCH',
      { status: 'published' },
      200,
    );
    assert.ok(Number.isFinite(Date.parse(published.published_at)));
    assert.ok((await (await fetch(origin + '/')).text()).includes('API Test Package'));
    assert.ok(
      (await (await fetch(origin + '/packages/api-test-package')).text()).includes(
        'API Test Package',
      ),
    );
    const { entry: edited } = await expect(`${base}/${entry.id}`, 'PATCH', {
      data: { title: 'Updated Package' },
    });
    assert.equal(edited.published_at, published.published_at, 'editing preserves publication date');
    const detail = await (await fetch(origin + '/packages/api-test-package')).text();
    assert.match(detail, /alt="Photo"/);
    assert.match(detail, /width="800"/);
    assert.ok(detail.includes('Updated Package'));
    const { entry: second } = await expect(
      base,
      'POST',
      { data: { title: 'Second Package' } },
      201,
    );
    await expect(base + '/reorder', 'POST', { ids: [second.id, entry.id] });
    const list = await expect(base, 'GET');
    assert.deepEqual(
      list.entries.map((item) => item.id),
      [second.id, entry.id],
    );
    assert.equal(
      list.entries[1].published_at,
      published.published_at,
      'reordering preserves publication date',
    );
    const ids = (result) => result.entries.map((item) => item.id);
    assert.deepEqual(ids(await expect(base + '?status=draft', 'GET')), [second.id]);
    assert.deepEqual(
      ids(await expect(base + '?status=published&limit=1', 'GET')),
      [entry.id],
      'filter before pagination',
    );
    assert.deepEqual(ids(await expect(base + '?status=published&limit=1&offset=1', 'GET')), []);
    const range = new URLSearchParams({
      published_from: published.published_at,
      published_before: new Date(Date.parse(published.published_at) + 1).toISOString(),
    });
    assert.deepEqual(ids(await expect(base + '?' + range, 'GET')), [entry.id]);
    assert.deepEqual(
      ids(
        await expect(
          base + '?published_before=' + encodeURIComponent(published.published_at),
          'GET',
        ),
      ),
      [],
      'upper boundary is exclusive',
    );
    await expect(base + '?status=invalid', 'GET', undefined, 400);
    await expect(base + '?published_from=invalid', 'GET', undefined, 400);
    await expect(base + '?published_before=2026-02-30T00:00:00.000Z', 'GET', undefined, 400);
    await expect(
      base + '?published_from=2026-11-02T00:00:00.000Z&published_before=2026-11-01T00:00:00.000Z',
      'GET',
      undefined,
      400,
    );
    await expect(base + '/reorder', 'POST', { ids: [entry.id, entry.id] }, 400);
    await expect(base + '/reorder', 'POST', { ids: [randomUUID(), entry.id] }, 404);
    assert.deepEqual(
      (await expect(base, 'GET')).entries.map((item) => item.id),
      [second.id, entry.id],
      'failed reorder rolls back',
    );
    await expect(base + '?limit=1&offset=1', 'GET');
    await expect(base + '?limit=101', 'GET', undefined, 400);
    await expect(`${base}/${entry.id}`, 'PATCH', { data: { price: 999 } }, 403, {
      origin: 'https://evil.example',
    });
    await expect('/api/cms/collections/sedna__user', 'GET', undefined, 404);
    await expect(`${base}/${randomUUID()}`, 'GET', undefined, 404);
    await expect(`${base}/${entry.id}`, 'DELETE', undefined, 204);
    await expect(`${base}/${second.id}`, 'DELETE', undefined, 204);
    assert.ok(!(await (await fetch(origin + '/')).text()).includes('Updated Package'));
    // Exercise the remaining field types against the same isolated database.
    const db = createPool(url.href);
    try {
      const extra = createContentApi({
        db,
        origin,
        getSession: async () => ({ session: { user: {} }, headers: new Headers() }),
        collections: [
          {
            collection: 'field_checks',
            fields: {
              title: fields.text({ required: true }),
              day: fields.date(),
              enabled: fields.boolean(),
              body: fields.richText(),
            },
          },
        ],
      });
      const write = (data) =>
        extra(
          new Request(origin + '/api/cms/collections/field_checks', {
            method: 'POST',
            headers: { origin, 'content-type': 'application/json' },
            body: JSON.stringify({ data, status: 'published' }),
          }),
        );
      assert.equal((await write({ title: 'Calendar', day: '2026-02-29' })).status, 400);
      assert.equal((await write({ title: 'Calendar', enabled: 'true' })).status, 400);
      const valid = await write({
        title: 'Calendar',
        day: '2028-02-29',
        enabled: false,
        body: '<p>Body</p>',
      });
      assert.equal(valid.status, 201);
      const saved = (await valid.json()).entry;
      assert.equal(saved.data.day, '2028-02-29');
      assert.equal(saved.data.enabled, false);
      assert.equal(saved.data.body, '<p>Body</p>');
    } finally {
      await db.end();
    }
    await expect('/api/cms/auth/sign-out', 'POST', {});
    await expect(base, 'GET', undefined, 401);
  } finally {
    if (server && server.exitCode === null) {
      server.kill('SIGTERM');
      await once(server, 'exit');
    }
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
  }
});
