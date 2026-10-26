import type { LiveLoader } from 'astro/loaders';
import type { Field } from './fields.js';

export interface CollectionConfig {
  collection: string;
  fields: Record<string, Field>;
  /** Pages that list this collection, used for cache purge. */
  pages?: string[];
}

export interface SednaLoader extends LiveLoader {
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

export function sednaLoader(config: CollectionConfig): SednaLoader {
  validate(config);
  return {
    name: 'sednacms',
    sedna: config,
    // Reading from the database comes in build step 3.
    loadCollection: async () => ({ entries: [] }),
    loadEntry: async () => undefined,
  };
}

export function isSednaLoader(value: unknown): value is SednaLoader {
  return typeof value === 'object' && value !== null && 'sedna' in value;
}
