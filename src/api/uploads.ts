import { UploadThingError } from 'uploadthing/server';
import {
  IMAGE_TYPES,
  MAX_IMAGE_BYTES,
  resolveImageProcessing,
  type StorageAdapter,
} from '../storage/config.js';
import { signS3Upload } from '../storage/s3.js';
import { createUploadthingHandler } from '../storage/uploadthing.js';

export function createUploadApi(options: {
  storage?: StorageAdapter;
  origin: string;
  getSession: (headers: Headers) => Promise<{ session: unknown; headers: Headers }>;
}) {
  let uploadthing: ReturnType<typeof createUploadthingHandler> | undefined;
  return async (request: Request): Promise<Response> => {
    const headers = new Headers({ 'Cache-Control': 'no-store' });
    const json = (body: unknown, status = 200) => Response.json(body, { status, headers });
    async function authorize(req: Request) {
      const auth = await options.getSession(req.headers);
      for (const cookie of auth.headers.getSetCookie()) headers.append('Set-Cookie', cookie);
      if (!auth.session)
        throw new UploadThingError({ code: 'FORBIDDEN', message: 'Authentication required' });
      if (req.method !== 'GET' && req.headers.get('origin') !== options.origin)
        throw new UploadThingError({ code: 'FORBIDDEN', message: 'Invalid origin' });
    }
    try {
      const storage = options.storage;
      // Provider callbacks have no user cookie. The SDK verifies their signatures.
      const callback =
        storage?.provider === 'uploadthing' &&
        request.method === 'POST' &&
        ['callback', 'error'].includes(request.headers.get('uploadthing-hook') ?? '');
      if (!callback) await authorize(request);
      if (!storage) return json({ error: 'Image uploads are not configured' }, 503);
      const url = new URL(request.url);
      if (request.method === 'GET' && !url.search) {
        return json({
          provider: storage.provider,
          maxBytes: MAX_IMAGE_BYTES,
          types: IMAGE_TYPES,
          image: resolveImageProcessing(storage.image),
        });
      }
      if (storage.provider === 'uploadthing') {
        uploadthing ??= createUploadthingHandler(authorize);
        const response = await uploadthing(request);
        response.headers.set('Cache-Control', 'no-store');
        for (const cookie of headers.getSetCookie()) response.headers.append('Set-Cookie', cookie);
        return response;
      }
      if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
      if (!request.headers.get('content-type')?.startsWith('application/json'))
        return json({ error: 'Expected JSON' }, 415);
      // Only small file descriptors belong on this endpoint, never the file itself.
      const text = await request.text();
      if (text.length > 4096) return json({ error: 'Upload request too large' }, 413);
      let file: Record<string, unknown>;
      try {
        file = JSON.parse(text);
      } catch {
        return json({ error: 'Invalid JSON' }, 400);
      }
      if (
        !file ||
        typeof file !== 'object' ||
        typeof file.type !== 'string' ||
        !IMAGE_TYPES.includes(file.type) ||
        typeof file.size !== 'number' ||
        !Number.isInteger(file.size) ||
        file.size < 1 ||
        file.size > MAX_IMAGE_BYTES
      )
        return json({ error: 'Choose a JPEG, PNG, WebP, GIF, or AVIF image up to 32 MB.' }, 400);
      return json(await signS3Upload({ type: file.type, size: file.size }));
    } catch (error) {
      if (error instanceof UploadThingError)
        return json(
          { error: error.message },
          error.message === 'Authentication required' ? 401 : 403,
        );
      console.error('[sednacms] Image storage unavailable. Check storage configuration.');
      return json(
        {
          error:
            'Image storage unavailable. Ask your website developer to check storage configuration.',
        },
        503,
      );
    }
  };
}
