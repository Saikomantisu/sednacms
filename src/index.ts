import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { AstroIntegration, AstroIntegrationLogger } from 'astro';
import { loadEnv, searchForWorkspaceRoot } from 'vite';
import { resolveAdminFavicon } from './admin/favicon.js';
import { type CacheOptions, validateCache } from './cache.js';
import { createPool } from './db/client.js';
import { ensureTables } from './db/tables.js';
import { type CollectionConfig, isSednaLoader } from './loader.js';
import type { StorageAdapter } from './storage/config.js';

export type {
  ApiErrorResponse,
  CmsEntry,
  EntriesResponse,
  EntryResponse,
  EntryStatus,
  EntryWrite,
  ReorderRequest,
  ReorderResponse,
  SchemaResponse,
} from './api/types.js';
export type { CacheOptions } from './cache.js';
export type { Field, FieldData, FieldsData, FieldType, ImageValue } from './fields.js';
export { fields } from './fields.js';
export type { CollectionConfig, CollectionFilter } from './loader.js';
export { sednaLoader } from './loader.js';
export type {
  ImageProcessingOptions,
  SignedUpload,
  StorageAdapter,
  UploadConfig,
} from './storage/config.js';
export { s3Storage, uploadthingStorage } from './storage/config.js';

const LIVE_CONFIG_FILES = [
  'live.config.ts',
  'live.config.mts',
  'live.config.js',
  'live.config.mjs',
];

type Import = (path: string) => Promise<Record<string, unknown>>;

async function readCollections(
  srcDir: string,
  importModule: Import,
): Promise<CollectionConfig[] | undefined> {
  const file = LIVE_CONFIG_FILES.map((name) => srcDir + name).find((path) => existsSync(path));
  if (!file) return undefined;
  const mod = await importModule(file);
  const collections = (mod.collections ?? {}) as Record<string, { loader?: unknown }>;
  return Object.values(collections)
    .map((c) => c.loader)
    .filter(isSednaLoader)
    .map((loader) => loader.sedna);
}

async function syncTables(
  databaseUrl: string,
  collections: CollectionConfig[],
  logger: AstroIntegrationLogger,
) {
  const pool = createPool(databaseUrl, 1);
  try {
    await ensureTables(pool, collections, logger);
  } finally {
    await pool.end();
  }
}

export type SednaPlatform = 'none' | 'cloudflare' | 'vercel' | 'netlify';

const adapterPlatforms: Record<string, SednaPlatform> = {
  '@astrojs/cloudflare': 'cloudflare',
  '@astrojs/vercel': 'vercel',
  '@astrojs/netlify': 'netlify',
};

export interface SednaOptions {
  /** Override platform identification from Astro's adapter. `none` opts out. */
  platform?: SednaPlatform;
  /** Disabled by default. Opt in to CDN caching with a TTL and platform purge support. */
  cache?: false | CacheOptions;
  storage?: StorageAdapter;
  admin?: {
    /** Admin favicon URL. Defaults to the site's public/favicon.svg, .ico, or .png. */
    favicon?: string;
  };
}

export default function sedna(options: SednaOptions = {}): AstroIntegration {
  validateCache(options.cache);
  if (
    options.platform !== undefined &&
    !['none', 'cloudflare', 'vercel', 'netlify'].includes(options.platform)
  )
    throw new Error('sednacms: platform must be none, cloudflare, vercel, or netlify.');
  let platform: SednaPlatform = options.platform ?? 'none';
  let root = '';
  let srcDir = '';

  return {
    name: 'sednacms',
    hooks: {
      'astro:config:setup': ({ config, logger, injectRoute, updateConfig, addMiddleware }) => {
        root = fileURLToPath(config.root);
        srcDir = fileURLToPath(config.srcDir);
        const liveConfig = LIVE_CONFIG_FILES.map((name) => srcDir + name).find((path) =>
          existsSync(path),
        );
        const env = loadEnv(
          process.env.NODE_ENV === 'production' ? 'production' : 'development',
          root,
          ['SEDNA_', 'UPLOADTHING_'],
        );
        const patterns: { protocol: 'https'; hostname: string }[] = [];
        if (options.storage?.provider === 'uploadthing')
          patterns.push({ protocol: 'https', hostname: '*.ufs.sh' });
        if (options.storage?.provider === 's3') {
          const publicUrl = process.env.SEDNA_S3_PUBLIC_URL ?? env.SEDNA_S3_PUBLIC_URL;
          if (publicUrl)
            patterns.push({ protocol: 'https', hostname: new URL(publicUrl).hostname });
        }
        updateConfig({
          image: { remotePatterns: [...config.image.remotePatterns, ...patterns] },
          vite: {
            server: {
              fs: {
                // Workers and WASM assets can live outside the app in a linked install.
                allow: [
                  ...(config.vite.server?.fs?.allow ?? [searchForWorkspaceRoot(root)]),
                  fileURLToPath(new URL('../', import.meta.url)),
                ],
              },
            },
            plugins: [
              {
                name: 'sedna-collections',
                resolveId(id) {
                  if (id === 'virtual:sedna/collections') return '\0virtual:sedna/collections';
                  if (id === 'virtual:sedna/adapter') return '\0virtual:sedna/adapter';
                  if (id === 'virtual:sedna/admin') return '\0virtual:sedna/admin';
                  if (id === 'virtual:sedna/storage') return '\0virtual:sedna/storage';
                  if (id === 'virtual:sedna/cache') return '\0virtual:sedna/cache';
                  if (id === 'virtual:sedna/platform') return '\0virtual:sedna/platform';
                },
                load(id) {
                  if (id === '\0virtual:sedna/adapter') return 'export const adapter = null;';
                  if (id === '\0virtual:sedna/platform')
                    return `export const platform = ${JSON.stringify(platform)};`;
                  if (id === '\0virtual:sedna/cache')
                    return `export const cache = ${JSON.stringify(options.cache ?? false)};`;
                  if (id === '\0virtual:sedna/storage')
                    return `export const storage = ${JSON.stringify(options.storage ?? null)};`;
                  if (id === '\0virtual:sedna/admin') {
                    return `export const favicon = ${JSON.stringify(resolveAdminFavicon(config.publicDir, config.base, options.admin?.favicon))}; export const uploadsEnabled = ${Boolean(options.storage)}; export const disposableDemo = false;`;
                  }
                  if (id === '\0virtual:sedna/collections')
                    return liveConfig
                      ? `export { collections } from ${JSON.stringify(liveConfig)};`
                      : 'export const collections = {};';
                },
              },
            ],
          },
        });
        addMiddleware({
          entrypoint: fileURLToPath(new URL('./middleware.js', import.meta.url)),
          order: 'pre',
        });
        injectRoute({
          pattern: '/admin/[...path]',
          entrypoint: fileURLToPath(new URL('./admin/index.astro', import.meta.url)),
          prerender: false,
        });
        injectRoute({
          pattern: '/api/cms/[...path]',
          entrypoint: fileURLToPath(new URL('./api/route.js', import.meta.url)),
          prerender: false,
        });
        logger.info('Sedna CMS loaded');
      },
      'astro:config:done': ({ config, logger }) => {
        // Read the final adapter after its integration has called setAdapter().
        const adapter = config.adapter?.name;
        platform =
          options.platform ??
          (adapter && Object.hasOwn(adapterPlatforms, adapter)
            ? adapterPlatforms[adapter]
            : 'none');
        logger.info(
          `Platform: ${platform}${options.platform === undefined ? ' (automatic)' : ' (explicit)'}`,
        );
      },
      'astro:server:setup': async ({ server, logger }) => {
        // The loader reads the connection string from process.env, which Vite does not fill from .env files.
        const env = loadEnv('development', root, ['SEDNA_', 'UPLOADTHING_']);
        for (const [key, value] of Object.entries(env)) process.env[key] ??= value;
        const databaseUrl = process.env.SEDNA_DATABASE_URL;
        if (databaseUrl) process.env.SEDNA_DATABASE_URL = databaseUrl;

        const runner = (server.environments.ssr as { runner?: { import: Import } }).runner;
        if (!runner) {
          logger.warn(
            'Could not load src/live.config.ts in this environment. Skipping table setup.',
          );
          return;
        }
        const collections = await readCollections(srcDir, (path) => runner.import(path));
        if (!collections?.length) {
          logger.info('No Sedna collections found in src/live.config.ts');
          return;
        }
        if (!databaseUrl) {
          logger.warn('SEDNA_DATABASE_URL is not set. Skipping table setup.');
          return;
        }
        try {
          await syncTables(databaseUrl, collections, logger);
          logger.info(`Database ready (${collections.map((c) => c.collection).join(', ')})`);
        } catch (error) {
          logger.error(`Could not set up database tables: ${(error as Error).message}`);
        }
      },
    },
  };
}
