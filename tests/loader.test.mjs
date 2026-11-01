import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Pool } from 'pg';
import { createPool } from '../dist/db/client.js';
import { fields } from '../dist/fields.js';
import { sednaLoader } from '../dist/loader.js';

test('loader bounds SQL pages and uses indexed slug/UUID predicates', async (t) => {
  const prior = process.env.SEDNA_DATABASE_URL;
  process.env.SEDNA_DATABASE_URL = 'postgres://localhost/test';
  t.after(() => {
    if (prior === undefined) delete process.env.SEDNA_DATABASE_URL;
    else process.env.SEDNA_DATABASE_URL = prior;
  });
  const queries = [];
  t.mock.method(Pool.prototype, 'query', async (sql, args) => {
    queries.push({ sql, args });
    return { rows: [] };
  });
  const loader = sednaLoader({ collection: 'packages', fields: { slug: fields.slug() } });
  await loader.loadCollection({ filter: { limit: 11, offset: 10 } });
  assert.match(queries.at(-1).sql, /order by sort_order, created_at, id limit \$1 offset \$2/);
  assert.deepEqual(queries.at(-1).args, [11, 10]);
  await loader.loadCollection({});
  assert.doesNotMatch(queries.at(-1).sql, /limit/);
  for (const filter of [
    { limit: 0 },
    { limit: 101 },
    { limit: 1.5 },
    { limit: '10' },
    { offset: 1 },
    { limit: 10, offset: -1 },
  ]) {
    const before = queries.length;
    assert.ok((await loader.loadCollection({ filter })).error);
    assert.equal(queries.length, before);
  }
  await loader.loadEntry({ filter: { id: 'some-slug' } });
  assert.match(queries.at(-1).sql, /"slug" = \$1 limit 1/);
  assert.doesNotMatch(queries.at(-1).sql, /id::text/);
  const uuid = '00000000-0000-0000-0000-000000000001';
  await loader.loadEntry({ filter: { id: uuid } });
  assert.match(queries.at(-1).sql, /id = \$2::uuid/);
  assert.deepEqual(queries.at(-1).args, [uuid, uuid]);
  const noSlug = sednaLoader({ collection: 'plain', fields: { title: fields.text() } });
  assert.equal(await noSlug.loadEntry({ filter: { id: 'invalid' } }), undefined);
  await noSlug.loadEntry({ filter: { id: uuid } });
  assert.match(queries.at(-1).sql, /id = \$1::uuid/);
});

test('pool configuration has bounded acquisition and validates overrides', async () => {
  for (const env of [
    {},
    { SEDNA_DATABASE_POOL_MAX: '12', SEDNA_DATABASE_CONNECTION_TIMEOUT_MS: '2500' },
  ]) {
    const pool = createPool('postgres://localhost/test', undefined, env);
    assert.equal(pool.options.max, Number(env.SEDNA_DATABASE_POOL_MAX ?? 5));
    assert.equal(
      pool.options.connectionTimeoutMillis,
      Number(env.SEDNA_DATABASE_CONNECTION_TIMEOUT_MS ?? 10000),
    );
    await pool.end();
  }
  for (const name of ['SEDNA_DATABASE_POOL_MAX', 'SEDNA_DATABASE_CONNECTION_TIMEOUT_MS']) {
    for (const value of ['0', '-1', '1.5', 'no', '', 'Infinity'])
      assert.throws(
        () => createPool('postgres://localhost/test', undefined, { [name]: value }),
        /positive integer/,
      );
  }
});
