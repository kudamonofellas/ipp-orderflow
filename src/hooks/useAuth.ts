/**
 * Auth + role hooks.
 *
 * Consumers use these to read the current user/role and check capabilities.
 * The context + provider live in `RoleContext.tsx`; this file only exports
 * hooks (no JSX) so it's not subject to react-refresh/only-export-components.
 */

import { useContext } from 'react';
import { AuthContext, type AuthState } from './auth-context';
import type { Capability, Role } from '../lib/domain';

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (ctx === null) {
    throw new Error('useAuth must be used inside <AuthProvider>');
  }
  return ctx;
}

/** Convenience hook: returns the `can()` bound to the current role/overrides. */
export function useCan() {
  return useAuth().can;
}

/** Convenience hook: just the current role (or null when logged out). */
export function useRole(): Role | null {
  return useAuth().role;
}

/** Convenience hook: the signed-in user's display name. */
export function useCurrentUserName(): string {
  const { user } = useAuth();
  if (!user) return '';
  const first = user.first_name ?? '';
  const last = user.last_name ?? '';
  const full = `${first} ${last}`.trim();
  return full || user.email;
}

/** Re-export for components that need to check a capability inline. */
export type { Capability, Role };
