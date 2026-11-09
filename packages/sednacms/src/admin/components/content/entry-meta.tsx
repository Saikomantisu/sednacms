import type { CmsEntry } from '../../../api/types.js';

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
