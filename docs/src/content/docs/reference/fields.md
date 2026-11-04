---

title: Fields
description: Supported field types, nullability, lists, objects, and validation.
---

Import `fields` from `sednacms` to define your collection schema. Browser-only code can import the same helpers from `sednacms/fields` without loading server dependencies.

| Helper                           | Value        | Notes                                                  |
| -------------------------------- | ------------ | ------------------------------------------------------ |
| `fields.text()`                  | `string`     | Plain text.                                            |
| `fields.richText()`              | `string`     | HTML from the rich-text editor.                        |
| `fields.number()`                | `number`     | Postgres double precision.                             |
| `fields.boolean()`               | `boolean`    | True or false.                                         |
| `fields.date()`                  | `string`     | Calendar day in `YYYY-MM-DD` format, with no timezone. |
| `fields.slug({ from: 'title' })` | `string`     | Generated from a sibling field and editable.           |
| `fields.image()`                 | `ImageValue` | `{ src, width, height, alt }`.                         |
| `fields.list(item)`              | Array        | Ordered values of another field type.                  |
| `fields.object(fields)`          | Object       | Named child fields.                                    |

## Required values and drafts

All fields accept `{ required: true }`. Lists and objects take options as their second argument. Sedna checks required values when publishing. Every field value can still be `null` in TypeScript because drafts may be incomplete.

```ts
fields.text({ required: true });
fields.list(fields.text({ required: true }), { required: true });
fields.object({ name: fields.text({ required: true }) }, { required: true });
```

Guard nullable values before rendering. Drafts can be incomplete, but supplied values must match their field types.

## Lists and grouped fields

Use `fields.list(item)` for ordered, repeatable values and `fields.object(fields)`
for groups of named fields. You can nest them and combine them with any field type:

```ts
fields: {
  tags: fields.list(fields.text({ required: true })),
  gallery: fields.list(fields.image({ required: true })),
  faqs: fields.list(fields.object({
    question: fields.text({ required: true }),
    answer: fields.richText({ required: true }),
  })),
  contact: fields.object({
    name: fields.text(),
    phone: fields.text(),
  }),
}
```

The admin lets editors add, remove, and move list items up or down. Grouped fields
can be added or cleared. Live collections return the values in order with inferred TypeScript types. Lists and objects use Postgres `jsonb` columns.

Both helpers accept `{ required: true }` as a second argument. A required list must
contain at least one item when publishing. An item's `required` option controls
whether that item may be empty. Required children of an object are checked when
the object is present; mark the object itself required to require the group.
Missing fields and empty scalar inputs become `null`; an empty list remains `[]`.
API updates replace a supplied list or object in full. Omitted top-level fields
keep their previous values. Nested slugs generate from sibling fields within their
object.

## Slugs

Set a slug's `from` option to the name of a sibling field. Sedna generates missing slugs from that field's value. Editing the source later preserves an existing slug. Duplicate top-level slugs return a conflict.

Only top-level slugs have unique indexes and address public live entries. Use a single top-level slug field for the collection's public URLs.

## Storage

Scalar text, rich text, and slugs use Postgres `text` columns. Numbers use `double precision`, booleans use `boolean`, and dates use `date`. Images, lists, and objects use `jsonb`. Required fields do not add database constraints because drafts may be incomplete.
