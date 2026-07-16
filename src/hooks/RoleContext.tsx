/**
 * Auth provider component.
 *
 * Only exports `AuthProvider` (satisfies react-refresh/only-export-components).
 * The context + types live in `auth-context.ts`; the hooks live in `useAuth.ts`.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  hasToken,
  login as directusLogin,
  logout as directusLogout,
  refresh as directusRefresh,
  readMe,
  type DirectusUser,
} from '../lib/directus';
import {
  can as canBase,
  loadRolePermissions,
  normalizeRole,
  type Capability,
  type Role,
} from '../lib/domain';
import { AuthContext, type AuthState } from './auth-context';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<DirectusUser | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [overrides, setOverrides] = useState<
    Partial<Record<Role, Partial<Record<Capability, boolean>>>>
  >({});
  const [loading, setLoading] = useState(true);
  const [loginError, setLoginError] = useState<string | null>(null);

  const rehydrate = useCallback(async (): Promise<{ ok: boolean; error: string | null }> => {
    const me = await readMe();
    if (me.error !== null || me.data === null) {
      setUser(null);
      setRole(null);
      setLoading(false);
      return { ok: false, error: me.error ?? 'Failed to load user profile' };
    }
    setUser(me.data);
    setRole(normalizeRole(me.data.role?.name ?? null));
    const perms = await loadRolePermissions();
    setOverrides(perms);
    setLoading(false);
    return { ok: true, error: null };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      // On mount, if a token exists in localStorage, attempt to rehydrate the
      // user. If readMe() fails (e.g. access token expired), try a token
      // refresh first. If refresh also fails, clear storage and go to login.
      if (hasToken()) {
        const firstTry = await rehydrate();
        if (!firstTry.ok && !cancelled) {
          // Access token may be expired — try refreshing
          const refreshed = await directusRefresh();
          if (refreshed.error === null && !cancelled) {
            // Refresh succeeded: rehydrate with the new token
            await rehydrate();
          } else if (!cancelled) {
            // Both failed: clear auth state cleanly
            setUser(null);
            setRole(null);
            setLoading(false);
          }
        }
      } else {
        setLoading(false);
      }
      if (cancelled) return;
    }
    init();
    return () => {
      cancelled = true;
    };
  }, [rehydrate]);

  const login = useCallback(
    async (email: string, password: string): Promise<boolean> => {
      setLoginError(null);
      setLoading(true);
      const res = await directusLogin(email, password);
      if (res.error !== null || res.data === null) {
        setLoginError(res.error ?? 'Login failed');
        setLoading(false);
        return false;
      }
      const result = await rehydrate();
      if (!result.ok) {
        setLoginError(result.error ?? 'Failed to load user profile after login');
        return false;
      }
      return true;
    },
    [rehydrate],
  );

  const logout = useCallback(async () => {
    await directusLogout();
    setUser(null);
    setRole(null);
    setOverrides({});
    setLoading(false);
  }, []);

  const can = useCallback(
    (capability: Capability): boolean => {
      if (role === null) return false;
      return canBase(role, capability, overrides);
    },
    [role, overrides],
  );

  const value = useMemo<AuthState>(
    () => ({ user, role, loading, loginError, login, logout, can }),
    [user, role, loading, loginError, login, logout, can],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
