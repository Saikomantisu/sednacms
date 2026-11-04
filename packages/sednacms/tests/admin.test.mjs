import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { resolveAdminFavicon } from '../dist/admin/favicon.js';

function publicDirectory(t) {
  const directory = mkdtempSync(join(tmpdir(), 'sedna-favicon-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return pathToFileURL(`${directory}/`);
}

test('admin falls back to Sedna without a site icon', (t) => {
  const directory = publicDirectory(t);
  assert.match(resolveAdminFavicon(directory, '/'), /^data:image\/svg\+xml,/);
  // A directory named favicon.svg is not an icon.
  mkdirSync(new URL('favicon.svg', directory));
  assert.match(resolveAdminFavicon(directory, '/'), /^data:image\/svg\+xml,/);
  assert.match(resolveAdminFavicon(new URL('missing/', directory), '/'), /^data:image\/svg\+xml,/);
});

test('admin discovers site icons in SVG, ICO, PNG order', (t) => {
  const directory = publicDirectory(t);
  for (const extension of ['png', 'ico', 'svg']) {
    const name = `favicon.${extension}`;
    writeFileSync(new URL(name, directory), 'icon fixture');
    assert.equal(resolveAdminFavicon(directory, '/'), `/${name}`);
    assert.equal(resolveAdminFavicon(directory, '/site/'), `/site/${name}`);
    assert.equal(resolveAdminFavicon(directory, '/site'), `/site/${name}`);
  }
});

test('explicit admin favicon overrides discovery and fallback', (t) => {
  const directory = publicDirectory(t);
  for (const override of ['/custom.svg', 'https://example.com/brand.png']) {
    assert.equal(resolveAdminFavicon(directory, '/', override), override);
    writeFileSync(new URL('favicon.svg', directory), 'icon fixture');
    assert.equal(resolveAdminFavicon(directory, '/site/', override), override);
  }
});
