import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { access, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';

const root = new URL('../', import.meta.url);
const site = new URL('apps/hybrid/', root);
const hosts = process.argv.slice(2);
if (!hosts.length) hosts.push('node', 'vercel', 'netlify', 'cloudflare');
assert.ok(hosts.every((host) => ['node', 'vercel', 'netlify', 'cloudflare'].includes(host)));
const databaseUrl = process.env.SEDNA_TEST_DATABASE_URL;
assert.ok(databaseUrl, 'Set SEDNA_TEST_DATABASE_URL to a disposable Postgres database.');
assert.ok(
  !(await readdir(site)).some(
    (name) =>
      name === '.dev.vars' ||
      name.startsWith('.dev.vars.') ||
      name === '.env' ||
      (name.startsWith('.env.') && name !== '.env.example'),
  ),
  'Run verification without local .env or .dev.vars files in apps/hybrid.',
);

const buildEnv = { ...process.env, NO_COLOR: '1', WRANGLER_SEND_METRICS: 'false' };
// Runtime secrets must never be necessary to build the static marketing pages.
for (const key of Object.keys(buildEnv)) {
  if (key.startsWith('SEDNA_') || key.startsWith('UPLOADTHING_')) delete buildEnv[key];
}

function start(args, env) {
  const child = spawn(process.execPath, args, {
    cwd: site,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (chunk) => {
    output = (output + chunk).slice(-12000);
  });
  child.stderr.on('data', (chunk) => {
    output = (output + chunk).slice(-12000);
  });
  const done = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0 || signal === 'SIGTERM') resolve();
      else reject(new Error(`Process exited ${code}: ${output}`));
    });
  });
  // A failed server may exit before the readiness probe observes it.
  done.catch(() => {});
  return { child, done, output: () => output };
}

async function unusedPort() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function exercise(origin) {
  const cookies = new Map();
  const token = randomUUID();
  const password = randomUUID();
  const request = async (path, method = 'GET', body, extraHeaders) => {
    const response = await fetch(origin + path, {
      method,
      redirect: 'manual',
      headers: {
        origin,
        cookie: Array.from(cookies, ([name, value]) => `${name}=${value}`).join('; '),
        'content-type': 'application/json',
        ...extraHeaders,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    for (const value of response.headers.getSetCookie()) {
      const pair = value.split(';')[0];
      const split = pair.indexOf('=');
      const name = pair.slice(0, split);
      if (/Max-Age=0(?:;|$)/i.test(value)) cookies.delete(name);
      else cookies.set(name, pair.slice(split + 1));
    }
    return response;
  };
  const api = async (path, method, body, status = 200, headers) => {
    const response = await request('/api/cms' + path, method, body, headers);
    const text = await response.text();
    assert.equal(response.status, status, `${method} ${path}: ${text}`);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    return JSON.parse(text);
  };
  // The runtime receives these values from the caller; the setup token is returned for it.
  return {
    token,
    run: async () => {
      const blog = async () => {
        const response = await fetch(origin + '/blog');
        assert.equal(response.status, 200);
        assert.equal(response.headers.get('cache-control'), 'no-store');
        return response.text();
      };
      // Hit a fresh collection concurrently, before the API can create its table.
      await Promise.all(
        Array.from({ length: 8 }, async () => {
          assert.match(await blog(), /No posts yet/);
        }),
      );
      const admin = await request('/admin');
      assert.equal(admin.status, 200);
      assert.equal(admin.headers.get('cache-control'), 'no-store');
      assert.match(await admin.text(), /Content \| Sedna/);
      await api('/schema', 'GET', undefined, 401);
      await api(
        '/setup',
        'POST',
        { name: 'Hybrid Test', email: 'hybrid@example.com', password },
        201,
        { 'x-sedna-setup-token': token },
      );
      await api('/auth/sign-in/email', 'POST', { email: 'hybrid@example.com', password });
      await api('/schema', 'GET');
      const { entry } = await api(
        '/collections/posts',
        'POST',
        {
          status: 'draft',
          data: { title: 'Hybrid draft', slug: 'hybrid-post', body: '<p>Hello studio.</p>' },
        },
        201,
      );
      assert.doesNotMatch(await blog(), /Hybrid draft/);
      await api(`/collections/posts/${entry.id}`, 'PATCH', { status: 'published' });
      assert.match(await blog(), /Hybrid draft/);
      const detail = await fetch(origin + '/blog/hybrid-post');
      assert.equal(detail.status, 200);
      assert.match(await detail.text(), /Hello studio/);
      await api(`/collections/posts/${entry.id}`, 'PATCH', { data: { title: 'Hybrid updated' } });
      // Repeated requests catch connection reuse across Workers request contexts.
      await Promise.all(
        Array.from({ length: 4 }, async () => {
          assert.match(await blog(), /Hybrid updated/);
        }),
      );
      await api(`/collections/posts/${entry.id}`, 'PATCH', { status: 'draft' });
      assert.doesNotMatch(await blog(), /Hybrid updated/);
      await api('/auth/sign-out', 'POST', {});
      await api('/schema', 'GET', undefined, 401);
    },
  };
}

for (const host of hosts) {
  console.log(`${host}: building without database or auth secrets`);
  await start([fileURLToPath(new URL('node_modules/astro/bin/astro.mjs', root)), 'build'], {
    ...buildEnv,
    SEDNA_HOST: host,
  }).done;
  const staticDir = new URL(
    host === 'vercel' ? '.vercel/output/static/' : host === 'netlify' ? 'dist/' : 'dist/client/',
    site,
  );
  assert.match(
    await readFile(new URL('index.html', staticDir), 'utf8'),
    /Websites for small teams/,
  );
  assert.match(
    await readFile(new URL('about/index.html', staticDir), 'utf8'),
    /independent studio/,
  );
  for (const path of ['blog/index.html', 'admin/index.html', 'api/cms/index.html']) {
    await assert.rejects(access(new URL(path, staticDir)), { code: 'ENOENT' });
  }

  const database = new Pool({ connectionString: databaseUrl });
  const schema = 'sedna_hybrid_' + randomUUID().replaceAll('-', '');
  const url = new URL(databaseUrl);
  url.searchParams.set('options', `-c search_path=${schema}`);
  const port = await unusedPort();
  const origin = `http://127.0.0.1:${port}`;
  const scenario = await exercise(origin);
  const runtime = {
    SEDNA_DATABASE_URL: url.href,
    SEDNA_SECRET: randomUUID(),
    SEDNA_URL: origin,
    SEDNA_SETUP_TOKEN: scenario.token,
  };
  let server;
  let secretsDir;
  try {
    await database.query(`CREATE SCHEMA ${schema}`);
    let args;
    if (host === 'node') args = [fileURLToPath(new URL('dist/server/entry.mjs', site))];
    if (host === 'vercel' || host === 'netlify') {
      // Execute the generated function through a local HTTP bridge. This does not emulate the CDN.
      let entry;
      if (host === 'vercel') {
        const dir = new URL('.vercel/output/functions/_render.func/', site);
        const config = JSON.parse(await readFile(new URL('.vc-config.json', dir), 'utf8'));
        entry = new URL(config.handler, dir);
      } else {
        entry = new URL('.netlify/v1/functions/ssr/ssr.mjs', site);
      }
      args = [
        '--input-type=module',
        '-e',
        `
        import { createServer } from 'node:http';
        import { Readable } from 'node:stream';
        import handler${host === 'netlify' ? ', { config }' : ''} from ${JSON.stringify(entry.href)};
        ${
          host === 'netlify'
            ? `
        import assert from 'node:assert/strict';
        assert.equal(config.preferStatic, true, 'Netlify must serve static files before the function');
        `
            : ''
        }
        createServer(async (req, res) => {
          const request = new Request(${JSON.stringify(origin)} + req.url, {
            method: req.method, headers: { ...req.headers, 'x-forwarded-for': '127.0.0.1' },
            ...(['GET', 'HEAD'].includes(req.method) ? {} : { body: Readable.toWeb(req), duplex: 'half' }),
          });
          const response = await ${
            host === 'vercel' ? 'handler.fetch(request)' : "handler(request, { ip: '127.0.0.1' })"
          };
          res.writeHead(response.status, {
            ...Object.fromEntries(response.headers), 'set-cookie': response.headers.getSetCookie(),
          });
          if (response.body) Readable.fromWeb(response.body).pipe(res); else res.end();
        }).listen(${port}, '127.0.0.1');
      `,
      ];
    }
    if (host === 'cloudflare') {
      const configUrl = new URL('dist/server/wrangler.json', site);
      secretsDir = await mkdtemp(join(tmpdir(), 'sedna-hybrid-'));
      const secretsFile = join(secretsDir, '.env');
      await writeFile(
        secretsFile,
        Object.entries(runtime)
          .map(([name, value]) => `${name}=${JSON.stringify(value).replaceAll('$', '\\$')}`)
          .join('\n'),
        { mode: 0o600 },
      );
      args = [
        fileURLToPath(new URL('node_modules/wrangler/bin/wrangler.js', root)),
        'dev',
        '--config',
        fileURLToPath(configUrl),
        '--env-file',
        secretsFile,
        '--port',
        String(port),
        '--ip',
        '127.0.0.1',
      ];
    }
    server = start(args, {
      ...buildEnv,
      ...runtime,
      SEDNA_HOST: host,
      HOST: '127.0.0.1',
      PORT: String(port),
    });
    const deadline = Date.now() + 30000;
    for (;;) {
      try {
        await fetch(origin + '/admin');
        break;
      } catch {
        assert.ok(Date.now() < deadline && server.child.exitCode === null, server.output());
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
    await scenario.run();
    console.log(
      `${host}: static output, auth, draft/publish/edit/unpublish, concurrent reads passed`,
    );
  } catch (error) {
    console.error(server?.output() ?? '');
    throw error;
  } finally {
    if (server) {
      server.child.kill();
      // Wrangler exits with code 1 when its parent terminates a dev session.
      await server.done.catch(() => {});
    }
    if (secretsDir) await rm(secretsDir, { recursive: true, force: true });
    await database.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await database.end();
  }
}
