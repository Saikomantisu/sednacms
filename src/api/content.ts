import type { Sql } from '../db/client.js';
import { ensureTables, tableName } from '../db/tables.js';
import type { CollectionConfig } from '../loader.js';
import type { CmsEntry, EntryStatus } from './types.js';

class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
function fail(status: number, message: string): never { throw new HttpError(status, message); }
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const uuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
const slugify = (value: string) => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function validateData(config: CollectionConfig, input: unknown, previous: Record<string, unknown>, status: EntryStatus) {
  if (!object(input)) fail(400, 'data must be an object');
  for (const key of Object.keys(input)) if (!Object.hasOwn(config.fields, key)) fail(400, `Unknown field: ${key}`);
  const data: Record<string, unknown> = Object.fromEntries(Object.keys(config.fields).map(name => [name, previous[name] ?? null]));
  Object.assign(data, input);
  for (const [name, field] of Object.entries(config.fields)) {
    if (field.type === 'slug' && !data[name] && field.from && typeof data[field.from] === 'string') {
      data[name] = slugify(data[field.from] as string) || null;
    }
    const value = data[name];
    if (value === null || value === '') {
      if (status === 'published' && (field.required || field.type === 'slug')) fail(400, `${name} is required to publish`);
      if (value === '') data[name] = null;
      continue;
    }
    let valid = false;
    switch (field.type) {
      case 'text': case 'richText': valid = typeof value === 'string'; break;
      case 'slug': valid = typeof value === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value); break;
      case 'number': valid = typeof value === 'number' && Number.isFinite(value); break;
      case 'boolean': valid = typeof value === 'boolean'; break;
      case 'date': valid = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value; break;
      case 'image':
        valid = object(value) && typeof value.src === 'string' && /^https?:\/\//.test(value.src) &&
          typeof value.alt === 'string' && Number.isInteger(value.width) && Number(value.width) > 0 &&
          Number.isInteger(value.height) && Number(value.height) > 0 && Object.keys(value).every(key => ['src','alt','width','height'].includes(key));
        break;
    }
    if (!valid) fail(400, `Invalid ${field.type} value for ${name}`);
  }
  return data;
}

function toEntry(config: CollectionConfig, row: Record<string, unknown>): CmsEntry {
  return {
    id: row.id as string, status: row.status as EntryStatus, sort_order: row.sort_order as number,
    created_at: (row.created_at as Date).toISOString(), updated_at: (row.updated_at as Date).toISOString(),
    data: Object.fromEntries(Object.keys(config.fields).map(name => [name, row[name] ?? null])) as CmsEntry['data'],
  };
}

export function createContentApi(options: {
  collections: CollectionConfig[];
  sql: Sql;
  origin: string;
  getSession: (headers: Headers) => Promise<unknown>;
}) {
  const { collections, sql, origin, getSession } = options;
  const configs = new Map(collections.map(config => [config.collection, config]));
  if (configs.size !== collections.length) throw new Error('sednacms: duplicate collection names');
  let ready: Promise<void> | undefined;
  async function ensureReady() {
    if (!ready) {
      ready = sql.begin(async tx => {
        await tx`select pg_advisory_xact_lock(hashtext('sedna:content:tables'))`;
        await ensureTables(tx as unknown as Sql, collections, { info: () => {}, warn: message => console.warn(`[sednacms] ${message}`) });
      }).then(() => {});
      ready.catch(() => { ready = undefined; });
    }
    await ready;
  }
  return async function handle(request: Request): Promise<Response> {
    try {
      if (!await getSession(request.headers)) return json({ error: 'Authentication required' }, 401);
      const url = new URL(request.url);
      if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(request.method)) fail(405, 'Method not allowed');
      if (request.method !== 'GET' && request.headers.get('origin') !== origin) fail(403, 'Invalid origin');
      if (url.pathname === '/api/cms/schema') {
        if (request.method !== 'GET') fail(405, 'Method not allowed');
        return json({ collections });
      }
      const match = /^\/api\/cms\/collections\/([a-z][a-z0-9_]*)(?:\/(reorder|[0-9a-f-]+))?$/.exec(url.pathname);
      if (!match) fail(404, 'Not found');
      const config = configs.get(match[1]);
      if (!config) fail(404, 'Collection not found');
      const id = match[2];
      const table = tableName(config.collection);
      if (id && id !== 'reorder' && !uuid(id)) fail(400, 'Invalid entry ID');
      await ensureReady();
      if (request.method === 'GET') {
        if (id === 'reorder') fail(405, 'Method not allowed');
        if (id) {
          const [row] = await sql`select * from ${sql(table)} where id = ${id}`;
          if (!row) fail(404, 'Entry not found');
          return json({ entry: toEntry(config, row) });
        }
        const limit = Number(url.searchParams.get('limit') ?? 100);
        const offset = Number(url.searchParams.get('offset') ?? 0);
        if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(offset) || offset < 0) fail(400, 'Invalid pagination');
        const rows = await sql`select * from ${sql(table)} order by sort_order, created_at, id limit ${limit} offset ${offset}`;
        return json({ entries: rows.map(row => toEntry(config, row)) });
      }
      if (request.method === 'DELETE') {
        if (!id || id === 'reorder') fail(405, 'Method not allowed');
        const rows = await sql`delete from ${sql(table)} where id = ${id} returning id`;
        if (!rows.length) fail(404, 'Entry not found');
        return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
      }
      if (!request.headers.get('content-type')?.startsWith('application/json')) fail(415, 'Expected JSON');
      let body: unknown;
      try { body = await request.json(); } catch { fail(400, 'Invalid JSON'); }
      if (!object(body)) fail(400, 'Expected an object');
      if (id === 'reorder') {
        if (request.method !== 'POST') fail(405, 'Method not allowed');
        const ids = body.ids;
        if (Object.keys(body).some(key => key !== 'ids') || !Array.isArray(ids) || ids.length > 1000 || !ids.every(item => typeof item === 'string' && uuid(item)) || new Set(ids).size !== ids.length) fail(400, 'Provide up to 1000 unique entry IDs');
        await sql.begin(async tx => {
          // Lock rows in a stable order to avoid overlapping reorders deadlocking.
          const rows = ids.length ? await tx`select id from ${tx(table)} where id in ${tx(ids)} order by id for update` : [];
          if (rows.length !== ids.length) fail(404, 'Entry not found');
          for (const [index, entryId] of ids.entries()) await tx`update ${tx(table)} set sort_order = ${index}, updated_at = now() where id = ${entryId}`;
        });
        return json({ success: true });
      }
      if ((id && request.method !== 'PATCH') || (!id && request.method !== 'POST')) fail(405, 'Method not allowed');
      if (Object.keys(body).some(key => !['data', 'status'].includes(key))) fail(400, 'Unknown request property');
      if (body.status !== undefined && body.status !== 'draft' && body.status !== 'published') fail(400, 'Invalid status');
      const entry = await sql.begin(async tx => {
        const previous = id ? (await tx`select * from ${tx(table)} where id = ${id} for update`)[0] : undefined;
        if (id && !previous) fail(404, 'Entry not found');
        const status = (body.status ?? previous?.status ?? 'draft') as EntryStatus;
        const data = validateData(config, body.data === undefined ? {} : body.data, previous ?? {}, status);
        const values: Record<string, unknown> = { ...data, status };
        // postgres.js needs an explicit JSON helper for dynamic inserts/updates.
        for (const [key, field] of Object.entries(config.fields)) if (field.type === 'image' && values[key] !== null) values[key] = tx.json(values[key] as never);
        const [row] = id
          ? await tx`update ${tx(table)} set ${tx(values)}, updated_at = now() where id = ${id} returning *`
          : await tx`insert into ${tx(table)} ${tx(values)} returning *`;
        return toEntry(config, row);
      });
      return json({ entry }, id ? 200 : 201);
    } catch (error) {
      if (error instanceof HttpError) return json({ error: error.message }, error.status);
      if ((error as { code?: string }).code === '23505') return json({ error: 'An entry with that slug already exists' }, 409);
      throw error;
    }
  };
}
