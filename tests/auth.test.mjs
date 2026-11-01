import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { Pool } from 'pg';
import { createContentApi } from '../dist/api/content.js';
import { AuthConfigurationError, createAuthServer } from '../dist/auth/server.js';

const databaseURL = process.env.SEDNA_TEST_DATABASE_URL;
test('auth setup, closed registration, sessions, and migrations', {
  skip: !databaseURL,
}, async (t) => {
  const admin = new Pool({ connectionString: databaseURL });
  const schema = 'sedna_test_' + randomUUID().replaceAll('-', '');
  const origin = 'http://localhost:4321';
  const setupToken = randomUUID();
  const url = new URL(databaseURL);
  // Neon poolers reject search_path startup options. Use the same endpoint directly for isolation.
  url.hostname = url.hostname.replace('-pooler.', '.');
  url.searchParams.set('options', `-c search_path=${schema}`);
  const env = {
    SEDNA_DATABASE_URL: url.href,
    SEDNA_URL: origin,
    SEDNA_SECRET: randomUUID(),
    SEDNA_SETUP_TOKEN: setupToken,
  };
  let server;
  let restarted;
  const email = 'admin@example.com';
  const password = 'test-password-' + randomUUID();
  const body = { name: 'Admin', email, password };
  try {
    await admin.query(`CREATE SCHEMA ${schema}`);
    server = createAuthServer(env);
    const call = (path, data, headers = {}) =>
      server.handle(
        new Request(origin + '/api/cms/' + path, {
          method: data ? 'POST' : 'GET',
          headers: {
            origin,
            'content-type': 'application/json',
            'x-sedna-client-ip': '127.0.0.1',
            ...headers,
          },
          ...(data ? { body: JSON.stringify(data) } : {}),
        }),
      );
    assert.deepEqual(await (await call('setup')).json(), {
      setupRequired: true,
      setupEnabled: true,
    });
    assert.equal((await call('setup', body)).status, 403, 'setup needs private token');
    assert.equal(
      (
        await call('setup', body, {
          origin: 'https://evil.example',
          'x-sedna-setup-token': setupToken,
        })
      ).status,
      403,
    );
    assert.equal(
      (await call('setup', { ...body, password: 'short' }, { 'x-sedna-setup-token': setupToken }))
        .status,
      400,
    );
    const results = await Promise.all([
      call('setup', body, { 'x-sedna-setup-token': setupToken }),
      call('setup', { ...body, email: 'other@example.com' }, { 'x-sedna-setup-token': setupToken }),
    ]);
    assert.deepEqual(
      results.map((r) => r.status).sort(),
      [201, 409],
      'only one concurrent setup wins',
    );
    // Either contender may win; use the actual created account.
    const created = await results.find((r) => r.status === 201).json();
    assert.deepEqual(await (await call('setup')).json(), {
      setupRequired: false,
      setupEnabled: true,
    });
    assert.equal((await call('auth/sign-up/email', body)).status, 404);
    assert.equal(await (await call('auth/get-session')).json(), null);
    assert.equal(
      (await call('auth/sign-in/email', { email: created.user.email, password: 'wrong-password' }))
        .status,
      401,
    );
    assert.equal(
      (
        await call(
          'auth/sign-in/email',
          { email: created.user.email, password },
          { origin: 'https://evil.example' },
        )
      ).status,
      403,
    );
    const login = await call('auth/sign-in/email', { email: created.user.email, password });
    assert.equal(login.status, 200, await login.clone().text());
    const cookies = login.headers.getSetCookie().map((c) => c.split(';')[0]);
    const cookie = cookies.join('; ');
    const tokenCookie = cookies.find((c) => c.startsWith('sedna.session_token='));
    const cacheCookie = cookies.find((c) => c.startsWith('sedna.session_data='));
    assert.ok(tokenCookie);
    assert.ok(cacheCookie, 'login issues the signed session cache');
    assert.match(login.headers.getSetCookie().join(';'), /HttpOnly/i);
    assert.match(login.headers.getSetCookie().join(';'), /SameSite=Lax/i);
    const context = await server.auth.$context;
    const lookup = t.mock.method(context.internalAdapter, 'findSession');
    const session = await call('auth/get-session', undefined, { cookie });
    assert.equal((await session.json()).user.email, created.user.email);
    assert.equal(lookup.mock.callCount(), 0, 'cached session needs no database lookup');
    const content = createContentApi({
      collections: [],
      db: {},
      origin,
      getSession: async (headers) => {
        const { response: session, headers: responseHeaders } = await server.auth.api.getSession({
          headers,
          returnHeaders: true,
        });
        return { session, headers: responseHeaders };
      },
    });
    const schemaRequest = (cookie) =>
      new Request(origin + '/api/cms/schema', { headers: { cookie } });
    assert.equal((await content(schemaRequest(cookie))).status, 200);
    assert.equal(lookup.mock.callCount(), 0, 'content requests also use the cookie cache');
    const fallback = await content(schemaRequest(tokenCookie));
    assert.equal(fallback.status, 200);
    assert.equal(lookup.mock.callCount(), 1, 'existing token-only sessions still work');
    const renewedCookies = fallback.headers.getSetCookie();
    assert.ok(
      renewedCookies.some((c) => c.startsWith('sedna.session_data=')),
      'content responses forward renewed cache cookies',
    );
    const renewedCookie = [tokenCookie, ...renewedCookies.map((c) => c.split(';')[0])].join('; ');
    assert.equal((await content(schemaRequest(renewedCookie))).status, 200);
    assert.equal(lookup.mock.callCount(), 1, 'renewed cache avoids further database lookups');
    const now = Date.now();
    const clock = t.mock.method(Date, 'now', () => now + 301_000);
    try {
      const expired = await content(schemaRequest(cookie));
      assert.equal(expired.status, 200);
      assert.equal(lookup.mock.callCount(), 2, 'expired cache rechecks the database');
      assert.ok(
        expired.headers
          .getSetCookie()
          .some(
            (c) => c.startsWith('sedna.session_data=') && !c.startsWith('sedna.session_data=;'),
          ),
        'expired cache is renewed',
      );
    } finally {
      clock.mock.restore();
    }
    const tamperedToken = tokenCookie + 'tampered; ' + cacheCookie;
    assert.equal(
      await (await call('auth/get-session', undefined, { cookie: tamperedToken })).json(),
      null,
      'tampered tokens are rejected even with a valid cache',
    );
    assert.equal(
      (
        await call('auth/get-session', undefined, {
          cookie: tokenCookie + '; ' + cacheCookie + 'tampered',
        })
      ).status,
      200,
    );
    const logout = await call('auth/sign-out', {}, { cookie });
    assert.equal(logout.status, 200);
    const clearedCookies = logout.headers.getSetCookie();
    for (const name of ['sedna.session_token', 'sedna.session_data']) {
      assert.ok(
        clearedCookies.some((c) => c.startsWith(name + '=;') && /Max-Age=0/i.test(c)),
        'logout clears ' + name,
      );
    }
    const signedOutCookie = clearedCookies.map((c) => c.split(';')[0]).join('; ');
    assert.equal(
      await (await call('auth/get-session', undefined, { cookie: signedOutCookie })).json(),
      null,
      'browser is signed out immediately',
    );
    assert.equal(
      await (await call('auth/get-session', undefined, { cookie: tokenCookie })).json(),
      null,
      'logout revokes the database session',
    );
    assert.ok(
      await (await call('auth/get-session', undefined, { cookie })).json(),
      'copied cache remains valid within its five-minute window',
    );
    const expiredClock = t.mock.method(Date, 'now', () => now + 301_000);
    try {
      assert.equal(
        await (await call('auth/get-session', undefined, { cookie })).json(),
        null,
        'expired cache cannot revive a revoked session',
      );
    } finally {
      expiredClock.mock.restore();
    }
    // New process initialization must preserve existing users and keep setup closed.
    restarted = createAuthServer(env);
    await restarted.ensureReady();
    const retry = await restarted.handle(
      new Request(origin + '/api/cms/setup', {
        method: 'POST',
        headers: { origin, 'content-type': 'application/json', 'x-sedna-setup-token': setupToken },
        body: JSON.stringify(body),
      }),
    );
    assert.equal(retry.status, 409);
    const rows = await admin.query(`SELECT password FROM ${schema}.sedna__account`);
    assert.notEqual(rows.rows[0].password, password, 'password is hashed');
    // Sign-in allows 3 attempts per 10 seconds, and the window can roll over mid-burst on a slow database.
    // Any 4 attempts inside one window must include a 429, so check the burst instead of one exact attempt.
    const statuses = [];
    for (let i = 0; i < 6; i++)
      statuses.push(
        (
          await call('auth/sign-in/email', {
            email: created.user.email,
            password: 'wrong-password',
          })
        ).status,
      );
    assert.ok(
      statuses.includes(429),
      `rate limit is enabled in development (got ${statuses.join(', ')})`,
    );
  } finally {
    await server?.close();
    await restarted?.close();
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
  }
});

test('missing auth configuration reports names without exposing secret values', () => {
  assert.throws(() => createAuthServer({}), AuthConfigurationError);
  assert.throws(() => createAuthServer({ SEDNA_DATABASE_URL: 'private-database-url' }), {
    message: 'sednacms: SEDNA_SECRET must contain at least 32 characters.',
  });
  const env = { SEDNA_DATABASE_URL: 'private-database-url', SEDNA_SECRET: 'x'.repeat(32) };
  assert.throws(() => createAuthServer(env), {
    message: 'sednacms: SEDNA_URL is required (the site origin, e.g. http://localhost:4321).',
  });
  for (const SEDNA_URL of [
    'private-invalid-url',
    'file:///private',
    'https://user:private@example.com',
  ]) {
    assert.throws(() => createAuthServer({ ...env, SEDNA_URL }), {
      message: 'sednacms: SEDNA_URL must be an HTTP or HTTPS site origin.',
    });
  }
});
