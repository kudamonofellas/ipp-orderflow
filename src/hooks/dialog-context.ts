/**
 * Dialog context — promise-based replacement for `window.alert`/`window.confirm`.
 * Kept separate from the provider component to satisfy
 * react-refresh/only-export-components (same reasoning as language-context.ts).
 */

import { createContext } from 'react';

export interface AlertOptions {
  title?: string;
  okLabel?: string;
}

export interface ConfirmOptions {
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Renders the confirm button in the destructive (error) color. */
  danger?: boolean;
}

export interface DialogState {
  /** Resolves once the user dismisses the alert. */
  alert: (message: string, opts?: AlertOptions) => Promise<void>;
  /** Resolves `true` on confirm, `false` on cancel/backdrop-dismiss. */
  confirm: (message: string, opts?: ConfirmOptions) => Promise<boolean>;
}

export const DialogContext = createContext<DialogState | null>(null);
