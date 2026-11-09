import { uploadsEnabled } from 'virtual:sedna/admin';
import { useEffect, useRef, useState } from 'react';
import type { MediaFile, MediaFolder, MediaResponse } from '../../../api/media.js';
import { MEDIA_EXTENSIONS, MEDIA_TYPES } from '../../../storage/config.js';
import { api, RequestError } from '../../api.js';
import { useConfirmation } from '../../hooks/use-confirmation.js';
import { toast } from '../../toasts.js';
import { uploadMedia } from '../../uploads.js';
import { Dialog } from '../ui/dialog.js';
import { SelectControl } from '../ui/select.js';

const paths = {
  folder: 'M3 7V5h6l2 2h10v13H3V7Z',
  upload: 'M12 16V3m-5 5 5-5 5 5M4 15v6h16v-6',
  search: 'M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
  grid: 'M3 3h7v7H3Zm11 0h7v7h-7ZM3 14h7v7H3Zm11 0h7v7h-7Z',
  list: 'M3 5h18M3 12h18M3 19h18',
  play: 'm9 5 11 7-11 7Z',
  close: 'm6 6 12 12M6 18 18 6',
  trash: 'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7',
  alert:
    'M12 9v4m0 4h.01M10.3 3.9 1.8 18.5A1 1 0 0 0 2.7 20h18.6a1 1 0 0 0 .9-1.5L13.7 3.9a2 2 0 0 0-3.4 0Z',
  external: 'M14 3h7v7m0-7L10 14M10 3H3v18h18v-7',
};
function Icon({ name }: { name: keyof typeof paths }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
function UploadPreview({ file }: { file: File }) {
  const [src, setSrc] = useState<string>();
  useEffect(() => {
    if (!file.type.startsWith('image/')) return;
    const url = URL.createObjectURL(file);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  return src ? (
    <img src={src} alt="" />
  ) : (
    <Icon name={file.type.startsWith('video/') ? 'play' : 'upload'} />
  );
}
const format = (file: MediaFile) =>
  file.type === 'image/jpeg' ? 'JPEG' : (MEDIA_EXTENSIONS[file.type] ?? 'file').toUpperCase();
const size = (bytes: number) =>
  `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(bytes / (bytes >= 1048576 ? 1048576 : 1024))} ${bytes >= 1048576 ? 'MB' : 'KB'}`;
const query = (folder: string | null, offset: number, q = '', type = '', images = false) =>
  `media?${new URLSearchParams({ folder: folder ?? '', offset: String(offset), q, type, images: String(images) })}`;

function loadMessage(error: unknown) {
  if (error instanceof RequestError) return error.message;
  if (error instanceof TypeError)
    return 'Could not reach the server. Check your connection and try again.';
  return 'The media library could not be loaded. Try again. If this continues, ask your site administrator to check the server logs.';
}

export function Media({
  disabled,
  run,
  onSelect,
}: {
  disabled: boolean;
  run: (action: () => Promise<void>) => void;
  onSelect?: (media: MediaFile) => void;
}) {
  const [view, setView] = useState<
    (MediaResponse & { folder: string | null; offset: number; q: string; type: string }) | null
  >(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [loadFailed, setLoadFailed] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<{ id: number; file: File }[]>([]);
  const fileSequence = useRef(0);
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  const [editing, setEditing] = useState<'new' | 'rename' | null>(null);
  const [name, setName] = useState('');
  const [search, setSearch] = useState('');
  const [layout, setLayout] = useState<'grid' | 'list'>('grid');
  const [selected, setSelected] = useState<MediaFile | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const { confirm, dialog } = useConfirmation();
  const initialQuery = useRef(query('all', 0, '', '', !!onSelect));
  const lastLoad = useRef<[string | null, number, string, string]>(['all', 0, '', '']);
  useEffect(() => {
    let active = true;
    api<MediaResponse>(initialQuery.current)
      .then((data) => {
        if (active) setView({ ...data, folder: 'all', offset: 0, q: '', type: '' });
      })
      .catch((error: Error) => {
        if (active) {
          setError(loadMessage(error));
          setLoadFailed(true);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  const folder = view?.folders.find((folder) => folder.id === view.folder);
  const busy = disabled || loading;
  const home = !view || view.folder === 'all';
  const currentName = folder?.name ?? 'Uncategorized';
  const rootFolders =
    home && view
      ? [{ id: '', name: 'Uncategorized' }, ...view.folders].filter(
          (item) => !view.type && item.name.toLowerCase().includes(view.q.toLowerCase()),
        )
      : [];
  const files = view && (!home || view.q || view.type) ? view.media : [];
  async function load(
    target = view ? view.folder : 'all',
    offset = 0,
    q = view?.q ?? '',
    type = view?.type ?? '',
  ) {
    lastLoad.current = [target, offset, q, type];
    setLoading(true);
    try {
      const data = await api<MediaResponse>(query(target, offset, q, type, !!onSelect));
      setView({ ...data, folder: target, offset, q, type });
      setError('');
      setLoadFailed(false);
    } catch (error) {
      setError(loadMessage(error));
      setLoadFailed(true);
      if (error instanceof RequestError && error.status === 401) throw error;
    } finally {
      setLoading(false);
    }
  }
  function act(action: () => Promise<void>) {
    run(async () => {
      setError('');
      setLoadFailed(false);
      try {
        await action();
      } catch (error) {
        setError(error instanceof Error ? error.message : 'Could not complete this action.');
        throw error;
      }
    });
  }
  function browse(target: string | null) {
    setSearch('');
    act(() => load(target, 0, '', ''));
  }
  function editFolder(mode: 'new' | 'rename') {
    setError('');
    setName(mode === 'rename' ? (folder?.name ?? '') : '');
    setEditing(mode);
  }
  function addFiles(files: File[]) {
    if (busy || uploading || !files.length) return;
    const added = files.map((file) => ({ id: ++fileSequence.current, file }));
    setPendingFiles((previous) => [...previous, ...added]);
  }
  function startUpload() {
    if (busy || uploading || !pendingFiles.length) return;
    const files = pendingFiles.map((item) => item.file);
    const target = home ? null : (view?.folder ?? null);
    run(async () => {
      closeUpload();
      setError('');
      setUploading(true);
      const title = (index: number) =>
        files.length === 1
          ? `Uploading ${files[0].name}`
          : `Uploading ${index + 1} of ${files.length} files`;
      const id = toast.loading(title(0), { description: files[0].name });
      const failures: string[] = [];
      try {
        for (const [index, file] of files.entries()) {
          toast.loading(title(index), { id, description: `${file.name} · Preparing` });
          try {
            await uploadMedia(
              file,
              (progress) => {
                const stage = {
                  preparing: 'Preparing',
                  uploading: 'Uploading',
                  finalizing: 'Saving to Media',
                }[progress.stage];
                const percent =
                  progress.stage === 'uploading' && progress.percent !== undefined
                    ? ` ${Math.floor(progress.percent)}%`
                    : '';
                toast.loading(title(index), {
                  id,
                  description: `${file.name} · ${stage}${percent}`,
                });
              },
              target,
            );
          } catch (error) {
            failures.push(
              `${file.name}: ${error instanceof Error ? error.message : 'Upload failed.'}`,
            );
            if (error instanceof RequestError && error.status === 401) {
              toast.error('Upload interrupted', {
                id,
                description: 'Sign in again to upload the remaining files.',
                duration: Infinity,
              });
              throw error;
            }
          }
        }
        if (failures.length) {
          toast.error(
            files.length === 1
              ? 'Upload failed'
              : `${files.length - failures.length} of ${files.length} files uploaded`,
            {
              id,
              description: failures.join('\n'),
              duration: Infinity,
            },
          );
        } else {
          toast.success(files.length === 1 ? 'File uploaded' : `${files.length} files uploaded`, {
            id,
            description: files.map((file) => file.name).join(', '),
            duration: 4000,
          });
        }
        setSearch('');
        await load(target, 0, '', '');
      } finally {
        setUploading(false);
      }
    });
  }
  function closeUpload() {
    setUploadOpen(false);
    setPendingFiles([]);
    setDragging(false);
    dragDepth.current = 0;
  }
  return (
    <section
      className="media-library"
      aria-label={onSelect ? 'Choose an image' : 'Media library'}
      aria-busy={loading}
    >
      {!onSelect && (
        <header className="page-head media-head">
          <h1>Media library</h1>
          <div className="actions">
            <button type="button" disabled={busy || !view} onClick={() => editFolder('new')}>
              <Icon name="folder" />
              Add new folder
            </button>
            {uploadsEnabled && (
              <button
                type="button"
                disabled={busy || uploading || !view}
                onClick={() => {
                  setError('');
                  setUploadOpen(true);
                }}
              >
                <Icon name="upload" />
                Upload files
              </button>
            )}
          </div>
        </header>
      )}

      {error && !editing && !selected && !uploadOpen && (
        <div className="media-error">
          <Icon name="alert" />
          <div className="media-error-copy" role="alert">
            <h2>{loadFailed ? 'Couldn’t load media' : 'Couldn’t complete this action'}</h2>
            <p>{error}</p>
          </div>
          {loadFailed && (
            <button
              type="button"
              disabled={busy}
              onClick={() => run(() => load(...lastLoad.current))}
            >
              {loading && <span className="media-spinner" aria-hidden="true" />}
              {loading ? 'Retrying…' : 'Try again'}
            </button>
          )}
        </div>
      )}
      {(view || !error) && (
        <div className="media-toolbar">
          <search>
            <div className="media-search">
              <label htmlFor="media-search" className="sr-only">
                Search by filename
              </label>
              <input
                id="media-search"
                type="search"
                placeholder={home ? 'Search media…' : 'Search this folder…'}
                maxLength={255}
                value={search}
                disabled={busy || !view}
                onChange={(event) => setSearch(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    act(() => load(view ? view.folder : 'all', 0, search));
                  }
                }}
              />
              <button
                type="button"
                className="icon-button"
                onClick={() => act(() => load(view ? view.folder : 'all', 0, search))}
                aria-label="Search media"
                disabled={busy || !view}
              >
                <Icon name="search" />
              </button>
            </div>
          </search>
          {!onSelect && (
            <div className="field media-type">
              <label htmlFor="media-type" className="sr-only">
                Media type
              </label>
              <SelectControl
                id="media-type"
                value={view?.type ?? ''}
                disabled={busy || !view}
                options={[
                  { value: '', label: 'All types' },
                  { value: 'image', label: 'Images' },
                  { value: 'video', label: 'Videos' },
                ]}
                onValueChange={(type) =>
                  act(() => load(view ? view.folder : 'all', 0, search, type))
                }
              />
            </div>
          )}
          {view && loading && (
            <span className="media-refresh" role="status">
              <span className="media-spinner" aria-hidden="true" />
              Updating…
            </span>
          )}
          <fieldset className="media-layout">
            <legend className="sr-only">Media layout</legend>
            <button
              type="button"
              className="icon-button"
              aria-label="Grid view"
              aria-pressed={layout === 'grid'}
              onClick={() => setLayout('grid')}
            >
              <Icon name="grid" />
            </button>
            <button
              type="button"
              className="icon-button"
              aria-label="List view"
              aria-pressed={layout === 'list'}
              onClick={() => setLayout('list')}
            >
              <Icon name="list" />
            </button>
          </fieldset>
        </div>
      )}
      {view && (
        <nav className="media-breadcrumbs" aria-label="Media folders">
          <button
            type="button"
            className="quiet"
            disabled={busy || home}
            onClick={() => browse('all')}
          >
            Media
          </button>
          {!home && (
            <>
              <span aria-hidden="true">/</span>
              <span aria-current="page">{currentName}</span>
              {folder && !onSelect && (
                <button
                  type="button"
                  className="quiet small"
                  disabled={busy}
                  onClick={() => editFolder('rename')}
                >
                  Rename folder
                </button>
              )}
            </>
          )}
        </nav>
      )}
      {!view && loading && !error && (
        <>
          <p className="sr-only" role="status">
            Loading media…
          </p>
          <ul className="media-grid media-skeletons" aria-hidden="true">
            {[0, 1, 2, 3, 4, 5].map((item) => (
              <li key={item}>
                <div className="media-skeleton">
                  <span />
                  <span />
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
      {view && (
        <>
          {rootFolders.length || files.length ? (
            <ul
              className={`media-grid${layout === 'list' ? ' media-list' : ''}`}
              data-loading={loading || undefined}
            >
              {rootFolders.map((item) => (
                <li key={item.id || 'uncategorized'}>
                  <button
                    type="button"
                    className="media-card media-folder-card"
                    disabled={busy}
                    onClick={() => browse(item.id || null)}
                    aria-label={`Open ${item.name} folder`}
                    aria-describedby={`media-folder-count-${item.id || 'uncategorized'}`}
                  >
                    <span className="media-thumbnail media-folder-thumbnail">
                      <Icon name="folder" />
                    </span>
                    <span className="media-caption">
                      <span className="media-folder-label">
                        <span className="media-name" title={item.name}>
                          {item.name}
                        </span>
                        <span
                          className="media-folder-count"
                          id={`media-folder-count-${item.id || 'uncategorized'}`}
                        >
                          {(view.imageCounts[item.id] ?? 0).toLocaleString()}{' '}
                          {(view.imageCounts[item.id] ?? 0) === 1 ? 'image' : 'images'}
                        </span>
                      </span>
                      <span className="media-format">Folder</span>
                    </span>
                  </button>
                </li>
              ))}
              {files.map((file) => (
                <li key={file.id}>
                  <button
                    type="button"
                    className="media-card"
                    disabled={busy}
                    onClick={() => (onSelect ? onSelect(file) : setSelected(file))}
                    aria-label={`${onSelect ? 'Choose' : 'Details for'} ${file.name}`}
                  >
                    <span
                      className={`media-thumbnail${file.type === 'image/svg+xml' ? ' media-svg' : ''}`}
                    >
                      {file.type.startsWith('image/') ? (
                        <img src={file.src} alt="" loading="lazy" referrerPolicy="no-referrer" />
                      ) : (
                        <Icon name="play" />
                      )}
                    </span>
                    <span className="media-caption">
                      <span className="media-name" title={file.name}>
                        {file.name}
                      </span>
                      <span className="media-format">{format(file)}</span>
                    </span>
                    {layout === 'list' && <span className="media-size">{size(file.size)}</span>}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="empty">
              <p>
                {view.q || view.type
                  ? 'No media matches your search.'
                  : onSelect
                    ? 'No images in this folder.'
                    : 'This folder is empty. Upload a file to add it here.'}
              </p>
            </div>
          )}
          {(!home || view.q || view.type) && (view.offset > 0 || view.hasMore) && (
            <div className="actions">
              <button
                type="button"
                disabled={busy || view.offset === 0}
                onClick={() => act(() => load(view.folder, view.offset - 48))}
              >
                Previous
              </button>
              <button
                type="button"
                disabled={busy || !view.hasMore}
                onClick={() => act(() => load(view.folder, view.offset + 48))}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
      {uploadOpen && !onSelect && uploadsEnabled && (
        <Dialog
          title="Upload to library"
          description="Choose files, then click Upload to add them to your library."
          closeLabel="Close upload dialog"
          className="media-upload-dialog"
          onCancel={closeUpload}
        >
          <input
            ref={fileInput}
            type="file"
            hidden
            multiple
            accept={MEDIA_TYPES.join(',')}
            aria-label="Upload media files"
            onChange={(event) => {
              const files = Array.from(event.currentTarget.files ?? []);
              event.currentTarget.value = '';
              addFiles(files);
            }}
          />
          <section
            className="media-dropzone"
            aria-label="Drop files to upload"
            data-dragging={dragging || undefined}
            aria-disabled={busy || uploading}
            onDragEnter={(event) => {
              event.preventDefault();
              if (!event.dataTransfer.types.includes('Files') || busy || uploading) return;
              dragDepth.current += 1;
              setDragging(true);
            }}
            onDragOver={(event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = busy || uploading ? 'none' : 'copy';
            }}
            onDragLeave={(event) => {
              event.preventDefault();
              dragDepth.current = Math.max(0, dragDepth.current - 1);
              if (dragDepth.current === 0) setDragging(false);
            }}
            onDrop={(event) => {
              event.preventDefault();
              dragDepth.current = 0;
              setDragging(false);
              addFiles(Array.from(event.dataTransfer.files));
            }}
          >
            <span className="media-dropzone-icon">
              <Icon name="upload" />
            </span>
            <h3>Drag and drop files here</h3>
            <p>Or browse files from your computer</p>
            <button
              type="button"
              disabled={busy || uploading}
              onClick={() => fileInput.current?.click()}
            >
              <Icon name="upload" />
              Browse files
            </button>
          </section>
          {error && (
            <p className="notice error" role="alert">
              {error}
            </p>
          )}
          {pendingFiles.length > 0 && (
            <ul className="media-upload-selection" aria-label="Selected files">
              {pendingFiles.map(({ id, file }) => (
                <li key={id}>
                  <span className="media-upload-preview">
                    <UploadPreview file={file} />
                  </span>
                  <span className="media-upload-filename" title={file.name}>
                    {file.name}
                  </span>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Remove ${file.name} from upload`}
                    onClick={() =>
                      setPendingFiles((previous) => previous.filter((item) => item.id !== id))
                    }
                  >
                    <Icon name="close" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <footer className="media-upload-footer">
            <p role="status">
              {pendingFiles.length
                ? `${pendingFiles.length} ${pendingFiles.length === 1 ? 'file' : 'files'} selected`
                : 'No files selected'}
            </p>
            <button
              type="button"
              className="primary"
              disabled={busy || uploading || !pendingFiles.length}
              onClick={startUpload}
            >
              Upload
            </button>
          </footer>
        </Dialog>
      )}

      {editing && !onSelect && (
        <Dialog
          title={editing === 'new' ? 'New folder' : 'Rename folder'}
          onCancel={() => {
            if (!disabled) setEditing(null);
          }}
        >
          <form
            className="media-folder-form"
            onSubmit={(event) => {
              event.preventDefault();
              act(async () => {
                const result = await api<{ folder: MediaFolder }>(
                  editing === 'new' ? 'media-folders' : `media-folders/${view?.folder}`,
                  editing === 'new' ? 'POST' : 'PATCH',
                  { name },
                );
                await load(result.folder.id, 0, '', '');
                setEditing(null);
                setSearch('');
              });
            }}
          >
            <div className="field">
              <label htmlFor="media-folder-name">Folder name</label>
              <input
                id="media-folder-name"
                value={name}
                maxLength={255}
                required
                disabled={busy}
                aria-invalid={Boolean(error) || undefined}
                aria-describedby={error ? 'media-folder-error' : undefined}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            {error && (
              <p id="media-folder-error" className="notice error" role="alert">
                {error}
              </p>
            )}
            <div className="actions">
              <button type="button" disabled={disabled} onClick={() => setEditing(null)}>
                Cancel
              </button>
              <button type="submit" className="primary" disabled={busy || !name.trim()}>
                {disabled ? 'Saving…' : editing === 'new' ? 'Create folder' : 'Save name'}
              </button>
            </div>
          </form>
        </Dialog>
      )}
      {selected && (
        <Dialog
          title={selected.name}
          showTitle={false}
          closeLabel="Close media details"
          className="media-details"
          onCancel={() => setSelected(null)}
        >
          <div className="media-details-layout">
            <div className="media-detail-stage">
              {selected.type.startsWith('image/') ? (
                <img
                  className="media-detail-preview"
                  src={selected.src}
                  alt=""
                  referrerPolicy="no-referrer"
                />
              ) : (
                <video
                  className="media-detail-preview"
                  src={selected.src}
                  controls
                  preload="metadata"
                >
                  <track kind="captions" />
                </video>
              )}
            </div>
            <div className="media-detail-properties">
              <header className="media-detail-heading">
                <p>{selected.type.startsWith('image/') ? 'Image details' : 'Video details'}</p>
                <h2>{selected.name}</h2>
              </header>
              <dl className="media-detail-metadata">
                <div>
                  <dt>Format</dt>
                  <dd>{format(selected)}</dd>
                </div>
                <div>
                  <dt>Size</dt>
                  <dd>{size(selected.size)}</dd>
                </div>
                <div>
                  <dt>Uploaded</dt>
                  <dd>
                    <time dateTime={selected.created_at}>
                      {new Date(selected.created_at).toLocaleDateString(undefined, {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                      })}
                    </time>
                  </dd>
                </div>
                {selected.width && selected.height ? (
                  <div>
                    <dt>Dimensions</dt>
                    <dd>
                      {selected.width} × {selected.height}
                    </dd>
                  </div>
                ) : null}
              </dl>
              {error && (
                <p role="alert" className="notice error">
                  {error}
                </p>
              )}
              <div className="field">
                <label htmlFor="media-move">Folder</label>
                <SelectControl
                  id="media-move"
                  disabled={busy}
                  value={selected.folder_id ?? ''}
                  options={[
                    { value: '', label: 'Uncategorized' },
                    ...(view?.folders.map((folder) => ({ value: folder.id, label: folder.name })) ??
                      []),
                  ]}
                  onValueChange={(value) => {
                    const folder_id = value || null;
                    act(async () => {
                      const result = await api<{ media: MediaFile }>(
                        `media/${selected.id}`,
                        'PATCH',
                        { folder_id },
                      );
                      setSelected(result.media);
                      await load();
                    });
                  }}
                />
              </div>
              <a
                className="media-detail-open"
                href={selected.src}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open file <span className="sr-only">(opens in a new tab)</span>
                <Icon name="external" />
              </a>
              <div className="media-details-actions">
                <button
                  type="button"
                  className="danger small"
                  disabled={busy}
                  onClick={() => {
                    void (async () => {
                      if (
                        !(await confirm(
                          'Delete this file?',
                          'This permanently deletes the file from storage and the media library. Existing content using it may break.',
                          'Delete file',
                        ))
                      )
                        return;
                      act(async () => {
                        await api(`media/${selected.id}`, 'DELETE');
                        setSelected(null);
                        await load();
                      });
                    })();
                  }}
                >
                  <Icon name="trash" />
                  Delete
                </button>
              </div>
            </div>
          </div>
          {dialog}
        </Dialog>
      )}
      {!selected && dialog}
    </section>
  );
}
