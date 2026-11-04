import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Include Sedna's dependency graph in SSR bundles, including linked installations. */
export function bundledDependencies(): string[] {
  const names = new Set(['sednacms']);
  const visited = new Set<string>();
  const pending = [fileURLToPath(new URL('../package.json', import.meta.url))];
  while (pending.length) {
    const manifestPath = pending.pop();
    if (!manifestPath || visited.has(manifestPath)) continue;
    visited.add(manifestPath);
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      dependencies?: Record<string, string>;
    };
    const require = createRequire(manifestPath);
    for (const name of Object.keys(manifest.dependencies ?? {})) {
      names.add(name);
      // Locate manifests without relying on a package exporting package.json.
      const dependency = require.resolve
        .paths(name)
        ?.map((directory) => join(directory, name, 'package.json'))
        .find((path) => existsSync(path));
      if (dependency) pending.push(realpathSync(dependency));
    }
  }
  return [...names];
}
