import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { cp, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execute = promisify(execFile);

test('Netlify function runs outside the repository with only its packaged dependencies', {
  timeout: 60000,
}, async () => {
  const playground = fileURLToPath(new URL('../playground/', import.meta.url));
  const temporary = await mkdtemp(join(tmpdir(), 'sedna-netlify-'));
  const env = {
    ...process.env,
    NODE_ENV: 'production',
    NODE_PATH: '',
    NODE_OPTIONS: '',
    NETLIFY: 'true',
    SEDNA_TEST_DATABASE_URL: '',
    // No real database or provider calls. The homepage handles database errors,
    // and the API checks below stop before any database work or cache purge.
    SEDNA_DATABASE_URL: 'postgres://127.0.0.1:1/unused',
    SEDNA_DATABASE_CONNECTION_TIMEOUT_MS: '50',
    SEDNA_SECRET: 'isolation-test-session-secret-at-least-32-characters',
    SEDNA_SETUP_TOKEN: 'isolation-test-setup-token-at-least-32-characters',
    SEDNA_URL: 'http://localhost',
    UPLOADTHING_TOKEN: '',
    SEDNA_NETLIFY_TOKEN: '',
    SEDNA_NETLIFY_SITE_ID: '',
    SITE_ID: '',
  };
  try {
    await execute('npm', ['run', 'build'], {
      cwd: playground,
      env,
      timeout: 45000,
      maxBuffer: 10_000_000,
    });
    await cp(join(playground, '.netlify/v1/functions/ssr'), temporary, { recursive: true });
    await writeFile(
      join(temporary, 'check.mjs'),
      `
      import assert from 'node:assert/strict';
      import handler from './ssr.mjs';
      const origin = process.env.SEDNA_URL;
      const request = (path, init) => handler(new Request(origin + path, init), { ip: '127.0.0.1' });
      const homepage = await request('/');
      assert.equal(homepage.status, 200);
      assert.match(await homepage.text(), /Travel packages/);
      const admin = await request('/admin');
      assert.equal(admin.status, 200);
      assert.equal(admin.headers.get('Cache-Control'), 'no-store');
      const unknown = await request('/api/cms/auth/not-a-real-route');
      assert.equal(unknown.status, 404);
      assert.deepEqual(await unknown.json(), { error: 'Not found' });
      const setup = await request('/api/cms/setup', {
        method: 'POST',
        headers: { origin, 'x-sedna-setup-token': process.env.SEDNA_SETUP_TOKEN },
      });
      assert.equal(setup.status, 415);
      assert.deepEqual(await setup.json(), { error: 'Expected JSON' });
      console.log('Isolated Netlify homepage, admin, auth and runtime setup token passed.');
    `,
    );
    const result = await execute(process.execPath, [join(temporary, 'check.mjs')], {
      cwd: temporary,
      env: {
        ...env,
        SEDNA_NETLIFY_TOKEN: 'isolation-test-purge-token',
        SEDNA_NETLIFY_SITE_ID: 'isolation-test-site',
      },
      timeout: 10000,
      maxBuffer: 10_000_000,
    });
    assert.match(
      result.stdout,
      /Isolated Netlify homepage, admin, auth and runtime setup token passed/,
    );
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
