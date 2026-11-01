import { disposableDemo, uploadsEnabled } from 'virtual:sedna/admin';
import { type InputHTMLAttributes, useState } from 'react';
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
export type FieldValue = string | boolean | number | ImageDraft | null;
export function initialValues(
  fields: Record<string, Field>,
  data: Record<string, unknown> = {},
): Record<string, FieldValue> {
  return Object.fromEntries(
    Object.entries(fields).map(([name, field]) => {
      const value = data[name] ?? null;
      if (field.type !== 'image') return [name, value as string | boolean | number | null];
      const image = value as ImageValue | null;
      return [
        name,
        {
          src: image?.src ?? '',
          width: image ? String(image.width) : '',
          height: image ? String(image.height) : '',
          alt: image?.alt ?? '',
        },
      ];
    }),
  );
}
export function readValues(fields: Record<string, Field>, values: Record<string, FieldValue>) {
  return Object.fromEntries(
    Object.entries(fields).map(([name, field]) => {
      const value = values[name];
      if (field.type === 'image') {
        const image = value as ImageDraft;
        if (!image.src && !image.width && !image.height && !image.alt) return [name, null];
        if (
          !validImageSource(image.src) ||
          !Number.isInteger(Number(image.width)) ||
          Number(image.width) < 1 ||
          !Number.isInteger(Number(image.height)) ||
          Number(image.height) < 1
        )
          throw new Error(`Provide an image URL, width, and height for ${titleCase(name)}.`);
        return [name, { ...image, width: Number(image.width), height: Number(image.height) }];
      }
      return [
        name,
        value === '' || value === null ? null : field.type === 'number' ? Number(value) : value,
      ];
    }),
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
}: {
  name: string;
  field: Field;
  value: FieldValue;
  disabled: boolean;
  onChange: (value: FieldValue, changed?: boolean) => void;
  run: (action: () => Promise<void>) => void;
}) {
  const id = 'field-' + name;
  const label = titleCase(name);
  return (
    <div className="field">
      {field.type === 'image' ? (
        <div className="field-label">
          {label} {field.required && <span className="required">*</span>}
        </div>
      ) : (
        <label htmlFor={id}>
          {label} {field.required && <span className="required">*</span>}
        </label>
      )}
      {field.type === 'richText' ? (
        <RichText id={id} label={label} value={value} disabled={disabled} onChange={onChange} />
      ) : field.type === 'image' ? (
        <ImageControl
          id={id}
          value={value as ImageDraft}
          disabled={disabled}
          onChange={onChange}
          run={run}
        />
      ) : field.type === 'boolean' ? (
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
      ) : (
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
                ? 'Generated from ' + titleCase(field.from).toLowerCase()
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
      )}
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
