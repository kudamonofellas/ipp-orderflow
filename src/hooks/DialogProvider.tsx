import { useCallback, useRef, useState, type ReactNode } from 'react';
import { DialogContext, type AlertOptions, type ConfirmOptions } from './dialog-context';
import { useLanguage } from './useLanguage';
import { Modal } from '../components/Modal/Modal';
import { Button } from '../components/Button/Button';

interface DialogRequest {
  kind: 'alert' | 'confirm';
  message: string;
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

/**
 * Renders one shared `Modal` for every `alert()`/`confirm()` call app-wide —
 * replaces `window.alert`/`window.confirm` (see progress-tracker.md 2026-08-11).
 * Only one dialog can be open at a time; a second call while one is pending
 * waits for the first to resolve (matches `window.alert`/`confirm`'s own
 * blocking behavior — callers never raced two native dialogs either).
 */
export function DialogProvider({ children }: { children: ReactNode }) {
  const { t } = useLanguage();
  const [request, setRequest] = useState<DialogRequest | null>(null);
  const resolveRef = useRef<(value: boolean) => void>(() => {});
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());

  const open = useCallback((next: DialogRequest): Promise<boolean> => {
    const run = () =>
      new Promise<boolean>((resolve) => {
        resolveRef.current = resolve;
        setRequest(next);
      });
    const result = queueRef.current.then(run);
    queueRef.current = result;
    return result;
  }, []);

  const alert = useCallback(
    async (message: string, opts?: AlertOptions) => {
      await open({
        kind: 'alert',
        message,
        title: opts?.title,
        confirmLabel: opts?.okLabel,
      });
    },
    [open],
  );

  const confirm = useCallback(
    (message: string, opts?: ConfirmOptions) =>
      open({
        kind: 'confirm',
        message,
        title: opts?.title,
        confirmLabel: opts?.confirmLabel,
        cancelLabel: opts?.cancelLabel,
        danger: opts?.danger,
      }),
    [open],
  );

  function settle(result: boolean) {
    resolveRef.current(result);
    setRequest(null);
  }

  return (
    <DialogContext.Provider value={{ alert, confirm }}>
      {children}
      <Modal
        open={request !== null}
        title={request?.title}
        onClose={() => settle(false)}
        footer={
          <>
            {request?.kind === 'confirm' && (
              <Button variant="secondary" onClick={() => settle(false)}>
                {request.cancelLabel ?? t('Cancel')}
              </Button>
            )}
            <Button
              variant="primary"
              style={
                request?.danger
                  ? { background: 'var(--state-error)', borderColor: 'var(--state-error)' }
                  : undefined
              }
              onClick={() => settle(true)}
            >
              {request?.confirmLabel ?? (request?.kind === 'confirm' ? t('Confirm') : t('OK'))}
            </Button>
          </>
        }
      >
        {request?.message}
      </Modal>
    </DialogContext.Provider>
  );
}
