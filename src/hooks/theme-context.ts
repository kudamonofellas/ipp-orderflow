/**
 * Theme context — shared between ThemeProvider and any component that needs
 * to read or toggle the light/dark theme. Kept separate from the provider
 * component to satisfy react-refresh/only-export-components.
 */

import { createContext } from 'react';

export type Theme = 'light' | 'dark';

export interface ThemeState {
  theme: Theme;
  toggle: () => void;
}

export const ThemeContext = createContext<ThemeState | null>(null);
