import { UploadThingError } from 'uploadthing/server';
import { log } from '../log.js';
import {
  IMAGE_TYPES,
  MAX_IMAGE_BYTES,
  MAX_MEDIA_BYTES,
  MAX_SVG_BYTES,
  MEDIA_TYPES,
  maxMediaBytes,
  resolveImageProcessing,
  type StorageAdapter,
  SVG_TYPE,
} from '../storage/config.js';
import { signS3Upload, storeS3Svg } from '../storage/s3.js';
import { SvgValidationError, sanitizeSvg, svgReceipt } from '../storage/svg.js';
import { createUploadthingHandler, storeUploadthingSvg } from '../storage/uploadthing.js';

class UploadSizeError extends Error {}
async function readSvgBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new SvgValidationError('Choose an SVG file.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_SVG_BYTES) {
        await reader.cancel();
        throw new UploadSizeError('Choose an SVG up to 1 MB.');
      }
      chunks.push(value);
    }
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
    } catch {
      throw new SvgValidationError('SVG files must use UTF-8 encoding.');
    }
  } finally {
    reader.releaseLock();
  }
}

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
      const url = new URL(request.url);
      // Provider callbacks have no user cookie. The SDK verifies their signatures.
      const callback =
        storage?.provider === 'uploadthing' &&
        url.searchParams.get('kind') !== 'svg' &&
        request.method === 'POST' &&
        ['callback', 'error'].includes(request.headers.get('uploadthing-hook') ?? '');
      if (!callback) await authorize(request);
      if (!storage) return json({ error: 'Image uploads are not configured' }, 503);
      if (url.searchParams.get('kind') === 'svg') {
        if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
        if (request.headers.get('content-type')?.split(';')[0].trim() !== SVG_TYPE)
          return json({ error: 'Expected an SVG file' }, 415);
        let name: string;
        try {
          name = decodeURIComponent(request.headers.get('x-sedna-filename') ?? 'image.svg');
        } catch {
          return json({ error: 'Invalid filename' }, 400);
        }
        name =
          (name
            .replace(/[\\/]/g, '_')
            .replace(/\.svg$/i, '')
            .trim()
            .slice(0, 200) || 'image') + '.svg';
        const { svg, width, height } = await sanitizeSvg(await readSvgBody(request));
        // Validate the signing secret before writing any file.
        svgReceipt({ src: '', size: 0, width, height });
        const src =
          storage.provider === 's3' ? await storeS3Svg(svg) : await storeUploadthingSvg(svg, name);
        const file = { name, src, type: SVG_TYPE, size: Buffer.byteLength(svg), width, height };
        return json({ ...file, svgProof: svgReceipt(file) });
      }
      const types = url.searchParams.get('kind') === 'media' ? MEDIA_TYPES : IMAGE_TYPES;
      if (request.method === 'GET' && !url.searchParams.has('slug')) {
        return json({
          provider: storage.provider,
          maxBytes: url.searchParams.get('kind') === 'media' ? MAX_MEDIA_BYTES : MAX_IMAGE_BYTES,
          limits: Object.fromEntries(types.map((type) => [type, maxMediaBytes(type)])),
          types,
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
        !types.includes(file.type) ||
        file.type === SVG_TYPE ||
        typeof file.size !== 'number' ||
        !Number.isInteger(file.size) ||
        file.size < 1 ||
        file.size > maxMediaBytes(file.type)
      )
        return json(
          { error: 'Choose a supported image, GIF, SVG, MP4, or WebM within its size limit.' },
          400,
        );
      return json(await signS3Upload({ type: file.type, size: file.size }));
    } catch (error) {
      if (error instanceof UploadSizeError) return json({ error: error.message }, 413);
      if (error instanceof SvgValidationError) return json({ error: error.message }, 400);
      if (error instanceof UploadThingError)
        return json(
          { error: error.message },
          error.message === 'Authentication required' ? 401 : 403,
        );
      log.error({
        message: 'Image storage unavailable.',
        hint: 'Check the storage adapter in astro.config.mjs and its environment variables.',
      });
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
