import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { createAuthServer } from '../dist/auth/server.js';

const databaseURL = process.env.SEDNA_TEST_DATABASE_URL;
test('auth setup, closed registration, sessions, and migrations', { skip: !databaseURL }, async () => {
  const admin = new Pool({ connectionString: databaseURL });
  const schema = 'sedna_test_' + randomUUID().replaceAll('-', '');
  const origin = 'http://localhost:4321';
  const setupToken = randomUUID();
  const url = new URL(databaseURL);
  // Neon poolers reject search_path startup options. Use the same endpoint directly for isolation.
  url.hostname = url.hostname.replace('-pooler.', '.');
  url.searchParams.set('options', `-c search_path=${schema}`);
  const env = { SEDNA_DATABASE_URL: url.href, SEDNA_URL: origin, SEDNA_SECRET: randomUUID(), SEDNA_SETUP_TOKEN: setupToken };
  let server;
  let restarted;
  const email = 'admin@example.com';
  const password = 'test-password-' + randomUUID();
  const body = { name: 'Admin', email, password };
  try {
    await admin.query(`CREATE SCHEMA ${schema}`);
    server = createAuthServer(env);
    const call = (path, data, headers = {}) => server.handle(new Request(origin + '/api/cms/' + path, {
      method: data ? 'POST' : 'GET',
      headers: { origin, 'content-type': 'application/json', 'x-sedna-client-ip': '127.0.0.1', ...headers },
      ...(data ? { body: JSON.stringify(data) } : {}),
    }));
    assert.equal((await call('setup', body)).status, 403, 'setup needs private token');
    assert.equal((await call('setup', body, { origin: 'https://evil.example', 'x-sedna-setup-token': setupToken })).status, 403);
    assert.equal((await call('setup', { ...body, password: 'short' }, { 'x-sedna-setup-token': setupToken })).status, 400);
    const results = await Promise.all([call('setup', body, { 'x-sedna-setup-token': setupToken }), call('setup', { ...body, email: 'other@example.com' }, { 'x-sedna-setup-token': setupToken })]);
    assert.deepEqual(results.map(r => r.status).sort(), [201,409], 'only one concurrent setup wins');
    // Either contender may win; use the actual created account.
    const created = await results.find(r => r.status === 201).json();
    assert.equal((await call('auth/sign-up/email', body)).status, 404);
    assert.equal(await (await call('auth/get-session')).json(), null);
    assert.equal((await call('auth/sign-in/email', { email: created.user.email, password: 'wrong-password' })).status, 401);
    assert.equal((await call('auth/sign-in/email', { email: created.user.email, password }, { origin: 'https://evil.example' })).status, 403);
    const login = await call('auth/sign-in/email', { email: created.user.email, password });
    assert.equal(login.status, 200, await login.clone().text());
    const cookie = login.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
    assert.ok(cookie.includes('sedna.session_token='));
    assert.match(login.headers.getSetCookie().join(';'), /HttpOnly/i);
    assert.match(login.headers.getSetCookie().join(';'), /SameSite=Lax/i);
    const session = await call('auth/get-session', undefined, { cookie });
    assert.equal((await session.json()).user.email, created.user.email);
    assert.equal((await call('auth/get-session', undefined, { cookie: cookie + 'tampered' })).status, 200);
    assert.equal(await (await call('auth/get-session', undefined, { cookie: cookie + 'tampered' })).json(), null);
    assert.equal((await call('auth/sign-out', {}, { cookie })).status, 200);
    assert.equal(await (await call('auth/get-session', undefined, { cookie })).json(), null, 'logout revokes session');
    // New process initialization must preserve existing users and keep setup closed.
    restarted = createAuthServer(env);
    await restarted.ensureReady();
    const retry = await restarted.handle(new Request(origin + '/api/cms/setup', { method: 'POST', headers: { origin, 'content-type': 'application/json', 'x-sedna-setup-token': setupToken }, body: JSON.stringify(body) }));
    assert.equal(retry.status, 409);
    const rows = await admin.query(`SELECT password FROM ${schema}.sedna__account`);
    assert.notEqual(rows.rows[0].password, password, 'password is hashed');
    for (let i = 0; i < 5; i++) await call('auth/sign-in/email', { email: created.user.email, password: 'wrong-password' });
    assert.equal((await call('auth/sign-in/email', { email: created.user.email, password: 'wrong-password' })).status, 429, 'rate limit is enabled in development');
  } finally {
    await server?.close();
    await restarted?.close();
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
  }
});
