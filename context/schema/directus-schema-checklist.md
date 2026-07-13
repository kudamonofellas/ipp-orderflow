# Directus Schema Completion — Admin UI Checklist

Run this against **dev** first (`dev-admin.kudafellas.cloud`), verify, then repeat on prod (`admin.kudafellas.cloud`).

> The SQL migration in `migrations/2026-07-09-complete-schema.sql` handles the DB-level changes (new columns, FK constraints). The steps below are the **Directus-layer** equivalents you can do from the admin UI if you prefer not to run raw SQL, plus the relation metadata registration which **must** be done in Directus (it's not a DB concern).

---

## Step 1 — Add the 10 missing `orders` fields

**Settings → Data Model → `orders` collection → "Create Field"** for each:

| Field | Interface | Type | Note |
|---|---|---|---|
| `pickup` | Toggle | Boolean | default `false` |
| `third_party` | Toggle | Boolean | default `false` |
| `payment_confirmed` | Toggle | Boolean | default `false` |
| `return_received` | Toggle | Boolean | default `false` |
| `return_settle` | Dropdown | String | choices: `sign` (leave blank = NULL) |
| `return_doc` | Text Input | Text | Accurate return doc reference |
| `return_inbound` | Toggle | Boolean | default `false` |
| `is_replacement` | Toggle | Boolean | default `false` |
| `partial_return` | Toggle | Boolean | default `false` |
| `returned_reason` | Text Input | Text | |

For each: Advanced → set the default value, leave "Required" off (all nullable per target schema).

---

## Step 2 — Create `role_permissions` fields

**Settings → Data Model → `role_permissions` → "Create Field"**:

| Field | Interface | Type | Note |
|---|---|---|---|
| `capability` | Text Input | String | e.g. `seePrices`, `createOrders` |
| `role` | Dropdown | String | choices: `Admin`, `Warehouse`, `Production`, `Finance`, `Courier` (no `Owner`) |
| `allowed` | Toggle | Boolean | override flag |

Then enforce uniqueness (Directus doesn't support composite PK):
- Select both `capability` and `role` fields → **Create Field** is not it; instead use the collection's **"…" menu → Edit Collection** is not it either.
- **Directus has no UI for composite unique constraints.** Run this one SQL line after creating the fields:
  ```sql
  ALTER TABLE role_permissions
    ADD CONSTRAINT role_permissions_capability_role_key UNIQUE (capability, role);
  ```
  (already included in the migration script).

The default Directus `id` (UUID) stays as PK — this is the Directus-compatible adaptation of the target's composite-PK design.

---

## Step 3 — Register relations (M2O)

This is the **most important** step for the SDK to work. The DB FK columns already exist, but Directus needs relation metadata.

For **each** pair below: **Settings → Data Model → open the *many* collection → hover the FK field → click "Create Relation" (or the link icon) → choose "Many-to-One" → select the *one* collection + field → Save.**

| Many collection | Field | → One collection | Field |
|---|---|---|---|
| `messages` | `order_uuid` | `orders` | `id` |
| `attachments` | `message_id` | `messages` | `message_id` |
| `attachments` | `order_uuid` | `orders` | `id` |
| `attachments` | `document_file` | `directus_files` | `id` |
| `messages` | `document_file` | `directus_files` | `id` |
| `order_lines` | `order_id` | `orders` | `id` |
| `order_lines` | `product_id` | `products` | `id` |
| `order_lines` | `weigh_photo` | `directus_files` | `id` |
| `order_lines` | `returned_weigh_photo` | `directus_files` | `id` |
| `line_cuts` | `line_id` | `order_lines` | `id` |
| `line_weighings` | `line_id` | `order_lines` | `id` |
| `line_photos` | `line_id` | `order_lines` | `id` |
| `line_return_photos` | `line_id` | `order_lines` | `id` |
| `order_history` | `order_id` | `orders` | `id` |
| `order_history` | `who` | `directus_users` | `id` |
| `delivery_proofs` | `order_id` | `orders` | `id` |
| `draft_weighings` | `order_id` | `orders` | `id` |
| `purchase_orders` | `order_id` | `orders` | `id` |
| `return_documents` | `order_id` | `orders` | `id` |
| `courier_locations` | `courier` | `directus_users` | `id` |
| `orders` | `taken_by` | `directus_users` | `id` |

`orders.customer_id → customers.id` is **already registered** ✓.

**On Delete** rule per relation:
- `order_lines`, `line_*`, `order_history`, `delivery_proofs`, `draft_weighings`, `purchase_orders`, `return_documents` → **CASCADE** (deleting an order/line cleans up children)
- `messages.order_uuid`, `attachments.*`, `orders.taken_by`, `order_history.who` → **SET NULL**
- `courier_locations.courier` → **CASCADE**

---

## Step 4 — (Optional) Enforce `settings` singleton

Only if you want DB-level enforcement. Skip if you're fine enforcing it in the domain layer (`src/lib/domain.ts`).

If the `settings` table is **empty** (fresh dev):
1. Delete the `settings` collection in Directus.
2. Recreate it with field `id` (Integer, Primary Key, default `1`).
3. Re-add: `require_photo`, `tol_below_pct`, `tol_above_pct`, `dispatch_proof_required`, `lang`.
4. In the collection's **"…" → Edit Collection**, toggle **"Singleton"** on.

If it already has rows, leave it — enforce the singleton in code instead.

---

## Step 5 — Set field-level permissions (ACLs)

For each new collection/field, configure per-role permissions under **Settings → Roles & Permissions**:

- **Owner / Administrator** → full CRUD on everything.
- **Admin** → full CRUD on `orders` (incl. new return fields), `order_lines`, `customers`, `products`, `order_history`, `role_permissions` (read+update, no delete), `settings` (read+update).
- **Warehouse** → read `orders` + update cold-storage/packing fields + full CRUD on `order_lines`, `line_weighings`, `line_photos`, `draft_weighings`, `delivery_proofs` (their half).
- **Production** → read `orders` + update `cutting_started` + full CRUD on `line_cuts`.
- **Finance** → read `orders` + update `payment_confirmed`.
- **Courier** → read `orders` (dispatch stage) + update `taken_by` + full CRUD on `delivery_proofs` + upsert `courier_locations`.

Field-level permissions are granular — restrict price fields (`order_lines.price`) to Admin/Finance/Owner only (per `code-standards.md`: prices stay in Accurate, the snapshot is sensitive).

---

## Step 6 — Re-export the snapshot

1. **Settings → Project Settings → (or use the CLI)** → export schema.
2. Save over `context/schema/snapshot.json`.
3. Verify the `relations` array now has ~22 entries (was 1).
4. Verify `orders` now shows the 10 new fields.
5. Verify `role_permissions` shows `capability`, `role`, `allowed`.

---

## Step 7 — Update frontend types

After the snapshot is re-exported:

1. `src/types/directus.ts` — add the 10 new `orders` fields + the `RolePermission` interface.
2. `src/lib/schemas.ts` — extend `OrdersCollectionSchema` with the new fields (all optional/nullable); add `RolePermissionsSchema`.
3. `src/lib/directus.ts` — register the new collections in the typed schema so the SDK auto-completes field names + nested reads.
4. Run `tsc --noEmit` + `npm run build` to confirm.

---

## Verification query (run after migration)

```sql
-- Confirm the 10 new orders columns exist
SELECT column_name FROM information_schema.columns
WHERE table_name = 'orders'
  AND column_name IN ('pickup','third_party','payment_confirmed','return_received',
    'return_settle','return_doc','return_inbound','is_replacement',
    'partial_return','returned_reason')
ORDER BY column_name;
-- Expect: 10 rows

-- Confirm role_permissions has its fields
SELECT column_name FROM information_schema.columns
WHERE table_name = 'role_permissions'
ORDER BY ordinal_position;
-- Expect: id, capability, role, allowed

-- Confirm the unique constraint
SELECT conname FROM pg_constraint
WHERE conrelid = 'role_permissions'::regclass AND contype = 'u';
-- Expect: role_permissions_capability_role_key

-- Confirm user FK constraints
SELECT conname FROM pg_constraint
WHERE conname IN ('orders_taken_by_foreign','order_history_who_foreign','courier_locations_courier_foreign');
-- Expect: 3 rows
```
