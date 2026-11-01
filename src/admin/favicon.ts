import { statSync } from 'node:fs';

// The admin mark (a planet crossed by a tilted orbit) in white on the brand rust.
const defaultFavicon =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%23b5523f'/%3E%3Cmask id='m'%3E%3Ccircle cx='16' cy='16' r='10' fill='%23fff'/%3E%3Cellipse cx='16' cy='16' rx='13.6' ry='4.7' transform='rotate(-28 16 16)' fill='none' stroke='%23000' stroke-width='2.2'/%3E%3C/mask%3E%3Ccircle cx='16' cy='16' r='10' fill='%23fff' mask='url(%23m)'/%3E%3C/svg%3E";

export function resolveAdminFavicon(publicDir: URL, base: string, override?: string): string {
  if (override) return override;
  for (const name of ['favicon.svg', 'favicon.ico', 'favicon.png']) {
    if (statSync(new URL(name, publicDir), { throwIfNoEntry: false })?.isFile()) {
      return `${base.replace(/\/$/, '')}/${name}`;
    }
  }
  return defaultFavicon;
}
