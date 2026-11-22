import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

test('documentation link checks parse elements rather than sample text or comments', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'sedna-doc-links-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const run = () =>
    spawnSync(
      process.execPath,
      [fileURLToPath(new URL('./check-docs-links.mjs', import.meta.url)), root],
      { encoding: 'utf8' },
    );
  assert.notEqual(run().status, 0, 'empty builds must fail');
  for (const fixture of [
    { html: '<a href=/missing/>Missing</a>', error: /missing page or asset/ },
    { html: '<code>id="ghost"</code><a href="#ghost">Ghost</a>', error: /missing anchor/ },
    {
      html: '<!-- <h2 id="ghost">Ghost</h2> --><a href="#ghost">Ghost</a>',
      error: /missing anchor/,
    },
    { html: '<!-- <a href="/missing/">Comment</a> -->' },
    { html: '<h2 id="a&amp;b">Heading</h2><a href="#a&amp;b">Heading</a>' },
    { html: '<h2 id=setup>Setup</h2><a href=#setup>Setup</a>' },
    { html: '<a name="legacy"></a><a href="#legacy">Legacy anchor</a>' },
  ]) {
    await writeFile(join(root, 'index.html'), fixture.html);
    const result = run();
    if (fixture.error) {
      assert.notEqual(result.status, 0, fixture.html);
      assert.match(result.stderr, fixture.error);
    } else {
      assert.equal(result.status, 0, result.stderr);
    }
  }
});
