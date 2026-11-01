import { copyFileSync, mkdirSync } from 'node:fs';

mkdirSync(new URL('../dist/admin/', import.meta.url), { recursive: true });
for (const file of ['index.astro', 'style.css']) {
  copyFileSync(
    new URL(`../src/admin/${file}`, import.meta.url),
    new URL(`../dist/admin/${file}`, import.meta.url),
  );
}
