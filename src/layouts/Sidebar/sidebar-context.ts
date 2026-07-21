/**
 * Sidebar context — shared between the Sidebar component and AppLayout so
 * the main content area can read the sidebar width and push (not overlay)
 * the content. Kept separate from the provider component to satisfy
 * react-refresh/only-export-components.
 */

import { createContext } from 'react';

export interface SidebarState {
  collapsed: boolean;
  toggle: () => void;
}

export const SidebarContext = createContext<SidebarState | null>(null);
