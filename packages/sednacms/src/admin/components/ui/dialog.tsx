import { Dialog as BaseDialog } from '@base-ui/react/dialog';
import { type ReactNode, useRef } from 'react';

export function Dialog({
  title,
  showTitle = true,
  closeLabel = 'Close dialog',
  description,
  className,
  children,
  onCancel,
}: {
  title: string;
  showTitle?: boolean;
  closeLabel?: string;
  description?: string;
  className?: string;
  children: ReactNode;
  onCancel: () => void;
}) {
  const popup = useRef<HTMLDivElement>(null);
  return (
    <BaseDialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <BaseDialog.Portal>
        <BaseDialog.Backdrop className="dialog-backdrop" />
        <BaseDialog.Viewport className="dialog-viewport">
          <BaseDialog.Popup
            ref={popup}
            className={`dialog ${className ?? ''}`}
            initialFocus={(interaction) =>
              interaction === 'touch'
                ? true
                : (popup.current?.querySelector<HTMLElement>(
                    'input:not([type="file"]):not([type="hidden"]):not([aria-hidden="true"]):not(:disabled), textarea:not(:disabled), [contenteditable="true"]',
                  ) ?? true)
            }
          >
            <BaseDialog.Title className={showTitle ? 'dialog-title' : 'sr-only'}>
              {title}
            </BaseDialog.Title>
            <BaseDialog.Close className="icon-button dialog-close" aria-label={closeLabel}>
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                aria-hidden="true"
              >
                <path d="m6 6 12 12M6 18 18 6" />
              </svg>
            </BaseDialog.Close>
            {description && <BaseDialog.Description>{description}</BaseDialog.Description>}
            {children}
          </BaseDialog.Popup>
        </BaseDialog.Viewport>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  );
}
