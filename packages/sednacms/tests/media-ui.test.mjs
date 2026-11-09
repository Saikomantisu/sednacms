import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { test } from 'node:test';
import { act, createElement } from 'react';
import { toast } from '../dist/admin/toasts.js';
import { createAdminDom } from './helpers/admin-dom.mjs';

const hook = registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'virtual:sedna/admin')
      return {
        url: 'data:text/javascript,export const disposableDemo=false;export const uploadsEnabled=true;',
        shortCircuit: true,
      };
    return next(specifier, context);
  },
});

test('Media uses folder cards, modal folder creation, contextual navigation and confirmed storage deletion', async (t) => {
  const { dom, restore } = createAdminDom();
  const { Media } = await import('../dist/admin/components/media/media-library.js');
  hook.deregister();
  const image = {
    id: 'photo',
    name: 'photo.png',
    src: 'https://images.example.com/photo.png',
    type: 'image/png',
    size: 100,
    width: 32,
    height: 24,
    folder_id: null,
    created_at: '2026-11-08T12:00:00.000Z',
  };
  const folders = [{ id: 'photos', name: 'Photos' }];
  const files = [image];
  const writes = [];
  const notifications = [];
  const revokedPreviews = [];
  let previewSequence = 0;
  t.mock.method(URL, 'createObjectURL', () => `blob:preview-${++previewSequence}`);
  t.mock.method(URL, 'revokeObjectURL', (url) => revokedPreviews.push(url));
  for (const type of ['loading', 'success', 'error']) {
    t.mock.method(toast, type, (title, options) => {
      notifications.push({ type, title, ...options });
      return options?.id ?? 'upload-toast';
    });
  }
  let firstRead = true;
  let releaseInitial;
  let releaseUpload;
  const previousXHR = Object.getOwnPropertyDescriptor(globalThis, 'XMLHttpRequest');
  Object.defineProperty(globalThis, 'XMLHttpRequest', {
    configurable: true,
    value: class {
      upload = {};
      status = 200;
      open() {}
      setRequestHeader() {}
      send() {
        this.upload.onprogress({ lengthComputable: true, loaded: 50, total: 100 });
        this.onload();
      }
    },
  });

  t.mock.method(globalThis, 'fetch', async (path, init) => {
    const url = new URL(path, 'https://cms.example.com');
    if (url.pathname === '/api/cms/uploads')
      return Response.json(
        init.method === 'GET'
          ? { provider: 's3', image: false }
          : {
              url: 'https://images.example.com/upload',
              src: 'https://images.example.com/clip.mp4',
              headers: {},
            },
      );
    if (init.method === 'GET') {
      const folder = url.searchParams.get('folder');
      const media = files.filter((file) => folder === 'all' || file.folder_id === (folder || null));
      const imageCounts = {};
      for (const file of files)
        if (file.type.startsWith('image/'))
          imageCounts[file.folder_id ?? ''] = (imageCounts[file.folder_id ?? ''] ?? 0) + 1;
      const response = Response.json({ media, folders: [...folders], imageCounts, hasMore: false });
      if (firstRead) {
        firstRead = false;
        return new Promise((resolve) => {
          releaseInitial = () => resolve(response);
        });
      }
      return response;
    }
    writes.push({ path: url.pathname, method: init.method });
    if (url.pathname === '/api/cms/media-folders') {
      const folder = { id: 'new-folder', name: JSON.parse(init.body).name };
      folders.push(folder);
      return Response.json({ folder });
    }
    if (init.method === 'DELETE') {
      files.splice(0, 1);
      return new Response(null, { status: 204 });
    }
    if (url.pathname === '/api/cms/media' && init.method === 'POST')
      return new Promise((resolve) => {
        releaseUpload = () => {
          const media = { ...JSON.parse(init.body), id: JSON.parse(init.body).name };
          files.push(media);
          resolve(Response.json({ media }));
        };
      });
    throw new Error('Unexpected request');
  });
  const mount = dom.window.document.querySelector('#app');
  const container = dom.window.document.body;
  const { createRoot } = await import('react-dom/client');
  const root = createRoot(mount);
  t.after(async () => {
    await act(async () => root.unmount());
    if (previousXHR) Object.defineProperty(globalThis, 'XMLHttpRequest', previousXHR);
    else delete globalThis.XMLHttpRequest;
    restore();
  });
  let pending;
  const run = (action) => {
    pending = action();
  };
  const button = (label) =>
    [...container.querySelectorAll('button')].findLast(
      (button) =>
        button.textContent.trim() === label || button.getAttribute('aria-label') === label,
    );
  async function click(label) {
    const element = button(label);
    assert.ok(element, `Button ${label} exists`);
    await act(async () => {
      element.click();
      await new Promise(setImmediate);
      await pending;
    });
  }
  await act(async () => {
    root.render(createElement(Media, { disabled: false, run }));
    await new Promise(setImmediate);
  });
  assert.equal(container.querySelectorAll('.media-skeleton').length, 6);
  assert.equal(button('Upload files').disabled, true);
  await act(async () => {
    releaseInitial();
    await new Promise(setImmediate);
  });
  assert.ok(container.querySelector('.media-folder-card'));
  assert.equal(
    container.querySelector('#media-folder-count-uncategorized').textContent.trim(),
    '1 image',
  );
  assert.equal(
    container.querySelector('#media-folder-count-photos').textContent.trim(),
    '0 images',
  );
  assert.equal(container.querySelector('.media-folders'), null);
  assert.equal(container.querySelector('.media-folder-form'), null);
  assert.doesNotMatch(container.textContent, /Unfiled|Office documents|ZIP/);
  await click('Create folder');
  assert.ok(container.querySelector('[role=dialog] .media-folder-form'));
  await click('Cancel');
  assert.equal(writes.length, 0);
  await click('Create folder');
  await act(async () => {
    const input = container.querySelector('#media-folder-name');
    Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(
      input,
      'Campaign',
    );
    input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    input.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  });
  assert.equal(button('Create folder').disabled, false);
  await click('Create folder');
  assert.equal(container.querySelector('[role=dialog]'), null);
  await click('Media');
  assert.ok(button('Open Campaign folder'));
  await click('Open Uncategorized folder');
  assert.ok(button('View details for photo.png'));
  await click('Upload files');
  assert.ok(container.querySelector('[role=dialog].media-upload-dialog'));
  assert.equal(button('Upload selected files').disabled, true);
  assert.equal(button('Done'), undefined);
  await act(async () => {
    const input = container.querySelector('input[type=file]');
    Object.defineProperty(input, 'files', {
      value: [new File(['image'], 'preview.png', { type: 'image/png' })],
      configurable: true,
    });
    input.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  });
  assert.equal(
    container.querySelector('.media-upload-selection img').getAttribute('src'),
    'blob:preview-1',
  );
  assert.equal(notifications.length, 0);
  await click('Remove preview.png from upload');
  assert.equal(button('Upload selected files').disabled, true);
  assert.deepEqual(revokedPreviews, ['blob:preview-1']);
  await act(async () => {
    const input = container.querySelector('input[type="file"]');
    Object.defineProperty(input, 'files', {
      value: [new File(['video'], 'clip.mp4', { type: 'video/mp4' })],
      configurable: true,
    });
    input.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    await new Promise(setImmediate);
  });
  assert.ok(container.querySelector('[role=dialog].media-upload-dialog'));
  assert.ok(container.querySelector('.media-upload-selection'));
  await act(async () => {
    button('Upload selected files').click();
    await new Promise(setImmediate);
  });
  assert.equal(container.querySelector('[role=dialog].media-upload-dialog'), null);
  assert.equal(container.querySelector('.media-uploads'), null);
  assert.equal(notifications.at(-1).type, 'loading');
  assert.match(notifications.at(-1).description, /clip.mp4.*Saving to media library/);
  assert.equal(container.querySelector('.media-library > .upload-progress'), null);
  assert.equal(container.querySelector('.media-uploads progress'), null);
  await act(async () => {
    releaseUpload();
    await pending;
  });
  assert.equal(notifications.at(-1).type, 'success');
  assert.equal(notifications.at(-1).title, 'File uploaded');
  assert.equal(notifications.at(-1).id, 'upload-toast');
  assert.ok(button('View details for clip.mp4'));
  await click('Upload files');
  await act(async () => {
    const event = new dom.window.Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'dataTransfer', {
      value: {
        files: [
          new File(['one'], 'one.mp4', { type: 'video/mp4' }),
          new File(['two'], 'two.mp4', { type: 'video/mp4' }),
        ],
      },
    });
    container.querySelector('.media-dropzone').dispatchEvent(event);
    await new Promise(setImmediate);
  });
  assert.equal(container.querySelectorAll('.media-upload-selection > li').length, 2);
  assert.match(container.querySelector('.media-upload-footer').textContent, /2 files selected/);
  assert.ok(container.querySelector('[role=dialog].media-upload-dialog'));
  assert.ok(container.querySelector('.media-upload-selection'));
  await act(async () => {
    button('Upload selected files').click();
    await new Promise(setImmediate);
  });
  assert.equal(container.querySelector('[role=dialog].media-upload-dialog'), null);
  assert.equal(notifications.at(-1).title, 'Uploading 1 of 2 files');
  await act(async () => {
    releaseUpload();
    await new Promise(setImmediate);
  });
  assert.equal(notifications.at(-1).title, 'Uploading 2 of 2 files');
  assert.match(notifications.at(-1).description, /two.mp4/);
  await act(async () => {
    releaseUpload();
    await pending;
  });
  assert.equal(notifications.at(-1).type, 'success');
  assert.equal(notifications.at(-1).title, '2 files uploaded');
  assert.equal(notifications.at(-1).id, 'upload-toast');
  await click('Upload files');
  await act(async () => {
    const input = container.querySelector('input[type=file]');
    Object.defineProperty(input, 'files', {
      value: [new File(['invalid'], 'bad.txt', { type: 'text/plain' })],
    });
    input.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    await pending;
  });
  assert.ok(container.querySelector('[role=dialog].media-upload-dialog'));
  assert.ok(container.querySelector('.media-upload-selection'));
  await act(async () => {
    button('Upload selected files').click();
    await new Promise(setImmediate);
  });
  assert.equal(container.querySelector('[role=dialog].media-upload-dialog'), null);
  assert.equal(container.querySelector('.media-uploads'), null);
  assert.equal(notifications.at(-1).type, 'error');
  assert.equal(notifications.at(-1).title, 'Upload failed');
  assert.match(notifications.at(-1).description, /bad.txt/);
  await click('Upload files');
  await act(async () => {
    const input = container.querySelector('input[type=file]');
    Object.defineProperty(input, 'files', {
      value: [new File(['image'], 'discard.png', { type: 'image/png' })],
    });
    input.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  });
  await click('Close upload dialog');
  assert.deepEqual(revokedPreviews, ['blob:preview-1', 'blob:preview-2']);
  await click('Upload files');
  assert.equal(container.querySelector('.media-upload-selection'), null);
  assert.equal(button('Upload selected files').disabled, true);
  await click('Close upload dialog');
  await click('View details for photo.png');
  assert.equal(container.querySelector('.media-detail-metadata time').dateTime, image.created_at);
  assert.match(container.querySelector('.media-detail-metadata time').textContent, /2026/);
  await click('Delete file');
  let confirmation = container.querySelector('[role=alertdialog]');
  assert.ok(confirmation);
  assert.equal(confirmation.querySelector('h2').textContent, `Delete "${image.name}"?`);
  assert.match(confirmation.textContent, /Images or videos using this file will stop loading/);
  assert.match(confirmation.textContent, /This cannot be undone/);
  assert.equal(writes.filter((write) => write.method === 'DELETE').length, 0);
  await click('Cancel');
  assert.equal(container.querySelector('[role=alertdialog]'), null);
  assert.ok(container.querySelector('.media-details'));
  assert.equal(writes.filter((write) => write.method === 'DELETE').length, 0);
  await click('Delete file');
  confirmation = container.querySelector('[role=alertdialog]');
  await act(async () => {
    [...confirmation.querySelectorAll('button')]
      .find((button) => button.textContent === 'Delete file')
      .click();
    await new Promise(setImmediate);
    await pending;
  });
  assert.equal(writes.filter((write) => write.method === 'DELETE').length, 1);
  assert.equal(button('View details for photo.png'), undefined);
  assert.equal(image.src, 'https://images.example.com/photo.png');
  await click('Media');
  assert.ok(button('Open Uncategorized folder'));
  assert.equal(
    container.querySelector('#media-folder-count-uncategorized').textContent.trim(),
    '0 images',
  );
});

test('Media groups load failures with a retry that retains context and clears errors on success', async (t) => {
  const { dom, restore } = createAdminDom();
  const { Media } = await import('../dist/admin/components/media/media-library.js');
  const { createRoot } = await import('react-dom/client');
  const root = createRoot(dom.window.document.querySelector('#app'));
  const container = dom.window.document.body;
  t.after(async () => {
    await act(async () => root.unmount());
    restore();
  });
  let respond;
  let first = true;
  const reads = [];
  t.mock.method(globalThis, 'fetch', async (path) => {
    reads.push(path);
    if (first) {
      first = false;
      return Response.json(
        { error: 'The database user does not have permission to access the media library.' },
        { status: 503 },
      );
    }
    return new Promise((resolve) => {
      respond = resolve;
    });
  });
  let pending;
  const run = (action) => {
    pending = action();
  };
  await act(async () => {
    root.render(createElement(Media, { disabled: false, run }));
    await new Promise(setImmediate);
  });
  assert.match(container.querySelector('[role=alert]').textContent, /permission/);
  assert.equal(container.querySelector('.media-toolbar'), null);
  const retry = container.querySelector('.media-error button');
  assert.equal(retry.textContent, 'Try again');
  await act(async () => {
    retry.click();
  });
  assert.equal(retry.disabled, true);
  assert.match(retry.textContent, /Retrying/);
  assert.match(container.querySelector('[role=alert]').textContent, /permission/);
  await act(async () => {
    respond(
      Response.json(
        { error: 'Still unavailable. Check the database connection.' },
        { status: 503 },
      ),
    );
    await pending;
  });
  assert.match(
    container.querySelector('[role=alert]').textContent,
    /Check the database connection/,
  );
  assert.equal(retry.disabled, false);
  await act(async () => {
    retry.click();
  });
  await act(async () => {
    respond(Response.json({ media: [], folders: [], imageCounts: {}, hasMore: false }));
    await pending;
  });
  assert.equal(container.querySelector('.media-error'), null);
  assert.ok(container.querySelector('.media-folder-card'));

  // A failed refresh keeps the last successful folder view available.
  await act(async () => {
    container.querySelector('.media-folder-card').click();
  });
  await act(async () => {
    respond(Response.json({ error: 'Connection interrupted.' }, { status: 503 }));
    await pending;
  });
  assert.ok(container.querySelector('.media-folder-card'));
  assert.match(container.querySelector('[role=alert]').textContent, /Connection interrupted/);
  assert.ok(container.querySelector('.media-error button'));
  const failedPath = reads.at(-1);
  await act(async () => {
    container.querySelector('.media-error button').click();
  });
  assert.equal(reads.at(-1), failedPath);
  await act(async () => {
    respond(Response.json({ media: [], folders: [], imageCounts: {}, hasMore: false }));
    await pending;
  });
  assert.match(container.querySelector('[aria-current=page]').textContent, /Uncategorized/);
});
