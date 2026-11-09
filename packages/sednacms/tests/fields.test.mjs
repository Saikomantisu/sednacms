import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createContentApi } from '../dist/api/content.js';
import { fields } from '../dist/fields.js';
import { sednaLoader } from '../dist/loader.js';

const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'virtual:sedna/admin')
      return {
        url: 'data:text/javascript,export const disposableDemo=false;export const uploadsEnabled=false;',
        shortCircuit: true,
      };
    return next(specifier, context);
  },
});
const { FieldControl } = await import('../dist/admin/components/content/fields.js');
const { initialValues, readValues } = await import('../dist/admin/utils/field-values.js');
hooks.deregister();

const schema = {
  tags: fields.list(fields.text({ required: true }), { required: true }),
  gallery: fields.list(fields.image()),
  faqs: fields.list(
    fields.object({
      question: fields.text({ required: true }),
      answer: fields.richText({ required: true }),
      slug: fields.slug({ from: 'question' }),
      scores: fields.list(fields.number()),
    }),
  ),
  details: fields.object({ featured: fields.boolean(), date: fields.date() }),
};
const image = { src: 'https://example.com/image.webp', width: 100, height: 80, alt: 'Test' };

test('nested editor values preserve order, nulls, images and scalar types', () => {
  const data = {
    tags: ['one', 'two'],
    gallery: [image, null],
    faqs: [{ question: 'Why?', answer: '<p>Because.</p>', slug: 'why', scores: [0, 2.5, null] }],
    details: { featured: false, date: '2026-11-04' },
  };
  assert.deepEqual(readValues(schema, initialValues(schema, data)), data);
  const empty = readValues(schema, initialValues(schema));
  assert.deepEqual(empty, { tags: null, gallery: null, faqs: null, details: null });
  const draft = initialValues(schema, data);
  draft.gallery[0].width = '0';
  assert.throws(() => readValues(schema, draft), /Gallery\[0\]/);
});

test('list and object controls render nested inputs and accessible ordering actions', () => {
  const html = renderToStaticMarkup(
    createElement(FieldControl, {
      name: 'tags',
      field: schema.tags,
      value: ['one', 'two'],
      disabled: false,
      onChange() {},
      run() {},
    }),
  );
  assert.match(html, /value="one"/);
  // Items are named after their list, so nested "Item 1" labels never collide.
  assert.match(html, />Tag 2</);
  assert.match(html, /Move up tag 2/);
  assert.match(html, /Remove tag 1/);
  assert.match(html, /Add tag/);
  const object = renderToStaticMarkup(
    createElement(FieldControl, {
      name: 'details',
      field: schema.details,
      value: { featured: false, date: null },
      disabled: true,
      onChange() {},
      run() {},
    }),
  );
  assert.match(object, /Featured/);
  assert.match(object, /type="date"/);
  assert.match(object, /disabled=""/);
});

function apiFixture() {
  const queries = [];
  let stored;
  const client = {
    release() {},
    async query(sql, params = []) {
      queries.push({ sql, params });
      if (sql.startsWith('select *')) return { rows: stored ? [stored] : [] };
      if (sql.startsWith('insert into') || sql.startsWith('update ')) {
        const names = sql.startsWith('insert')
          ? [...sql.matchAll(/"([^"]+)"/g)].slice(1).map((match) => match[1])
          : [...sql.matchAll(/"([^"]+)" = \$/g)].map((match) => match[1]);
        stored = {
          id: '00000000-0000-0000-0000-000000000001',
          created_at: new Date(),
          updated_at: new Date(),
          sort_order: 0,
          ...stored,
        };
        names.forEach((name, index) => {
          const value = params[index];
          stored[name] = name in schema && value !== null ? JSON.parse(value) : value;
        });
        return { rows: [stored] };
      }
      return { rows: [] };
    },
  };
  const api = createContentApi({
    collections: [{ collection: 'lists', fields: schema }],
    db: { connect: async () => client, query: client.query },
    origin: 'https://example.com',
    getSession: async () => ({ session: {}, headers: new Headers() }),
  });
  return {
    queries,
    async call(body, id = '') {
      const response = await api(
        new Request(`https://example.com/api/cms/collections/lists${id ? `/${id}` : ''}`, {
          method: id ? 'PATCH' : 'POST',
          headers: { origin: 'https://example.com', 'content-type': 'application/json' },
          body: JSON.stringify(body),
        }),
      );
      return { status: response.status, body: await response.json() };
    },
  };
}

test('API stores lists as JSON and validates nested data on draft saves and publication', async () => {
  const { call, queries } = apiFixture();
  const created = await call({
    data: { tags: ['first', 'second'], gallery: [image], faqs: [{ question: 'Why?' }] },
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.entry.data.faqs[0].slug, 'why');
  assert.equal(created.body.entry.data.faqs[0].answer, null);
  assert.ok(queries.some(({ sql }) => /"tags" jsonb/.test(sql)));
  const insert = queries.find(({ sql }) => sql.startsWith('insert into'));
  assert.equal(insert.params[0], '["first","second"]');
  const id = created.body.entry.id;
  const incomplete = await call({ status: 'published' }, id);
  assert.equal(incomplete.status, 400);
  assert.match(incomplete.body.error, /faqs\[0\].answer/);
  const published = await call(
    {
      status: 'published',
      data: {
        faqs: [{ question: 'Why?', answer: '<p>Because.</p>', scores: [0, 1.5] }],
      },
    },
    id,
  );
  assert.equal(published.status, 200);
  assert.deepEqual(published.body.entry.data.tags, ['first', 'second']);
  for (const data of [
    { tags: [] },
    { tags: [null] },
    { tags: 'wrong' },
    { tags: [12] },
    { faqs: [{ question: 'Why?', answer: 'Answer', extra: true }] },
    { gallery: [{ ...image, width: -1 }] },
    { details: { date: '2026-02-30' } },
    { faqs: [{ question: 'Why?', answer: 'Answer', scores: ['bad'] }] },
  ])
    assert.equal((await call({ data }, id)).status, 400, JSON.stringify(data));
  const cleared = await call({ data: { gallery: [], details: null } }, id);
  assert.equal(cleared.status, 200);
  assert.deepEqual(cleared.body.entry.data.gallery, []);
});

test('nested schema names and slug sources are checked before querying', () => {
  assert.throws(
    () =>
      sednaLoader({
        collection: 'test',
        fields: {
          items: fields.list(fields.object({ 'bad-name': fields.text() })),
        },
      }),
    /invalid field name/,
  );
  assert.throws(
    () =>
      sednaLoader({
        collection: 'test',
        fields: {
          items: fields.list(fields.object({ slug: fields.slug({ from: 'missing' }) })),
        },
      }),
    /unknown field/,
  );
  assert.doesNotThrow(() =>
    sednaLoader({
      collection: 'test',
      fields: {
        items: fields.list(fields.object({ id: fields.text() })),
      },
    }),
  );
});
