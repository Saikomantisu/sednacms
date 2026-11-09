import type { CmsEntry } from '../../api/types.js';
import type { CollectionConfig } from '../../loader.js';

export const titleCase = (value: string) =>
  value.replace(/[_-]/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase());
export function entryTitle(entry: CmsEntry, schema: CollectionConfig) {
  const name = Object.keys(schema.fields).find((key) => schema.fields[key].type === 'text');
  const value = name ? entry.data[name] : null;
  return typeof value === 'string' && value ? value : 'Untitled entry';
}
