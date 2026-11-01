import { Editor } from '@tiptap/core';
import { Placeholder } from '@tiptap/extensions';
import StarterKit from '@tiptap/starter-kit';
import DOMPurify from 'dompurify';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Dialog } from './ui.js';

const sanitize = (html: string) => DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
function normalizeUrl(value: string): string | null {
  const url = value.trim();
  if (!url || /^(https?:|mailto:|tel:|\/|#)/i.test(url)) return url;
  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return null;
  return 'https://' + url;
}

// Static toolbar icons use JSX so React owns their markup.
const icon = (paths: ReactNode) => (
  <svg
    viewBox="0 0 24 24"
    width="18"
    height="18"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {paths}
  </svg>
);
const icons = {
  undo: icon(
    <>
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
    </>,
  ),
  redo: icon(
    <>
      <path d="m15 14 5-5-5-5" />
      <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
    </>,
  ),
  bold: icon(
    <>
      <path d="M7 5h5.5a3.5 3.5 0 0 1 0 7H7z" />
      <path d="M7 12h6.5a3.5 3.5 0 0 1 0 7H7z" />
    </>,
  ),
  italic: icon(<path d="M18 5h-7M13 19H6M14.5 5l-5 14" />),
  bulletList: icon(
    <>
      <path d="M9 6h11M9 12h11M9 18h11" />
      {[6, 12, 18].map((y) => (
        <circle key={y} cx="4.5" cy={y} r="1.1" fill="currentColor" stroke="none" />
      ))}
    </>,
  ),
  orderedList: icon(
    <>
      <path d="M10 6h10M10 12h10M10 18h10" />
      <path d="M4 4.5 5 4v4" />
      <path d="M3.8 13.4a1.2 1.2 0 0 1 2.3.4c0 1-2.3 1.6-2.3 3.2h2.4" />
    </>,
  ),
  link: icon(
    <>
      <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" />
      <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
    </>,
  ),
};

const mod = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl+';

type Tool = {
  label: string;
  icon: ReactNode;
  run: (editor: Editor) => unknown;
  /** Toggle buttons report their state with aria-pressed. */
  active?: (editor: Editor) => boolean;
  enabled?: (editor: Editor) => boolean;
};

// Each inner array is one group in the toolbar, separated by a divider.
const groups: Tool[][] = [
  [
    {
      label: `Undo (${mod}Z)`,
      icon: icons.undo,
      run: (e) => e.chain().focus().undo().run(),
      enabled: (e) => e.can().undo(),
    },
    {
      label: `Redo (${mod}${mod === '⌘' ? '⇧Z' : 'Y'})`,
      icon: icons.redo,
      run: (e) => e.chain().focus().redo().run(),
      enabled: (e) => e.can().redo(),
    },
  ],
  [
    {
      label: `Bold (${mod}B)`,
      icon: icons.bold,
      run: (e) => e.chain().focus().toggleBold().run(),
      active: (e) => e.isActive('bold'),
    },
    {
      label: `Italic (${mod}I)`,
      icon: icons.italic,
      run: (e) => e.chain().focus().toggleItalic().run(),
      active: (e) => e.isActive('italic'),
    },
  ],
  [
    {
      label: 'Bullet list',
      icon: icons.bulletList,
      run: (e) => e.chain().focus().toggleBulletList().run(),
      active: (e) => e.isActive('bulletList'),
    },
    {
      label: 'Numbered list',
      icon: icons.orderedList,
      run: (e) => e.chain().focus().toggleOrderedList().run(),
      active: (e) => e.isActive('orderedList'),
    },
  ],
  [{ label: 'Link', icon: icons.link, run: () => {}, active: (e) => e.isActive('link') }],
];

// Block styles live in a dropdown, like a word processor.
const blocks = [
  {
    value: 'paragraph',
    label: 'Normal',
    set: (e: Editor) => e.chain().focus().lift('blockquote').setParagraph().run(),
  },
  {
    value: 'h2',
    label: 'Heading',
    set: (e: Editor) => e.chain().focus().lift('blockquote').setHeading({ level: 2 }).run(),
  },
  {
    value: 'h3',
    label: 'Subheading',
    set: (e: Editor) => e.chain().focus().lift('blockquote').setHeading({ level: 3 }).run(),
  },
  {
    value: 'quote',
    label: 'Quote',
    set: (e: Editor) => e.chain().focus().setParagraph().setBlockquote().run(),
  },
];

function currentBlock(e: Editor) {
  if (e.isActive('blockquote')) return 'quote';
  if (e.isActive('heading', { level: 2 })) return 'h2';
  if (e.isActive('heading', { level: 3 })) return 'h3';
  return 'paragraph';
}

export function RichText({
  id,
  label,
  value,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  value: unknown;
  disabled: boolean;
  onChange: (value: string | null, changed?: boolean) => void;
}) {
  const mount = useRef<HTMLDivElement>(null);
  const editorRef = useRef<Editor | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const initialValue = useRef(value);
  const [, refresh] = useState(0);
  const [link, setLink] = useState<{ current: string } | null>(null);
  useEffect(() => {
    if (!mount.current) return;
    const editor = new Editor({
      element: mount.current,
      content: sanitize(typeof initialValue.current === 'string' ? initialValue.current : ''),
      extensions: [
        StarterKit.configure({
          heading: { levels: [2, 3] },
          code: false,
          codeBlock: false,
          horizontalRule: false,
          strike: false,
          underline: false,
          link: {
            openOnClick: false,
            autolink: true,
            defaultProtocol: 'https',
            HTMLAttributes: { target: null, rel: null },
          },
        }),
        Placeholder.configure({ placeholder: 'Start writing…' }),
      ],
      editorProps: {
        attributes: {
          id,
          class: 'rich-editor',
          role: 'textbox',
          'aria-multiline': 'true',
          'aria-label': label,
        },
      },
      onTransaction: () => refresh((version) => version + 1),
      onUpdate: ({ editor }) =>
        onChangeRef.current(editor.isEmpty ? null : sanitize(editor.getHTML())),
    });
    editorRef.current = editor;
    onChangeRef.current(editor.isEmpty ? null : sanitize(editor.getHTML()), false);
    refresh((version) => version + 1);
    return () => {
      editorRef.current = null;
      editor.destroy();
    };
  }, [id, label]);
  useEffect(() => {
    editorRef.current?.setEditable(!disabled, false);
  }, [disabled]);
  const editor = editorRef.current;
  function saveLink(href: string | null) {
    setLink(null);
    if (!editor || editor.isDestroyed) return;
    if (href === null) {
      editor.commands.focus();
      return;
    }
    const chain = editor.chain().focus().extendMarkRange('link');
    if (!href) {
      chain.unsetLink().run();
      return;
    }
    if (editor.state.selection.empty && !link?.current) {
      chain
        .insertContent({ type: 'text', text: href, marks: [{ type: 'link', attrs: { href } }] })
        .run();
    } else chain.setLink({ href }).run();
  }
  return (
    <div className="rich">
      <div className="toolbar" role="toolbar" aria-label={label + ' formatting'}>
        <select
          className="block-select"
          aria-label="Text style"
          value={editor ? currentBlock(editor) : 'paragraph'}
          disabled={disabled || !editor}
          onChange={(event) => {
            if (editor) blocks.find((block) => block.value === event.target.value)?.set(editor);
          }}
        >
          {blocks.map((block) => (
            <option key={block.value} value={block.value}>
              {block.label}
            </option>
          ))}
        </select>
        {groups.map((group) => (
          <span className="toolbar-group" key={group[0].label}>
            <span className="toolbar-divider" />
            {group.map((tool) => (
              <button
                key={tool.label}
                type="button"
                className="tool"
                title={tool.label}
                aria-label={tool.label.replace(/ \(.*\)$/, '')}
                aria-pressed={tool.active && editor ? tool.active(editor) : undefined}
                disabled={disabled || !editor || Boolean(tool.enabled && !tool.enabled(editor))}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  if (!editor) return;
                  if (tool.label === 'Link')
                    setLink({
                      current: (editor.getAttributes('link').href as string | undefined) ?? '',
                    });
                  else void tool.run(editor);
                }}
              >
                {tool.icon}
              </button>
            ))}
          </span>
        ))}
      </div>
      <div className="rich-mount" ref={mount} />
      {link && <LinkDialog current={link.current} onDone={saveLink} />}
    </div>
  );
}
function LinkDialog({
  current,
  onDone,
}: {
  current: string;
  onDone: (value: string | null) => void;
}) {
  const [value, setValue] = useState(current);
  const [invalid, setInvalid] = useState(false);
  return (
    <Dialog title={current ? 'Edit link' : 'Add link'} onCancel={() => onDone(null)}>
      <div className="field link-field">
        <label htmlFor="link-url">Web address</label>
        <input
          id="link-url"
          type="text"
          inputMode="url"
          placeholder="example.com/page"
          value={value}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? 'link-error' : undefined}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              const href = normalizeUrl(value);
              if (href === null) setInvalid(true);
              else onDone(href);
            }
          }}
        />
        {invalid && (
          <p id="link-error" className="hint link-error">
            Enter a web address like example.com/page.
          </p>
        )}
      </div>
      <div className="actions">
        {current && (
          <button type="button" className="danger" onClick={() => onDone('')}>
            Remove link
          </button>
        )}
        <button type="button" onClick={() => onDone(null)}>
          Cancel
        </button>
        <button
          type="button"
          className="primary"
          onClick={() => {
            const href = normalizeUrl(value);
            if (href === null) setInvalid(true);
            else onDone(href);
          }}
        >
          Save link
        </button>
      </div>
    </Dialog>
  );
}
