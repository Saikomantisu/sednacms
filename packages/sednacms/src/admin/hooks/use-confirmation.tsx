import { AlertDialog } from '@base-ui/react/alert-dialog';
import { useEffect, useRef, useState } from 'react';

type Confirmation = {
  title: string;
  description: string;
  label: string;
  cancelLabel: string;
};
export function useConfirmation() {
  const [pending, setPending] = useState<Confirmation | null>(null);
  const resolveRef = useRef<((value: boolean) => void) | null>(null);
  useEffect(() => () => resolveRef.current?.(false), []);
  function confirm(title: string, description: string, label: string, cancelLabel = 'Cancel') {
    return new Promise<boolean>((resolve) => {
      resolveRef.current?.(false);
      resolveRef.current = resolve;
      setPending({ title, description, label, cancelLabel });
    });
  }
  function done(value: boolean) {
    resolveRef.current?.(value);
    resolveRef.current = null;
    setPending(null);
  }
  const cancel = useRef<HTMLButtonElement>(null);
  const dialog = pending && (
    <AlertDialog.Root
      open
      onOpenChange={(open) => {
        if (!open) done(false);
      }}
    >
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className="dialog-backdrop" />
        <AlertDialog.Viewport className="dialog-viewport">
          <AlertDialog.Popup className="dialog confirmation" initialFocus={cancel}>
            <AlertDialog.Title className="dialog-title">{pending.title}</AlertDialog.Title>
            <AlertDialog.Description>{pending.description}</AlertDialog.Description>
            <div className="actions">
              <AlertDialog.Close ref={cancel} onClick={() => done(false)}>
                {pending.cancelLabel}
              </AlertDialog.Close>
              <button type="button" className="danger" onClick={() => done(true)}>
                {pending.label}
              </button>
            </div>
          </AlertDialog.Popup>
        </AlertDialog.Viewport>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
  return { confirm, dialog };
}
