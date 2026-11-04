import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatEntry, log, logOnce } from '../dist/log.js';

test('entries format like Astro errors: message, then indented hint paragraphs', () => {
  assert.equal(formatEntry('Plain'), 'Plain');
  assert.equal(formatEntry({ message: 'No hint' }), 'No hint');
  assert.equal(
    formatEntry({ message: 'Broken.', hint: ['Fix one.', 'Or two.'] }),
    'Broken.\n  Hint:\n    Fix one.\n\n    Or two.',
  );
});

test('runtime logs use the Astro prefix for each level and logOnce deduplicates', (t) => {
  const lines = [];
  for (const level of ['info', 'warn', 'error'])
    t.mock.method(console, level, (line) => lines.push(line));
  log.info('Ready');
  log.warn('Careful');
  log.error({ message: 'Failed.', hint: 'Fix it.' });
  logOnce('error', 'Same');
  logOnce('error', 'Same');
  assert.match(lines[0], /^\d\d:\d\d:\d\d \[sednacms\] Ready$/);
  assert.match(lines[1], /^\d\d:\d\d:\d\d \[WARN\] \[sednacms\] Careful$/);
  assert.match(
    lines[2],
    /^\d\d:\d\d:\d\d \[ERROR\] \[sednacms\] Failed\.\n {2}Hint:\n {4}Fix it\.$/,
  );
  assert.equal(lines.length, 4);
});
