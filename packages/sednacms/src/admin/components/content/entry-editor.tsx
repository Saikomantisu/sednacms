import { useEffect, useRef, useState } from 'react';
import type { CmsEntry, EntryStatus } from '../../../api/types.js';
import type { CollectionConfig } from '../../../loader.js';
import { initialValues, readValues } from '../../utils/field-values.js';
import { entryTitle, titleCase } from '../../utils/format.js';
import { EntryDates, Status } from './entry-meta.js';
import { FieldControl } from './fields.js';

type Props = {
  schema: CollectionConfig;
  entry?: CmsEntry;
  busy: boolean;
  onDirty: () => void;
  onBack: () => void;
  onSave: (status: EntryStatus, read: () => Record<string, unknown>) => void;
  onDelete: () => void;
  run: (action: () => Promise<void>) => void;
};
export function EntryEditor({
  schema,
  entry,
  busy,
  onDirty,
  onBack,
  onSave,
  onDelete,
  run,
}: Props) {
  const [values, setValues] = useState(() => initialValues(schema.fields, entry?.data));
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    form.current?.querySelector<HTMLElement>('input,textarea,[contenteditable]')?.focus();
  }, []);
  const title = entry ? entryTitle(entry, schema) : 'New entry';
  const live = entry?.status === 'published';
  const read = () => readValues(schema.fields, values);
  return (
    <>
      <nav className="crumbs" aria-label="Breadcrumb">
        <button type="button" className="quiet" disabled={busy} onClick={onBack}>
          {titleCase(schema.collection)}
        </button>
        <span>/</span>
        <span aria-current="page">{title}</span>
      </nav>
      <header className="page-head editor-head">
        <div className="editor-title">
          <h1>{title}</h1>
          <div className="entry-meta">
            <Status value={entry?.status ?? 'draft'} />
          </div>
        </div>
        {entry ? (
          <EntryDates entry={entry} />
        ) : (
          <div className="entry-dates">
            <span className="entry-date">Not saved yet</span>
          </div>
        )}
      </header>
      <form
        className="card editor"
        ref={form}
        onSubmit={(event) => {
          event.preventDefault();
          onSave('published', read);
        }}
      >
        {Object.entries(schema.fields).map(([name, field]) => (
          <FieldControl
            key={name}
            name={name}
            field={field}
            value={values[name]}
            disabled={busy}
            run={run}
            onChange={(value, changed = true) => {
              setValues((previous) => ({ ...previous, [name]: value }));
              if (changed) onDirty();
            }}
          />
        ))}
        {Object.values(schema.fields).some((field) => field.required) && (
          <p className="editor-note">
            Complete the fields marked * to publish. You can leave fields empty when saving a draft.
          </p>
        )}
        <div className="editor-bar">
          {entry && (
            <button type="button" className="danger" disabled={busy} onClick={onDelete}>
              Delete entry
            </button>
          )}
          <div className="actions">
            <button type="button" disabled={busy} onClick={() => onSave('draft', read)}>
              {live ? 'Unpublish and save draft' : 'Save draft'}
            </button>
            <button type="submit" className="primary" disabled={busy}>
              {live ? 'Publish changes' : 'Publish'}
            </button>
          </div>
        </div>
      </form>
    </>
  );
}
