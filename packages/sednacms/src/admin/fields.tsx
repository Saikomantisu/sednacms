import { disposableDemo, uploadsEnabled } from 'virtual:sedna/admin';
import { type InputHTMLAttributes, type ReactNode, useEffect, useRef, useState } from 'react';
import type { Field, ImageValue } from '../fields.js';
import { RichText } from './rich-text.js';
import { titleCase } from './ui.js';
import { type UploadProgress, uploadImage } from './uploads.js';

// Only the isolated demo accepts browser-local images. Live CMS validation stays unchanged.
const validImageSource = (src: string) =>
  disposableDemo
    ? src.startsWith('/images/') || src.startsWith(`blob:${location.origin}/`)
    : /^https?:\/\//.test(src);

type ImageDraft = { src: string; width: string; height: string; alt: string };
export type FieldValue =
  | string
  | boolean
  | number
  | null
  | FieldValue[]
  | { [key: string]: FieldValue };

function initialValue(field: Field, value: unknown): FieldValue {
  if (field.type === 'image') {
    const image = value as ImageValue | null;
    return {
      src: image?.src ?? '',
      width: image ? String(image.width) : '',
      height: image ? String(image.height) : '',
      alt: image?.alt ?? '',
    };
  }
  if (value == null) return null;
  if (field.type === 'list')
    return (value as unknown[]).map((item) => initialValue(field.item, item));
  if (field.type === 'object') return initialValues(field.fields, value as Record<string, unknown>);
  return value as string | boolean | number;
}
export function initialValues(
  fields: Record<string, Field>,
  data: Record<string, unknown> = {},
): Record<string, FieldValue> {
  return Object.fromEntries(
    Object.entries(fields).map(([name, field]) => [name, initialValue(field, data[name])]),
  );
}
function readValue(field: Field, value: FieldValue, name: string): unknown {
  if (field.type === 'image') {
    const image = value as ImageDraft;
    if (!image.src && !image.width && !image.height && !image.alt) return null;
    if (
      !validImageSource(image.src) ||
      !Number.isInteger(Number(image.width)) ||
      Number(image.width) < 1 ||
      !Number.isInteger(Number(image.height)) ||
      Number(image.height) < 1
    )
      throw new Error(`Provide an image URL, width, and height for ${titleCase(name)}.`);
    return { ...image, width: Number(image.width), height: Number(image.height) };
  }
  if (value == null || value === '') return null;
  if (field.type === 'list')
    return (value as FieldValue[]).map((item, index) =>
      readValue(field.item, item, `${name}[${index}]`),
    );
  if (field.type === 'object') return readValues(field.fields, value as Record<string, FieldValue>);
  return field.type === 'number' ? Number(value) : value;
}
export function readValues(
  fields: Record<string, Field>,
  values: Record<string, FieldValue>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(fields).map(([name, field]) => [name, readValue(field, values[name], name)]),
  );
}
export function LabelledInput({
  label,
  hint,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  return (
    <div className="field">
      <label htmlFor={props.id}>{label}</label>
      <input {...props} />
      {hint && <p className="hint">{hint}</p>}
    </div>
  );
}
export function FieldControl({
  name,
  field,
  value,
  disabled,
  onChange,
  run,
  label: fieldLabel,
}: {
  name: string;
  label?: string;
  field: Field;
  value: FieldValue;
  disabled: boolean;
  onChange: (value: FieldValue, changed?: boolean) => void;
  run: (action: () => Promise<void>) => void;
}) {
  const id = `field-${name}`;
  const label = fieldLabel ?? titleCase(name);
  const heading = (
    <>
      {label} {field.required && <span className="required">*</span>}
    </>
  );
  const props = { id, name, label, field, value, disabled, onChange, run };
  return (
    <div className="field">
      {field.type === 'list' ? (
        <ListControl
          {...props}
          field={field}
          value={value as FieldValue[] | null}
          heading={heading}
        />
      ) : (
        <>
          {field.type === 'image' || field.type === 'object' ? (
            <div className="field-label" id={`${id}-label`}>
              {heading}
            </div>
          ) : (
            <label htmlFor={id}>{heading}</label>
          )}
          <FieldInput {...props} />
        </>
      )}
    </div>
  );
}
type InputProps = {
  id: string;
  name: string;
  label: string;
  field: Field;
  value: FieldValue;
  disabled: boolean;
  onChange: (value: FieldValue, changed?: boolean) => void;
  run: (action: () => Promise<void>) => void;
};
// The control alone, without its label, so list items can supply their own.
function FieldInput({ id, name, label, field, value, disabled, onChange, run }: InputProps) {
  if (field.type === 'list')
    return (
      <ListControl
        {...{ id, name, label, disabled, onChange, run }}
        field={field}
        value={value as FieldValue[] | null}
      />
    );
  if (field.type === 'object')
    return value === null ? (
      <AddButton disabled={disabled} onClick={() => onChange(initialValues(field.fields))}>
        Add {label.toLowerCase()}
      </AddButton>
    ) : (
      <fieldset className="object-control" aria-labelledby={`${id}-label`}>
        <ObjectFields {...{ name, field, disabled, onChange, run }} value={value} />
        <button
          type="button"
          className="quiet small clear-object"
          disabled={disabled}
          onClick={() => onChange(null)}
        >
          Clear {label.toLowerCase()}
        </button>
      </fieldset>
    );
  if (field.type === 'richText')
    return <RichText id={id} label={label} value={value} disabled={disabled} onChange={onChange} />;
  if (field.type === 'image')
    return (
      <ImageControl
        id={id}
        value={value as ImageDraft}
        disabled={disabled}
        onChange={onChange}
        run={run}
      />
    );
  if (field.type === 'boolean')
    return (
      <select
        id={id}
        disabled={disabled}
        value={value === null ? '' : String(value)}
        onChange={(event) =>
          onChange(event.target.value === '' ? null : event.target.value === 'true')
        }
      >
        <option value="">Not set</option>
        <option value="true">Yes</option>
        <option value="false">No</option>
      </select>
    );
  return (
    <>
      <input
        id={id}
        name={name}
        disabled={disabled}
        type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
        step={field.type === 'number' ? 'any' : undefined}
        value={value === null ? '' : String(value)}
        placeholder={
          field.type === 'slug' && field.from
            ? `Generated from ${titleCase(field.from).toLowerCase()}`
            : undefined
        }
        onChange={(event) => onChange(event.target.value)}
      />
      {field.type === 'slug' && field.from && (
        <p className="hint">
          Leave empty to make one from the {titleCase(field.from).toLowerCase()}.
        </p>
      )}
    </>
  );
}
function ObjectFields({
  name,
  field,
  value,
  disabled,
  onChange,
  run,
}: Omit<InputProps, 'id' | 'label' | 'field'> & { field: Extract<Field, { type: 'object' }> }) {
  const values = value as Record<string, FieldValue>;
  return Object.entries(field.fields).map(([key, child]) => (
    <FieldControl
      key={key}
      name={`${name}-${key}`}
      label={titleCase(key)}
      field={child}
      value={values[key]}
      disabled={disabled}
      run={run}
      onChange={(next, changed) => onChange({ ...values, [key]: next }, changed)}
    />
  ));
}

const icons = {
  up: <path d="M12 19V5m-6 6 6-6 6 6" />,
  down: <path d="M12 5v14m-6-6 6 6 6-6" />,
  remove: <path d="M3 6h18M9 6V4h6v2M5 6l1 14h12l1-14M10 10v6m4-6v6" />,
  chevron: <path d="m9 6 6 6-6 6" />,
  plus: <path d="M12 5v14M5 12h14" />,
};
function Icon({ name }: { name: keyof typeof icons }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {icons[name]}
    </svg>
  );
}
function AddButton(props: { disabled: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className="add-item" disabled={props.disabled} onClick={props.onClick}>
      <Icon name="plus" />
      {props.children}
    </button>
  );
}

// Names one item after its list: "Highlights" → "Highlight", "Itinerary" → "Itinerary item".
// Only regular plurals are shortened; anything unsure keeps the label and adds "item".
const singular = (label: string) =>
  /(series|species|news|ss|us|is)$/i.test(label)
    ? `${label} item`
    : /[^aeiou]ies$/i.test(label)
      ? label.replace(/ies$/i, 'y')
      : /(ss|x|ch|sh)es$/i.test(label)
        ? label.slice(0, -2)
        : /s$/i.test(label)
          ? label.slice(0, -1)
          : `${label} item`;
const count = (n: number, label: string) =>
  `${n} ${(n === 1 ? singular(label) : label).toLowerCase()}`;
// DOMParser documents are inert: nothing loads or runs. textContent also decodes entities.
const plainText = (html: string) =>
  (new DOMParser().parseFromString(html.replace(/</g, ' <'), 'text/html').body.textContent ?? '')
    .replace(/\s+/g, ' ')
    .trim();
const isEmpty = (field: Field, value: FieldValue) =>
  value == null ||
  value === '' ||
  (Array.isArray(value) && value.length === 0) ||
  (field.type === 'image' && !(value as ImageDraft).src) ||
  (field.type === 'richText' && !plainText(String(value)));
// One line of text that identifies an item when its fields are hidden.
function summarize(field: Field, value: FieldValue, label: string): string {
  if (value == null) return '';
  if (field.type === 'object') {
    const values = value as Record<string, FieldValue>;
    // The first text-like field names the item, like a title. An empty title stays empty
    // rather than borrowing a description, so the header never mislabels the item.
    const entries = Object.entries(field.fields);
    const entry =
      entries.find(([, child]) => ['text', 'slug', 'richText'].includes(child.type)) ??
      entries.find(([, child]) => ['number', 'date'].includes(child.type));
    return entry ? summarize(entry[1], values[entry[0]], entry[0]) : '';
  }
  if (field.type === 'image') {
    const image = value as ImageDraft;
    return image.alt || image.src.split(/[/?#]/).filter(Boolean).at(-1) || '';
  }
  if (field.type === 'richText') return plainText(String(value));
  if (field.type === 'list') {
    const length = (value as FieldValue[]).length;
    return length ? count(length, label) : '';
  }
  return String(value);
}

// Whether a value, or anything inside it, still lacks a required field.
function incomplete(field: Field, value: FieldValue): boolean {
  if (field.type === 'image' && value) {
    const image = value as ImageDraft;
    if (!image.src && !image.width && !image.height && !image.alt) return field.required;
    const size = (n: string) => Number.isInteger(Number(n)) && Number(n) >= 1;
    return !validImageSource(image.src) || !size(image.width) || !size(image.height);
  }
  if (isEmpty(field, value)) return field.required;
  if (field.type === 'list')
    return (value as FieldValue[]).some((item) => incomplete(field.item, item));
  if (field.type === 'object') {
    const values = value as Record<string, FieldValue>;
    return Object.entries(field.fields).some(([name, child]) => incomplete(child, values[name]));
  }
  return false;
}
// What a collapsed object item shows: counts of its lists, and what it still needs.
function objectStatus(
  field: Extract<Field, { type: 'object' }>,
  values: Record<string, FieldValue>,
) {
  const fields = Object.entries(field.fields);
  const meta = fields
    .filter(([name, child]) => child.type === 'list' && !isEmpty(child, values[name]))
    .map(([name, child]) => summarize(child, values[name], titleCase(name)))
    .join(' · ');
  const missing = fields
    .filter(([name, child]) => child.required && isEmpty(child, values[name]))
    .map(([name]) => titleCase(name).toLowerCase());
  const needs = missing.length
    ? `Needs ${missing.join(', ')}`
    : fields.some(([name, child]) => incomplete(child, values[name]))
      ? 'Incomplete'
      : '';
  return { meta, needs };
}

let nextItemKey = 0;
const inlineTypes = ['text', 'number', 'date', 'slug', 'boolean'];
type Removed = { key: number; index: number; value: FieldValue; title: string };
function ListControl({
  id,
  name,
  label,
  heading,
  field,
  value,
  disabled,
  onChange,
  run,
}: Omit<InputProps, 'field' | 'value'> & {
  heading?: ReactNode;
  field: Extract<Field, { type: 'list' }>;
  value: FieldValue[] | null;
}) {
  // Keys move with items so rich-text editors and pending uploads keep their state.
  const [keys, setKeys] = useState(() => (value ?? []).map(() => nextItemKey++));
  const [open, setOpen] = useState<ReadonlySet<number>>(() => new Set());
  const [removed, setRemoved] = useState<Removed | null>(null);
  const [message, setMessage] = useState({ text: '', count: 0 });
  const focusNext = useRef<string[]>([]);
  const root = useRef<HTMLDivElement>(null);
  const items = value ?? [];
  const item = field.item;
  const inline = inlineTypes.includes(item.type);
  const itemName = singular(label);
  const lower = itemName.toLowerCase();

  // React moves DOM nodes on reorder, which drops focus. Put it back on the intended control.
  useEffect(() => {
    const selectors = focusNext.current;
    if (!selectors.length) return;
    focusNext.current = [];
    for (const selector of selectors) {
      const target = root.current?.querySelector<HTMLElement>(selector);
      if (target && !target.matches(':disabled')) return target.focus();
    }
  });
  // Saving or uploading commits the removal, so the undo offer ends there.
  useEffect(() => {
    if (disabled) setRemoved(null);
  }, [disabled]);

  const update = (nextItems: FieldValue[], nextKeys: number[], announce: string) => {
    setKeys(nextKeys);
    // A changing trailing space makes screen readers repeat an identical message.
    setMessage(({ count }) => ({ text: announce, count: count + 1 }));
    onChange(nextItems);
  };
  const firstControl = (key: number) =>
    `[data-key="${key}"] :is(.item-toggle, input, select, [contenteditable="true"])`;
  const move = (index: number, offset: number, action: 'up' | 'down') => {
    const to = index + offset;
    const nextItems = [...items];
    const nextKeys = [...keys];
    [nextItems[index], nextItems[to]] = [nextItems[to], nextItems[index]];
    [nextKeys[index], nextKeys[to]] = [nextKeys[to], nextKeys[index]];
    const other = action === 'up' ? 'down' : 'up';
    focusNext.current = [action, other].map(
      (name) => `[data-key="${keys[index]}"] [data-action="${name}"]`,
    );
    setRemoved(null);
    update(nextItems, nextKeys, `${itemName} moved to position ${to + 1} of ${items.length}.`);
  };
  const remove = (index: number) => {
    const title = summarize(item, items[index], 'Items');
    setRemoved({ key: keys[index], index, value: items[index], title });
    focusNext.current = [':scope > .list-items > .list-undo [data-undo]'];
    update(
      items.filter((_, i) => i !== index),
      keys.filter((_, i) => i !== index),
      `${itemName} ${index + 1} removed. Undo is available.`,
    );
  };
  const undo = () => {
    if (!removed) return;
    const { key, index, value: restored } = removed;
    setRemoved(null);
    focusNext.current = [firstControl(key)];
    update(
      [...items.slice(0, index), restored, ...items.slice(index)],
      [...keys.slice(0, index), key, ...keys.slice(index)],
      `${itemName} restored.`,
    );
  };
  const add = () => {
    const key = nextItemKey++;
    setOpen(new Set(open).add(key));
    setRemoved(null);
    // The new item's first field, or its own Add button when it starts empty, else its header.
    focusNext.current = [
      `[data-key="${key}"] :is(input, select, [contenteditable="true"], .add-item)`,
      `[data-key="${key}"] .item-toggle`,
    ];
    update(
      [...items, item.type === 'object' ? initialValues(item.fields) : initialValue(item, null)],
      [...keys, key],
      `${itemName} ${items.length + 1} added.`,
    );
  };
  const toggle = (key: number) => {
    const next = new Set(open);
    if (!next.delete(key)) next.add(key);
    setOpen(next);
  };
  const allOpen = keys.every((key) => open.has(key));

  const actions = (index: number) => {
    const position = `${lower} ${index + 1}`;
    const button = (action: 'up' | 'down' | 'remove', title: string, off: boolean) => (
      <button
        type="button"
        className="icon-button"
        data-action={action}
        disabled={disabled || off}
        aria-label={`${title} ${position}`}
        title={title}
        onClick={() =>
          action === 'remove' ? remove(index) : move(index, action === 'up' ? -1 : 1, action)
        }
      >
        <Icon name={action} />
      </button>
    );
    return (
      <div className="list-actions">
        {button('up', 'Move up', index === 0)}
        {button('down', 'Move down', index === items.length - 1)}
        {button('remove', 'Remove', false)}
      </div>
    );
  };
  const renderItem = (current: FieldValue, index: number) => {
    const key = keys[index];
    const itemId = `${id}-${key}`;
    const onItemChange = (next: FieldValue, changed?: boolean) =>
      onChange(
        items.map((value, i) => (i === index ? next : value)),
        changed,
      );
    if (inline)
      return (
        <li className="list-row" key={key} data-key={key}>
          <span className="item-index" aria-hidden="true">
            {index + 1}
          </span>
          <div className="list-row-input">
            <label className="sr-only" htmlFor={itemId}>
              {itemName} {index + 1}
            </label>
            <FieldInput
              id={itemId}
              name={`${name}-${key}`}
              label={`${itemName} ${index + 1}`}
              field={item}
              value={current}
              disabled={disabled}
              onChange={onItemChange}
              run={run}
            />
          </div>
          {actions(index)}
        </li>
      );
    const isOpen = open.has(key);
    // A list nested directly in a list has no name of its own, so its values are "items".
    const childLabel = item.type === 'list' ? 'Items' : `${itemName} ${index + 1}`;
    const title = summarize(item, current, 'Items');
    const image = item.type === 'image' ? (current as ImageDraft) : null;
    const objectValues = item.type === 'object' ? (current as Record<string, FieldValue>) : null;
    const { meta, needs } =
      item.type === 'object' && objectValues
        ? objectStatus(item, objectValues)
        : {
            meta: '',
            needs: incomplete(item, current)
              ? isEmpty(item, current)
                ? 'Empty'
                : 'Incomplete'
              : '',
          };
    return (
      <li className="list-block" key={key} data-key={key}>
        <div className="item-head">
          <button
            type="button"
            className="item-toggle"
            id={`${itemId}-head`}
            aria-expanded={isOpen}
            aria-controls={`${itemId}-body`}
            onClick={() => toggle(key)}
          >
            <span className="item-chevron">
              <Icon name="chevron" />
            </span>
            <span className="item-index">
              <span className="sr-only">{itemName} </span>
              {index + 1}
            </span>
            {image?.src && validImageSource(image.src) && (
              <img
                key={image.src}
                className="item-thumb"
                src={image.src}
                alt=""
                referrerPolicy="no-referrer"
                onError={(event) => {
                  event.currentTarget.hidden = true;
                }}
              />
            )}
            <span className={title ? 'item-title' : 'item-title untitled'}>
              {title || `Untitled ${lower}`}
            </span>
            {needs && !isOpen ? (
              <span className="item-missing">{needs}</span>
            ) : (
              meta && <span className="item-meta">{meta}</span>
            )}
          </button>
          {actions(index)}
        </div>
        <fieldset
          className="item-body"
          id={`${itemId}-body`}
          aria-labelledby={`${itemId}-head`}
          hidden={!isOpen}
        >
          {item.type === 'object' ? (
            objectValues === null ? (
              <AddButton
                disabled={disabled}
                onClick={() => onItemChange(initialValues(item.fields))}
              >
                Add details
              </AddButton>
            ) : (
              <ObjectFields
                name={`${name}-${key}`}
                field={item}
                value={objectValues}
                disabled={disabled}
                onChange={onItemChange}
                run={run}
              />
            )
          ) : (
            <FieldInput
              id={itemId}
              name={`${name}-${key}`}
              label={childLabel}
              field={item}
              value={current}
              disabled={disabled}
              onChange={onItemChange}
              run={run}
            />
          )}
        </fieldset>
      </li>
    );
  };
  const undoRow = removed && (
    <li className="list-undo" key="undo">
      <span className="list-undo-text">
        Removed {removed.title ? <q>{removed.title}</q> : `${lower} ${removed.index + 1}`}
      </span>
      <button type="button" className="quiet small" data-undo onClick={undo}>
        Undo
      </button>
    </li>
  );
  const rows = items.map(renderItem);
  if (undoRow) rows.splice(Math.min(removed.index, rows.length), 0, undoRow);
  const headingId = `${id}-label`;
  return (
    <div className={inline ? 'list-control' : 'list-control blocks'} ref={root}>
      {(heading || (!inline && items.length > 1)) && (
        <div className="list-head">
          {heading && (
            <div className="field-label" id={headingId}>
              {heading}
            </div>
          )}
          {!inline && items.length > 1 && (
            <button
              type="button"
              className="quiet small list-expand"
              aria-label={`${allOpen ? 'Collapse' : 'Expand'} all ${label.toLowerCase()}`}
              onClick={() => setOpen(allOpen ? new Set() : new Set(keys))}
            >
              {allOpen ? 'Collapse all' : 'Expand all'}
            </button>
          )}
        </div>
      )}
      {rows.length > 0 ? (
        <ul className="list-items" aria-labelledby={heading ? headingId : undefined}>
          {rows}
        </ul>
      ) : (
        <p className="list-empty">No {label.toLowerCase()} yet.</p>
      )}
      <AddButton disabled={disabled} onClick={add}>
        Add {lower}
      </AddButton>
      <p className="sr-only" role="status">
        {message.text}
        {message.count % 2 ? '\u00a0' : ''}
      </p>
    </div>
  );
}
function ImageControl({
  id,
  value,
  disabled,
  onChange,
  run,
}: {
  id: string;
  value: ImageDraft;
  disabled: boolean;
  onChange: (value: ImageDraft) => void;
  run: (action: () => Promise<void>) => void;
}) {
  const [failed, setFailed] = useState('');
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const progressLabel =
    progress?.stage === 'preparing'
      ? 'Preparing image…'
      : progress?.stage === 'finalizing'
        ? 'Finishing upload…'
        : 'Uploading image…';
  const percent = progress?.stage === 'uploading' ? progress.percent : undefined;
  const input = (key: keyof ImageDraft, label: string, type: string) => (
    <LabelledInput
      id={id + '-' + key}
      label={label}
      type={type}
      disabled={disabled}
      value={value[key]}
      min={type === 'number' ? 1 : undefined}
      step={type === 'number' ? 1 : undefined}
      onChange={(event) => onChange({ ...value, [key]: event.target.value })}
    />
  );
  return (
    <div className="image-control">
      {uploadsEnabled && (
        <div className="field">
          <label htmlFor={id + '-upload'}>Upload image</label>
          <input
            id={id + '-upload'}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
            aria-describedby={`${id}-upload-hint`}
            disabled={disabled}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = '';
              if (!file) return;
              run(async () => {
                try {
                  const image = await uploadImage(file, setProgress);
                  onChange({
                    src: image.src,
                    width: String(image.width),
                    height: String(image.height),
                    alt: value.alt,
                  });
                } finally {
                  setProgress(null);
                }
              });
            }}
          />
          <p className="hint" id={`${id}-upload-hint`}>
            {disposableDemo
              ? 'Local preview only. Up to 5 MB per image and 25 MB per session. Nothing is uploaded.'
              : 'JPEG, PNG, WebP, GIF, or AVIF, up to 32 MB.'}
          </p>
          {progress && (
            <div className="upload-progress">
              <div className="upload-progress-label">
                <p role="status">{progressLabel}</p>
                {percent !== undefined && <span aria-hidden="true">{Math.floor(percent)}%</span>}
              </div>
              <progress max={100} value={percent} aria-label={progressLabel} />
            </div>
          )}
        </div>
      )}
      {input('src', 'Image URL', disposableDemo ? 'text' : 'url')}
      <div className="field-grid">
        {input('width', 'Width', 'number')}
        {input('height', 'Height', 'number')}
      </div>
      {input('alt', 'Image description', 'text')}
      <p className="hint">
        {disposableDemo
          ? 'Use bundled /images/ paths or choose a local image. External images are blocked in this demo.'
          : uploadsEnabled
            ? 'You can also paste an existing image URL and enter its dimensions.'
            : 'Paste an existing image URL and enter its dimensions. Ask your website developer to configure storage to enable uploads.'}
      </p>
      {value.src && (
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange({ src: '', width: '', height: '', alt: '' })}
        >
          Remove image
        </button>
      )}
      {validImageSource(value.src) && failed !== value.src && (
        <img
          className="image-preview"
          src={value.src}
          alt={value.alt || 'Selected preview'}
          referrerPolicy="no-referrer"
          onError={() => setFailed(value.src)}
        />
      )}
    </div>
  );
}
