import type { FieldsData } from 'sednacms';
import type { packageFields, postFields, testimonialFields } from '../src/schema.ts';

// Dummy content is inserted into the CMS only by the seed command.
export const dummyPackage: FieldsData<typeof packageFields> = {
  title: 'A weekend in Edinburgh',
  summary: 'Two days exploring the Old Town, walking the hills, and eating well.',
  highlights: [
    'Two nights in the Old Town',
    'Small-group walking tour',
    'Time to explore on your own',
  ],
  itinerary: [
    {
      title: 'Arrive and explore the Old Town',
      description: 'Drop your bags, then get to know the city on foot.',
      activities: [
        'Check in from 2 pm',
        'Walk the Royal Mile with a local guide',
        'Dinner on your own',
      ],
    },
    {
      title: 'See the city from above',
      description: 'Start early for quieter paths and views across the rooftops.',
      activities: [
        'Breakfast at the hotel',
        'Walk up Calton Hill',
        'Visit the National Museum of Scotland',
      ],
    },
  ],
};

export const dummyPackages: FieldsData<typeof packageFields>[] = [
  dummyPackage,
  {
    title: 'Three days in the Lake District',
    summary: 'Lakeside walks, a village base, and a full day on the fells.',
    highlights: [
      'Three nights in Ambleside',
      'Guided fell walk',
      'Windermere boat trip',
      'Packed lunches included',
    ],
    itinerary: [
      {
        title: 'Settle in by the lake',
        description: 'An easy first afternoon with time to find your bearings.',
        activities: [
          'Check in at the guesthouse',
          'Walk to Waterhead',
          'Meet your guide over dinner',
        ],
      },
      {
        title: 'Head for the fells',
        description: 'Follow a guided route chosen for the weather and the group.',
        activities: [
          'Collect your packed lunch',
          'Walk Loughrigg Fell with your guide',
          'Stop for tea in Grasmere',
        ],
      },
      {
        title: 'A slower day on Windermere',
        description: 'Finish with a morning on the water and a free afternoon.',
        activities: [
          'Take a boat trip on Windermere',
          'Lunch in Bowness',
          'Explore Ambleside at your own pace',
        ],
      },
    ],
  },
  {
    title: 'York by train',
    summary: 'A short city break with medieval streets, museums, and no car needed.',
    highlights: [
      'Two nights near the station',
      'Small-group history walk',
      'Free afternoon for museums',
    ],
    itinerary: [
      {
        title: 'Walk through the old city',
        description: 'Arrive by train and leave your bags before heading out.',
        activities: [
          'Drop your bags at the hotel',
          'Join a guided walk through the Shambles',
          'Walk a section of the city walls',
        ],
      },
      {
        title: 'Choose your own afternoon',
        description: 'Start together, then spend the afternoon on whatever catches your interest.',
        activities: [
          'Visit York Minster',
          'Browse the market for lunch',
          'Choose the Railway Museum or a riverside walk',
        ],
      },
    ],
  },
];

export const dummyPosts: FieldsData<typeof postFields>[] = [
  {
    title: 'Packing for a weekend away',
    slug: 'packing-for-a-weekend-away',
    body: '<p>A small bag is enough for two nights. Pack a waterproof jacket, comfortable shoes, and a spare layer.</p><h2>Leave room for the journey home</h2><p>Keep a little space for anything you pick up along the way.</p>',
    date: '2026-11-01',
    reading_time: 3,
    image: null,
    tags: ['Travel tips', 'Weekends'],
    gallery: [],
    faqs: [
      {
        question: 'Do I need walking boots?',
        answer:
          '<p>Trainers are fine for city walks. Bring walking boots for routes on the fells.</p>',
      },
    ],
  },
  {
    title: 'Planning your first walking holiday',
    slug: 'planning-your-first-walking-holiday',
    body: '<p>Choose a route that leaves time for breaks. Start with shorter walks and check the forecast before setting out.</p><p>A local guide can help you choose a route that suits your group.</p>',
    date: '2026-11-03',
    reading_time: 4,
    image: null,
    tags: ['Walking', 'Planning'],
    gallery: [],
    faqs: [],
  },
];

export const dummyTestimonials: FieldsData<typeof testimonialFields>[] = [
  {
    name: 'Alex Morgan',
    quote:
      'The Edinburgh walk was a great way to start the weekend. We still had plenty of time to explore on our own.',
    role: 'Weekend traveller',
    company: null,
  },
  {
    name: 'Sam Patel',
    quote:
      'Our guide picked a Lake District route that suited the whole group. The packed lunch was a welcome bonus.',
    role: 'Walking holiday guest',
    company: null,
  },
  {
    name: 'Jamie Taylor',
    quote:
      'Everything in York was within walking distance of the hotel. Arriving by train made the trip easy.',
    role: 'City break guest',
    company: null,
  },
];
