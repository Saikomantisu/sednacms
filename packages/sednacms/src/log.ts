import { styleText } from 'node:util';

/** A message, optionally with hint paragraphs printed below it like Astro's own errors. */
export type LogEntry = string | { message: string; hint?: string | string[] };

type Level = 'info' | 'warn' | 'error';

/** The message and its indented hint, without a prefix. Pass this to Astro's integration logger. */
export function formatEntry(entry: LogEntry): string {
  if (typeof entry === 'string') return entry;
  const hints = [entry.hint ?? []].flat();
  if (!hints.length) return entry.message;
  return [entry.message, '  Hint:', hints.map((hint) => `    ${hint}`).join('\n\n')].join('\n');
}

const time = new Intl.DateTimeFormat([], {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

// Matches Astro's log prefix: `12:00:00 [WARN] [sednacms]`. Colors are dropped when the
// output is not a terminal or NO_COLOR is set.
function prefix(level: Level, stream: NodeJS.WriteStream) {
  const style = (format: Parameters<typeof styleText>[0], text: string) =>
    styleText(format, text, { stream });
  const timestamp = time.format(new Date());
  if (level === 'info') return `${style('dim', timestamp)} ${style('blue', '[sednacms]')}`;
  return style(
    level === 'warn' ? 'yellow' : 'red',
    `${style('bold', timestamp)} [${level.toUpperCase()}] [sednacms]`,
  );
}

function write(level: Level, entry: LogEntry) {
  const stream = level === 'info' ? process.stdout : process.stderr;
  console[level](`${prefix(level, stream)} ${formatEntry(entry)}`);
}

/** Logs at request time, where Astro's integration logger is not available. */
export const log = {
  info: (entry: LogEntry) => write('info', entry),
  warn: (entry: LogEntry) => write('warn', entry),
  error: (entry: LogEntry) => write('error', entry),
};

const logged = new Set<string>();

/** Logs a message once per process. For configuration problems that repeat on every request. */
export function logOnce(level: Level, entry: LogEntry) {
  const key = `${level}:${formatEntry(entry)}`;
  if (logged.has(key)) return;
  logged.add(key);
  log[level](entry);
}
