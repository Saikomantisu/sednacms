import { readdir, readFile, stat } from 'node:fs/promises';
import { extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const root = process.argv[2]
  ? resolve(process.argv[2])
  : fileURLToPath(new URL('../apps/docs/dist/', import.meta.url));
const origin = 'https://docs.invalid';
const pages = (await readdir(root, { recursive: true }))
  .filter((path) => path.endsWith('.html'))
  .map((path) => join(root, path));
if (!pages.length) throw new Error('No generated documentation pages found. Build the docs first.');
const documents = new Map(
  await Promise.all(
    pages.map(async (path) => {
      const dom = new JSDOM(await readFile(path, 'utf8'));
      const document = dom.window.document;
      const hrefs = [...document.querySelectorAll('a[href], link[href], area[href]')].map(
        (element) => element.getAttribute('href'),
      );
      const anchors = new Set([
        ...[...document.querySelectorAll('[id]')].map((element) => element.id),
        ...[...document.querySelectorAll('a[name]')].map((element) => element.getAttribute('name')),
      ]);
      dom.window.close();
      return [path, { hrefs, anchors }];
    }),
  ),
);
const targets = new Map();
const failures = [];
let checked = 0;

async function target(pathname) {
  if (targets.has(pathname)) return targets.get(pathname);
  const path = resolve(root, `.${decodeURIComponent(pathname)}`);
  for (const candidate of [path, join(path, 'index.html'), `${path}.html`]) {
    try {
      if ((await stat(candidate)).isFile()) {
        targets.set(pathname, candidate);
        return candidate;
      }
    } catch (error) {
      if (!['ENOENT', 'ENOTDIR'].includes(error.code)) throw error;
    }
  }
  targets.set(pathname, undefined);
}

for (const [path, { hrefs }] of documents) {
  const from = relative(root, path).replaceAll('\\', '/');
  for (const value of hrefs) {
    const url = new URL(value, `${origin}/${from}`);
    if (url.origin !== origin) continue;
    checked++;
    const destination = await target(url.pathname);
    if (!destination) {
      failures.push(`${from}: missing page or asset ${value}`);
      continue;
    }
    if (url.hash && extname(destination) === '.html') {
      const fragment = decodeURIComponent(url.hash.slice(1));
      if (!documents.get(destination).anchors.has(fragment))
        failures.push(`${from}: missing anchor ${value}`);
    }
  }
}

if (failures.length) throw new Error(failures.join('\n'));
console.log(`Checked ${checked} internal links across ${pages.length} documentation pages.`);
