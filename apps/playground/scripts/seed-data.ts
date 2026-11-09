import type { FieldsData } from 'sednacms';
import type { postFields, testimonialFields } from '../src/schema.ts';

// Dummy content is inserted into the CMS only by the seed command.
const photo = (id: string, alt: string) => ({
  src: `https://images.unsplash.com/${id}?w=1200&h=800&fit=crop&q=80`,
  width: 1200,
  height: 800,
  alt,
});

export const dummyPosts: FieldsData<typeof postFields>[] = [
  {
    title: 'How I scope a small website project',
    slug: 'how-i-scope-a-small-website-project',
    excerpt: 'One page of decisions, written before any code, saves weeks of back and forth.',
    image: photo(
      'photo-1553877522-43269d4ea984',
      'Two people talking over laptops at a desk, in black and white',
    ),
    body: `<p>Most project trouble starts before the first line of code, in the gap between what the client imagines and what I have understood. So I write the scope down. It takes about an hour, and it is the most valuable hour of the project.</p>
<h2>Five questions I always ask</h2>
<ul><li>Who is the site for, and what should they do when they arrive?</li><li>Which pages does it need on day one?</li><li>Who will edit the content, and how often?</li><li>What already exists: copy, photos, a logo, an old site?</li><li>What is the launch date, and why that date?</li></ul>
<h2>Write down what is not included</h2>
<p>The list of things I will not build is as useful as the list of things I will. Blog migration, translations, a members area: if it is not in the document, it is a separate conversation with its own price.</p>
<blockquote><p>A scope is not a contract against the client. It is a shared picture that both of us can point at.</p></blockquote>
<h2>Agree how feedback works</h2>
<p>I include two rounds of feedback, each collected into a single list. Ten small emails become one clear message, and I can answer it properly.</p>
<p>Clients often tell me the document felt like a relief. They finally knew what they were getting, and when.</p>`,
    date: '2026-11-06',
    reading_time: 4,
    tags: ['Freelancing', 'Process'],
  },
  {
    title: 'Accessibility is mostly small habits',
    slug: 'accessibility-is-mostly-small-habits',
    excerpt: 'You do not need a big audit to make a site far easier to use.',
    image: photo(
      'photo-1498050108023-c5249f4df085',
      'A laptop showing code on a bright, tidy desk',
    ),
    body: `<p>Accessibility can sound like a huge subject, so people put it off. In practice, a handful of habits fix most of the problems I find on small sites.</p>
<h2>Use the right element</h2>
<p>A button that goes somewhere should be a link. A button that does something should be a button. Browsers give you keyboard support, focus and screen reader labels for free when you pick correctly.</p>
<h2>Keep the focus ring</h2>
<p>Never remove the outline on focused elements without replacing it. Someone who navigates with a keyboard needs to see where they are.</p>
<pre><code>:focus-visible {
  outline: 2px solid currentColor;
  outline-offset: 2px;
}</code></pre>
<h2>Check these four things before launch</h2>
<ul><li>Text has enough contrast against its background.</li><li>Every image has alt text, or an empty alt if it is decoration.</li><li>Headings go in order, h1 then h2 then h3.</li><li>You can reach everything by pressing Tab.</li></ul>
<p>Ten minutes with the keyboard alone will teach you more than any checklist.</p>`,
    date: '2026-10-28',
    reading_time: 4,
    tags: ['Accessibility', 'Web'],
  },
  {
    title: 'What I look for in a CMS for a client site',
    slug: 'what-i-look-for-in-a-cms-for-a-client-site',
    excerpt: 'The best CMS is the one your client still enjoys using in a year.',
    image: photo('photo-1555066931-4365d14bab8c', 'A dark laptop screen filled with code'),
    body: `<p>I have set up a lot of content systems. The ones that work have little in common with feature lists. They share a few quieter qualities.</p>
<h2>Editing should feel obvious</h2>
<p>If a client has to ask how to change a heading, the tool has failed. I look for a clear list of content, a simple form per entry, and a preview they can trust.</p>
<h2>Content should be structured</h2>
<p>A post is a title, an image, a date and a body, not one big blob of formatted text. Structured content lets me redesign the site later without asking the client to rewrite anything.</p>
<h2>It should be hard to break</h2>
<ul><li>Required fields, so nothing is published half finished.</li><li>Drafts, so unfinished work stays private.</li><li>Image handling, so a 12 MB photo never reaches a visitor.</li></ul>
<p>When I hand over a site, I want the client to forget about me, in the best way. A good CMS makes that possible.</p>`,
    date: '2026-10-14',
    reading_time: 4,
    tags: ['CMS', 'Clients'],
  },
  {
    title: 'Writing CSS that is easy to leave behind',
    slug: 'writing-css-that-is-easy-to-leave-behind',
    excerpt: 'Someone else will maintain your stylesheet. Be kind to them.',
    image: photo('photo-1461749280684-dccba630e2f6', 'Close-up of PHP code on a dark monitor'),
    body: `<p>Every site I build eventually gets edited by someone else, often a person who is not a full-time developer. I try to write styles the way I would want to inherit them.</p>
<h2>Small, boring rules</h2>
<p>Clever selectors are hard to read six months later. I prefer short, flat rules with a name that says what the thing is.</p>
<h2>Keep decisions in one place</h2>
<p>Colours, font sizes and spacing belong in a small set of named values. When the brand colour changes, you change it once.</p>
<pre><code>:root {
  --color-text: #1e293b;
  --color-accent: #2563eb;
  --space-4: 1rem;
}</code></pre>
<h2>Leave a short guide</h2>
<ul><li>Where the colours and fonts are defined.</li><li>How to add a new page.</li><li>The two or three things that are easy to break.</li></ul>
<p>A page of notes in the repository costs me twenty minutes and saves the next person an afternoon.</p>`,
    date: '2026-09-30',
    reading_time: 3,
    tags: ['CSS', 'Handover'],
  },
];

export const dummyTestimonials: FieldsData<typeof testimonialFields>[] = [
  {
    name: 'Daniel Okafor',
    quote:
      'The one-page scope was a revelation. We knew exactly what we were getting, and the site launched on the day Maya promised.',
    role: 'Owner',
    company: 'Okafor Bikes',
  },
  {
    name: 'Hannah Lindqvist',
    quote:
      'Our team updates the site every week now without asking for help. That alone was worth the project.',
    role: 'Marketing lead',
    company: 'Fjord Studio',
  },
  {
    name: 'Marcus Reid',
    quote:
      'She found why our old site was slow in an afternoon and fixed it the same week. Pages now load in under a second.',
    role: 'Co-founder',
    company: 'Pocketful',
  },
];
