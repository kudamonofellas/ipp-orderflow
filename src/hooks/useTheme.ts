/**
 * Theme hook — reads the ThemeContext.
 * Separate from ThemeProvider.tsx so that file only exports components
 * (satisfies react-refresh/only-export-components).
 */

import { useContext } from 'react';
import { ThemeContext, type ThemeState } from './theme-context';

export function useTheme(): ThemeState {
  const ctx = useContext(ThemeContext);
  if (ctx === null) {
    throw new Error('useTheme must be used inside <ThemeProvider>');
  }
  return ctx;
}
