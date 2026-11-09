import { type Pool, transaction } from '../db/client.js';
import { log } from '../log.js';
import {
  IMAGE_TYPES,
  MEDIA_TYPES,
  maxMediaBytes,
  type StorageAdapter,
  SVG_TYPE,
} from '../storage/config.js';
import { deleteS3File } from '../storage/s3.js';
import { verifySvgReceipt } from '../storage/svg.js';
import { deleteUploadthingFile } from '../storage/uploadthing.js';

export interface MediaFile {
  id: string;
  name: string;
  src: string;
  type: string;
  size: number;
  width: number | null;
  height: number | null;
  folder_id: string | null;
  created_at: string;
}
export interface MediaFolder {
  id: string;
  name: string;
}
export interface MediaResponse {
  media: MediaFile[];
  folders: MediaFolder[];
  imageCounts: Record<string, number>;
  hasMore: boolean;
}

const uuid = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
function fail(status: number, message: string): never {
  throw new HttpError(status, message);
}
function name(value: unknown) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 255)
    fail(400, 'Provide a name of up to 255 characters.');
  return value.trim();
}

// Registration never fetches a supplied URL. Only this site's storage URLs belong in the library.
function managedSource(src: unknown, storage?: StorageAdapter): src is string {
  if (!storage) fail(503, 'Media uploads are not configured.');
  if (typeof src !== 'string' || src.length > 2048) return false;
  let url: URL;
  try {
    url = new URL(src);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash)
    return false;
  if (storage.provider === 's3') {
    const base = process.env.SEDNA_S3_PUBLIC_URL;
    if (!base) fail(503, 'Media storage is not configured.');
    const prefix = `${base.replace(/\/$/, '')}/sedna/`;
    return src.startsWith(prefix) && /^[0-9a-f-]{36}\.[a-z0-9]+$/.test(src.slice(prefix.length));
  }
  const token = process.env.UPLOADTHING_TOKEN;
  if (!token) fail(503, 'Media storage is not configured.');
  const { appId } = JSON.parse(Buffer.from(token, 'base64').toString());
  return url.host === `${appId}.ufs.sh` && /^\/f\/[a-zA-Z0-9_-]+$/.test(url.pathname);
}

export function createMediaApi(options: {
  db: Pool;
  storage?: StorageAdapter;
  origin: string;
  getSession: (headers: Headers) => Promise<{ session: unknown; headers: Headers }>;
}) {
  const { db } = options;
  let ready: Promise<void> | undefined;
  async function ensureReady() {
    ready ??= transaction(db, async (client) => {
      await client.query("select pg_advisory_xact_lock(hashtext('sedna:media:tables'))");
      await client.query(`create table if not exists sedna__media_folders (
        id uuid primary key default gen_random_uuid(), name text not null unique
      )`);
      await client.query(`create table if not exists sedna__media (
        id uuid primary key default gen_random_uuid(), name text not null,
        src text not null unique, type text not null, size integer not null check (size > 0),
        width integer, height integer,
        folder_id uuid references sedna__media_folders(id),
        created_at timestamptz not null default now()
      )`);
      await client.query(
        'create index if not exists sedna__media_folder_idx on sedna__media (folder_id, created_at desc, id desc)',
      );
    }).catch((error) => {
      ready = undefined;
      throw error;
    });
    await ready;
  }
  return async (request: Request): Promise<Response> => {
    const headers = new Headers({ 'Cache-Control': 'no-store' });
    const json = (body: unknown, status = 200) => Response.json(body, { status, headers });
    try {
      const auth = await options.getSession(request.headers);
      for (const cookie of auth.headers.getSetCookie()) headers.append('Set-Cookie', cookie);
      if (!auth.session) fail(401, 'Authentication required');
      if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(request.method))
        fail(405, 'Method not allowed');
      if (request.method !== 'GET' && request.headers.get('origin') !== options.origin)
        fail(403, 'Invalid origin');
      const url = new URL(request.url);
      const match = /^\/api\/cms\/(media|media-folders)(?:\/([^/]+))?$/.exec(url.pathname);
      if (!match) fail(404, 'Not found');
      const [, resource, id] = match;
      if (id && !uuid(id)) fail(400, 'Invalid ID');
      if (request.method === 'DELETE') {
        if (resource !== 'media' || !id) fail(405, 'Method not allowed');
        await ensureReady();
        await transaction(db, async (client) => {
          const {
            rows: [file],
          } = await client.query<{ src: string }>(
            'select src from sedna__media where id = $1 for update',
            [id],
          );
          if (!file) fail(404, 'Media not found');
          const storage = options.storage;
          if (!storage) fail(503, 'Media storage is not configured.');
          if (!managedSource(file.src, storage))
            fail(400, 'This file does not belong to the configured storage.');
          const path = new URL(file.src).pathname;
          try {
            if (storage.provider === 's3') await deleteS3File(`sedna/${path.split('/').at(-1)}`);
            else await deleteUploadthingFile(path.slice('/f/'.length));
          } catch {
            fail(
              503,
              'Could not confirm storage deletion. The Media entry was kept so you can retry.',
            );
          }
          // Missing provider objects can be deleted again after a failed database commit.
          await client.query('delete from sedna__media where id = $1', [id]);
        });
        return new Response(null, { status: 204, headers });
      }
      if (request.method === 'GET') {
        if (resource !== 'media' || id) fail(405, 'Method not allowed');
        const folder = url.searchParams.get('folder') || null;
        if (folder !== null && folder !== 'all' && !uuid(folder)) fail(400, 'Invalid folder');
        const offset = Number(url.searchParams.get('offset') ?? 0);
        if (!Number.isSafeInteger(offset) || offset < 0) fail(400, 'Invalid pagination');
        const images = url.searchParams.get('images') === 'true';
        const search = url.searchParams.get('q') ?? '';
        if (search.length > 255) fail(400, 'Search is too long');
        const type = url.searchParams.get('type') ?? '';
        if (!['', 'image', 'video'].includes(type)) fail(400, 'Invalid file type');
        const types = images
          ? IMAGE_TYPES
          : MEDIA_TYPES.filter((mime) => !type || mime.startsWith(`${type}/`));
        await ensureReady();
        const { rows: folders } = await db.query<MediaFolder>(
          'select id, name from sedna__media_folders order by name, id',
        );
        if (folder && folder !== 'all' && !folders.some((item) => item.id === folder))
          fail(404, 'Folder not found');
        const { rows: counts } =
          folder === 'all'
            ? await db.query<{ folder_id: string | null; count: number }>(
                `select folder_id, count(*)::integer as count from sedna__media
               where type = any($1::text[]) group by folder_id`,
                [IMAGE_TYPES],
              )
            : { rows: [] };
        const { rows } = await db.query<MediaFile>(
          `select id, name, src, type, size, width, height, folder_id, created_at
          from sedna__media where ($2::boolean or folder_id is not distinct from $1::uuid)
          and type = any($3::text[]) and position(lower($5::text) in lower(name)) > 0
          order by created_at desc, id desc limit 49 offset $4`,
          [folder === 'all' ? null : folder, folder === 'all', types, offset, search],
        );
        return json({
          media: rows.slice(0, 48),
          folders,
          imageCounts: Object.fromEntries(counts.map((item) => [item.folder_id ?? '', item.count])),
          hasMore: rows.length > 48,
        });
      }
      if (!request.headers.get('content-type')?.startsWith('application/json'))
        fail(415, 'Expected JSON');
      const text = await request.text();
      if (text.length > 8192) fail(413, 'Request too large');
      let body: Record<string, unknown>;
      try {
        body = JSON.parse(text);
      } catch {
        fail(400, 'Invalid JSON');
      }
      if (!body || typeof body !== 'object' || Array.isArray(body)) fail(400, 'Expected an object');
      if (resource === 'media-folders') {
        const folderName = name(body.name);
        if (folderName.toLowerCase() === 'uncategorized')
          fail(400, 'Uncategorized is the default folder. Choose another name.');
        if (request.method === 'POST' && id) fail(405, 'Method not allowed');
        if (request.method === 'PATCH' && !id) fail(405, 'Method not allowed');
        await ensureReady();
        const {
          rows: [folder],
        } =
          request.method === 'POST'
            ? await db.query<MediaFolder>(
                'insert into sedna__media_folders (name) values ($1) returning id, name',
                [folderName],
              )
            : await db.query<MediaFolder>(
                'update sedna__media_folders set name = $1 where id = $2 returning id, name',
                [folderName, id],
              );
        if (!folder) fail(404, 'Folder not found');
        return json({ folder }, request.method === 'POST' ? 201 : 200);
      }
      const folder = body.folder_id ?? null;
      if (folder !== null && !uuid(folder)) fail(400, 'Invalid folder');
      if (request.method === 'PATCH') {
        if (!id) fail(405, 'Method not allowed');
        if (!Object.hasOwn(body, 'folder_id')) fail(400, 'Provide a folder');
        await ensureReady();
        const {
          rows: [media],
        } = await db.query<MediaFile>(
          'update sedna__media set folder_id = $1 where id = $2 returning *',
          [folder, id],
        );
        if (!media) fail(404, 'Media not found');
        return json({ media });
      }
      if (id) fail(405, 'Method not allowed');
      const mediaName = name(body.name);
      if (!managedSource(body.src, options.storage))
        fail(400, "Only uploads to this site's storage can be added to Media.");
      if (
        typeof body.type !== 'string' ||
        !MEDIA_TYPES.includes(body.type) ||
        !Number.isInteger(body.size) ||
        Number(body.size) < 1 ||
        Number(body.size) > maxMediaBytes(body.type)
      )
        fail(400, 'Choose a supported image, GIF, SVG, MP4, or WebM within its size limit.');
      const image = IMAGE_TYPES.includes(body.type);
      if (
        image &&
        (!Number.isInteger(body.width) ||
          Number(body.width) < 1 ||
          Number(body.width) > 2147483647 ||
          !Number.isInteger(body.height) ||
          Number(body.height) < 1 ||
          Number(body.height) > 2147483647)
      )
        fail(400, 'Provide valid image dimensions');
      if (
        body.type === SVG_TYPE &&
        !verifySvgReceipt(
          { src: body.src, size: body.size, width: body.width, height: body.height },
          body.svgProof,
        )
      )
        fail(400, 'SVG files must pass through the sanitised upload endpoint.');
      await ensureReady();
      const {
        rows: [media],
      } = await db.query<MediaFile>(
        `insert into sedna__media (name, src, type, size, width, height, folder_id)
        values ($1, $2, $3, $4, $5, $6, $7) on conflict (src) do update set src = excluded.src returning *`,
        [
          mediaName,
          body.src,
          body.type,
          body.size,
          image ? body.width : null,
          image ? body.height : null,
          folder,
        ],
      );
      return json({ media }, 201);
    } catch (error) {
      if (error instanceof HttpError) return json({ error: error.message }, error.status);
      const code = (error as { code?: string }).code;
      if (code === '23505') return json({ error: 'A folder with that name already exists.' }, 409);
      if (code === '23503') return json({ error: 'Folder not found. Refresh and try again.' }, 404);
      const message =
        code === '42501'
          ? 'The database user does not have permission to access the media library. Ask your site administrator to check database permissions.'
          : code === '28P01' || code === '28000'
            ? 'The database rejected the connection credentials. Ask your site administrator to check the database configuration.'
            : code === '42P01' || code === '42703' || code === '3D000'
              ? 'The media database is not set up correctly. Ask your site administrator to check the database setup.'
              : code?.startsWith('08') ||
                  [
                    'ECONNREFUSED',
                    'ECONNRESET',
                    'ETIMEDOUT',
                    'ENOTFOUND',
                    'EAI_AGAIN',
                    '57P01',
                    '57P03',
                    '53300',
                  ].includes(code ?? '')
                ? 'Could not connect to the media database. Try again in a moment. If this continues, ask your site administrator to check the database connection.'
                : 'The server could not complete the media request. Try again. If this continues, ask your site administrator to check the server logs.';
      log.error({
        message: `Media request failed${code ? ` (${code})` : ''}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        hint: message,
      });
      return json({ error: message }, 503);
    }
  };
}
