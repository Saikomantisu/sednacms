import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import pg from 'pg';
import { createMediaApi } from '../dist/api/media.js';
import { getAuthServer } from '../dist/auth/server.js';
import { createPool } from '../dist/db/client.js';
import { ensureContentTables } from '../dist/db/tables.js';
import { fields } from '../dist/fields.js';
import { sednaLoader } from '../dist/loader.js';
import { withRequestResources } from '../dist/runtime.js';

test('Workers reuse completed schema setup across requests without reusing pending I/O', {
  skip: !process.env.SEDNA_TEST_DATABASE_URL,
}, async (t) => {
  const database = new pg.Pool({ connectionString: process.env.SEDNA_TEST_DATABASE_URL });
  const schema = 'sedna_schema_' + randomUUID().replaceAll('-', '');
  const env = { ...process.env };
  await database.query(`CREATE SCHEMA ${schema}`);
  t.after(async () => {
    process.env = env;
    await database.query(`DROP SCHEMA ${schema} CASCADE`);
    await database.end();
  });
  const url = new URL(process.env.SEDNA_TEST_DATABASE_URL);
  url.searchParams.set('options', `-c search_path=${schema}`);
  process.env.SEDNA_DATABASE_URL = url.href;
  process.env.SEDNA_SECRET = randomUUID();
  process.env.SEDNA_URL = 'http://localhost:4321';
  const queries = [];
  const query = pg.Client.prototype.query;
  t.mock.method(pg.Client.prototype, 'query', function (sql, ...args) {
    queries.push(typeof sql === 'string' ? sql : sql.text);
    return query.call(this, sql, ...args);
  });
  const config = { collection: 'posts', fields: { title: fields.text() } };
  const loader = sednaLoader(config);
  const read = () =>
    withRequestResources(async () => {
      assert.deepEqual(await loader.loadCollection({}), { entries: [] });
    });
  await Promise.all(Array.from({ length: 8 }, read));
  assert.ok(queries.some((sql) => /alter table/i.test(sql)));
  queries.length = 0;
  await read();
  await withRequestResources(() =>
    ensureContentTables(createPool(url.href), [config], {
      info() {},
      warn() {},
    }),
  );
  assert.ok(
    queries.every((sql) => /^select "id"/.test(sql)),
    'warm setup must not lock or alter tables',
  );
  const auth = () => withRequestResources(() => getAuthServer().ensureReady());
  await auth();
  queries.length = 0;
  await auth();
  assert.deepEqual(queries, [], 'warm auth must not introspect or migrate the database');
  const media = () =>
    withRequestResources(async () => {
      const handle = createMediaApi({
        db: createPool(url.href),
        origin: process.env.SEDNA_URL,
        getSession: async () => ({ session: { user: { id: 'test' } }, headers: new Headers() }),
      });
      assert.equal(
        (await handle(new Request(process.env.SEDNA_URL + '/api/cms/media'))).status,
        200,
      );
    });
  await media();
  queries.length = 0;
  await media();
  assert.ok(
    queries.every((sql) => /^select /i.test(sql)),
    'warm media must not lock or create tables',
  );
  const changed = { ...config, fields: { ...config.fields, summary: fields.text() } };
  await withRequestResources(() =>
    ensureContentTables(createPool(url.href), [changed], {
      info() {},
      warn() {},
    }),
  );
  assert.ok(
    queries.some((sql) => /add column.*"summary"/i.test(sql)),
    'changed fields still run setup',
  );
});
