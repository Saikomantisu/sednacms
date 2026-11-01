import type { ImageValue } from '../fields.js';

export type UploadProgress =
  | { stage: 'preparing' | 'finalizing' }
  | { stage: 'uploading'; percent?: number };

/** Browser-only transport. Implementations must never contain server credentials. */
export interface AdminAdapter {
  request(
    path: string,
    method: string,
    body: unknown,
    headers: Record<string, string>,
  ): Promise<Response>;
  uploadImage(file: File, progress: (progress: UploadProgress) => void): Promise<ImageValue>;
}

let activeAdapter: AdminAdapter | null = null;

export function setAdminAdapter(adapter: AdminAdapter | null) {
  activeAdapter = adapter;
}

export function getAdminAdapter() {
  return activeAdapter;
}
