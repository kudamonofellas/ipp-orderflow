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
  // Broader than `printDocuments` (which gates the Finalise "Print DO/SI"
  // stage-advance action, Admin/Owner only) — this gates the Documents
  // section itself (both seeing it and adding to it) on `OrderDetail.tsx`.
  // Ported from the prototype's own hardcoded `['Admin','Finance',
  // 'Owner'].includes(role)` (`Dev-OrderDetail.jsx:1615`) — DO/SI numbers
  // are accounting/paperwork, not floor work, so Warehouse/Production/
  // Courier don't see it at all; Finance sees AND adds (no narrower gate
  // for the add-form — the prototype's add-form sits inside the same
  // Admin/Finance/Owner block with nothing extra).
  | 'seeDocuments'
  | 'dispatch'
  | 'uploadDeliveryProof'
  // Split from the single `processReturns` (2026-08-26) to match the
  // prototype's own two distinct role checks on the returns panel
  // (`Dev-OrderDetail.jsx:1094-1095`): `canReceive` (warehouse physically
  // receives/weighs the goods back in) vs `canDecide` (admin picks the
  // Accurate document type). Warehouse and Admin never overlap on either —
  // a Warehouse session should never see the Settle dropdown, an Admin
  // session should never see the receive-weigh controls.
  | 'receiveReturns'
  | 'decideReturns'
  // The courier who carries the revised DO/SI out for signing can capture
  // the signed photo (`canSign`, `Dev-OrderDetail.jsx:1096` —
  // `['Admin','Courier','Owner']`), distinct from both of the above.
  | 'signReturns'
  | 'manageRoles'
  | 'manageSettings'
  | 'manage_products'
  // Narrower than manage_products: flipping a product's out-of-stock flag,
  // without the rest of create/edit/delete. Split out so Warehouse can keep
  // the OOS toggle it needs without the broader grant the
  // Settings-Owner.png design shows it as unchecked for (see F-10 —
  // previously both the Products list toggle and this capability's write
  // shared manage_products, a split-authority gate on one field).
  | 'flag_out_of_stock'
  | 'manage_customers'
  | 'cancelOrders'
  | 'seePrices'
  | 'seeCustomerContact'
  | 'viewPickList'
  | 'viewDeliveryRun'
  | 'reconcileCOD'
  | 'seeCustomerCredit'
  | 'browseCustomers'
  | 'browseProducts'
  | 'accessReports'
  // No live courier-location map exists in the port yet (GPS tracking is a
  // deferred "Next Up" item, same as the courier hand-off/pickup flow) — this
  // capability has no UI to gate today. Kept for capability-matrix parity
  // with the prototype and ready to wire up the moment that feature lands.
  | 'trackCourier'
  // Decoupled from advanceStage/flow.capability so Owner Settings can grant
  // these independently (Settings-Owner.png "Roles & Permissions" grid).
  | 'holdResume'
  | 'sendBackStage'
  | 'reopenOrders'
  // Lets a role advance stages outside their own pipeline focus (e.g. Admin
  // covering for Warehouse). Additive to the stage's own owning capability.
  | 'helpOtherStages'
  // The following have no live UI yet (same "capability exists, feature
  // doesn't" posture as trackCourier) — added for Owner Settings matrix
  // parity with the design, ready to wire up when the feature lands.
  | 'confirmDocsReturned'
  | 'overrideCreditLimit'
  | 'exportCSV'
  | 'backupRestore'
  | 'resetData'
  | 'editAfterLock';

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
    // Every other pipeline stage has its own dedicated capability
    // (weighColdStorage/cutProduction/packWarehouse/dispatch/approveFinance)
    // — `advanceStage` is only ever consumed by `intake` and `finalise`
    // (`OrderDetail.tsx`'s `STAGE_FLOW`), both `Admin`-only per the
    // prototype's `ACTOR` map with no floor-helper carve-out (matches
    // `helpOtherStages`'s own scope there too — `Dev-OrderDetail.jsx:123`
    // only ever covers `['cold','production','packing','dispatch']`).
    // Previously also granted to Warehouse/Production/Courier — let anyone
    // with that stale grant print the DO/SI and release straight to
    // dispatch, which is Admin's (and Owner's) job alone. Reported directly.
    advanceStage: true,
    printDocuments: true,
    seeDocuments: true,
    decideReturns: true,
    signReturns: true,
    manage_products: true,
    flag_out_of_stock: true,
    manage_customers: true,
    cancelOrders: true,
    seePrices: true,
    seeCustomerContact: true,
    viewPickList: true,
    reconcileCOD: true,
    seeCustomerCredit: true,
    browseCustomers: true,
    browseProducts: true,
    accessReports: true,
    trackCourier: true,
    // Owner Settings "Roles & Permissions" grid defaults (Settings-Owner.png).
    holdResume: true,
    sendBackStage: true,
    reopenOrders: true,
    helpOtherStages: true,
    confirmDocsReturned: true,
    exportCSV: true,
    backupRestore: true,
    manageSettings: true,
  },
  Warehouse: {
    weighColdStorage: true,
    packWarehouse: true,
    // NOT manage_products (see F-10 / the flag_out_of_stock doc comment
    // above) — Settings-Owner.png shows Warehouse unchecked for full
    // create/edit/delete. Warehouse only gets the narrower OOS-flip grant.
    flag_out_of_stock: true,
    // Warehouse completes the "receive" bucket of a return (weigh the goods
    // back in) — no Owner Settings page exists yet to grant this per-role,
    // so it defaults on rather than blocking the workflow. Matches the
    // prototype's `canReceive` exactly (`Dev-OrderDetail.jsx:1094`) —
    // Warehouse never gets `decideReturns` (that's Admin's job).
    receiveReturns: true,
    viewPickList: true,
    browseProducts: true,
    // Per Settings-Owner.png's Roles & Permissions grid: Warehouse sees order
    // value (needed to judge what's being packed/weighed).
    seePrices: true,
    exportCSV: true,
  },
  Production: {
    cutProduction: true,
    browseProducts: true,
    // Per Settings-Owner.png: Production sees order value (needed to judge
    // what's being cut).
    seePrices: true,
    exportCSV: true,
  },
  Finance: {
    approveFinance: true,
    seeDocuments: true,
    seePrices: true,
    seeCustomerContact: true,
    reconcileCOD: true,
    seeCustomerCredit: true,
    browseCustomers: true,
    browseProducts: true,
    accessReports: true,
    trackCourier: true,
    overrideCreditLimit: true,
    exportCSV: true,
  },
  Courier: {
    dispatch: true,
    uploadDeliveryProof: true,
    // Courier needs the delivery contact/address to complete the drop-off —
    // matches the prototype's default (Dev-domain.js ALLOW.Courier.seeCustomerContact).
    seeCustomerContact: true,
    viewDeliveryRun: true,
    browseProducts: true,
    exportCSV: true,
    // The courier physically carries the revised DO/SI out for signing and
    // captures the signed photo (`canSign`, Dev-OrderDetail.jsx:1096).
    signReturns: true,
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
  'seeDocuments',
  'dispatch',
  'uploadDeliveryProof',
  'receiveReturns',
  'decideReturns',
  'signReturns',
  'manageRoles',
  'manageSettings',
  'manage_products',
  'flag_out_of_stock',
  'manage_customers',
  'seePrices',
  'seeCustomerContact',
  'viewPickList',
  'viewDeliveryRun',
  'reconcileCOD',
  'seeCustomerCredit',
  'browseCustomers',
  'browseProducts',
  'accessReports',
  'trackCourier',
  'holdResume',
  'sendBackStage',
  'reopenOrders',
  'helpOtherStages',
  'confirmDocsReturned',
  'overrideCreditLimit',
  'exportCSV',
  'backupRestore',
  'resetData',
  'editAfterLock',
];

/**
 * Roles & Permissions grid layout (Owner Settings, context/designs/Settings-Owner.png).
 * A curated subset/order of `CAPABILITIES` grouped under the design's section
 * headers — not every internal capability belongs on this Owner-facing grid
 * (e.g. weighColdStorage/cutProduction/packWarehouse are implied by stage
 * ownership, not independently toggled).
 */
export const PERMISSION_GRID: { section: string; rows: { cap: Capability; label: string }[] }[] = [
  {
    section: 'Visibility',
    rows: [
      { cap: 'seePrices', label: 'See prices & order value' },
      { cap: 'seeCustomerContact', label: 'See customer contact & sales rep' },
      { cap: 'seeCustomerCredit', label: 'See credit limit & exposure' },
      { cap: 'browseCustomers', label: 'Browse the Customers directory' },
      { cap: 'browseProducts', label: 'Browse the Products directory' },
      { cap: 'accessReports', label: 'Access Reports' },
      { cap: 'trackCourier', label: 'See live courier location' },
    ],
  },
  {
    section: 'Orders',
    rows: [
      { cap: 'createOrders', label: 'Create orders' },
      { cap: 'editOrderLines', label: 'Edit orders (own stage, pre-cut)' },
      { cap: 'editAfterLock', label: 'Edit after cutting / dispatch (override)' },
      { cap: 'seeDocuments', label: 'See & add Documents (DO/SI, PO)' },
    ],
  },
  {
    section: 'Pipeline',
    rows: [
      { cap: 'helpOtherStages', label: 'Act on other stages (floor helper)' },
      { cap: 'approveFinance', label: 'Clear payment at the Finance gate' },
      { cap: 'holdResume', label: 'Put on hold / resume' },
      { cap: 'cancelOrders', label: 'Cancel orders' },
      { cap: 'sendBackStage', label: 'Send an order back a stage' },
      { cap: 'reopenOrders', label: 'Reopen closed orders' },
      { cap: 'confirmDocsReturned', label: 'Confirm signed DO & SI returned' },
    ],
  },
  {
    section: 'Money',
    rows: [
      { cap: 'overrideCreditLimit', label: 'Clear an order over the credit limit' },
      { cap: 'reconcileCOD', label: 'Reconcile COD cash' },
      { cap: 'exportCSV', label: 'Export data to CSV (orders / products)' },
    ],
  },
  {
    section: 'Admin Area',
    rows: [
      { cap: 'manage_customers', label: 'Create / edit customers' },
      { cap: 'manage_products', label: 'Create / edit products' },
      { cap: 'manageSettings', label: 'Edit operational settings' },
      { cap: 'backupRestore', label: 'Backup / restore data' },
      { cap: 'manageRoles', label: 'Manage team / users' },
      { cap: 'resetData', label: 'Reset demo data' },
    ],
  },
];

/** Column order for the Roles & Permissions grid (matches Settings-Owner.png). */
export const PERMISSION_GRID_ROLES: Exclude<Role, 'Owner'>[] = [
  'Admin',
  'Warehouse',
  'Production',
  'Finance',
  'Courier',
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
