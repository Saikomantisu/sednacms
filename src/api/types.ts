import type { CollectionConfig } from '../loader.js';
import type { Field, FieldsData } from '../fields.js';

export type EntryStatus = 'draft' | 'published';
export interface CmsEntry {
  id: string;
  status: EntryStatus;
  sort_order: number;
  created_at: string;
  updated_at: string;
  data: FieldsData<Record<string, Field>>;
}
export interface EntryWrite {
  data?: Partial<CmsEntry['data']>;
  status?: EntryStatus;
}
export interface EntryResponse { entry: CmsEntry }
export interface EntriesResponse { entries: CmsEntry[] }
export interface ApiErrorResponse { error: string }
export interface ReorderRequest { ids: string[] }

export interface SchemaResponse { collections: CollectionConfig[] }
export interface ReorderResponse { success: true }
