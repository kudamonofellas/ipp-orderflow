import { useContext } from 'react';
import { DialogContext, type DialogState } from './dialog-context';

export function useDialog(): DialogState {
  const ctx = useContext(DialogContext);
  if (ctx === null) {
    throw new Error('useDialog must be used inside <DialogProvider>');
  }
  return ctx;
}
