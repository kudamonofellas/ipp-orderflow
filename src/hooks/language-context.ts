/**
 * Language context — shared between LanguageProvider and any component that
 * needs to read/switch the active language or call `t()`. Kept separate from
 * the provider component to satisfy react-refresh/only-export-components.
 */

import { createContext } from 'react';
import type { Lang } from '../i18n/translations';

export interface LanguageState {
  lang: Lang;
  setLang: (lang: Lang) => void;
  /** Translates an English key to the active language. Returns the key
   *  itself when the language is English or the key has no translation. */
  t: (key: string) => string;
}

export const LanguageContext = createContext<LanguageState | null>(null);
