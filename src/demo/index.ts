import { fileURLToPath } from 'node:url';
import type { AstroIntegration } from 'astro';
import { resolveAdminFavicon } from '../admin/favicon.js';

export type { AdminAdapter, UploadProgress } from '../admin/adapter.js';

export interface DemoOptions {
  /** Module URL exporting a default AdminAdapter. Runs only in the browser. */
  adapter: URL;
  favicon?: string;
}

/** Isolated editor integration. Installs no database, authentication or upload handlers. */
export default function sednaDemo(options: DemoOptions): AstroIntegration {
  const adapter = fileURLToPath(options.adapter);
  return {
    name: 'sednacms/demo',
    hooks: {
      'astro:config:setup': ({ config, injectRoute, updateConfig }) => {
        if (config.integrations.some((integration) => integration.name === 'sednacms'))
          throw new Error(
            'sednacms/demo cannot be installed alongside the live sednacms integration.',
          );
        injectRoute({
          pattern: '/admin/[...path]',
          entrypoint: fileURLToPath(new URL('../admin/index.astro', import.meta.url)),
          prerender: false,
        });
        injectRoute({
          pattern: '/api/cms/[...path]',
          entrypoint: fileURLToPath(new URL('./blocked-api.js', import.meta.url)),
          prerender: false,
        });
        updateConfig({
          vite: {
            optimizeDeps: {
              include: [
                'react',
                'react-dom',
                'react-dom/client',
                'react/jsx-runtime',
                'react/jsx-dev-runtime',
              ],
            },
            plugins: [
              {
                name: 'sedna-demo-adapter',
                resolveId(id) {
                  if (id === 'virtual:sedna/admin' || id === 'virtual:sedna/adapter')
                    return '\0' + id;
                },
                load(id) {
                  if (id === '\0virtual:sedna/adapter')
                    return `export { default as adapter } from ${JSON.stringify(adapter)};`;
                  if (id === '\0virtual:sedna/admin')
                    return `export const favicon = ${JSON.stringify(resolveAdminFavicon(config.publicDir, config.base, options.favicon))}; export const uploadsEnabled = true; export const disposableDemo = true;`;
                },
              },
            ],
          },
        });
      },
    },
  };
}
