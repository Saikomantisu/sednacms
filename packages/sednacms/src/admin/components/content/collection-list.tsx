import { useRef, useState } from 'react';
import type { CmsEntry } from '../../../api/types.js';
import type { CollectionConfig } from '../../../loader.js';
import { entryTitle, titleCase } from '../../utils/format.js';
import { SelectControl } from '../ui/select.js';
import { EntryDates, Status } from './entry-meta.js';

export const pageSize = 50;
export type Filters = { page: number; status: string; date: string };
export const emptyFilters: Filters = { page: 0, status: '', date: '' };
export function listQuery({ page, status, date }: Filters) {
  const query = new URLSearchParams({ limit: String(pageSize), offset: String(page * pageSize) });
  if (status) query.set('status', status);
  if (date) {
    const [year, month, day] = date.split('-').map(Number);
    query.set('published_from', new Date(year, month - 1, day).toISOString());
    query.set('published_before', new Date(year, month - 1, day + 1).toISOString());
  }
  return query;
}
type Props = {
  schema: CollectionConfig;
  entries: CmsEntry[];
  filters: Filters;
  busy: boolean;
  onFilter: (filters: Filters) => void;
  onEdit: (entry?: CmsEntry) => void;
  onMove: (from: number, to: number) => void;
};
export function CollectionList({
  schema,
  entries,
  filters,
  busy,
  onFilter,
  onEdit,
  onMove,
}: Props) {
  const dragged = useRef<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [target, setTarget] = useState<string | null>(null);
  const { page, status, date } = filters;
  const hasMore = entries.length === pageSize;
  const filtering = Boolean(status || date);
  const empty = !entries.length && !page && !filtering;
  const collectionName = titleCase(schema.collection);
  const count =
    entries.length && (page || hasMore)
      ? `Showing ${page * pageSize + 1}–${page * pageSize + entries.length}`
      : `${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}`;
  const clear = () => onFilter(emptyFilters);
  return (
    <>
      <header className="page-head">
        <div>
          <h1>{collectionName}</h1>
          {!empty && <p className="page-sub">{count}</p>}
        </div>
        {!empty && (
          <button type="button" className="primary" disabled={busy} onClick={() => onEdit()}>
            Create entry
          </button>
        )}
      </header>
      <div className="list-filters">
        <label htmlFor="filter-status">
          Status
          <SelectControl
            id="filter-status"
            value={status}
            disabled={busy}
            options={[
              { value: '', label: 'All statuses' },
              { value: 'draft', label: 'Draft' },
              { value: 'published', label: 'Published' },
            ]}
            onValueChange={(status) => onFilter({ ...filters, page: 0, status })}
          />
        </label>
        <label htmlFor="filter-date">
          Published on
          <input
            id="filter-date"
            type="date"
            value={date}
            disabled={busy}
            onChange={(event) => {
              if (event.target.reportValidity())
                onFilter({ ...filters, page: 0, date: event.target.value });
            }}
          />
        </label>
        {filtering && (
          <button type="button" className="quiet" disabled={busy} onClick={clear}>
            Clear filters
          </button>
        )}
      </div>
      <section className="card" aria-label={collectionName}>
        {!entries.length ? (
          <div className="empty">
            <h2>
              {filtering
                ? 'No matching entries'
                : page
                  ? 'No entries on this page'
                  : `No ${collectionName.toLowerCase()} yet`}
            </h2>
            <p>
              {filtering
                ? 'Change the status or publication date, or clear the filters to see all entries.'
                : page
                  ? 'Go back to the previous page.'
                  : 'Create an entry to add content to this collection. Save it as a draft or publish it to your site.'}
            </p>
            <button
              type="button"
              className="primary"
              disabled={busy}
              onClick={() =>
                filtering ? clear() : page ? onFilter({ ...filters, page: page - 1 }) : onEdit()
              }
            >
              {filtering ? 'Clear filters' : page ? 'Previous page' : 'Create entry'}
            </button>
          </div>
        ) : (
          <ul className="entry-list">
            {entries.map((entry, index) => {
              const title = entryTitle(entry, schema);
              return (
                <li
                  key={entry.id}
                  className={[
                    'entry-row',
                    filtering && 'filtered',
                    dragging === entry.id && 'dragging',
                    target === entry.id && 'drop-target',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  draggable={!filtering && !busy}
                  onDragStart={(event) => {
                    if (busy || filtering) {
                      event.preventDefault();
                      return;
                    }
                    dragged.current = entry.id;
                    setDragging(entry.id);
                    event.dataTransfer.effectAllowed = 'move';
                    event.dataTransfer.setData('text/plain', entry.id);
                  }}
                  onDragOver={(event) => {
                    if (dragged.current && !busy && !filtering) {
                      event.preventDefault();
                      setTarget(entry.id);
                    }
                  }}
                  onDragLeave={() => setTarget(null)}
                  onDragEnd={() => {
                    dragged.current = null;
                    setDragging(null);
                    setTarget(null);
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    const from = entries.findIndex((item) => item.id === dragged.current);
                    dragged.current = null;
                    setDragging(null);
                    setTarget(null);
                    if (!busy && !filtering && from >= 0 && from !== index) onMove(from, index);
                  }}
                >
                  <span className="drag-handle" aria-hidden="true">
                    ⠿
                  </span>
                  <div className="entry-info">
                    <button
                      type="button"
                      className="entry-name"
                      disabled={busy}
                      onClick={() => onEdit(entry)}
                    >
                      {title}
                    </button>
                    <div className="entry-meta">
                      <Status value={entry.status} />
                    </div>
                  </div>
                  <EntryDates entry={entry} />
                  <div className="order-controls">
                    <button
                      type="button"
                      aria-label={`Move ${title} up`}
                      disabled={busy || filtering || index === 0}
                      onClick={() => onMove(index, index - 1)}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      aria-label={`Move ${title} down`}
                      disabled={busy || filtering || index === entries.length - 1}
                      onClick={() => onMove(index, index + 1)}
                    >
                      ↓
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {(page > 0 || hasMore) && (
          <div className="pagination">
            <button
              type="button"
              className="small"
              disabled={busy || page === 0}
              onClick={() => onFilter({ ...filters, page: page - 1 })}
            >
              Previous
            </button>
            <span className="muted">Page {page + 1}</span>
            <button
              type="button"
              className="small"
              disabled={busy || !hasMore}
              onClick={() => onFilter({ ...filters, page: page + 1 })}
            >
              Next
            </button>
          </div>
        )}
      </section>
    </>
  );
}
