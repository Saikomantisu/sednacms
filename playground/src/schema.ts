import { fields } from 'sednacms';

export const postFields = {
  title: fields.text({ required: true }),
  slug: fields.slug({ from: 'title' }),
  body: fields.richText(),
  date: fields.date(),
  reading_time: fields.number(),
  image: fields.image(),
  tags: fields.list(fields.text({ required: true })),
  gallery: fields.list(fields.image({ required: true })),
  faqs: fields.list(
    fields.object({
      question: fields.text({ required: true }),
      answer: fields.richText({ required: true }),
    }),
  ),
};

export const testimonialFields = {
  name: fields.text({ required: true }),
  quote: fields.text({ required: true }),
  role: fields.text(),
  company: fields.text(),
};

export const packageFields = {
  title: fields.text({ required: true }),
  summary: fields.text(),
  highlights: fields.list(fields.text({ required: true }), { required: true }),
  itinerary: fields.list(
    fields.object(
      {
        title: fields.text({ required: true }),
        description: fields.text(),
        activities: fields.list(fields.text({ required: true })),
      },
      { required: true },
    ),
    { required: true },
  ),
};
