export type FieldType = Field['type'];
type ScalarType = 'text' | 'richText' | 'number' | 'image' | 'boolean' | 'date' | 'slug';

interface FieldOptions {
  required?: boolean;
}

function field<T extends ScalarType>(type: T) {
  return (options: FieldOptions = {}) => ({ type, required: options.required ?? false });
}

export const fields = {
  text: field('text'),
  richText: field('richText'),
  number: field('number'),
  image: field('image'),
  boolean: field('boolean'),
  date: field('date'),
  list: <F extends Field>(item: F, options: FieldOptions = {}) => ({
    type: 'list' as const,
    item,
    required: options.required ?? false,
  }),
  object: <F extends Record<string, Field>>(fields: F, options: FieldOptions = {}) => ({
    type: 'object' as const,
    fields,
    required: options.required ?? false,
  }),
  slug: (options: FieldOptions & { from?: string } = {}) => ({
    type: 'slug' as const,
    required: options.required ?? false,
    from: options.from,
  }),
};

export type Field =
  | { [T in Exclude<ScalarType, 'slug'>]: { type: T; required: boolean } }[Exclude<
      ScalarType,
      'slug'
    >]
  | { type: 'slug'; required: boolean; from?: string }
  | { type: 'list'; required: boolean; item: Field }
  | { type: 'object'; required: boolean; fields: Record<string, Field> };

export interface ImageValue {
  src: string;
  width: number;
  height: number;
  alt: string;
}

interface FieldValues {
  text: string;
  richText: string;
  number: number;
  image: ImageValue;
  boolean: boolean;
  /** Calendar day as "YYYY-MM-DD". */
  date: string;
  slug: string;
}

// Every value can be null: columns are nullable and `required` is only checked when saving.
export type FieldData<F extends Field> =
  | (F extends { type: 'list'; item: infer I extends Field }
      ? FieldData<I>[]
      : F extends { type: 'object'; fields: infer O extends Record<string, Field> }
        ? FieldsData<O>
        : F extends { type: infer T extends keyof FieldValues }
          ? FieldValues[T]
          : never)
  | null;

export type FieldsData<F extends Record<string, Field>> = {
  [K in keyof F]: FieldData<F[K]>;
};
