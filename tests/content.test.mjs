import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { Pool } from 'pg';
import { createSql } from '../dist/db/client.js';
import { createContentApi } from '../dist/api/content.js';
import { fields } from '../dist/fields.js';

const databaseURL = process.env.SEDNA_TEST_DATABASE_URL;
test('production Astro API creates and publishes live content', { skip: !databaseURL, timeout: 120000 }, async () => {
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
  const call = async (path, method = 'GET', body, headers = {}) => fetch(origin + path, {
    method, headers: { origin, cookie, 'content-type': 'application/json', ...headers },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}), redirect: 'manual',
  });
  const expect = async (path, method, body, status = 200, headers) => {
    const response = await call(path, method, body, headers);
    assert.equal(response.status, status, `${method} ${path}: ${await response.clone().text()}\n${logs}`);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    return status === 204 ? null : response.json();
  };
  try {
    await admin.query(`CREATE SCHEMA ${schema}`);
    server = spawn(process.execPath, ['playground/dist/server/entry.mjs'], {
      env: { ...process.env, HOST: '127.0.0.1', PORT: '14329', SEDNA_DATABASE_URL: url.href, SEDNA_URL: origin, SEDNA_SECRET: randomUUID(), SEDNA_SETUP_TOKEN: token },
      stdio: ['ignore','pipe','pipe'],
    });
    server.stdout.on('data', chunk => { logs += chunk; });
    server.stderr.on('data', chunk => { logs += chunk; });
    for (let attempt = 0; ; attempt++) {
      try { await fetch(origin + '/'); break; } catch {
        if (attempt > 100 || server.exitCode !== null) throw new Error('Server did not start: ' + logs);
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    await expect('/api/cms/schema', 'GET', undefined, 401);
    await expect('/api/cms/collections/packages', 'POST', { data: { title: 'Unauthorized' } }, 401);
    await expect('/api/cms/setup', 'POST', { name: 'Test Admin', email: 'admin@example.com', password }, 201, { 'x-sedna-setup-token': token });
    const login = await call('/api/cms/auth/sign-in/email', 'POST', { email: 'admin@example.com', password });
    assert.equal(login.status, 200, await login.clone().text());
    cookie = login.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
    const config = await expect('/api/cms/schema', 'GET');
    assert.equal(config.collections[0].collection, 'packages');
    assert.equal(config.collections[0].fields.title.required, true);
    const base = '/api/cms/collections/packages';
    const { entry: blank } = await expect(base, 'POST', { data: {} }, 201);
    await expect(`${base}/${blank.id}`, 'PATCH', { status: 'published' }, 400);
    await expect(`${base}/${blank.id}`, 'DELETE', undefined, 204);
    await expect(base, 'POST', { data: { title: 'Bad', price: '123' } }, 400);
    await expect(base, 'POST', { data: { id: randomUUID() } }, 400);
    const { entry } = await expect(base, 'POST', { data: { title: 'API Test Package', price: 123, cover: { src: 'https://example.com/photo.jpg', width: 800, height: 600, alt: 'Photo' } } }, 201);
    assert.equal(entry.data.slug, 'api-test-package');
    assert.equal(entry.status, 'draft');
    assert.equal(entry.data.cover.width, 800);
    assert.ok(!(await (await fetch(origin + '/')).text()).includes('API Test Package'));
    await expect(base, 'POST', { data: { title: 'API Test Package' } }, 409);
    await expect(`${base}/${entry.id}`, 'PATCH', { status: 'published' }, 200);
    assert.ok((await (await fetch(origin + '/')).text()).includes('API Test Package'));
    assert.ok((await (await fetch(origin + '/packages/api-test-package')).text()).includes('API Test Package'));
    await expect(`${base}/${entry.id}`, 'PATCH', { data: { title: 'Updated Package' } });
    const detail = await (await fetch(origin + '/packages/api-test-package')).text();
    assert.ok(detail.includes('Updated Package'));
    const { entry: second } = await expect(base, 'POST', { data: { title: 'Second Package' } }, 201);
    await expect(base + '/reorder', 'POST', { ids: [second.id, entry.id] });
    const list = await expect(base, 'GET');
    assert.deepEqual(list.entries.map(item => item.id), [second.id, entry.id]);
    await expect(base + '/reorder', 'POST', { ids: [entry.id, entry.id] }, 400);
    await expect(base + '/reorder', 'POST', { ids: [randomUUID(), entry.id] }, 404);
    assert.deepEqual((await expect(base, 'GET')).entries.map(item => item.id), [second.id, entry.id], 'failed reorder rolls back');
    await expect(base + '?limit=1&offset=1', 'GET');
    await expect(base + '?limit=101', 'GET', undefined, 400);
    await expect(`${base}/${entry.id}`, 'PATCH', { data: { price: 999 } }, 403, { origin: 'https://evil.example' });
    await expect('/api/cms/collections/sedna__user', 'GET', undefined, 404);
    await expect(`${base}/${randomUUID()}`, 'GET', undefined, 404);
    await expect(`${base}/${entry.id}`, 'DELETE', undefined, 204);
    await expect(`${base}/${second.id}`, 'DELETE', undefined, 204);
    assert.ok(!(await (await fetch(origin + '/')).text()).includes('Updated Package'));
    // Exercise the remaining field types against the same isolated database.
    const sql = createSql(url.href);
    try {
      const extra = createContentApi({ sql, origin, getSession: async () => ({ user: {} }), collections: [{ collection: 'field_checks', fields: {
        title: fields.text({ required: true }), day: fields.date(), enabled: fields.boolean(), body: fields.richText(),
      } }] });
      const write = data => extra(new Request(origin + '/api/cms/collections/field_checks', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ data, status: 'published' }) }));
      assert.equal((await write({ title: 'Calendar', day: '2026-02-29' })).status, 400);
      assert.equal((await write({ title: 'Calendar', enabled: 'true' })).status, 400);
      const valid = await write({ title: 'Calendar', day: '2028-02-29', enabled: false, body: '<p>Body</p>' });
      assert.equal(valid.status, 201);
      const saved = (await valid.json()).entry;
      assert.equal(saved.data.day, '2028-02-29');
      assert.equal(saved.data.enabled, false);
      assert.equal(saved.data.body, '<p>Body</p>');
    } finally { await sql.end(); }
    await expect('/api/cms/auth/sign-out', 'POST', {});
    await expect(base, 'GET', undefined, 401);
  } finally {
    if (server && server.exitCode === null) { server.kill('SIGTERM'); await once(server, 'exit'); }
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
  }
});
