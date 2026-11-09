import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { test } from 'node:test';
import { act, createElement, useState } from 'react';
import { createAdminDom } from './helpers/admin-dom.mjs';

registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'virtual:sedna/admin')
      return {
        url: 'data:text/javascript,export const disposableDemo=false;export const uploadsEnabled=true;',
        shortCircuit: true,
      };
    return next(specifier, context);
  },
});

function Editor({ FieldControl, expose, disabled = false }) {
  const [value, setValue] = useState({ src: '', width: '', height: '', alt: '' });
  expose(value);
  return createElement(FieldControl, {
    name: 'photo',
    field: { type: 'image' },
    value,
    disabled,
    onChange: setValue,
    run: (action) => action(),
  });
}

test('image field preserves manual entry and alt text, opens the file picker, and clears the selection', async (t) => {
  const { dom, restore } = createAdminDom();
  const { FieldControl } = await import('../dist/admin/components/content/fields.js');
  const { createRoot } = await import('react-dom/client');
  const root = createRoot(dom.window.document.querySelector('#app'));
  let current;
  const props = {
    FieldControl,
    expose: (value) => {
      current = value;
    },
  };
  t.after(async () => {
    await act(async () => root.unmount());
    restore();
  });
  const document = dom.window.document;
  const button = (label) =>
    [...document.querySelectorAll('button')].find(
      (el) => el.textContent === label || el.getAttribute('aria-label') === label,
    );
  const edit = async (key, value) => {
    await act(async () => {
      const input = document.getElementById(`field-photo-${key}`);
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(
        input,
        value,
      );
      input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    });
  };
  await act(async () => root.render(createElement(Editor, props)));
  assert.equal(
    document.querySelector('.image-placeholder').getAttribute('aria-label'),
    'No image selected',
  );
  const details = document.querySelector('.image-details');
  assert.equal(details.open, false);
  assert.equal(details.querySelector('summary').textContent, 'Use an image URL');
  assert.equal(document.getElementById('field-photo-alt'), null);
  const fileInput = document.querySelector('input[type=file]');
  assert.equal(fileInput.hidden, true);
  const clicks = t.mock.method(fileInput, 'click', () => {});
  await act(async () => button('Choose image').click());
  const menuItem = (label) =>
    [...document.querySelectorAll('[role=menuitem]')].find((el) => el.textContent === label);
  assert.ok(menuItem('Media library'));
  await act(async () => menuItem('Upload image').click());
  assert.equal(clicks.mock.callCount(), 1);
  await act(async () => button('Choose image').click());
  await act(async () => menuItem('Use an image URL').click());
  assert.equal(details.open, true);
  await edit('src', 'https://images.example.com/photo.jpg');
  await edit('width', '1200');
  await edit('height', '800');
  await edit('alt', 'People working at a desk');
  assert.equal(document.querySelector('.image-preview').alt, current.alt);
  assert.equal(document.querySelector('.image-dimensions').textContent, '1200 × 800 px');
  assert.equal(details.querySelector('summary').textContent, 'Image details');
  assert.ok(button('Change'));
  await act(async () =>
    document.querySelector('.image-preview').dispatchEvent(new dom.window.Event('error')),
  );
  assert.equal(
    document.querySelector('.image-placeholder').getAttribute('aria-label'),
    'Image preview unavailable',
  );
  await act(async () => root.render(createElement(Editor, { ...props, disabled: true })));
  assert.equal(button('Change').disabled, true);
  assert.equal(document.querySelector('[role=menu]'), null);
  assert.equal(button('Remove image').disabled, true);
  await act(async () => root.render(createElement(Editor, props)));
  await act(async () => button('Remove image').click());
  assert.deepEqual(current, { src: '', width: '', height: '', alt: '' });
  assert.equal(document.querySelector('.image-preview'), null);
  assert.ok(button('Choose image'));
  assert.equal(document.activeElement, button('Choose image'));
});
