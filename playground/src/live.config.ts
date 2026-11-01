import { defineLiveCollection } from 'astro:content';
import { fields, sednaLoader } from 'sednacms';

const packages = defineLiveCollection({
  loader: sednaLoader({
    collection: 'packages',
    fields: {
      title: fields.text({ required: true }),
      slug: fields.slug({ from: 'title' }),
      price: fields.number(),
      cover: fields.image(),
      body: fields.richText(),
    },
    pages: ['/', '/packages'],
  }),
});

const testimonials = defineLiveCollection({
  loader: sednaLoader({
    collection: 'testimonials',
    fields: {
      name: fields.text({ required: true }),
      quote: fields.text({ required: true }),
      role: fields.text(),
      company: fields.text(),
      avatar: fields.image(),
    },
  }),
});

export const collections = { packages, testimonials };
