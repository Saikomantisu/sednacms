import type { AstroIntegration } from 'astro';

export default function sedna(): AstroIntegration {
  return {
    name: 'sednacms',
    hooks: {
      'astro:config:setup': ({ logger }) => {
        logger.info('Sedna CMS loaded');
      },
    },
  };
}
