import { Pool, type PoolClient, types } from 'pg';
import { log } from '../log.js';

export type { Pool, PoolClient };
/** Anything that can run a query: the pool, or a client inside a transaction. */
export type Queryable = Pick<PoolClient, 'query'>;

const DATE_OID = 1082;

// pg 8 treats sslmode=prefer, require and verify-ca as verify-full, and warns on every start that pg 9
// will weaken them to their libpq meaning. Hosts like Neon hand out `sslmode=require` URLs. Writing
// verify-full out keeps today's behavior, silences the warning, and stays strict after the pg 9 upgrade.
function explicitSslMode(connectionString: string) {
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    return connectionString;
  }
  const mode = url.searchParams.get('sslmode');
  if (
    url.searchParams.has('uselibpqcompat') ||
    !['prefer', 'require', 'verify-ca'].includes(mode ?? '')
  ) {
    return connectionString;
  }
  url.searchParams.set('sslmode', 'verify-full');
  return url.href;
}

function positiveInteger(value: string | undefined, fallback: number, name: string) {
  const number = value === undefined ? fallback : Number(value);
  if (!Number.isSafeInteger(number) || number < 1)
    throw new Error(`sednacms: ${name} must be a positive integer.`);
  return number;
}

export function createPool(
  connectionString: string,
  max?: number,
  env: Record<string, string | undefined> = process.env,
): Pool {
  max ??= positiveInteger(env.SEDNA_DATABASE_POOL_MAX, 5, 'SEDNA_DATABASE_POOL_MAX');
  const pool = new Pool({
    connectionString: explicitSslMode(connectionString),
    max,
    connectionTimeoutMillis: positiveInteger(
      env.SEDNA_DATABASE_CONNECTION_TIMEOUT_MS,
      10_000,
      'SEDNA_DATABASE_CONNECTION_TIMEOUT_MS',
    ),
    // pg closes idle connections after 10 seconds by default, and reopening one to a remote database
    // costs a full TLS handshake (over a second), so keep them open between requests.
    idleTimeoutMillis: 5 * 60_000,
    types: {
      // A `date` column is a calendar day with no timezone. Keep it as the "YYYY-MM-DD" string
      // Postgres sends, instead of a JS Date that would land on a different day in some timezones.
      getTypeParser: ((oid: number, format?: 'text' | 'binary') =>
        oid === DATE_OID
          ? (value: string) => value
          : types.getTypeParser(oid, format)) as typeof types.getTypeParser,
    },
  });
  // The database can drop an idle connection (Neon suspends idle computes). The pool replaces it on
  // the next query; without this listener the dropped connection's error would crash the server.
  pool.on('error', (error) => log.warn(`Database connection closed: ${error.message}`));
  return pool;
}

/** Quote a table or column name. Names are validated before they get here; this also escapes quotes. */
export function ident(name: string) {
  return `"${name.replaceAll('"', '""')}"`;
}

export async function transaction<T>(
  pool: Pool,
  run: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  let broken: Error | undefined;
  try {
    await client.query('begin');
    const result = await run(client);
    await client.query('commit');
    return result;
  } catch (error) {
    // If rollback fails the connection is unusable, so the pool discards it instead of reusing it.
    await client.query('rollback').catch((rollbackError: Error) => {
      broken = rollbackError;
    });
    throw error;
  } finally {
    client.release(broken);
  }
}
