import { disposableDemo } from 'virtual:sedna/admin';
import { Dialog as BaseDialog } from '@base-ui/react/dialog';
import { useEffect, useRef, useState } from 'react';
import type { CollectionConfig } from '../../../loader.js';
import { titleCase } from '../../utils/format.js';
import { Brand } from './brand.js';

type Props = {
  schemas: CollectionConfig[];
  selectedCollection?: string;
  mediaSelected: boolean;
  userName: string;
  busy: boolean;
  onCollection: (schema: CollectionConfig) => void;
  onMedia: () => void;
  onSignOut: () => void;
};

export function AdminNavigation(props: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const drawer = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const wide = matchMedia('(min-width: 751px)');
    const close = () => {
      if (wide.matches) setMenuOpen(false);
    };
    wide.addEventListener('change', close);
    return () => wide.removeEventListener('change', close);
  }, []);
  const {
    schemas,
    selectedCollection,
    mediaSelected,
    userName,
    busy,
    onCollection,
    onMedia,
    onSignOut,
  } = props;
  function sidebar(inDrawer = false) {
    return (
      <>
        <div className="sidebar-brand">
          <Brand />
          <a
            className="github-link"
            href="https://github.com/Saikomantisu/sednacms"
            target="_blank"
            rel="noopener noreferrer"
            title="Sedna on GitHub"
          >
            <span className="sr-only">Sedna on GitHub (opens in a new tab)</span>
            <svg width="18" height="18" aria-hidden="true" focusable="false">
              <use href="#sedna-icon-github" />
            </svg>
          </a>
          {inDrawer && (
            <BaseDialog.Close className="icon-button" aria-label="Close menu">
              <svg width="20" height="20" aria-hidden="true" focusable="false">
                <use href="#sedna-icon-close" />
              </svg>
            </BaseDialog.Close>
          )}
        </div>
        <p className="side-label">Collections</p>
        <nav aria-label="Collections">
          {schemas.map((schema) => (
            <button
              key={schema.collection}
              type="button"
              className={selectedCollection === schema.collection ? 'active' : ''}
              aria-current={selectedCollection === schema.collection ? 'page' : undefined}
              disabled={busy}
              onClick={() => {
                setMenuOpen(false);
                onCollection(schema);
              }}
            >
              {titleCase(schema.collection)}
            </button>
          ))}
        </nav>
        {!disposableDemo && (
          <nav className="side-library" aria-label="Library">
            <p className="side-label">Library</p>
            <button
              type="button"
              className={mediaSelected ? 'active' : ''}
              aria-current={mediaSelected ? 'page' : undefined}
              disabled={busy}
              onClick={() => {
                setMenuOpen(false);
                onMedia();
              }}
            >
              Media
            </button>
          </nav>
        )}
        <footer>
          <a
            className="side-link"
            href="/"
            target="_blank"
            rel="noopener"
            onClick={
              disposableDemo
                ? (event) => {
                    event.preventDefault();
                    window.dispatchEvent(new Event('sedna-demo-preview'));
                  }
                : undefined
            }
          >
            {disposableDemo ? 'Preview my changes ↗' : 'View website ↗'}
          </a>
          <div className="account">
            <span className="avatar" aria-hidden="true">
              {userName.charAt(0).toUpperCase()}
            </span>
            <div className="account-text">
              <span className="user-name" title={userName}>
                {userName}
              </span>
              <button
                type="button"
                className="text-link"
                disabled={busy}
                onClick={() => {
                  setMenuOpen(false);
                  onSignOut();
                }}
              >
                {disposableDemo ? 'Reset demo' : 'Sign out'}
              </button>
            </div>
          </div>
        </footer>
      </>
    );
  }
  return (
    <BaseDialog.Root open={menuOpen} onOpenChange={setMenuOpen}>
      <header className="topbar">
        <BaseDialog.Trigger className="icon-button" aria-label="Open menu">
          <svg width="22" height="22" aria-hidden="true" focusable="false">
            <use href="#sedna-icon-menu" />
          </svg>
        </BaseDialog.Trigger>
        <Brand />
      </header>
      <aside className="sidebar">{sidebar()}</aside>
      <BaseDialog.Portal>
        <BaseDialog.Backdrop className="dialog-backdrop drawer-backdrop" />
        <BaseDialog.Viewport className="dialog-viewport drawer-viewport">
          <BaseDialog.Popup
            ref={drawer}
            className="dialog drawer"
            initialFocus={() =>
              drawer.current?.querySelector<HTMLElement>('nav [aria-current="page"], nav button') ??
              true
            }
          >
            <BaseDialog.Title className="sr-only">Menu</BaseDialog.Title>
            <div className="sidebar">{sidebar(true)}</div>
          </BaseDialog.Popup>
        </BaseDialog.Viewport>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  );
}
