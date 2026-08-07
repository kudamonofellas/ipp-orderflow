/**
 * Language hook — reads the LanguageContext.
 * Separate from LanguageProvider.tsx so that file only exports components
 * (satisfies react-refresh/only-export-components).
 */

import { useContext } from 'react';
import { LanguageContext, type LanguageState } from './language-context';

export function useLanguage(): LanguageState {
  const ctx = useContext(LanguageContext);
  if (ctx === null) {
    throw new Error('useLanguage must be used inside <LanguageProvider>');
  }
  return ctx;
}
