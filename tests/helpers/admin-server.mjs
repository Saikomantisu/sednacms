import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { Pool } from 'pg';

if (!process.env.SEDNA_TEST_DATABASE_URL) throw new Error('Set SEDNA_TEST_DATABASE_URL');
const pool = new Pool({ connectionString: process.env.SEDNA_TEST_DATABASE_URL });
const schema = 'sedna_ui_' + randomUUID().replaceAll('-', '');
const url = new URL(process.env.SEDNA_TEST_DATABASE_URL);
url.hostname = url.hostname.replace('-pooler.', '.');
url.searchParams.set('options', `-c search_path=${schema}`);
await pool.query(`CREATE SCHEMA ${schema}`);
const child = spawn(process.execPath, ['playground/dist/server/entry.mjs'], {
  env: {
    ...process.env,
    HOST: '127.0.0.1',
    PORT: '14330',
    SEDNA_DATABASE_URL: url.href,
    SEDNA_URL: 'http://127.0.0.1:14330',
    SEDNA_SECRET: randomUUID(),
    SEDNA_SETUP_TOKEN: 'sedna-temporary-ui-setup-token-2026',
  },
  stdio: ['ignore', 'inherit', 'inherit'],
});
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  if (child.exitCode === null) {
    child.kill('SIGTERM');
    await once(child, 'exit');
  }
  await pool.query(`DROP SCHEMA ${schema} CASCADE`);
  await pool.end();
  console.log('Temporary admin test schema removed.');
}
process.on('SIGINT', () => {
  void close();
});
process.on('SIGTERM', () => {
  void close();
});
child.on('exit', () => {
  void close();
});
