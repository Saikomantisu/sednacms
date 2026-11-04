import { createHash } from 'node:crypto';
import { createPool, ident, transaction } from '../../../packages/sednacms/dist/db/client.js';
import { ensureTables } from '../../../packages/sednacms/dist/db/tables.js';
import { packageFields, postFields, testimonialFields } from '../src/schema.ts';
import { dummyPackages, dummyPosts, dummyTestimonials } from './seed-data.ts';

const collections = [
  { collection: 'packages', fields: packageFields, entries: dummyPackages },
  { collection: 'posts', fields: postFields, entries: dummyPosts },
  { collection: 'testimonials', fields: testimonialFields, entries: dummyTestimonials },
].filter(({ collection }) => !process.argv[2] || collection === process.argv[2]);
if (!collections.length) throw new Error('Unknown collection to seed.');

if (!process.env.SEDNA_DATABASE_URL)
  throw new Error('Set SEDNA_DATABASE_URL in apps/playground/.env.');
const pool = createPool(process.env.SEDNA_DATABASE_URL, 1);
try {
  const added = await transaction(pool, async (client) => {
    await client.query("select pg_advisory_xact_lock(hashtext('sedna:playground:seed-packages'))");
    await ensureTables(client, collections, {
      info: console.log,
      warn: console.warn,
    });
    const counts = {};
    for (const { collection, fields, entries } of collections) {
      const table = ident(`sedna_${collection}`);
      const names = Object.keys(fields);
      const jsonField = (name) => ['list', 'object', 'image'].includes(fields[name].type);
      counts[collection] = 0;
      for (const data of entries) {
        // Keep the original package seed IDs and preserve edits on subsequent runs.
        const namespace = collection === 'packages' ? 'package' : collection;
        const id = createHash('sha256')
          .update(`sedna:playground:${namespace}:${data.title ?? data.name}`)
          .digest('hex')
          .slice(0, 32);
        const placeholders = names.map(
          (name, index) => `$${index + 2}${jsonField(name) ? '::jsonb' : ''}`,
        );
        const result = await client.query(
          `insert into ${table} (id, ${names.map(ident).join(', ')}, status, published_at, sort_order)
           values ($1::uuid, ${placeholders.join(', ')}, 'published', now(),
             (select coalesce(max(sort_order), -1) + 1 from ${table}))
           on conflict do nothing`,
          [
            id,
            ...names.map((name) =>
              jsonField(name) ? JSON.stringify(data[name] ?? null) : (data[name] ?? null),
            ),
          ],
        );
        counts[collection] += result.rowCount;
      }
    }
    return counts;
  });
  for (const [collection, count] of Object.entries(added)) {
    console.log(`Added ${count} dummy ${collection}. Existing entries were kept.`);
  }
} finally {
  await pool.end();
}
