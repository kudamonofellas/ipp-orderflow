import { useCallback, useRef, useState, type ReactNode } from 'react';
import {
  DialogContext,
  type AlertOptions,
  type ConfirmOptions,
  type PromptOptions,
} from './dialog-context';
import { useLanguage } from './useLanguage';
import { Modal } from '../components/Modal/Modal';
import { Button } from '../components/Button/Button';
import styles from './DialogProvider.module.css';

interface DialogRequest {
  kind: 'alert' | 'confirm' | 'prompt';
  message: string;
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  placeholder?: string;
}

/**
 * Renders one shared `Modal` for every `alert()`/`confirm()`/`prompt()` call
 * app-wide — replaces `window.alert`/`window.confirm`/`window.prompt` (see
 * progress-tracker.md 2026-08-11, and 2026-08-19 for `prompt`). Only one
 * dialog can be open at a time; a second call while one is pending waits for
 * the first to resolve (matches the native dialogs' own blocking behavior —
 * callers never raced two native dialogs either).
 */
export function DialogProvider({ children }: { children: ReactNode }) {
  const { t } = useLanguage();
  const [request, setRequest] = useState<DialogRequest | null>(null);
  const [promptValue, setPromptValue] = useState('');
  const resolveRef = useRef<(value: boolean) => void>(() => {});
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());
  // A ref, not just the `promptValue` state, because `settle()` resolves the
  // pending promise and clears `request` in the same tick — the `prompt()`
  // wrapper below needs the LATEST typed value synchronously at that exact
  // moment, before React has necessarily flushed the state update it'd read.
  const promptValueRef = useRef('');

  const open = useCallback(
    (next: DialogRequest, initialValue = ''): Promise<boolean> => {
      const run = () =>
        new Promise<boolean>((resolve) => {
          resolveRef.current = resolve;
          promptValueRef.current = initialValue;
          setPromptValue(initialValue);
          setRequest(next);
        });
      const result = queueRef.current.then(run);
      queueRef.current = result;
      return result;
    },
    [],
  );

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

  const prompt = useCallback(
    async (message: string, opts?: PromptOptions) => {
      const confirmed = await open(
        {
          kind: 'prompt',
          message,
          title: opts?.title,
          confirmLabel: opts?.confirmLabel,
          cancelLabel: opts?.cancelLabel,
          danger: opts?.danger,
          placeholder: opts?.placeholder,
        },
        opts?.defaultValue ?? '',
      );
      return confirmed ? promptValueRef.current : null;
    },
    [open],
  );

  function settle(result: boolean) {
    resolveRef.current(result);
    setRequest(null);
  }

  function updatePromptValue(v: string) {
    promptValueRef.current = v;
    setPromptValue(v);
  }

  return (
    <DialogContext.Provider value={{ alert, confirm, prompt }}>
      {children}
      <Modal
        open={request !== null}
        title={request?.title}
        onClose={() => settle(false)}
        footer={
          <>
            {(request?.kind === 'confirm' || request?.kind === 'prompt') && (
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
              {request?.confirmLabel ??
                (request?.kind === 'alert' ? t('OK') : t('Confirm'))}
            </Button>
          </>
        }
      >
        {request?.message}
        {request?.kind === 'prompt' && (
          <input
            type="text"
            className={styles.promptInput}
            value={promptValue}
            placeholder={request.placeholder}
            autoFocus
            onChange={(e) => updatePromptValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                settle(true);
              }
            }}
          />
        )}
      </Modal>
    </DialogContext.Provider>
  );
}
