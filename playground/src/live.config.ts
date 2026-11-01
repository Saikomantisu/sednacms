import { defineLiveCollection } from 'astro:content';
import { sednaLoader } from 'sednacms';
import { postFields, testimonialFields } from './schema';

const posts = defineLiveCollection({
  loader: sednaLoader({ collection: 'posts', fields: postFields }),
});

const testimonials = defineLiveCollection({
  loader: sednaLoader({ collection: 'testimonials', fields: testimonialFields }),
});

export const collections = { posts, testimonials };
