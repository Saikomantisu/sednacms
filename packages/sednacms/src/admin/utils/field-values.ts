import { disposableDemo } from 'virtual:sedna/admin';
import type { Field, ImageValue } from '../../fields.js';
import { titleCase } from './format.js';

// Only the isolated demo accepts browser-local images. Live CMS validation stays unchanged.
export const validImageSource = (src: string) =>
  disposableDemo
    ? src.startsWith('/images/') || src.startsWith(`blob:${location.origin}/`)
    : /^https?:\/\//.test(src);

export type ImageDraft = { src: string; width: string; height: string; alt: string };
export type FieldValue =
  | string
  | boolean
  | number
  | null
  | FieldValue[]
  | { [key: string]: FieldValue };

export function initialValue(field: Field, value: unknown): FieldValue {
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
