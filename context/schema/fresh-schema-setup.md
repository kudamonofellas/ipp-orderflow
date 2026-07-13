# Fresh Schema Setup — `horeca_orders_dev` (Directus 10.13.x)

> Run this against the **dev** instance (`dev-admin.kudafellas.cloud`) only.
> The DB was wiped and Directus downgraded to 10.13.x (no user limit).
> This guide builds the **entire** schema from zero — it supersedes
> `directus-schema-checklist.md` (which assumed collections already existed)
> and the `2026-07-09-complete-schema.sql` migration (which was incremental).
>
> Source of truth for column shapes: `context/schema/target-db-schema.md`.
> Directus adaptations (UUID PKs, `directus_users`/`directus_files` instead of
> `users`/`photos`) per `context/architecture.md`.

---

## Prerequisites

1. `directus-dev` container is running on Directus **10.13.x** (pinned in `docker-compose.txt`).
2. `horeca_orders_dev` Postgres DB exists and is **empty** (wiped).
3. On first boot, Directus created the admin user from `ADMIN_EMAIL` / `ADMIN_PASSWORD` env vars.
4. You can log in at `https://dev-admin.kudafellas.cloud`.

**Conventions for every collection below:**
- PK = `id` UUID, default `gen_random_uuid()` (Directus default — do not change).
- Directus auto-manages `date_created`, `date_updated`, `user_created`, `user_updated` — **do not** create these manually; enable them under the collection's accountability settings instead.
- Timestamps with business meaning (`at`, `created_at`, `delivered_at`, etc.) **are** created manually as `TIMESTAMPTZ`.
- Monetary → `NUMERIC(15,2)`. Weights → `NUMERIC(10,3)`. GPS → `NUMERIC(9,6)`.
- All fields nullable unless marked `NOT NULL` below.

---

## Step 0 — Bootstrap the admin account

1. Log in at `https://dev-admin.kudafellas.cloud` with `ADMIN_EMAIL` / `ADMIN_PASSWORD`.
2. Go to **Settings → Project Settings** → set project name to `IPP-OrderFlow (dev)`.
3. Confirm you're on 10.13.x (footer should show `Directus 10.13.x`).

---

## Step 1 — Create collections + fields (SQL)

Run the SQL script that creates all 18 collections with their fields, constraints, and foreign keys in one shot:

**`context/schema/migrations/2026-07-10-fresh-schema.sql`**

Run it via the Directus admin (**Settings → SQL**) or `psql` into `horeca_orders_dev`:

```bash
docker exec -i business_postgres psql -U admin -d horeca_orders_dev < context/schema/migrations/2026-07-10-fresh-schema.sql
```

The script is idempotent (safe to re-run) and covers:
- All 18 `CREATE TABLE IF NOT EXISTS` statements (customers, products, orders, order_lines, line_cuts, line_weighings, line_photos, line_return_photos, order_history, delivery_proofs, draft_weighings, purchase_orders, return_documents, courier_locations, role_permissions, settings, messages, attachments).
- All UNIQUE constraints (`orders.no`, `products.accurate_name`, `messages.message_id`, `role_permissions.(capability,role)`).
- The `settings` singleton enforcement (`CHECK (id = 1)`) + seed row.
- All 31 FK constraints with correct ON DELETE rules (CASCADE vs SET NULL).
- Indexes on `orders.customer_name`, `orders.stage`, `orders.status`.

After running the SQL, **refresh the Directus schema cache** so the admin UI sees the new tables: **Settings → Data Model → click the refresh icon** (or restart the `directus-dev` container).

> **Why SQL instead of the admin UI?** The admin UI is fine for one or two fields, but for 18 collections × ~10 fields each, SQL is far faster and reproducible. The SQL script is also version-controlled, so prod gets the exact same schema.

### Field reference (for the admin UI / Directus metadata)

After the SQL runs, the tables exist at the DB level but Directus doesn't yet know about them as "collections" with proper field interfaces. You have two options:

**Option A — Let Directus auto-detect (fastest):** After refreshing the schema cache, Directus 10.x will auto-register the tables as collections with default interfaces. You can then optionally tweak field interfaces (e.g. set `stage` to a Dropdown with the 12 choices, `catch_weight` to a Toggle, etc.) via the admin UI.

**Option B — Register manually via the admin UI:** If auto-detect doesn't pick up a table, create the collection in **Settings → Data Model → "Create Collection"** and select "Use existing table" (don't let Directus create a new table — the SQL already did).

### Field interface tweaks (do these in the admin UI after auto-detect)

These can't be done in SQL — they're Directus-layer metadata:

| Collection | Field | Interface | Choices / Notes |
|---|---|---|---|
| `orders` | `stage` | Dropdown | `intake, cold, finance, production, packing, finalise, dispatch, delivered, outstanding, awaiting, cancelled, returned` |
| `orders` | `status` | Dropdown | Legacy field; default `Draft` |
| `orders` | `channel` | Dropdown | `horeca, retail, b2c` |
| `orders` | `return_settle` | Dropdown | `sign` (leave blank = NULL) |
| `customers` | `channel` | Dropdown | `horeca, retail, b2c` |
| `customers` | `pay_timing` | Dropdown | `upfront, cod, terms` |
| `customers` | `pay_method` | Dropdown | `cash, transfer` |
| `products` | `ppn` | Dropdown | `exempt, included, excluded` |
| `order_lines` | `unit` | Dropdown | `kg, gram, pack, pcs, box, ekor, loaf` |
| `order_lines` | `status` | Dropdown | `recognized, manual, unmatched` |
| `return_documents` | `kind` | Dropdown | `signed_doc, signed_draft, note` |
| `role_permissions` | `role` | Dropdown | `Admin, Warehouse, Production, Finance, Courier` (no `Owner`) |
| All boolean fields | — | Toggle | — |
| All `*_photo` / `document_file` fields | — | File (M2O → directus_files) | See Step 2 |

### Enable accountability (audit fields) per collection

For each collection, go to **"…" → Edit Collection → Accountability → "All"**. This enables Directus's auto-managed `date_created`, `date_updated`, `user_created`, `user_updated` fields without you creating them in SQL.

---

## Step 2 — Register relations (M2O) in Directus

The SQL script in Step 1 created all the DB-level FK constraints. **Directus also needs its own relation metadata** so the `@directus/sdk` can auto-resolve nested reads (e.g. `readItems('orders', { fields: ['*', 'customer_id.*'] })`).

For each pair below: **open the *many* collection → hover the FK field → click the link icon → "Many-to-One" → select the *one* collection + field → set On Delete → Save.**

| Many collection | Field | → One collection | Field | On Delete |
|---|---|---|---|---|
| `orders` | `customer_id` | `customers` | `id` | SET NULL |
| `order_lines` | `order_id` | `orders` | `id` | CASCADE |
| `order_lines` | `product_id` | `products` | `id` | SET NULL |
| `order_lines` | `weigh_photo` | `directus_files` | `id` | SET NULL |
| `order_lines` | `returned_weigh_photo` | `directus_files` | `id` | SET NULL |
| `line_cuts` | `line_id` | `order_lines` | `id` | CASCADE |
| `line_weighings` | `line_id` | `order_lines` | `id` | CASCADE |
| `line_photos` | `line_id` | `order_lines` | `id` | CASCADE |
| `line_return_photos` | `line_id` | `order_lines` | `id` | CASCADE |
| `line_weighings` | `photo_id` | `directus_files` | `id` | SET NULL |
| `line_photos` | `photo_id` | `directus_files` | `id` | SET NULL |
| `line_return_photos` | `photo_id` | `directus_files` | `id` | SET NULL |
| `order_history` | `order_id` | `orders` | `id` | CASCADE |
| `order_history` | `who` | `directus_users` | `id` | SET NULL |
| `delivery_proofs` | `order_id` | `orders` | `id` | CASCADE |
| `delivery_proofs` | `cond_photo` | `directus_files` | `id` | SET NULL |
| `delivery_proofs` | `recv_photo` | `directus_files` | `id` | SET NULL |
| `delivery_proofs` | `signed_photo` | `directus_files` | `id` | SET NULL |
| `draft_weighings` | `order_id` | `orders` | `id` | CASCADE |
| `draft_weighings` | `photo_id` | `directus_files` | `id` | SET NULL |
| `purchase_orders` | `order_id` | `orders` | `id` | CASCADE |
| `purchase_orders` | `photo_id` | `directus_files` | `id` | SET NULL |
| `return_documents` | `order_id` | `orders` | `id` | CASCADE |
| `return_documents` | `photo_id` | `directus_files` | `id` | SET NULL |
| `courier_locations` | `courier` | `directus_users` | `id` | CASCADE |
| `orders` | `taken_by` | `directus_users` | `id` | SET NULL |
| `messages` | `order_uuid` | `orders` | `id` | SET NULL |
| `messages` | `document_file` | `directus_files` | `id` | SET NULL |
| `attachments` | `message_id` | `messages` | `message_id` | SET NULL |
| `attachments` | `order_uuid` | `orders` | `id` | SET NULL |
| `attachments` | `document_file` | `directus_files` | `id` | SET NULL |

> **On Delete rules summary:**
> - **CASCADE** (deleting parent cleans up children): `order_lines`, `line_cuts`, `line_weighings`, `line_photos`, `line_return_photos`, `order_history`, `delivery_proofs`, `draft_weighings`, `purchase_orders`, `return_documents`, `courier_locations`.
> - **SET NULL** (keep the child, null the reference): everything else — file refs, user refs, `messages.order_uuid`, `attachments.*`.

---

## Step 3 — Create roles + users

Directus 10.13.x has **no user limit**. Create all six business roles and one test user per role.

### 3.1 Create roles

**Settings → Roles & Permissions → "Create Role"** for each:

| Role name | Description |
|---|---|
| `Owner` | God mode — full access to everything incl. Settings + role_permissions |
| `Admin` | Full CRUD on orders + lines + customers + products + history |
| `Warehouse` | Cold storage + packing + weighings + photos |
| `Production` | Cutting + line_cuts |
| `Finance` | Payment approval gate |
| `Courier` | Dispatch + delivery proofs + courier_locations |

> Directus's built-in `Administrator` and `Public` roles already exist — don't recreate them. The `Owner` business role is separate from Directus's `Administrator` (though you can give it the same permissions).

### 3.2 Create test users

**Settings → User Directory → "Create User"** for each role. On 10.x there's no limit, so create one per role:

| Email | Role | Purpose |
|---|---|---|
| `owner@ipp.test` | Owner | Test god-mode UI |
| `admin@ipp.test` | Admin | Test order management |
| `warehouse@ipp.test` | Warehouse | Test cold storage + weighing |
| `production@ipp.test` | Production | Test cutting flow |
| `finance@ipp.test` | Finance | Test approval gate |
| `courier@ipp.test` | Courier | Test dispatch + GPS |

For each: set a password, mark active, assign the role. Generate a static API token for each (needed for SDK testing from the frontend).

---

## Step 4 — Configure permissions (ACLs)

**Settings → Roles & Permissions** → open each role → configure per-collection + per-field permissions.

### Owner
- Full CRUD on **all** collections. Full access to `settings` + `role_permissions`.

### Admin
- **Full CRUD**: `orders` (all fields incl. return fields), `order_lines`, `customers`, `products`, `order_history`, `purchase_orders`, `return_documents`.
- **Read + Update** (no create/delete): `role_permissions`, `settings`.
- **Read**: `messages`, `attachments`.
- **No access**: `courier_locations` (courier-only).

### Warehouse
- **Read**: `orders` (all fields).
- **Update** (no create/delete): `orders` — only cold-storage/packing fields: `stage`, `cutting_started`, `return_received`, `return_inbound`, `notes`.
- **Full CRUD**: `order_lines`, `line_weighings`, `line_photos`, `line_return_photos`, `draft_weighings`, `delivery_proofs` (their half — cond/recv photos).
- **Read**: `products`, `customers` (need to see what they're packing).
- **No access**: price fields (`order_lines.price`), `role_permissions`, `settings`.

### Production
- **Read**: `orders` (all fields).
- **Update**: `orders.cutting_started` only.
- **Full CRUD**: `line_cuts`.
- **Read**: `order_lines`, `products`.
- **No access**: price fields, `role_permissions`, `settings`, `delivery_proofs`.

### Finance
- **Read**: `orders` (all fields).
- **Update**: `orders.payment_confirmed` only.
- **Read**: `order_lines` (incl. `price` — Finance sees prices).
- **Read**: `customers` (credit terms).
- **No access**: `role_permissions`, `settings`, warehouse/production collections.

### Courier
- **Read**: `orders` — dispatch stage only (filter: `stage = 'dispatch'`).
- **Update**: `orders.taken_by`, `orders.stage` (to `delivered`).
- **Full CRUD**: `delivery_proofs`, `courier_locations`.
- **Read**: `customers` (name + address only — for delivery).
- **No access**: price fields, `role_permissions`, `settings`, warehouse/production collections.

### Field-level price restriction
On `order_lines`, restrict the `price` field to **Admin + Finance + Owner** only. For Warehouse, Production, Courier: set `price` to **No access** (not even read). Per `code-standards.md`: prices stay in Accurate; the snapshot is sensitive.

---

## Step 5 — Seed the `settings` singleton

Insert the one allowed row:

**Settings → Settings collection → Create Item:**

| Field | Value |
|---|---|
| `id` | `1` (auto, since it's the singleton) |
| `require_photo` | `false` |
| `tol_below_pct` | `10` |
| `tol_above_pct` | `10` |
| `dispatch_proof_required` | `true` |
| `lang` | `en` |

> Never insert a second row (enforced by the singleton toggle / `CHECK (id = 1)` constraint).

---

## Step 6 — Re-export the snapshot

1. **Settings → Schema → Export** (or use the CLI: `npx directus schema snapshot ./snapshot.json` inside the container).
2. Save over `context/schema/snapshot.json`.
3. Verify:
   - `collections` array has **18** entries (was 3).
   - `relations` array has **~31** entries (was 0).
   - `orders` shows all fields incl. the 10 return/payment fields + `stage`, `no`, `customer_id`, `taken_by`.
   - `role_permissions` shows `capability`, `role`, `allowed`.
   - `settings` is marked `singleton: true`.

---

## Step 7 — Update frontend types

After the snapshot is re-exported:

1. `src/types/directus.ts` — add interfaces for all new collections (`Customer`, `Product`, `OrderLine`, `LineCut`, `LineWeighing`, `LinePhoto`, `LineReturnPhoto`, `OrderHistory`, `DeliveryProof`, `DraftWeighing`, `PurchaseOrder`, `ReturnDocument`, `CourierLocation`, `RolePermission`, `Settings`). Extend `OrdersCollection` with the new fields.
2. `src/lib/schemas.ts` — extend `OrdersCollectionSchema` with the new fields (all optional/nullable); add zod schemas for each new collection.
3. `src/lib/directus.ts` — register the new collections in the typed schema so the SDK auto-completes field names + nested reads. Add `readCustomers()`, `readProducts()`, `readOrderLines()`, etc. wrapper methods as needed.
4. Run `tsc --noEmit` + `npm run build` to confirm.

---

## Verification queries (run after setup)

Run these in **Settings → SQL** (or `psql` into `horeca_orders_dev`):

```sql
-- 1. Confirm all 18 collections exist
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_type = 'BASE TABLE'
  AND table_name NOT LIKE 'directus_%'
  AND table_name NOT LIKE 'spatial_%'
  AND table_name != 'geometry_columns'
  AND table_name != 'geography_columns'
ORDER BY table_name;
-- Expect: attachments, courier_locations, customers, delivery_proofs,
--         draft_weighings, line_cuts, line_photos, line_return_photos,
--         line_weighings, order_history, order_lines, orders,
--         purchase_orders, return_documents, role_permissions, settings,
--         messages, products  (18 rows)

-- 2. Confirm orders has the 10 return/payment fields
SELECT column_name FROM information_schema.columns
WHERE table_name = 'orders'
  AND column_name IN ('pickup','third_party','payment_confirmed','return_received',
    'return_settle','return_doc','return_inbound','is_replacement',
    'partial_return','returned_reason')
ORDER BY column_name;
-- Expect: 10 rows

-- 3. Confirm role_permissions unique constraint
SELECT conname FROM pg_constraint
WHERE conrelid = 'role_permissions'::regclass AND contype = 'u';
-- Expect: role_permissions_capability_role_key

-- 4. Confirm user FK constraints
SELECT conname FROM pg_constraint
WHERE conname IN ('orders_taken_by_foreign','order_history_who_foreign','courier_locations_courier_foreign');
-- Expect: 3 rows

-- 5. Confirm settings singleton
SELECT singleton FROM directus_collections WHERE collection = 'settings';
-- Expect: true (or verify via the admin UI)
```

---

## Notes

- **Directus 10.x vs 12.x UI differences:** Some field interface names differ slightly. If an interface listed above isn't found, use the closest equivalent (e.g. "Text Input" ↔ "String", "Numeric Input" ↔ "Float"/"Integer"). The underlying DB type is what matters.
- **`status` vs `stage`:** Both exist on `orders` during the transition. `status` (legacy, default `Draft`) is what the current frontend reads; `stage` (new, default `intake`) is the canonical enum. Map `Draft` → `intake`. Once the domain layer lands, `stage` wins.
- **No `users` or `photos` collections:** `target-db-schema.md` lists `users` and `photos`, but per `architecture.md` these are replaced by Directus's built-in `directus_users` and `directus_files`. Do not create them.
- **`order_history` append-only:** Enforce in the domain layer (`src/lib/domain.ts`) — never UPDATE or DELETE a row. Directus 10.x doesn't have a built-in "append-only" collection flag.
- **`courier_locations` ephemeral:** Upsert on ping, not append. Enforce in the domain layer.
