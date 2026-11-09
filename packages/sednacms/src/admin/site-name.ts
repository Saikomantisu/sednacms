/** Read the site's rendered homepage title without executing its scripts. */
export async function resolveSiteName(homePath: string, signal?: AbortSignal): Promise<string> {
  try {
    const response = await fetch(homePath, { signal, headers: { Accept: 'text/html' } });
    if (!response.ok) return 'Sedna';
    const html = await response.text();
    const page = new window.DOMParser().parseFromString(html, 'text/html');
    return page.querySelector('title')?.textContent?.trim() || 'Sedna';
  } catch {
    return 'Sedna';
  }
}
