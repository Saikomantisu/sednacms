import { type CSSProperties, createElement } from 'react';
import { Toaster } from 'sonner';

export function Notifications() {
  return createElement(Toaster, {
    theme: 'dark',
    position: 'bottom-right',
    duration: 4000,
    closeButton: true,
    offset: 24,
    mobileOffset: 16,
    style: {
      '--normal-bg': 'var(--card)',
      '--normal-text': 'var(--ink)',
      '--normal-border': 'var(--line)',
      fontFamily: 'inherit',
    } as CSSProperties,
  });
}
