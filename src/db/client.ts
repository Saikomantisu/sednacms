import postgres from 'postgres';

export type Sql = postgres.Sql;

export function createSql(url: string): Sql {
  return postgres(url, {
    // Pooled connections (PgBouncer, Neon pooler) run in transaction mode, which does not support prepared statements.
    prepare: false,
    // Hide "already exists, skipping" notices from IF NOT EXISTS statements.
    onnotice: () => {},
  });
}
