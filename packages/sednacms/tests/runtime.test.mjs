import assert from 'node:assert/strict';
import { test } from 'node:test';
import { onRequestEnd, runtimeResource, withRequestResources } from '../dist/runtime.js';

test('Node resources are reused while concurrent Worker requests have separate resources', async () => {
  let created = 0;
  const closed = [];
  const resource = runtimeResource(() => {
    const value = { id: ++created };
    onRequestEnd(async () => {
      closed.push(value.id);
    });
    return value;
  });
  const shared = resource();
  assert.equal(resource(), shared);
  await Promise.all(
    [1, 2].map(() =>
      withRequestResources(async () => {
        const local = resource();
        await new Promise((resolve) => setImmediate(resolve));
        assert.equal(resource(), local);
        assert.notEqual(local, shared);
      }),
    ),
  );
  assert.equal(created, 3);
  assert.deepEqual(closed.sort(), [2, 3]);
  assert.equal(resource(), shared);
});

test('Worker resources are closed after a failed request', async () => {
  let closed = false;
  await assert.rejects(
    withRequestResources(async () => {
      onRequestEnd(async () => {
        closed = true;
      });
      throw new Error('render failed');
    }),
    /render failed/,
  );
  assert.equal(closed, true);
});
