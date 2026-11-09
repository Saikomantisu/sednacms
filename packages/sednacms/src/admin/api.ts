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
        headers: {
          'Content-Type': body instanceof Blob ? body.type : 'application/json',
          ...headers,
        },
        ...(body === undefined ? {} : { body: body instanceof Blob ? body : JSON.stringify(body) }),
      });
  const data =
    response.status === 204
      ? null
      : await response.json().catch(() => {
          if (response.ok)
            throw new RequestError(
              'The server returned an invalid response. Try again.',
              response.status,
              path,
            );
          return null;
        });
  if (!response.ok)
    throw new RequestError(
      (typeof data?.error === 'string' && data.error) ||
        (typeof data?.message === 'string' && data.message) ||
        (response.status === 401
          ? 'Your session has expired. Sign in again to continue.'
          : response.status === 403
            ? 'You do not have permission to complete this request. Ask your site administrator for access.'
            : `The server could not complete the request (HTTP ${response.status}). Try again.`),
      response.status,
      path,
    );
  if (response.headers.get('X-Sedna-Cache') === 'purge-failed')
    toast.warning(
      'Changes saved. The website cache could not be refreshed, so pages may show older content until it expires. If you need the changes to appear now, ask your developer to check the cache settings.',
      {
        id: 'cache-refresh',
        duration: Infinity,
      },
    );
  return data as T;
}
