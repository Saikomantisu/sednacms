import { fields } from 'sednacms';

export const postFields = {
  title: fields.text({ required: true }),
  slug: fields.slug({ from: 'title' }),
  body: fields.richText(),
  date: fields.date(),
  reading_time: fields.number(),
  image: fields.image(),
};

export const testimonialFields = {
  name: fields.text({ required: true }),
  quote: fields.text({ required: true }),
  role: fields.text(),
  company: fields.text(),
};
