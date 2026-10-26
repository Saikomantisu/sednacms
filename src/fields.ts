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
