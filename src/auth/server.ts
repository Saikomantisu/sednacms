import { randomUUID, timingSafeEqual } from 'node:crypto';
import { betterAuth } from 'better-auth';
import { hashPassword } from 'better-auth/crypto';
import { getMigrations } from 'better-auth/db/migration';
import { Pool } from 'pg';

// System tables are separate from collection tables, including in an existing site database.
export function createAuthServer(env: Record<string, string | undefined> = process.env) {
  const { SEDNA_DATABASE_URL: connectionString, SEDNA_SECRET: secret, SEDNA_URL: baseURL } = env;
  if (!connectionString) throw new Error('sednacms: SEDNA_DATABASE_URL is required for authentication.');
  if (!secret || secret.length < 32) throw new Error('sednacms: SEDNA_SECRET must contain at least 32 characters.');
  if (!baseURL) throw new Error('sednacms: SEDNA_URL is required (the site origin, e.g. http://localhost:4321).');
  const origin = new URL(baseURL).origin;
  const pool = new Pool({ connectionString, max: 5 });
  const auth = betterAuth({
    database: pool,
    secret,
    baseURL: origin,
    basePath: '/api/cms/auth',
    trustedOrigins: [origin],
    emailAndPassword: { enabled: true, disableSignUp: true, minPasswordLength: 12 },
    user: { modelName: 'sedna__user' },
    session: { modelName: 'sedna__session' },
    account: { modelName: 'sedna__account' },
    verification: { modelName: 'sedna__verification' },
    advanced: {
      cookiePrefix: 'sedna',
      // Migrations below validate the schema before auth requests can reach the handler.
      database: { validateSchema: false },
      ipAddress: { ipAddressHeaders: ['x-sedna-client-ip'] },
    },
    rateLimit: { enabled: true, storage: 'database', modelName: 'sedna__rate_limit' },
  });
  let ready: Promise<void> | undefined;
  async function ensureReady() {
    if (!ready) {
      ready = (async () => {
        const client = await pool.connect();
        try {
          // Transaction locks work with pooled Neon connections and concurrent cold starts.
          await client.query('BEGIN');
          await client.query("SELECT pg_advisory_xact_lock(hashtext('sedna:auth:migrations'))");
          const migrations = await getMigrations(auth.options);
          await migrations.runMigrations();
          await client.query('COMMIT');
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        } finally { client.release(); }
      })();
      ready.catch(() => { ready = undefined; });
    }
    await ready;
  }
  const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
  async function handle(request: Request) {
    const path = new URL(request.url).pathname;
    // Only expose the auth operations Sedna currently supports.
    const allowed = new Map([
      ['/api/cms/auth/sign-in/email', 'POST'],
      ['/api/cms/auth/sign-out', 'POST'],
      ['/api/cms/auth/get-session', 'GET'],
    ]);
    if (path !== '/api/cms/setup' && !allowed.has(path)) return json({ error: 'Not found' }, 404);
    if (path === '/api/cms/setup') {
      if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
      if (request.headers.get('origin') !== origin) return json({ error: 'Invalid origin' }, 403);
      const token = env.SEDNA_SETUP_TOKEN;
      const provided = request.headers.get('x-sedna-setup-token') ?? '';
      if (!token || token.length < 32 || Buffer.byteLength(token) !== Buffer.byteLength(provided) ||
        !timingSafeEqual(Buffer.from(token), Buffer.from(provided))) return json({ error: 'Invalid setup token' }, 403);
      if (!request.headers.get('content-type')?.startsWith('application/json')) return json({ error: 'Expected JSON' }, 415);
      let body: unknown;
      try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
      const { name, email, password } = (body ?? {}) as Record<string, unknown>;
      if (typeof name !== 'string' || !name.trim() || name.length > 200 ||
          typeof email !== 'string' || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
          typeof password !== 'string' || password.length < 12 || password.length > 128) {
        return json({ error: 'Provide a name, valid email, and a password of 12–128 characters.' }, 400);
      }
      await ensureReady();
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query("SELECT pg_advisory_xact_lock(hashtext('sedna:auth:setup'))");
        const existing = await client.query('SELECT id FROM sedna__user LIMIT 1');
        if (existing.rowCount) {
          await client.query('ROLLBACK');
          return json({ error: 'Setup is already complete' }, 409);
        }
        const id = randomUUID();
        // Use Better Auth's password format; account creation is atomic with the first-user check.
        const passwordHash = await hashPassword(password);
        await client.query('INSERT INTO sedna__user (id, name, email, "emailVerified", "createdAt", "updatedAt") VALUES ($1,$2,$3,false,now(),now())', [id, name.trim(), email.toLowerCase()]);
        await client.query('INSERT INTO sedna__account (id, "userId", "accountId", "providerId", password, "createdAt", "updatedAt") VALUES ($1,$2,$2,\'credential\',$3,now(),now())', [randomUUID(), id, passwordHash]);
        await client.query('COMMIT');
        return json({ user: { id, name: name.trim(), email: email.toLowerCase() } }, 201);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally { client.release(); }
    }
    if (request.method !== allowed.get(path)) return json({ error: 'Method not allowed' }, 405);
    await ensureReady();
    const response = await auth.handler(request);
    response.headers.set('Cache-Control', 'no-store');
    return response;
  }
  return { auth, ensureReady, handle, close: () => pool.end() };
}

let server: ReturnType<typeof createAuthServer> | undefined;
export function getAuthServer() { return server ??= createAuthServer(); }
