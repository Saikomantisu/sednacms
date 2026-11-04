import { getAdminAdapter } from './adapter.js';
import { toast } from './toasts.js';
export class RequestError extends Error {
  constructor(
    message: string,
    public status: number,
    public path: string,
  ) {
    super(message);
  }
}

export async function api<T>(
  path: string,
  method = 'GET',
  body?: unknown,
  headers: Record<string, string> = {},
): Promise<T> {
  const adapter = getAdminAdapter();
  const response = adapter
    ? await adapter.request(path, method, body, headers)
    : await fetch('/api/cms/' + path, {
        method,
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', ...headers },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
  const data = response.status === 204 ? null : await response.json();
  if (!response.ok)
    throw new RequestError(
      data?.error ?? data?.message ?? 'Something went wrong. Please try again.',
      response.status,
      path,
    );
  if (response.headers.get('X-Sedna-Cache') === 'purge-failed')
    toast.warning(
      'Changes saved, but the website cache could not be refreshed. Pages may remain outdated until the cache expires.',
      {
        id: 'cache-refresh',
        duration: Infinity,
      },
    );
  return data as T;
}
