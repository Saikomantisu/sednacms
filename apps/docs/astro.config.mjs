import starlight from '@astrojs/starlight';
import { defineConfig } from 'astro/config';

export default defineConfig({
  integrations: [
    starlight({
      title: 'Sedna CMS',
      description: 'Add editable content to your Astro site with Sedna CMS.',
      logo: { src: './src/assets/mark.svg' },
      favicon: '/favicon.svg',
      social: [
        { icon: 'github', label: 'GitHub', href: 'https://github.com/Saikomantisu/sednacms' },
      ],
      editLink: { baseUrl: 'https://github.com/Saikomantisu/sednacms/edit/main/apps/docs/' },
      customCss: ['./src/styles/custom.css'],
      sidebar: [
        {
          label: 'Start here',
          items: [
            { label: 'Introduction', slug: 'getting-started/introduction' },
            { label: 'Installation', slug: 'getting-started/installation' },
            { label: 'Your first collection', slug: 'getting-started/first-collection' },
          ],
        },
        {
          label: 'Guides',
          items: [
            { label: 'Render live content', slug: 'guides/live-content' },
            { label: 'Edit and publish', slug: 'guides/admin' },
            { label: 'Image uploads', slug: 'guides/uploads' },
            { label: 'Authentication', slug: 'guides/authentication' },
            { label: 'Caching', slug: 'guides/caching' },
            { label: 'Deployment', slug: 'guides/deployment' },
            { label: 'Add Sedna with an agent', slug: 'guides/agents' },
          ],
        },
        {
          label: 'Reference',
          items: [
            { label: 'Fields', slug: 'reference/fields' },
            { label: 'Configuration', slug: 'reference/configuration' },
            { label: 'Environment variables', slug: 'reference/environment' },
            { label: 'Content API', slug: 'reference/content-api' },
            { label: 'Troubleshooting', slug: 'reference/troubleshooting' },
          ],
        },
      ],
    }),
  ],
});
