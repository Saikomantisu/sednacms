import type { LiveLoader } from 'astro/loaders';
import { markContentRequest } from './cache.js';
import { createPool, ident, type Pool } from './db/client.js';
import { ensureTables, type Logger, tableName } from './db/tables.js';
import type { Field, FieldsData } from './fields.js';

type Fields = Record<string, Field>;

export interface CollectionConfig<F extends Fields = Fields> {
  collection: string;
  fields: F;
  /** Reserved for future purge adapters. Has no effect on the current cache policy. */
  pages?: string[];
}

export interface CollectionFilter {
  limit?: number;
  offset?: number;
}

// Astro turns `getLiveEntry(collection, "some-slug")` into `{ id: "some-slug" }`.
export interface SednaLoader<F extends Fields = Fields>
  extends LiveLoader<FieldsData<F>, { id: string }, CollectionFilter> {
  sedna: CollectionConfig;
}

// Columns every collection table has. Fields cannot use these names.
export const SYSTEM_COLUMNS = [
  'id',
  'status',
  'sort_order',
  'created_at',
  'updated_at',
  'published_at',
];

const COLLECTION_NAME = /^[a-z][a-z0-9_]*$/;
const FIELD_NAME = /^[a-zA-Z][a-zA-Z0-9_]*$/;

function validate(config: CollectionConfig) {
  if (!COLLECTION_NAME.test(config.collection)) {
    throw new Error(
      `sednacms: invalid collection name "${config.collection}". Use lowercase letters, digits and underscores, starting with a letter.`,
    );
  }
  for (const [name, field] of Object.entries(config.fields)) {
    if (!FIELD_NAME.test(name)) {
      throw new Error(
        `sednacms: invalid field name "${name}" in "${config.collection}". Use letters, digits and underscores, starting with a letter.`,
      );
    }
    if (SYSTEM_COLUMNS.includes(name)) {
      throw new Error(`sednacms: field name "${name}" in "${config.collection}" is reserved.`);
    }
    if (field.type === 'slug' && field.from && !(field.from in config.fields)) {
      throw new Error(
        `sednacms: slug field "${name}" in "${config.collection}" points to unknown field "${field.from}".`,
      );
    }
  }
}

const logger: Logger = {
  info: (message) => console.log(`[sednacms] ${message}`),
  warn: (message) => console.warn(`[sednacms] ${message}`),
};

// One pool per server process, shared by all collections.
let pool: Pool | undefined;

function getPool() {
  const url = process.env.SEDNA_DATABASE_URL;
  if (!url) throw new Error('sednacms: SEDNA_DATABASE_URL is not set.');
  pool ??= createPool(url);
  return pool;
}

// Production has no dev server hook, so each collection checks its table once, before its first query.
const ready = new Map<string, Promise<void>>();

function ensureReady(pool: Pool, config: CollectionConfig) {
  let promise = ready.get(config.collection);
  if (!promise) {
    promise = ensureTables(pool, [config], logger);
    // Let the next query try again instead of caching the failure.
    promise.catch(() => ready.delete(config.collection));
    ready.set(config.collection, promise);
  }
  return promise;
}

export function sednaLoader<F extends Fields>(config: CollectionConfig<F>): SednaLoader<F> {
  validate(config);
  const table = tableName(config.collection);
  const fieldNames = Object.keys(config.fields);
  const slugField = fieldNames.find((name) => config.fields[name].type === 'slug');
  const columns = ['id', ...fieldNames].map(ident).join(', ');
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  // Entries are addressed by slug when the collection has one, so pages can use `getLiveEntry('packages', slug)`.
  function toEntry(row: Record<string, unknown>) {
    const data = Object.fromEntries(
      fieldNames.map((name) => [name, row[name] ?? null]),
    ) as FieldsData<F>;
    const id = (slugField && (row[slugField] as string | null)) || (row.id as string);
    return { id, data };
  }

  return {
    name: 'sednacms',
    sedna: config,
    loadCollection: async ({ filter }) => {
      markContentRequest();
      try {
        const { limit, offset = 0 } = filter ?? {};
        if (
          (limit !== undefined && (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)) ||
          !Number.isSafeInteger(offset) ||
          offset < 0 ||
          (offset > 0 && limit === undefined)
        )
          throw new Error(
            'sednacms: pagination requires limit 1–100 and a nonnegative integer offset.',
          );
        const pool = getPool();
        await ensureReady(pool, config);
        const { rows } = await pool.query(
          `select ${columns} from ${ident(table)} where status = 'published' order by sort_order, created_at, id${limit === undefined ? '' : ' limit $1 offset $2'}`,
          limit === undefined ? [] : [limit, offset],
        );
        return { entries: rows.map(toEntry) };
      } catch (error) {
        markContentRequest(true);
        return { error: error as Error };
      }
    },
    loadEntry: async ({ filter }) => {
      markContentRequest();
      try {
        const isUuid = uuid.test(filter.id);
        if (!slugField && !isUuid) return undefined;
        const match = slugField
          ? isUuid
            ? `(${ident(slugField)} = $1 or id = $2::uuid)`
            : `${ident(slugField)} = $1`
          : 'id = $1::uuid';
        const pool = getPool();
        await ensureReady(pool, config);
        const {
          rows: [row],
        } = await pool.query(
          `select ${columns} from ${ident(table)} where status = 'published' and ${match} limit 1`,
          slugField && isUuid ? [filter.id, filter.id] : [filter.id],
        );
        return row ? toEntry(row) : undefined;
      } catch (error) {
        markContentRequest(true);
        return { error: error as Error };
      }
    },
  };
}

export function isSednaLoader(value: unknown): value is SednaLoader {
  return typeof value === 'object' && value !== null && 'sedna' in value;
}
