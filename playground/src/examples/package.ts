import type { FieldsData } from 'sednacms';
import type { packageFields } from '../schema';

// Shared by the frontend previews and the explicit package seed command.
export const examplePackage: FieldsData<typeof packageFields> = {
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

export const examplePackages: FieldsData<typeof packageFields>[] = [
  examplePackage,
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
