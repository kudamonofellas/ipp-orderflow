/**
 * Data hook for the Owner Settings "Team" and "Roles & Permissions" sections.
 * Fetches directus_users (team members), directus_roles (dropdown options),
 * and role_permissions (the live override table behind `can()`).
 */

import { useEffect, useState } from "react";
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

  return { members, roles, permRows, loading, error, reload };
}
