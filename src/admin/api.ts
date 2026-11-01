import { getAdminAdapter } from './adapter.js';
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
  return data as T;
}
