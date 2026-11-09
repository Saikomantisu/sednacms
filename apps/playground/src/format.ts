// "2026-11-01" -> "Nov 1, 2026"
export function formatDate(date: string) {
  return new Date(date).toLocaleDateString('en-US', { dateStyle: 'medium', timeZone: 'UTC' });
}
