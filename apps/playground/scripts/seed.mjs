// Adds dummy content to empty collections. Run with: npm run playground:seed
// Pass a collection name to seed only that one, for example: npm run seed -w sednacms-playground -- posts
import { createPool, ident, transaction } from '../../../packages/sednacms/dist/db/client.js';
import { ensureTables } from '../../../packages/sednacms/dist/db/tables.js';
import { postFields, testimonialFields } from '../src/schema.ts';
import { dummyPosts, dummyTestimonials } from './seed-data.ts';

const collections = [
  { collection: 'posts', fields: postFields, entries: dummyPosts },
  { collection: 'testimonials', fields: testimonialFields, entries: dummyTestimonials },
].filter(({ collection }) => !process.argv[2] || collection === process.argv[2]);

if (!collections.length) throw new Error(`Unknown collection: ${process.argv[2]}`);
if (!process.env.SEDNA_DATABASE_URL) throw new Error('Set SEDNA_DATABASE_URL in .env.');

// These field types are stored as JSON.
const jsonTypes = ['list', 'object', 'image'];

const pool = createPool(process.env.SEDNA_DATABASE_URL, 1);
try {
  await transaction(pool, async (client) => {
    await ensureTables(client, collections, { info: console.log, warn: console.warn });

    for (const { collection, fields, entries } of collections) {
      const table = ident(`sedna_${collection}`);
      const names = Object.keys(fields);

      const { rowCount } = await client.query(`select 1 from ${table} limit 1`);
      if (rowCount) {
        console.log(`Skipped ${collection}: it already has entries.`);
        continue;
      }

      for (const [index, entry] of entries.entries()) {
        const isJson = (name) => jsonTypes.includes(fields[name].type);
        const values = names.map((name) =>
          isJson(name) ? JSON.stringify(entry[name]) : entry[name],
        );
        const placeholders = names.map((name, i) =>
          isJson(name) ? `$${i + 1}::jsonb` : `$${i + 1}`,
        );
        await client.query(
          `insert into ${table} (${names.map(ident).join(', ')}, status, published_at, sort_order)
           values (${placeholders.join(', ')}, 'published', now(), $${names.length + 1})`,
          [...values, index],
        );
      }
      console.log(`Added ${entries.length} dummy ${collection}.`);
    }
  });
} finally {
  await pool.end();
}
