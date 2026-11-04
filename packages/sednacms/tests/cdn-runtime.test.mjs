import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

function start(command, args, env) {
  const child = spawn(command, args, { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', (chunk) => {
    output += chunk;
  });
  child.stderr.on('data', (chunk) => {
    output += chunk;
  });
  const done = new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(output))));
  });
  // A server is intentionally terminated during cleanup; handle its exit promise.
  done.catch(() => {});
  return { child, done, output: () => output };
}

test('built Astro server emits collection tags, preserves query variants, and excludes private routes', {
  timeout: 30000,
}, async (t) => {
  const playground = fileURLToPath(new URL('../../../apps/playground/', import.meta.url));
  const temporary = await mkdtemp(join(playground, '.sedna-cache-test-'));
  const running = [];
  t.after(async () => {
    for (const process of running) {
      if (process.child.exitCode === null) process.child.kill();
    }
    await Promise.all(running.map((process) => process.done.catch(() => {})));
    await rm(temporary, { recursive: true, force: true });
  });
  await writeFile(
    join(temporary, 'astro.config.mjs'),
    `
    import node from '@astrojs/node';
    import { defineConfig } from 'astro/config';
    import { fileURLToPath } from 'node:url';
    import sedna from 'sednacms';
    export default defineConfig({
      root: fileURLToPath(new URL('../', import.meta.url)),
      outDir: fileURLToPath(new URL('./dist/', import.meta.url)),
      adapter: node({ mode: 'standalone' }),
      integrations: [sedna({ platform: 'netlify', cache: { ttl: 300 } })],
    });
  `,
  );
  // Substitute only the database boundary. The built Astro router, integration,
  // middleware, virtual modules, and live loader all execute normally.
  await writeFile(
    join(temporary, 'database.mjs'),
    `
    import { Pool } from 'pg';
    Pool.prototype.query = async function () { return { rows: [], rowCount: 0 }; };
  `,
  );
  const env = {
    ...process.env,
    SEDNA_DATABASE_URL: 'postgres://localhost/unused',
    SEDNA_NETLIFY_TOKEN: 'runtime-test-token',
    SEDNA_NETLIFY_SITE_ID: 'runtime-test-site',
    HOST: '127.0.0.1',
    PORT: '0',
  };
  const build = start(
    process.execPath,
    [
      fileURLToPath(new URL('../../../node_modules/astro/bin/astro.mjs', import.meta.url)),
      'build',
      '--root',
      playground,
      '--config',
      relative(playground, join(temporary, 'astro.config.mjs')),
    ],
    // Purge credentials belong to the function runtime, not static prerendering.
    { ...env, SEDNA_NETLIFY_TOKEN: '', SEDNA_NETLIFY_SITE_ID: '', SITE_ID: '' },
  );
  running.push(build);
  await build.done;
  const server = start(
    process.execPath,
    ['--import', join(temporary, 'database.mjs'), join(temporary, 'dist/server/entry.mjs')],
    env,
  );
  running.push(server);
  const origin = await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Server did not start: ${server.output()}`)),
      10000,
    );
    const ready = () => {
      const match = server.output().match(/http:\/\/127\.0\.0\.1:\d+/);
      if (match) {
        clearTimeout(timer);
        resolve(match[0]);
      }
    };
    server.child.stdout.on('data', ready);
    server.child.stderr.on('data', ready);
    server.child.once('exit', () => {
      clearTimeout(timer);
      reject(new Error(server.output()));
    });
    ready();
  });
  for (const path of ['/', '/?page=2']) {
    const response = await fetch(origin + path);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('Netlify-CDN-Cache-Control'), /durable, max-age=300/);
    assert.deepEqual(
      new Set(response.headers.get('Netlify-Cache-Tag').split(',')),
      new Set(['sedna:posts', 'sedna:testimonials', 'sedna:packages']),
    );
    assert.match(await response.text(), /No posts/);
  }
  for (const [path, headers] of [
    ['/', { Cookie: 'sedna.session_token=private' }],
    ['/admin', {}],
  ]) {
    const response = await fetch(origin + path, { headers });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.equal(response.headers.get('Netlify-CDN-Cache-Control'), 'no-store');
    assert.equal(response.headers.has('Netlify-Cache-Tag'), false);
  }
});
