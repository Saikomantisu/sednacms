import postgres from 'postgres';

export type Sql = postgres.Sql;

export function createSql(url: string): Sql {
  return postgres(url, {
    // Pooled connections (PgBouncer, Neon pooler) run in transaction mode, which does not support prepared statements.
    prepare: false,
    // Hide "already exists, skipping" notices from IF NOT EXISTS statements.
    onnotice: () => {},
    types: {
      // A `date` column is a calendar day with no timezone. Keep it as the "YYYY-MM-DD" string
      // Postgres sends, instead of a JS Date that would land on a different day in some timezones.
      calendarDate: {
        to: 1082,
        from: [1082],
        serialize: (value: string) => value,
        parse: (value: string) => value,
      },
    },
  });
}
