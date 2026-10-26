import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { AstroIntegration, AstroIntegrationLogger } from 'astro';
import { loadEnv } from 'vite';
import { createSql } from './db/client.js';
import { ensureTables } from './db/tables.js';
import { isSednaLoader, type CollectionConfig } from './loader.js';

export { fields } from './fields.js';
export type { Field, FieldType, FieldsData, ImageValue } from './fields.js';
export { sednaLoader } from './loader.js';
export type { CollectionConfig } from './loader.js';

const LIVE_CONFIG_FILES = ['live.config.ts', 'live.config.mts', 'live.config.js', 'live.config.mjs'];

type Import = (path: string) => Promise<Record<string, unknown>>;

async function readCollections(srcDir: string, importModule: Import): Promise<CollectionConfig[] | undefined> {
  const file = LIVE_CONFIG_FILES.map((name) => srcDir + name).find((path) => existsSync(path));
  if (!file) return undefined;
  const mod = await importModule(file);
  const collections = (mod.collections ?? {}) as Record<string, { loader?: unknown }>;
  return Object.values(collections)
    .map((c) => c.loader)
    .filter(isSednaLoader)
    .map((loader) => loader.sedna);
}

async function syncTables(databaseUrl: string, collections: CollectionConfig[], logger: AstroIntegrationLogger) {
  const sql = createSql(databaseUrl);
  try {
    await ensureTables(sql, collections, logger);
  } finally {
    await sql.end();
  }
}

export default function sedna(): AstroIntegration {
  let root = '';
  let srcDir = '';

  return {
    name: 'sednacms',
    hooks: {
      'astro:config:setup': ({ config, logger }) => {
        root = fileURLToPath(config.root);
        srcDir = fileURLToPath(config.srcDir);
        logger.info('Sedna CMS loaded');
      },
      'astro:server:setup': async ({ server, logger }) => {
        // The loader reads the connection string from process.env, which Vite does not fill from .env files.
        const databaseUrl = loadEnv('development', root, 'SEDNA_').SEDNA_DATABASE_URL ?? process.env.SEDNA_DATABASE_URL;
        if (databaseUrl) process.env.SEDNA_DATABASE_URL = databaseUrl;

        const runner = (server.environments.ssr as { runner?: { import: Import } }).runner;
        if (!runner) {
          logger.warn('Could not load src/live.config.ts in this environment. Skipping table setup.');
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
