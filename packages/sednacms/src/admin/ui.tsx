import { type ReactNode, useEffect, useRef, useState } from 'react';
import type { CmsEntry } from '../api/types.js';
import type { CollectionConfig } from '../loader.js';

export const titleCase = (value: string) =>
  value.replace(/[_-]/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase());
export function entryTitle(entry: CmsEntry, schema: CollectionConfig) {
  const name = Object.keys(schema.fields).find((key) => schema.fields[key].type === 'text');
  const value = name ? entry.data[name] : null;
  return typeof value === 'string' && value ? value : 'Untitled entry';
}
export function Brand() {
  return (
    <div className="brand">
      <span className="mark" />
      sedna
    </div>
  );
}
export function Status({ value }: { value: string }) {
  return <span className={'status ' + value}>{value === 'published' ? 'Published' : 'Draft'}</span>;
}
const day = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
function edited(iso: string) {
  const date = new Date(iso);
  const now = new Date();
  const days = Math.round((day(now) - day(date)) / 86_400_000);
  if (days === 0) return 'Edited today';
  if (days === 1) return 'Edited yesterday';
  if (days > 1 && days < 7) return `Edited ${days} days ago`;
  return (
    'Edited ' +
    date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      ...(date.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
    })
  );
}
export function EntryDates({ entry }: { entry: CmsEntry }) {
  const label = entry.status === 'published' ? 'Published' : 'Created';
  const iso = entry.status === 'published' ? entry.published_at : entry.created_at;
  return (
    <div className="entry-dates">
      {iso ? (
        <time
          className="entry-date"
          dateTime={iso}
          title={`${label} ${new Date(iso).toLocaleString()}`}
        >
          {label}{' '}
          {new Date(iso).toLocaleDateString(undefined, {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          })}
        </time>
      ) : (
        <span className="entry-date">Publication date unavailable</span>
      )}
      <time
        className="entry-edited"
        dateTime={entry.updated_at}
        title={`Edited ${new Date(entry.updated_at).toLocaleString()}`}
      >
        {edited(entry.updated_at)}
      </time>
    </div>
  );
}
export function Dialog({
  title,
  children,
  onCancel,
}: {
  title: string;
  children: ReactNode;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    dialog.showModal();
    dialog.querySelector<HTMLElement>('input,button')?.focus();
    return () => dialog.close();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
    >
      <h2>{title}</h2>
      {children}
    </dialog>
  );
}
type Confirmation = {
  title: string;
  description: string;
  label: string;
  cancelLabel: string;
  resolve: (value: boolean) => void;
};
export function useConfirmation() {
  const [pending, setPending] = useState<Confirmation | null>(null);
  const resolveRef = useRef<((value: boolean) => void) | null>(null);
  useEffect(() => () => resolveRef.current?.(false), []);
  function confirm(title: string, description: string, label: string, cancelLabel = 'Cancel') {
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
      setPending({ title, description, label, cancelLabel, resolve });
    });
  }
  function done(value: boolean) {
    pending?.resolve(value);
    resolveRef.current = null;
    setPending(null);
  }
  const dialog = pending && (
    <Dialog title={pending.title} onCancel={() => done(false)}>
      <p className="muted">{pending.description}</p>
      <div className="actions">
        <button type="button" onClick={() => done(false)}>
          {pending.cancelLabel}
        </button>
        <button type="button" className="danger" onClick={() => done(true)}>
          {pending.label}
        </button>
      </div>
    </Dialog>
  );
  return { confirm, dialog };
}
