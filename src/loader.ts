import type { LiveLoader } from 'astro/loaders';
import { createSql, type Sql } from './db/client.js';
import { ensureTables, tableName, type Logger } from './db/tables.js';
import type { Field, FieldsData } from './fields.js';

type Fields = Record<string, Field>;

export interface CollectionConfig<F extends Fields = Fields> {
  collection: string;
  fields: F;
  /** Pages that list this collection, used for cache purge. */
  pages?: string[];
}

// Astro turns `getLiveEntry(collection, "some-slug")` into `{ id: "some-slug" }`.
export interface SednaLoader<F extends Fields = Fields> extends LiveLoader<FieldsData<F>, { id: string }> {
  sedna: CollectionConfig;
}

// Columns every collection table has. Fields cannot use these names.
export const SYSTEM_COLUMNS = ['id', 'status', 'sort_order', 'created_at', 'updated_at'];

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
      throw new Error(`sednacms: invalid field name "${name}" in "${config.collection}". Use letters, digits and underscores, starting with a letter.`);
    }
    if (SYSTEM_COLUMNS.includes(name)) {
      throw new Error(`sednacms: field name "${name}" in "${config.collection}" is reserved.`);
    }
    if (field.type === 'slug' && field.from && !(field.from in config.fields)) {
      throw new Error(`sednacms: slug field "${name}" in "${config.collection}" points to unknown field "${field.from}".`);
    }
  }
}

const logger: Logger = {
  info: (message) => console.log(`[sednacms] ${message}`),
  warn: (message) => console.warn(`[sednacms] ${message}`),
};

// One client per server process, shared by all collections.
let sql: Sql | undefined;

function getSql() {
  const url = process.env.SEDNA_DATABASE_URL;
  if (!url) throw new Error('sednacms: SEDNA_DATABASE_URL is not set.');
  sql ??= createSql(url);
  return sql;
}

// Production has no dev server hook, so each collection checks its table once, before its first query.
const ready = new Map<string, Promise<void>>();

function ensureReady(sql: Sql, config: CollectionConfig) {
  let promise = ready.get(config.collection);
  if (!promise) {
    promise = ensureTables(sql, [config], logger);
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

  // Entries are addressed by slug when the collection has one, so pages can use `getLiveEntry('packages', slug)`.
  function toEntry(row: Record<string, unknown>) {
    const data = Object.fromEntries(fieldNames.map((name) => [name, row[name] ?? null])) as FieldsData<F>;
    const id = (slugField && (row[slugField] as string | null)) || (row.id as string);
    return { id, data };
  }

  return {
    name: 'sednacms',
    sedna: config,
    loadCollection: async () => {
      try {
        const sql = getSql();
        await ensureReady(sql, config);
        const rows = await sql`
          select id, ${sql(fieldNames)} from ${sql(table)}
          where status = 'published'
          order by sort_order, created_at
        `;
        return { entries: rows.map(toEntry) };
      } catch (error) {
        return { error: error as Error };
      }
    },
    loadEntry: async ({ filter }) => {
      try {
        const sql = getSql();
        await ensureReady(sql, config);
        const match = slugField ? sql`(${sql(slugField)} = ${filter.id} or id::text = ${filter.id})` : sql`id::text = ${filter.id}`;
        const [row] = await sql`
          select id, ${sql(fieldNames)} from ${sql(table)}
          where status = 'published' and ${match}
          limit 1
        `;
        return row ? toEntry(row) : undefined;
      } catch (error) {
        return { error: error as Error };
      }
    },
  };
}

export function isSednaLoader(value: unknown): value is SednaLoader {
  return typeof value === 'object' && value !== null && 'sedna' in value;
}
