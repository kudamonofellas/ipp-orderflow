/**
 * Sidebar hook — reads the SidebarContext.
 * Separate from Sidebar.tsx so that file only exports components
 * (satisfies react-refresh/only-export-components).
 */

import { useContext } from 'react';
import { SidebarContext, type SidebarState } from './sidebar-context';

export function useSidebar(): SidebarState {
  const ctx = useContext(SidebarContext);
  if (ctx === null) {
    throw new Error('useSidebar must be used inside <SidebarProvider>');
  }
  return ctx;
}
