import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { act, createElement } from 'react';
import { createAdminDom } from './helpers/admin-dom.mjs';

const { dom, restore } = createAdminDom();
after(restore);

function Inspector({ ui: { Dialog, useConfirmation }, results, expose }) {
  const { confirm, dialog } = useConfirmation();
  expose(confirm);
  return createElement(
    Dialog,
    { title: 'File details', onCancel: () => results.push('closed') },
    createElement(
      'button',
      {
        type: 'button',
        onClick: async () => {
          results.push(await confirm('Remove file?', 'This cannot be undone.', 'Remove'));
        },
      },
      'Remove file',
    ),
    dialog,
  );
}

test('dialogs cancel safely, nest confirmations, restore focus and settle on unmount', async (t) => {
  const { Dialog } = await import('../dist/admin/components/ui/dialog.js');
  const { useConfirmation } = await import('../dist/admin/hooks/use-confirmation.js');
  const { createRoot } = await import('react-dom/client');
  const root = createRoot(dom.window.document.querySelector('#app'));
  t.after(async () => {
    await act(async () => root.unmount());
  });
  const results = [];
  let request;
  await act(async () =>
    root.render(
      createElement(Inspector, {
        ui: { Dialog, useConfirmation },
        results,
        expose: (confirm) => {
          request = confirm;
        },
      }),
    ),
  );
  const document = dom.window.document;
  const button = (text) =>
    [...document.querySelectorAll('button')].find((el) => el.textContent === text);
  const click = async (text) => {
    await act(async () => {
      button(text).focus();
      button(text).click();
    });
  };
  const parent = document.querySelector('[role=dialog]');
  assert.equal(
    document.getElementById(parent.getAttribute('aria-labelledby')).textContent,
    'File details',
  );
  await click('Remove file');
  const confirmation = document.querySelector('[role=alertdialog]');
  assert.equal(
    document.getElementById(confirmation.getAttribute('aria-describedby')).textContent,
    'This cannot be undone.',
  );
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
  assert.equal(document.activeElement.textContent, 'Cancel');
  await click('Cancel');
  assert.deepEqual(results, [false]);
  assert.equal(document.querySelector('[role=alertdialog]'), null);
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
  assert.equal(document.activeElement.textContent, 'Remove file');
  assert.ok(parent.isConnected);
  await click('Remove file');
  await click('Remove');
  assert.deepEqual(results, [false, true]);
  assert.ok(parent.isConnected);
  let abandoned;
  await act(async () => {
    abandoned = request('Leave?', 'Unsaved edits.', 'Leave');
  });
  await act(async () => root.render(null));
  assert.equal(await abandoned, false);
});
