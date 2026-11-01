import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { CmsEntry, EntriesResponse, EntryResponse, SchemaResponse } from '../api/types.js';
import type { CollectionConfig } from '../loader.js';
import { api, RequestError } from './api.js';
import { AuthScreen, type Credentials } from './auth.js';
import {
  CollectionList,
  emptyFilters,
  type Filters,
  listQuery,
  pageSize,
} from './collection-list.js';
import { EntryEditor } from './entry-editor.js';
import { Notifications, toast } from './toasts.js';
import { Brand, entryTitle, titleCase, useConfirmation } from './ui.js';

type Screen =
  | { type: 'loading' | 'error' | 'empty' }
  | { type: 'auth'; setup: boolean; enabled: boolean }
  | { type: 'list'; schema: CollectionConfig; entries: CmsEntry[]; filters: Filters }
  | { type: 'editor'; schema: CollectionConfig; entry?: CmsEntry; revision: number };
function App() {
  const [screen, setScreen] = useState<Screen>({ type: 'loading' });
  const [schemas, setSchemas] = useState<CollectionConfig[]>([]);
  const [userName, setUserName] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const busyRef = useRef(false);
  const dirty = useRef(false);
  const revision = useRef(0);
  const { confirm, dialog } = useConfirmation();
  const selected = screen.type === 'list' || screen.type === 'editor' ? screen.schema : null;
  function message(text: string, error = false) {
    if (error)
      toast.error(text, {
        id: 'admin-message',
        duration: Infinity,
        style: { background: '#8f2b28', color: 'white' },
      });
    else toast.success(text, { id: 'admin-message', duration: 4000, style: {} });
  }
  function showAuth(setup: boolean, enabled = true) {
    dirty.current = false;
    toast.dismiss('admin-message');
    setNotice('');
    setScreen({ type: 'auth', setup, enabled });
  }
  async function run(action: () => Promise<void> | void) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await action();
    } catch (error) {
      const text = error instanceof Error ? error.message : 'Could not complete this action.';
      if (
        error instanceof RequestError &&
        error.status === 401 &&
        !error.path.startsWith('auth/')
      ) {
        showAuth(false);
        setNotice('You were signed out. Sign in again to keep editing.');
      } else {
        setNotice(text);
        message(text, true);
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  async function canLeave() {
    return (
      !dirty.current ||
      (await confirm(
        'Leave without saving?',
        'Your edits to this entry will be lost.',
        'Discard edits',
        'Keep editing',
      ))
    );
  }
  function showList(schema: CollectionConfig, entries: CmsEntry[], filters = emptyFilters) {
    dirty.current = false;
    history.replaceState(null, '', '#' + schema.collection);
    setScreen({ type: 'list', schema, entries, filters });
  }
  async function loadList(schema: CollectionConfig, filters = emptyFilters) {
    const response = await api<EntriesResponse>(
      `collections/${schema.collection}?${listQuery(filters)}`,
    );
    showList(schema, response.entries, filters);
  }
  function openEditor(schema: CollectionConfig, entry?: CmsEntry) {
    dirty.current = false;
    history.replaceState(null, '', '#' + schema.collection + '/' + (entry?.id ?? 'new'));
    setScreen({ type: 'editor', schema, entry, revision: ++revision.current });
  }
  async function start() {
    const [collection, id] = location.hash.slice(1).split('/');
    const path = /^[a-z][a-z0-9_]*$/.test(collection) ? `collections/${collection}` : null;
    const entryId = id && /^[0-9a-f-]{36}$/.test(id) ? id : null;
    const sessionRequest = api<{ user: { name: string; email: string } } | null>(
      'auth/get-session',
    );
    const schemaRequest = api<SchemaResponse>('schema');
    const listRequest =
      path && !id ? api<EntriesResponse>(`${path}?limit=${pageSize}&offset=0`) : null;
    const entryRequest = path && entryId ? api<EntryResponse>(`${path}/${entryId}`) : null;
    for (const request of [schemaRequest, listRequest, entryRequest]) request?.catch(() => {});
    const session = await sessionRequest;
    if (!session) {
      const setup = await api<{ setupRequired: boolean; setupEnabled: boolean }>('setup');
      showAuth(setup.setupRequired, setup.setupEnabled);
      return;
    }
    const collections = (await schemaRequest).collections;
    setSchemas(collections);
    setUserName(session.user.name || session.user.email);
    if (!collections.length) {
      setScreen({ type: 'empty' });
      return;
    }
    const schema = collections.find((schema) => schema.collection === collection) ?? collections[0];
    const known = schema.collection === collection;
    if (id === 'new') openEditor(schema);
    else if (entryId) {
      try {
        openEditor(
          schema,
          (
            await (known && entryRequest
              ? entryRequest
              : api<EntryResponse>(`collections/${schema.collection}/${entryId}`))
          ).entry,
        );
      } catch (error) {
        if (!(error instanceof RequestError) || error.status !== 404) throw error;
        await loadList(schema);
        message('Could not find that entry. It may have been deleted.', true);
      }
    } else if (known && listRequest) showList(schema, (await listRequest).entries);
    else await loadList(schema);
  }
  async function loadAdmin() {
    setScreen({ type: 'loading' });
    try {
      await start();
    } catch (error) {
      setScreen({ type: 'error' });
      throw error;
    }
  }
  const initialLoad = useRef(() => void run(loadAdmin));
  useEffect(() => {
    initialLoad.current();
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (dirty.current) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, []);
  useEffect(() => {
    document.title =
      screen.type === 'auth'
        ? screen.setup
          ? 'Set up Sedna'
          : 'Sign in | Sedna'
        : screen.type === 'list'
          ? titleCase(screen.schema.collection) + ' | Sedna'
          : screen.type === 'editor'
            ? (screen.entry ? entryTitle(screen.entry, screen.schema) : 'New entry') + ' | Sedna'
            : 'Sedna | Content';
  }, [screen]);
  async function signIn(credentials: Credentials, clearSecrets: () => void) {
    const { name, email, password, token } = credentials;
    setNotice('');
    if (screen.type === 'auth' && screen.setup) {
      await api('setup', 'POST', { name, email, password }, { 'X-Sedna-Setup-Token': token });
      clearSecrets();
      showAuth(false);
      message('Account created. Signing you in.');
    }
    await api('auth/sign-in/email', 'POST', { email, password });
    clearSecrets();
    await start();
  }
  async function move(from: number, to: number) {
    if (
      screen.type !== 'list' ||
      screen.filters.status ||
      screen.filters.date ||
      from === to ||
      to < 0 ||
      to >= screen.entries.length
    )
      return;
    const base = `collections/${screen.schema.collection}`;
    const all: CmsEntry[] = [];
    for (let offset = 0; ; offset += 100) {
      const batch = await api<EntriesResponse>(`${base}?limit=100&offset=${offset}`);
      all.push(...batch.entries);
      if (all.length > 1000) throw new Error('Reordering is supported for up to 1,000 entries.');
      if (batch.entries.length < 100) break;
    }
    const source = all.findIndex((item) => item.id === screen.entries[from].id);
    const target = all.findIndex((item) => item.id === screen.entries[to].id);
    if (source < 0 || target < 0) throw new Error('The list has changed. Refresh and try again.');
    const [item] = all.splice(source, 1);
    all.splice(target, 0, item);
    await api(base + '/reorder', 'POST', { ids: all.map((value) => value.id) });
    await loadList(screen.schema, screen.filters);
    message('Order saved.');
  }
  return (
    <>
      <div className="admin-app" aria-busy={busy}>
        {screen.type === 'loading' ? (
          <main id="main" className="loading">
            <p role="status">Loading…</p>
          </main>
        ) : screen.type === 'error' ? (
          <main id="main" className="loading">
            <div className="notice error" role="status">
              {notice}
            </div>
            <button type="button" disabled={busy} onClick={() => void run(loadAdmin)}>
              Try again
            </button>
          </main>
        ) : screen.type === 'auth' ? (
          <AuthScreen
            key={String(screen.setup)}
            setup={screen.setup}
            enabled={screen.enabled}
            busy={busy}
            notice={notice}
            onSubmit={(credentials, clear) => void run(() => signIn(credentials, clear))}
          />
        ) : (
          <div className="layout">
            <aside className="sidebar">
              <Brand />
              <p className="side-label">Collections</p>
              <nav aria-label="Collections">
                {schemas.map((schema) => (
                  <button
                    key={schema.collection}
                    type="button"
                    className={selected?.collection === schema.collection ? 'active' : ''}
                    aria-current={selected?.collection === schema.collection ? 'page' : undefined}
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        if (await canLeave()) await loadList(schema);
                      })
                    }
                  >
                    {titleCase(schema.collection)}
                  </button>
                ))}
              </nav>
              <footer>
                <a className="side-link" href="/" target="_blank" rel="noopener">
                  View website ↗
                </a>
                <div className="account">
                  <span className="avatar" aria-hidden="true">
                    {userName.charAt(0).toUpperCase()}
                  </span>
                  <div className="account-text">
                    <span className="user-name" title={userName}>
                      {userName}
                    </span>
                    <button
                      type="button"
                      className="text-link"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          if (!(await canLeave())) return;
                          await api('auth/sign-out', 'POST', {});
                          history.replaceState(null, '', location.pathname);
                          showAuth(false);
                        })
                      }
                    >
                      Sign out
                    </button>
                  </div>
                </div>
              </footer>
            </aside>
            <main id="main" className="main">
              {screen.type === 'empty' ? (
                <>
                  <h1>Nothing to edit yet</h1>
                  <p className="page-sub">
                    This site has no collections. Ask your website developer to add one.
                  </p>
                </>
              ) : screen.type === 'list' ? (
                <CollectionList
                  schema={screen.schema}
                  entries={screen.entries}
                  filters={screen.filters}
                  busy={busy}
                  onFilter={(filters) => void run(() => loadList(screen.schema, filters))}
                  onEdit={(entry) => {
                    if (!busyRef.current) openEditor(screen.schema, entry);
                  }}
                  onMove={(from, to) => void run(() => move(from, to))}
                />
              ) : (
                screen.type === 'editor' && (
                  <EntryEditor
                    key={screen.revision}
                    schema={screen.schema}
                    entry={screen.entry}
                    busy={busy}
                    onDirty={() => {
                      dirty.current = true;
                    }}
                    onBack={() =>
                      void run(async () => {
                        if (await canLeave()) await loadList(screen.schema);
                      })
                    }
                    onSave={(status, read) =>
                      void run(async () => {
                        const base = `collections/${screen.schema.collection}`;
                        const result = await api<EntryResponse>(
                          base + (screen.entry ? '/' + screen.entry.id : ''),
                          screen.entry ? 'PATCH' : 'POST',
                          { data: read(), status },
                        );
                        openEditor(screen.schema, result.entry);
                        message(
                          status === 'published'
                            ? 'Published.'
                            : screen.entry?.status === 'published'
                              ? 'Unpublished. It is a draft again.'
                              : 'Draft saved.',
                        );
                      })
                    }
                    onDelete={() =>
                      void run(async () => {
                        if (
                          !screen.entry ||
                          !(await confirm(
                            `Delete "${entryTitle(screen.entry, screen.schema)}"?`,
                            screen.entry.status === 'published'
                              ? 'It will come off your site and cannot be restored.'
                              : 'This cannot be undone.',
                            'Delete',
                          ))
                        )
                          return;
                        await api(
                          `collections/${screen.schema.collection}/${screen.entry.id}`,
                          'DELETE',
                        );
                        dirty.current = false;
                        await loadList(screen.schema);
                        message('Deleted.');
                      })
                    }
                  />
                )
              )}
            </main>
          </div>
        )}
      </div>
      {dialog}
      <Notifications />
    </>
  );
}
const container = document.querySelector<HTMLDivElement>('#app');
if (container) createRoot(container).render(<App />);
