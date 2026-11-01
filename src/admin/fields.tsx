import { type InputHTMLAttributes, useState } from 'react';
import type { Field, ImageValue } from '../fields.js';
import { RichText } from './rich-text.js';
import { titleCase } from './ui.js';

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
          !/^https?:\/\//.test(image.src) ||
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
}: {
  name: string;
  field: Field;
  value: FieldValue;
  disabled: boolean;
  onChange: (value: FieldValue, changed?: boolean) => void;
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
        <ImageControl id={id} value={value as ImageDraft} disabled={disabled} onChange={onChange} />
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
}: {
  id: string;
  value: ImageDraft;
  disabled: boolean;
  onChange: (value: ImageDraft) => void;
}) {
  const [failed, setFailed] = useState('');
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
    <>
      {input('src', 'Image URL', 'url')}
      <div className="field-grid">
        {input('width', 'Width', 'number')}
        {input('height', 'Height', 'number')}
      </div>
      {input('alt', 'Image description', 'text')}
      <p className="hint">
        Paste the address of an image that is already online. Uploading from your computer is coming
        soon.
      </p>
      {/^https?:\/\//.test(value.src) && failed !== value.src && (
        <img
          className="image-preview"
          src={value.src}
          alt={value.alt || 'Selected preview'}
          referrerPolicy="no-referrer"
          onError={() => setFailed(value.src)}
        />
      )}
    </>
  );
}
