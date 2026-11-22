import { defineLiveCollection } from 'astro:content';
import { fields, sednaLoader } from 'sednacms';

export const collections = {
  posts: defineLiveCollection({
    loader: sednaLoader({
      collection: 'posts',
      fields: {
        title: fields.text({ required: true }),
        slug: fields.slug({ from: 'title' }),
        body: fields.richText(),
      },
    }),
  }),
};
