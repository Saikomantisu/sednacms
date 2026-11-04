import { type FieldsData, fields, type ImageValue } from '../dist/fields.js';

const schema = {
  tags: fields.list(fields.text()),
  gallery: fields.list(fields.image()),
  groups: fields.list(
    fields.object({
      title: fields.text(),
      scores: fields.list(fields.number()),
      details: fields.object({ active: fields.boolean() }),
    }),
  ),
};
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Assert<T extends true> = T;
export type InferredFields = Assert<
  Equal<
    FieldsData<typeof schema>,
    {
      tags: (string | null)[] | null;
      gallery: (ImageValue | null)[] | null;
      groups:
        | ({
            title: string | null;
            scores: (number | null)[] | null;
            details: { active: boolean | null } | null;
          } | null)[]
        | null;
    }
  >
>;
