-- =====================================================================
-- Migration: Complete the Directus schema to match target-db-schema.md
-- Date: 2026-07-09
-- Target DB: horeca_orders (Postgres, via Directus 12)
-- Run: against the horeca_orders database (psql / Directus SQL console)
--
-- Idempotent: safe to re-run (uses IF NOT EXISTS / IF EXISTS guards).
-- After running: re-export the snapshot to context/schema/snapshot.json
--                (Directus Settings → Schema → Export), then update
--                src/types/directus.ts + src/lib/schemas.ts.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. orders: add the 10 missing pipeline / return / payment fields
--    (these exist in target-db-schema.md but not in snapshot.json)
-- ---------------------------------------------------------------------

ALTER TABLE orders ADD COLUMN IF NOT EXISTS pickup             BOOLEAN DEFAULT FALSE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS third_party        BOOLEAN DEFAULT FALSE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_confirmed  BOOLEAN DEFAULT FALSE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS return_received    BOOLEAN DEFAULT FALSE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS return_settle      TEXT;            -- enum: 'sign', NULL
ALTER TABLE orders ADD COLUMN IF NOT EXISTS return_doc         TEXT;            -- Accurate return doc ref
ALTER TABLE orders ADD COLUMN IF NOT EXISTS return_inbound     BOOLEAN DEFAULT FALSE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_replacement     BOOLEAN DEFAULT FALSE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS partial_return     BOOLEAN DEFAULT FALSE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS returned_reason    TEXT;

-- ---------------------------------------------------------------------
-- 2. role_permissions: add fields (collection shell already exists
--    in Directus but has no columns beyond the default id).
--
--    Design note: target-db-schema.md specifies a composite PK
--    (capability, role). Directus does not support composite PKs,
--    so we keep the Directus-managed UUID `id` as PK and enforce
--    uniqueness on (capability, role) via a constraint. This is the
--    Directus-compatible adaptation; the domain layer's can() resolver
--    treats a missing row as "fall back to coded default", so the
--    unique constraint is sufficient.
-- ---------------------------------------------------------------------

ALTER TABLE role_permissions ADD COLUMN IF NOT EXISTS capability TEXT;
ALTER TABLE role_permissions ADD COLUMN IF NOT EXISTS role       TEXT;
ALTER TABLE role_permissions ADD COLUMN IF NOT EXISTS allowed    BOOLEAN;

-- unique constraint on (capability, role) — drop first if exists, then add
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'role_permissions_capability_role_key'
      AND conrelid = 'role_permissions'::regclass
  ) THEN
    ALTER TABLE role_permissions
      ADD CONSTRAINT role_permissions_capability_role_key UNIQUE (capability, role);
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 3. Foreign-key constraints for user references (directus_users)
--    These three columns exist as UUID but have no DB-level FK
--    (snapshot.json shows foreign_key_table = null for each).
-- ---------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_taken_by_foreign'
  ) THEN
    ALTER TABLE orders
      ADD CONSTRAINT orders_taken_by_foreign
      FOREIGN KEY (taken_by) REFERENCES directus_users(id)
      ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'order_history_who_foreign'
  ) THEN
    ALTER TABLE order_history
      ADD CONSTRAINT order_history_who_foreign
      FOREIGN KEY (who) REFERENCES directus_users(id)
      ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'courier_locations_courier_foreign'
  ) THEN
    ALTER TABLE courier_locations
      ADD CONSTRAINT courier_locations_courier_foreign
      FOREIGN KEY (courier) REFERENCES directus_users(id)
      ON DELETE CASCADE;
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 4. (Optional) settings singleton enforcement
--    target-db-schema.md says id = INT PK DEFAULT 1 (singleton).
--    snapshot.json has id as UUID with gen_random_uuid().
--    This is non-blocking — the code-standards invariant ("never INSERT
--    a second row") can be enforced in the domain layer instead.
--    Uncomment below ONLY if you want DB-level singleton enforcement
--    and are sure no rows exist yet.
-- ---------------------------------------------------------------------

-- WARNING: only run if the settings table is empty or you are migrating
-- a fresh dev DB. Changing the PK type on a populated table is destructive.
--
-- DELETE FROM settings;
-- ALTER TABLE settings DROP COLUMN id;
-- ALTER TABLE settings ADD COLUMN id INTEGER PRIMARY KEY DEFAULT 1;
-- ALTER TABLE settings ADD CONSTRAINT settings_singleton CHECK (id = 1);

COMMIT;

-- =====================================================================
-- 5. Directus relation metadata (NOT SQL — register via Directus)
--    The DB FK constraints above + the ones already in snapshot.json
--    exist at the Postgres level, but Directus needs its own relation
--    metadata so the @directus/sdk can auto-resolve nested reads.
--
--    Register these in the Directus admin UI (see
--    directus-schema-checklist.md, section "Register relations") or via
--    POST /relations with the SDK. The full list:
--
--    • messages.order_uuid         → orders.id
--    • attachments.message_id      → messages.message_id
--    • attachments.order_uuid      → orders.id
--    • attachments.document_file   → directus_files.id
--    • messages.document_file      → directus_files.id
--    • order_lines.order_id        → orders.id
--    • order_lines.product_id      → products.id
--    • order_lines.weigh_photo     → directus_files.id
--    • order_lines.returned_weigh_photo → directus_files.id
--    • line_cuts.line_id           → order_lines.id
--    • line_weighings.line_id      → order_lines.id
--    • line_photos.line_id         → order_lines.id
--    • line_return_photos.line_id  → order_lines.id
--    • order_history.order_id      → orders.id
--    • order_history.who           → directus_users.id
--    • delivery_proofs.order_id    → orders.id
--    • draft_weighings.order_id    → orders.id
--    • purchase_orders.order_id    → orders.id
--    • return_documents.order_id   → orders.id
--    • courier_locations.courier   → directus_users.id
--    • orders.taken_by             → directus_users.id
--    • orders.customer_id          → customers.id   (already registered ✓)
-- =====================================================================
