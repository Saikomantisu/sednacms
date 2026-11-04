import { ident, type Pool, transaction } from '../db/client.js';
import { ensureTables, tableName } from '../db/tables.js';
import type { Field } from '../fields.js';
import type { CollectionConfig } from '../loader.js';
import { log } from '../log.js';
import type { CmsEntry, EntryStatus } from './types.js';

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
function fail(status: number, message: string): never {
  throw new HttpError(status, message);
}
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const uuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const slugify = (value: string) =>
  value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

function validateData(
  config: CollectionConfig,
  input: unknown,
  previous: Record<string, unknown>,
  status: EntryStatus,
) {
  if (!object(input)) fail(400, 'data must be an object');
  for (const key of Object.keys(input))
    if (!Object.hasOwn(config.fields, key)) fail(400, `Unknown field: ${key}`);
  const data: Record<string, unknown> = Object.fromEntries(
    Object.keys(config.fields).map((name) => [name, previous[name] ?? null]),
  );
  Object.assign(data, input);
  for (const [name, field] of Object.entries(config.fields)) {
    data[name] = validateValue(field, data[name], name, data, status);
  }
  return data;
}

function validateValue(
  field: Field,
  input: unknown,
  name: string,
  siblings: Record<string, unknown>,
  status: EntryStatus,
): unknown {
  let value = input;
  if (field.type === 'slug' && !value && field.from && typeof siblings[field.from] === 'string')
    value = slugify(siblings[field.from] as string) || null;
  if (value === null || value === undefined || value === '') {
    if (status === 'published' && (field.required || field.type === 'slug'))
      fail(400, `${name} is required to publish`);
    return null;
  }
  if (field.type === 'list') {
    if (!Array.isArray(value)) fail(400, `Invalid list value for ${name}`);
    if (status === 'published' && field.required && value.length === 0)
      fail(400, `${name} is required to publish`);
    return value.map((item, index) =>
      validateValue(field.item, item, `${name}[${index}]`, {}, status),
    );
  }
  if (field.type === 'object') {
    if (!object(value)) fail(400, `Invalid object value for ${name}`);
    for (const key of Object.keys(value))
      if (!Object.hasOwn(field.fields, key)) fail(400, `Unknown field: ${name}.${key}`);
    return Object.fromEntries(
      Object.entries(field.fields).map(([key, child]) => [
        key,
        validateValue(child, value[key], `${name}.${key}`, value, status),
      ]),
    );
  }
  let valid = false;
  switch (field.type) {
    case 'text':
    case 'richText':
      valid = typeof value === 'string';
      break;
    case 'slug':
      valid = typeof value === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
      break;
    case 'number':
      valid = typeof value === 'number' && Number.isFinite(value);
      break;
    case 'boolean':
      valid = typeof value === 'boolean';
      break;
    case 'date':
      valid =
        typeof value === 'string' &&
        /^\d{4}-\d{2}-\d{2}$/.test(value) &&
        Number.isFinite(Date.parse(value)) &&
        new Date(value).toISOString().slice(0, 10) === value;
      break;
    case 'image':
      valid =
        object(value) &&
        typeof value.src === 'string' &&
        /^https?:\/\//.test(value.src) &&
        typeof value.alt === 'string' &&
        Number.isInteger(value.width) &&
        Number(value.width) > 0 &&
        Number.isInteger(value.height) &&
        Number(value.height) > 0 &&
        Object.keys(value).every((key) => ['src', 'alt', 'width', 'height'].includes(key));
      break;
  }
  if (!valid) fail(400, `Invalid ${field.type} value for ${name}`);
  return value;
}

function toEntry(config: CollectionConfig, row: Record<string, unknown>): CmsEntry {
  return {
    id: row.id as string,
    status: row.status as EntryStatus,
    sort_order: row.sort_order as number,
    created_at: (row.created_at as Date).toISOString(),
    updated_at: (row.updated_at as Date).toISOString(),
    published_at: row.published_at ? (row.published_at as Date).toISOString() : null,
    data: Object.fromEntries(
      Object.keys(config.fields).map((name) => [name, row[name] ?? null]),
    ) as CmsEntry['data'],
  };
}

export function createContentApi(options: {
  collections: CollectionConfig[];
  db: Pool;
  origin: string;
  getSession: (headers: Headers) => Promise<{ session: unknown; headers: Headers }>;
  invalidate?: (collection: string) => Promise<void>;
}) {
  const { collections, db, origin, getSession } = options;
  const configs = new Map(collections.map((config) => [config.collection, config]));
  if (configs.size !== collections.length) throw new Error('sednacms: duplicate collection names');
  let ready: Promise<void> | undefined;
  async function ensureReady() {
    if (!ready) {
      ready = transaction(db, async (client) => {
        await client.query("select pg_advisory_xact_lock(hashtext('sedna:content:tables'))");
        await ensureTables(client, collections, {
          info: () => {},
          warn: log.warn,
        });
      });
      ready.catch(() => {
        ready = undefined;
      });
    }
    await ready;
  }
  return async function handle(request: Request): Promise<Response> {
    const headers = new Headers({ 'Cache-Control': 'no-store' });
    const json = (value: unknown, status = 200) => Response.json(value, { status, headers });
    const invalidate = async (collection: string) => {
      try {
        await options.invalidate?.(collection);
      } catch {
        // The database change has committed. Do not turn it into a failed save or
        // encourage a retry that could create duplicate content.
        headers.set('X-Sedna-Cache', 'purge-failed');
        log.warn({
          message: 'Content saved, but CDN cache invalidation failed.',
          hint: 'Cached pages may stay outdated until their TTL expires. Check the CDN token and site, project or zone ID.',
        });
      }
    };
    try {
      const auth = await getSession(request.headers);
      // Persist refreshed session cookies so subsequent requests can use the cache.
      for (const cookie of auth.headers.getSetCookie()) headers.append('Set-Cookie', cookie);
      if (!auth.session) return json({ error: 'Authentication required' }, 401);
      const url = new URL(request.url);
      if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(request.method))
        fail(405, 'Method not allowed');
      if (request.method !== 'GET' && request.headers.get('origin') !== origin)
        fail(403, 'Invalid origin');
      if (url.pathname === '/api/cms/schema') {
        if (request.method !== 'GET') fail(405, 'Method not allowed');
        return json({ collections });
      }
      const match = /^\/api\/cms\/collections\/([a-z][a-z0-9_]*)(?:\/(reorder|[0-9a-f-]+))?$/.exec(
        url.pathname,
      );
      if (!match) fail(404, 'Not found');
      const config = configs.get(match[1]);
      if (!config) fail(404, 'Collection not found');
      const id = match[2];
      const table = ident(tableName(config.collection));
      if (id && id !== 'reorder' && !uuid(id)) fail(400, 'Invalid entry ID');
      await ensureReady();
      if (request.method === 'GET') {
        if (id === 'reorder') fail(405, 'Method not allowed');
        if (id) {
          const {
            rows: [row],
          } = await db.query(`select * from ${table} where id = $1`, [id]);
          if (!row) fail(404, 'Entry not found');
          return json({ entry: toEntry(config, row) });
        }
        const limit = Number(url.searchParams.get('limit') ?? 100);
        const offset = Number(url.searchParams.get('offset') ?? 0);
        if (
          !Number.isInteger(limit) ||
          limit < 1 ||
          limit > 100 ||
          !Number.isInteger(offset) ||
          offset < 0
        )
          fail(400, 'Invalid pagination');
        const conditions: string[] = [];
        const params: unknown[] = [limit, offset];
        const status = url.searchParams.get('status');
        if (status !== null) {
          if (status !== 'draft' && status !== 'published') fail(400, 'Invalid status');
          params.push(status);
          conditions.push(`status = $${params.length}`);
        }
        const bounds = ['published_from', 'published_before'] as const;
        for (const key of bounds) {
          const value = url.searchParams.get(key);
          if (value === null) continue;
          if (
            !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) ||
            !Number.isFinite(Date.parse(value)) ||
            new Date(value).toISOString() !== value
          )
            fail(400, 'Invalid publication date');
          params.push(value);
          conditions.push(
            `published_at ${key === 'published_from' ? '>=' : '<'} $${params.length}`,
          );
        }
        const from = url.searchParams.get('published_from');
        const before = url.searchParams.get('published_before');
        if (from && before && from >= before) fail(400, 'Invalid publication date range');
        const where = conditions.length ? ` where ${conditions.join(' and ')}` : '';
        const { rows } = await db.query(
          `select * from ${table}${where} order by sort_order, created_at, id limit $1 offset $2`,
          params,
        );
        return json({ entries: rows.map((row) => toEntry(config, row)) });
      }
      if (request.method === 'DELETE') {
        if (!id || id === 'reorder') fail(405, 'Method not allowed');
        const {
          rows: [deleted],
        } = await db.query(`delete from ${table} where id = $1 returning status`, [id]);
        if (!deleted) fail(404, 'Entry not found');
        if (deleted.status === 'published') await invalidate(config.collection);
        return new Response(null, { status: 204, headers });
      }
      if (!request.headers.get('content-type')?.startsWith('application/json'))
        fail(415, 'Expected JSON');
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        fail(400, 'Invalid JSON');
      }
      if (!object(body)) fail(400, 'Expected an object');
      if (id === 'reorder') {
        if (request.method !== 'POST') fail(405, 'Method not allowed');
        const ids = body.ids;
        if (
          Object.keys(body).some((key) => key !== 'ids') ||
          !Array.isArray(ids) ||
          ids.length > 1000 ||
          !ids.every((item) => typeof item === 'string' && uuid(item)) ||
          new Set(ids).size !== ids.length
        )
          fail(400, 'Provide up to 1000 unique entry IDs');
        const published = ids.length
          ? await transaction(db, async (client) => {
              // Lock rows in a stable order to avoid overlapping reorders deadlocking.
              const { rows, rowCount } = await client.query(
                `select id, status from ${table} where id = any($1::uuid[]) order by id for update`,
                [ids],
              );
              if (rowCount !== ids.length) fail(404, 'Entry not found');
              // One statement for the whole list: positions count from zero in the order given.
              await client.query(
                `update ${table} set sort_order = position - 1, updated_at = now()
             from unnest($1::uuid[]) with ordinality as next(id, position) where ${table}.id = next.id`,
                [ids],
              );
              return rows.some((row) => row.status === 'published');
            })
          : false;
        if (published) await invalidate(config.collection);
        return json({ success: true });
      }
      if ((id && request.method !== 'PATCH') || (!id && request.method !== 'POST'))
        fail(405, 'Method not allowed');
      if (Object.keys(body).some((key) => !['data', 'status'].includes(key)))
        fail(400, 'Unknown request property');
      if (body.status !== undefined && body.status !== 'draft' && body.status !== 'published')
        fail(400, 'Invalid status');
      const { entry, published } = await transaction(db, async (client) => {
        const previous = id
          ? (await client.query(`select * from ${table} where id = $1 for update`, [id])).rows[0]
          : undefined;
        if (id && !previous) fail(404, 'Entry not found');
        const status = (body.status ?? previous?.status ?? 'draft') as EntryStatus;
        const data = validateData(
          config,
          body.data === undefined ? {} : body.data,
          previous ?? {},
          status,
        );
        const values: Record<string, unknown> = { ...data, status };
        if (status === 'published' && previous?.status !== 'published')
          values.published_at = new Date();
        // pg encodes arrays as Postgres arrays unless explicitly sent as JSON text.
        for (const [key, field] of Object.entries(config.fields))
          if (['image', 'list', 'object'].includes(field.type) && values[key] !== null)
            values[key] = JSON.stringify(values[key]);
        const columns = Object.keys(values).map(ident);
        const params = Object.values(values);
        const {
          rows: [row],
        } = id
          ? await client.query(
              `update ${table} set ${columns.map((column, i) => `${column} = $${i + 1}`).join(', ')}, updated_at = now() where id = $${params.length + 1} returning *`,
              [...params, id],
            )
          : await client.query(
              `insert into ${table} (${columns.join(', ')}) values (${columns.map((_, i) => `$${i + 1}`).join(', ')}) returning *`,
              params,
            );
        return {
          entry: toEntry(config, row),
          published: previous?.status === 'published' || status === 'published',
        };
      });
      if (published) await invalidate(config.collection);
      return json({ entry }, id ? 200 : 201);
    } catch (error) {
      if (error instanceof HttpError) return json({ error: error.message }, error.status);
      if ((error as { code?: string }).code === '23505')
        return json({ error: 'An entry with that slug already exists' }, 409);
      throw error;
    }
  };
}
