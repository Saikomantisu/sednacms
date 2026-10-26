export type FieldType = 'text' | 'richText' | 'number' | 'image' | 'boolean' | 'date' | 'slug';

interface FieldOptions {
  required?: boolean;
}

function field<T extends FieldType>(type: T) {
  return (options: FieldOptions = {}) => ({ type, required: options.required ?? false });
}

export const fields = {
  text: field('text'),
  richText: field('richText'),
  number: field('number'),
  image: field('image'),
  boolean: field('boolean'),
  date: field('date'),
  slug: (options: FieldOptions & { from?: string } = {}) => ({
    type: 'slug' as const,
    required: options.required ?? false,
    from: options.from,
  }),
};

export type Field = ReturnType<(typeof fields)[keyof typeof fields]>;

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
export type FieldsData<F extends Record<string, Field>> = { [K in keyof F]: FieldValues[F[K]['type']] | null };
