import { createHash } from 'node:crypto';
import { createPool, transaction } from '../../dist/db/client.js';
import { ensureTables } from '../../dist/db/tables.js';
import { examplePackages } from '../src/examples/package.ts';
import { packageFields } from '../src/schema.ts';

if (!process.env.SEDNA_DATABASE_URL) throw new Error('Set SEDNA_DATABASE_URL in playground/.env.');
const pool = createPool(process.env.SEDNA_DATABASE_URL, 1);
try {
  const added = await transaction(pool, async (client) => {
    await client.query("select pg_advisory_xact_lock(hashtext('sedna:playground:seed-packages'))");
    await ensureTables(client, [{ collection: 'packages', fields: packageFields }], {
      info: console.log,
      warn: console.warn,
    });
    let count = 0;
    for (const data of examplePackages) {
      // Stable IDs make reruns safe even after an editor changes an example's title.
      const id = createHash('sha256')
        .update(`sedna:playground:package:${data.title}`)
        .digest('hex')
        .slice(0, 32);
      const result = await client.query(
        `insert into sedna_packages (id, title, summary, highlights, itinerary, status, published_at, sort_order)
         values ($1::uuid, $2, $3, $4::jsonb, $5::jsonb, 'published', now(),
           (select coalesce(max(sort_order), -1) + 1 from sedna_packages))
         on conflict (id) do nothing`,
        [
          id,
          data.title,
          data.summary,
          JSON.stringify(data.highlights),
          JSON.stringify(data.itinerary),
        ],
      );
      count += result.rowCount;
    }
    return count;
  });
  console.log(`Added ${added} example packages. Existing entries were kept.`);
} finally {
  await pool.end();
}
