/**
 * Domain layer — the capability matrix + the `can()` resolver.
 *
 * Per architecture.md + ai-workflow-rules.md: every order mutation must pass
 * through `can(role, capability)` before the Directus SDK call. The Owner role
 * is always allowed and is NOT stored in `role_permissions`.
 *
 * The coded defaults below (ALLOW) are the fallback when a `role_permissions`
 * row is absent. `can()` is synchronous and pure: it takes the current role +
 * a capability key and returns a boolean. The async `loadRolePermissions()`
 * helper fetches Owner-configurable overrides from Directus so the resolver
 * stays in sync with the live matrix.
 */

import { readItems } from '@directus/sdk';
import { getClient } from './directus';

/**
 * The six business roles (architecture.md). Directus role *names* are mapped
 * to these via `normalizeRole()`.
 */
export type Role = 'Owner' | 'Admin' | 'Warehouse' | 'Production' | 'Finance' | 'Courier';

/**
 * Capability keys. Add new keys here as the UI grows; never change an existing
 * key (it would orphan any `role_permissions` row that references it).
 */
export type Capability =
  | 'createOrders'
  | 'editOrderLines'
  | 'advanceStage'
  | 'approveFinance'
  | 'weighColdStorage'
  | 'cutProduction'
  | 'packWarehouse'
  | 'printDocuments'
  | 'dispatch'
  | 'uploadDeliveryProof'
  | 'processReturns'
  | 'manageRoles'
  | 'manageSettings'
  | 'manage_products'
  | 'manage_customers'
  | 'cancelOrders'
  | 'seePrices';

/**
 * Coded defaults — the fallback when `role_permissions` has no row for a
 * (capability, role) pair. `true` = allowed, `false` = denied.
 *
 * Owner is not listed here; Owner is always allowed (short-circuited in can()).
 */
export const ALLOW: Record<Exclude<Role, 'Owner'>, Partial<Record<Capability, boolean>>> = {
  Admin: {
    createOrders: true,
    editOrderLines: true,
    advanceStage: true,
    printDocuments: true,
    processReturns: true,
    manage_products: true,
    manage_customers: true,
    cancelOrders: true,
    seePrices: true,
  },
  Warehouse: {
    weighColdStorage: true,
    packWarehouse: true,
    advanceStage: true,
    manage_products: true,
  },
  Production: {
    cutProduction: true,
    advanceStage: true,
  },
  Finance: {
    approveFinance: true,
    seePrices: true,
  },
  Courier: {
    dispatch: true,
    uploadDeliveryProof: true,
    advanceStage: true,
  },
};

/**
 * The full capability list — used by the Owner Settings UI (a later unit) to
 * render the toggle grid. Keep this in sync with `Capability`.
 */
export const CAPABILITIES: Capability[] = [
  'createOrders',
  'editOrderLines',
  'advanceStage',
  'approveFinance',
  'weighColdStorage',
  'cutProduction',
  'packWarehouse',
  'printDocuments',
  'dispatch',
  'uploadDeliveryProof',
  'processReturns',
  'manageRoles',
  'manageSettings',
  'seePrices',
];

/**
 * Pure capability check. Owner is always allowed. Otherwise: if the caller has
 * loaded overrides from `role_permissions`, those win; else fall back to the
 * coded default; else deny.
 *
 * Synchronous so UI components can call it inline without awaiting.
 */
export function can(
  role: Role,
  capability: Capability,
  overrides?: Partial<Record<Role, Partial<Record<Capability, boolean>>>>,
): boolean {
  if (role === 'Owner') return true;
  if (overrides && overrides[role]?.[capability] !== undefined) {
    return overrides[role]?.[capability] === true;
  }
  return ALLOW[role]?.[capability] === true;
}

/**
 * Map a Directus role *name* to our 6-role enum. Directus role names on this
 * instance are free-text (e.g. "Owner/Developer/Administrator"), so we match on
 * the first business-role keyword found. Falls back to `Admin` (safest default
 * for the prototype — Owner gets full access via the short-circuit anyway).
 */
export function normalizeRole(directusRoleName: string | null | undefined): Role {
  if (!directusRoleName) return 'Admin';
  const name = directusRoleName.toLowerCase();
  if (name.includes('owner')) return 'Owner';
  if (name.includes('admin')) return 'Admin';
  if (name.includes('warehouse')) return 'Warehouse';
  if (name.includes('production')) return 'Production';
  if (name.includes('finance')) return 'Finance';
  if (name.includes('courier')) return 'Courier';
  return 'Admin';
}

/**
 * Shape of a `role_permissions` row (per target-db-schema.md).
 * Composite PK = (capability, role). Owner is never stored here.
 */
interface RolePermissionRow {
  capability: string;
  role: string;
  allowed: boolean;
}

/**
 * Fetch all Owner-configured overrides from Directus. Returns a structure
 * ready to pass to `can()` as the `overrides` argument. On any error returns
 * an empty object (coded defaults take over).
 *
 * Call this once after login and keep the result in the RoleContext so can()
 * stays in sync with the live matrix without an extra fetch per check.
 */
export async function loadRolePermissions(): Promise<
  Partial<Record<Role, Partial<Record<Capability, boolean>>>>
> {
  try {
    const rows = (await getClient().request(
      readItems('role_permissions', { limit: -1 }),
    )) as unknown as RolePermissionRow[];
    const out: Partial<Record<Role, Partial<Record<Capability, boolean>>>> = {};
    for (const row of rows) {
      const role = normalizeRole(row.role);
      if (role === 'Owner') continue;
      const cap = row.capability as Capability;
      if (!out[role]) out[role] = {};
      out[role]![cap] = row.allowed;
    }
    return out;
  } catch {
    return {};
  }
}
