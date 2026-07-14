/**
 * Auth context + shared auth state shape.
 *
 * Kept separate from the provider component so the `.tsx` file only exports
 * a component (satisfies react-refresh/only-export-components). The provider
 * lives in `RoleContext.tsx`; the hooks live in `useAuth.ts`.
 */

import { createContext } from 'react';
import { getClient } from '../lib/directus';
import type { Capability, Role } from '../lib/domain';
import type { DirectusUser } from '../lib/directus';

export interface AuthState {
  user: DirectusUser | null;
  role: Role | null;
  loading: boolean;
  loginError: string | null;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  can: (capability: Capability) => boolean;
}

export const AuthContext = createContext<AuthState | null>(null);

/** Re-export the Directus client for components that need a raw handle. */
export { getClient as directusClient };
