import { defineLiveCollection } from 'astro:content';
import { sednaLoader } from 'sednacms';
import { packageFields, postFields, testimonialFields } from './schema';

const posts = defineLiveCollection({
  loader: sednaLoader({ collection: 'posts', fields: postFields }),
});

const testimonials = defineLiveCollection({
  loader: sednaLoader({ collection: 'testimonials', fields: testimonialFields }),
});

const packages = defineLiveCollection({
  loader: sednaLoader({ collection: 'packages', fields: packageFields }),
});

export const collections = { posts, testimonials, packages };
