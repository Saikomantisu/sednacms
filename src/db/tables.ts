import type { AstroIntegrationLogger } from 'astro';
import type { FieldType } from '../fields.js';
import type { CollectionConfig } from '../loader.js';
import type { Sql } from './client.js';

const COLUMN_TYPES: Record<FieldType, string> = {
  text: 'text',
  richText: 'text',
  number: 'double precision',
  image: 'jsonb',
  boolean: 'boolean',
  date: 'date',
  slug: 'text',
};

// Content tables are `sedna_<collection>`. Collection names cannot start with `_`,
// so Sedna's own system tables use `sedna__<name>` and can never collide.
export function tableName(collection: string) {
  return `sedna_${collection}`;
}

/**
 * Create missing tables and columns for each collection. Only ever adds:
 * never drops, renames or changes existing columns.
 */
export async function ensureTables(sql: Sql, collections: CollectionConfig[], logger: AstroIntegrationLogger) {
  for (const config of collections) {
    const table = tableName(config.collection);

    const existing = await sql<{ column_name: string; data_type: string }[]>`
      select column_name, data_type from information_schema.columns
      where table_schema = current_schema() and table_name = ${table}
    `;
    if (existing.length === 0) {
      await sql`
        create table if not exists ${sql(table)} (
          id uuid primary key default gen_random_uuid(),
          status text not null default 'draft' check (status in ('draft', 'published')),
          sort_order double precision not null default 0,
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now()
        )
      `;
      logger.info(`Created table ${table}`);
    }

    const columns = new Map(existing.map((c) => [c.column_name, c.data_type]));
    for (const [name, field] of Object.entries(config.fields)) {
      const type = COLUMN_TYPES[field.type];
      const current = columns.get(name);
      if (current === undefined) {
        // Columns stay nullable: drafts may be incomplete, so `required` is checked when saving.
        await sql`alter table ${sql(table)} add column if not exists ${sql(name)} ${sql.unsafe(type)}`;
        if (existing.length > 0) logger.info(`Added column ${table}.${name}`);
      } else if (current !== type) {
        logger.warn(`Column ${table}.${name} is ${current} but field type "${field.type}" expects ${type}. Leaving it unchanged.`);
      }
      if (field.type === 'slug') {
        await sql`create unique index if not exists ${sql(`${table}_${name}_key`)} on ${sql(table)} (${sql(name)})`;
      }
    }
  }
}
