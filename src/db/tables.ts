import type { AstroIntegrationLogger } from 'astro';
import type { FieldType } from '../fields.js';
import type { CollectionConfig } from '../loader.js';
import { ident, type Queryable } from './client.js';

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
export type Logger = Pick<AstroIntegrationLogger, 'info' | 'warn'>;

export function tableName(collection: string) {
  return `sedna_${collection}`;
}

/**
 * Create missing tables and columns for each collection. Only ever adds:
 * never drops, renames or changes existing columns.
 */
export async function ensureTables(db: Queryable, collections: CollectionConfig[], logger: Logger) {
  for (const config of collections) {
    const table = tableName(config.collection);

    const { rows: existing } = await db.query<{ column_name: string; data_type: string }>(
      `select column_name, data_type from information_schema.columns
       where table_schema = current_schema() and table_name = $1`,
      [table],
    );
    if (existing.length === 0) {
      await db.query(`
        create table if not exists ${ident(table)} (
          id uuid primary key default gen_random_uuid(),
          status text not null default 'draft' check (status in ('draft', 'published')),
          sort_order double precision not null default 0,
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now()
        )
      `);
      logger.info(`Created table ${table}`);
    }

    const columns = new Map(existing.map((c) => [c.column_name, c.data_type]));
    // Historical publication dates are unknown. Track them on future publishes.
    await db.query(`alter table ${ident(table)} add column if not exists published_at timestamptz`);
    for (const [name, field] of Object.entries(config.fields)) {
      const type = COLUMN_TYPES[field.type];
      const current = columns.get(name);
      if (current === undefined) {
        // Columns stay nullable: drafts may be incomplete, so `required` is checked when saving.
        await db.query(
          `alter table ${ident(table)} add column if not exists ${ident(name)} ${type}`,
        );
        if (existing.length > 0) logger.info(`Added column ${table}.${name}`);
      } else if (current !== type) {
        logger.warn(
          `Column ${table}.${name} is ${current} but field type "${field.type}" expects ${type}. Leaving it unchanged.`,
        );
      }
      if (field.type === 'slug') {
        await db.query(
          `create unique index if not exists ${ident(`${table}_${name}_key`)} on ${ident(table)} (${ident(name)})`,
        );
      }
    }
  }
}
