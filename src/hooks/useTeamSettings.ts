/**
 * Data hook for the Owner Settings "Team" and "Roles & Permissions" sections.
 * Fetches directus_users (team members), directus_roles (dropdown options),
 * and role_permissions (the live override table behind `can()`).
 */

import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import {
  readTeamMembers,
  readAllRoles,
  readRolePermissionRows,
  type TeamMember,
  type RoleBrief,
  type RolePermissionRow,
} from "../lib/directus";

interface UseTeamSettingsResult {
  members: TeamMember[];
  roles: RoleBrief[];
  permRows: RolePermissionRow[];
  loading: boolean;
  error: string | null;
  reload: () => void;
  /**
   * Patch `permRows`/`members` directly (optimistic update after a single-row
   * write), without bumping `nonce` — a full `reload()` refetches members +
   * roles + permRows together and flips `loading` for all three, which
   * visibly unmounts/remounts the unrelated Team section on every single grid
   * click or member toggle. Reserve `reload()` for genuine full-refresh cases
   * (member added/removed, role reassigned).
   */
  setPermRows: Dispatch<SetStateAction<RolePermissionRow[]>>;
  setMembers: Dispatch<SetStateAction<TeamMember[]>>;
}

export function useTeamSettings(): UseTeamSettingsResult {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [roles, setRoles] = useState<RoleBrief[]>([]);
  const [permRows, setPermRows] = useState<RolePermissionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const reload = () => setNonce((n) => n + 1);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      const [m, r, p] = await Promise.all([
        readTeamMembers(),
        readAllRoles(),
        readRolePermissionRows(),
      ]);
      if (cancelled) return;

      if (m.error !== null) {
        setError(m.error);
      } else {
        setError(null);
        setMembers(m.data ?? []);
      }
      if (r.data) setRoles(r.data);
      if (p.data) setPermRows(p.data);
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [nonce]);

  return {
    members,
    roles,
    permRows,
    loading,
    error,
    reload,
    setPermRows,
    setMembers,
  };
}
