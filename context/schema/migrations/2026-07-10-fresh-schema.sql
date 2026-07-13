-- =====================================================================
-- Fresh Schema Build — horeca_orders_dev (Directus 10.13.x)
-- Date: 2026-07-10
-- Target DB: horeca_orders_dev (Postgres, via Directus 10.13.x)
--
-- This script creates ALL 18 business collections from zero.
-- Run AFTER Directus 10.13.x has bootstrapped its own system tables
-- (directus_*, directus_users, directus_files, directus_roles, etc.)
-- on a freshly wiped horeca_orders_dev database.
--
-- Source of truth: context/schema/target-db-schema.md
-- Directus adaptations: context/architecture.md
--   - No `users` table → use directus_users
--   - No `photos` table → use directus_files
--   - role_permissions keeps UUID id PK + UNIQUE(capability, role)
--   - settings is a singleton (id INT = 1)
--
-- Idempotent: safe to re-run (uses IF NOT EXISTS guards).
-- After running: register M2O relation metadata in Directus admin UI
--   (Step 2 in fresh-schema-setup.md) — Directus needs its own relation
--   metadata for the SDK to resolve nested reads. The DB FK constraints
--   below are necessary but not sufficient.
-- =====================================================================

BEGIN;

-- =====================================================================
-- 1. CUSTOMERS
-- =====================================================================
CREATE TABLE IF NOT EXISTS customers (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name          TEXT NOT NULL,
    company_name  TEXT,
    channel       TEXT NOT NULL DEFAULT 'horeca',
    contact       TEXT,
    address       TEXT,
    area          TEXT,
    sales         TEXT,
    credit_limit  NUMERIC(15,2) DEFAULT 0,
    term_days     INTEGER DEFAULT 0,
    pay_timing    TEXT,
    pay_method    TEXT,
    created_at    TIMESTAMPTZ DEFAULT now(),
    updated_at    TIMESTAMPTZ DEFAULT now()
);

-- =====================================================================
-- 2. PRODUCTS
-- =====================================================================
CREATE TABLE IF NOT EXISTS products (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name           TEXT NOT NULL,
    accurate_name  TEXT NOT NULL,
    category       TEXT,
    origin         TEXT,
    grade          TEXT,
    brand          TEXT,
    form           TEXT,
    pack           TEXT,
    catch_weight   BOOLEAN DEFAULT FALSE,
    fixed_pack     BOOLEAN DEFAULT FALSE,
    ppn            TEXT,
    active         BOOLEAN DEFAULT TRUE,
    created_at     TIMESTAMPTZ DEFAULT now(),
    updated_at     TIMESTAMPTZ DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'products_accurate_name_key'
      AND conrelid = 'products'::regclass
  ) THEN
    ALTER TABLE products ADD CONSTRAINT products_accurate_name_key UNIQUE (accurate_name);
  END IF;
END $$;

-- =====================================================================
-- 3. ORDERS (core pipeline record — full target shape)
-- =====================================================================
CREATE TABLE IF NOT EXISTS orders (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- legacy human-readable code (kept from old schema)
    order_id            VARCHAR(50),
    -- new canonical human order number
    no                  TEXT NOT NULL,
    -- relations (FKs added below)
    customer_id         UUID,
    taken_by            UUID,
    -- pipeline enum (canonical)
    stage               TEXT NOT NULL DEFAULT 'intake',
    -- legacy status field (kept for backward-compat; maps Draft → intake)
    status              VARCHAR(50) DEFAULT 'Draft',
    channel             TEXT NOT NULL DEFAULT 'horeca',
    -- dates
    order_date          DATE,
    deliver_at          TIMESTAMPTZ,
    delivered_at        TIMESTAMPTZ,
    delivery_date       DATE DEFAULT CURRENT_DATE,
    -- sales rep snapshot
    sales               TEXT,
    sales_rep           VARCHAR(255),
    sales_phone_number  VARCHAR(50),
    -- legacy denormalized customer fields (kept as snapshots)
    customer_name       VARCHAR(255),
    customer_legal_name TEXT,
    customer_contact    VARCHAR(255),
    customer_email      VARCHAR(255),
    customer_address    TEXT,
    -- legacy weight fields
    requested_weight    VARCHAR(255),
    actual_weight       VARCHAR(255),
    -- legacy denormalized items blob (kept; new orders use order_lines)
    order_items         TEXT,
    notes               TEXT,
    -- pipeline flags
    cancelled           BOOLEAN DEFAULT FALSE,
    cancelled_from      TEXT,
    cutting_started     BOOLEAN DEFAULT FALSE,
    pickup              BOOLEAN DEFAULT FALSE,
    third_party         BOOLEAN DEFAULT FALSE,
    payment_confirmed   BOOLEAN DEFAULT FALSE,
    -- returns sub-flow
    return_received     BOOLEAN DEFAULT FALSE,
    return_settle       TEXT,
    return_doc          TEXT,
    return_inbound      BOOLEAN DEFAULT FALSE,
    is_replacement      BOOLEAN DEFAULT FALSE,
    partial_return      BOOLEAN DEFAULT FALSE,
    returned_reason     TEXT,
    -- timestamps
    created_at          TIMESTAMPTZ DEFAULT now(),
    updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- indexes
CREATE INDEX IF NOT EXISTS orders_customer_name_idx ON orders (customer_name);
CREATE INDEX IF NOT EXISTS orders_stage_idx ON orders (stage);
CREATE INDEX IF NOT EXISTS orders_status_idx ON orders (status);

-- unique constraint on `no`
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'orders_no_key'
      AND conrelid = 'orders'::regclass
  ) THEN
    ALTER TABLE orders ADD CONSTRAINT orders_no_key UNIQUE (no);
  END IF;
END $$;

-- =====================================================================
-- 4. ORDER_LINES
-- =====================================================================
CREATE TABLE IF NOT EXISTS order_lines (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id              UUID NOT NULL,
    product_id            UUID,
    name                  TEXT NOT NULL,
    qty                   NUMERIC(12,3) NOT NULL,
    unit                  TEXT NOT NULL,
    weight                NUMERIC(10,3),
    price                 NUMERIC(15,2),
    status                TEXT,
    delivered             INTEGER DEFAULT 0,
    returned              INTEGER DEFAULT 0,
    short                 BOOLEAN DEFAULT FALSE,
    removed               BOOLEAN DEFAULT FALSE,
    weigh_photo           UUID,
    returned_weigh_photo  UUID,
    sort_order            INTEGER DEFAULT 0
);

-- =====================================================================
-- 5. LINE_CUTS
-- =====================================================================
CREATE TABLE IF NOT EXISTS line_cuts (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    line_id     UUID NOT NULL,
    text        TEXT NOT NULL,
    done        BOOLEAN DEFAULT FALSE,
    sort_order  INTEGER DEFAULT 0
);

-- =====================================================================
-- 6. LINE_WEIGHINGS
-- =====================================================================
CREATE TABLE IF NOT EXISTS line_weighings (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    line_id     UUID NOT NULL,
    weight      NUMERIC(10,3),
    photo_id    UUID,
    created_at  TIMESTAMPTZ DEFAULT now()
);

-- =====================================================================
-- 7. LINE_PHOTOS
-- =====================================================================
CREATE TABLE IF NOT EXISTS line_photos (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    line_id     UUID NOT NULL,
    photo_id    UUID NOT NULL,
    sort_order  INTEGER DEFAULT 0
);

-- =====================================================================
-- 8. LINE_RETURN_PHOTOS
-- =====================================================================
CREATE TABLE IF NOT EXISTS line_return_photos (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    line_id     UUID NOT NULL,
    photo_id    UUID NOT NULL,
    sort_order  INTEGER DEFAULT 0
);

-- =====================================================================
-- 9. ORDER_HISTORY (append-only audit trail)
-- =====================================================================
CREATE TABLE IF NOT EXISTS order_history (
    id        BIGSERIAL PRIMARY KEY,
    order_id  UUID NOT NULL,
    at        TIMESTAMPTZ DEFAULT now(),
    who       UUID,
    what      TEXT NOT NULL,
    stage     TEXT
);

-- =====================================================================
-- 10. DELIVERY_PROOFS
-- =====================================================================
CREATE TABLE IF NOT EXISTS delivery_proofs (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id      UUID NOT NULL,
    cond_photo    UUID,
    recv_photo    UUID,
    signed_photo  UUID,
    cod           BOOLEAN DEFAULT FALSE,
    name          TEXT,
    archived      BOOLEAN DEFAULT FALSE,
    created_at    TIMESTAMPTZ DEFAULT now()
);

-- =====================================================================
-- 11. DRAFT_WEIGHINGS
-- =====================================================================
CREATE TABLE IF NOT EXISTS draft_weighings (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id    UUID NOT NULL,
    line_id     UUID NOT NULL,  -- no FK — drafts may outlive a line briefly
    weight      NUMERIC(10,3),
    photo_id    UUID,
    created_at  TIMESTAMPTZ DEFAULT now()
);

-- =====================================================================
-- 12. PURCHASE_ORDERS (one-to-one with orders)
-- =====================================================================
CREATE TABLE IF NOT EXISTS purchase_orders (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id    UUID NOT NULL,
    photo_id    UUID,
    ref         TEXT,
    created_at  TIMESTAMPTZ DEFAULT now()
);

-- =====================================================================
-- 13. RETURN_DOCUMENTS
-- =====================================================================
CREATE TABLE IF NOT EXISTS return_documents (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id    UUID NOT NULL,
    kind        TEXT NOT NULL,
    photo_id    UUID,
    created_at  TIMESTAMPTZ DEFAULT now()
);

-- =====================================================================
-- 14. COURIER_LOCATIONS (ephemeral — upsert on ping)
-- =====================================================================
CREATE TABLE IF NOT EXISTS courier_locations (
    courier  UUID NOT NULL,
    lat      NUMERIC(9,6) NOT NULL,
    lng      NUMERIC(9,6) NOT NULL,
    at       TIMESTAMPTZ DEFAULT now()
);

-- =====================================================================
-- 15. ROLE_PERMISSIONS
--    Directus keeps UUID id as PK (composite PKs unsupported).
--    Uniqueness enforced via constraint on (capability, role).
-- =====================================================================
CREATE TABLE IF NOT EXISTS role_permissions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    capability  TEXT,
    role        TEXT,
    allowed     BOOLEAN
);

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

-- =====================================================================
-- 16. SETTINGS (singleton — id INT = 1)
-- =====================================================================
CREATE TABLE IF NOT EXISTS settings (
    id                      INTEGER PRIMARY KEY DEFAULT 1,
    require_photo           BOOLEAN DEFAULT FALSE,
    tol_below_pct           INTEGER DEFAULT 10,
    tol_above_pct           INTEGER DEFAULT 10,
    dispatch_proof_required BOOLEAN DEFAULT TRUE,
    lang                    TEXT DEFAULT 'en',
    updated_at              TIMESTAMPTZ DEFAULT now()
);

-- enforce singleton (only id = 1 allowed)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'settings_singleton'
      AND conrelid = 'settings'::regclass
  ) THEN
    ALTER TABLE settings ADD CONSTRAINT settings_singleton CHECK (id = 1);
  END IF;
END $$;

-- seed the singleton row if empty
INSERT INTO settings (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- =====================================================================
-- 17. MESSAGES (WhatsApp intake log)
-- =====================================================================
CREATE TABLE IF NOT EXISTS messages (
    id              BIGSERIAL PRIMARY KEY,
    message_id      VARCHAR(255) NOT NULL,
    sender_number   VARCHAR(255),
    content         TEXT,
    caption         TEXT,
    has_attachment  BOOLEAN DEFAULT FALSE,
    document_file   UUID,
    is_edited       BOOLEAN DEFAULT FALSE,
    edited_at       TIMESTAMPTZ,
    is_deleted      BOOLEAN DEFAULT FALSE,
    deleted_at      TIMESTAMPTZ,
    quoted_msg_id   VARCHAR(255),
    ocr_text        TEXT,
    order_uuid      UUID,
    order_id        VARCHAR(50),
    created_at      TIMESTAMPTZ DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'messages_message_id_key'
      AND conrelid = 'messages'::regclass
  ) THEN
    ALTER TABLE messages ADD CONSTRAINT messages_message_id_key UNIQUE (message_id);
  END IF;
END $$;

-- =====================================================================
-- 18. ATTACHMENTS
-- =====================================================================
CREATE TABLE IF NOT EXISTS attachments (
    id            BIGSERIAL PRIMARY KEY,
    message_id    VARCHAR(255),
    order_uuid    UUID,
    sender_phone  VARCHAR(255),
    doc_type      VARCHAR(100),
    file_path     VARCHAR(500),
    document_file UUID,
    caption       TEXT,
    ocr_text      TEXT,
    created_at    TIMESTAMPTZ DEFAULT now()
);

-- =====================================================================
-- FOREIGN KEY CONSTRAINTS
-- =====================================================================

-- orders → customers
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_customer_id_foreign') THEN
    ALTER TABLE orders
      ADD CONSTRAINT orders_customer_id_foreign
      FOREIGN KEY (customer_id) REFERENCES customers(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- orders → directus_users (taken_by)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_taken_by_foreign') THEN
    ALTER TABLE orders
      ADD CONSTRAINT orders_taken_by_foreign
      FOREIGN KEY (taken_by) REFERENCES directus_users(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- order_lines → orders (CASCADE)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_lines_order_id_foreign') THEN
    ALTER TABLE order_lines
      ADD CONSTRAINT order_lines_order_id_foreign
      FOREIGN KEY (order_id) REFERENCES orders(id)
      ON DELETE CASCADE;
  END IF;
END $$;

-- order_lines → products (SET NULL)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_lines_product_id_foreign') THEN
    ALTER TABLE order_lines
      ADD CONSTRAINT order_lines_product_id_foreign
      FOREIGN KEY (product_id) REFERENCES products(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- order_lines → directus_files (weigh_photo, returned_weigh_photo)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_lines_weigh_photo_foreign') THEN
    ALTER TABLE order_lines
      ADD CONSTRAINT order_lines_weigh_photo_foreign
      FOREIGN KEY (weigh_photo) REFERENCES directus_files(id)
      ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_lines_returned_weigh_photo_foreign') THEN
    ALTER TABLE order_lines
      ADD CONSTRAINT order_lines_returned_weigh_photo_foreign
      FOREIGN KEY (returned_weigh_photo) REFERENCES directus_files(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- line_cuts → order_lines (CASCADE)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'line_cuts_line_id_foreign') THEN
    ALTER TABLE line_cuts
      ADD CONSTRAINT line_cuts_line_id_foreign
      FOREIGN KEY (line_id) REFERENCES order_lines(id)
      ON DELETE CASCADE;
  END IF;
END $$;

-- line_weighings → order_lines (CASCADE)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'line_weighings_line_id_foreign') THEN
    ALTER TABLE line_weighings
      ADD CONSTRAINT line_weighings_line_id_foreign
      FOREIGN KEY (line_id) REFERENCES order_lines(id)
      ON DELETE CASCADE;
  END IF;
END $$;

-- line_weighings → directus_files (photo_id)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'line_weighings_photo_id_foreign') THEN
    ALTER TABLE line_weighings
      ADD CONSTRAINT line_weighings_photo_id_foreign
      FOREIGN KEY (photo_id) REFERENCES directus_files(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- line_photos → order_lines (CASCADE)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'line_photos_line_id_foreign') THEN
    ALTER TABLE line_photos
      ADD CONSTRAINT line_photos_line_id_foreign
      FOREIGN KEY (line_id) REFERENCES order_lines(id)
      ON DELETE CASCADE;
  END IF;
END $$;

-- line_photos → directus_files (photo_id)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'line_photos_photo_id_foreign') THEN
    ALTER TABLE line_photos
      ADD CONSTRAINT line_photos_photo_id_foreign
      FOREIGN KEY (photo_id) REFERENCES directus_files(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- line_return_photos → order_lines (CASCADE)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'line_return_photos_line_id_foreign') THEN
    ALTER TABLE line_return_photos
      ADD CONSTRAINT line_return_photos_line_id_foreign
      FOREIGN KEY (line_id) REFERENCES order_lines(id)
      ON DELETE CASCADE;
  END IF;
END $$;

-- line_return_photos → directus_files (photo_id)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'line_return_photos_photo_id_foreign') THEN
    ALTER TABLE line_return_photos
      ADD CONSTRAINT line_return_photos_photo_id_foreign
      FOREIGN KEY (photo_id) REFERENCES directus_files(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- order_history → orders (CASCADE)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_history_order_id_foreign') THEN
    ALTER TABLE order_history
      ADD CONSTRAINT order_history_order_id_foreign
      FOREIGN KEY (order_id) REFERENCES orders(id)
      ON DELETE CASCADE;
  END IF;
END $$;

-- order_history → directus_users (who, SET NULL)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_history_who_foreign') THEN
    ALTER TABLE order_history
      ADD CONSTRAINT order_history_who_foreign
      FOREIGN KEY (who) REFERENCES directus_users(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- delivery_proofs → orders (CASCADE)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'delivery_proofs_order_id_foreign') THEN
    ALTER TABLE delivery_proofs
      ADD CONSTRAINT delivery_proofs_order_id_foreign
      FOREIGN KEY (order_id) REFERENCES orders(id)
      ON DELETE CASCADE;
  END IF;
END $$;

-- delivery_proofs → directus_files (cond/recv/signed)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'delivery_proofs_cond_photo_foreign') THEN
    ALTER TABLE delivery_proofs
      ADD CONSTRAINT delivery_proofs_cond_photo_foreign
      FOREIGN KEY (cond_photo) REFERENCES directus_files(id)
      ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'delivery_proofs_recv_photo_foreign') THEN
    ALTER TABLE delivery_proofs
      ADD CONSTRAINT delivery_proofs_recv_photo_foreign
      FOREIGN KEY (recv_photo) REFERENCES directus_files(id)
      ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'delivery_proofs_signed_photo_foreign') THEN
    ALTER TABLE delivery_proofs
      ADD CONSTRAINT delivery_proofs_signed_photo_foreign
      FOREIGN KEY (signed_photo) REFERENCES directus_files(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- draft_weighings → orders (CASCADE)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'draft_weighings_order_id_foreign') THEN
    ALTER TABLE draft_weighings
      ADD CONSTRAINT draft_weighings_order_id_foreign
      FOREIGN KEY (order_id) REFERENCES orders(id)
      ON DELETE CASCADE;
  END IF;
END $$;

-- draft_weighings → directus_files (photo_id)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'draft_weighings_photo_id_foreign') THEN
    ALTER TABLE draft_weighings
      ADD CONSTRAINT draft_weighings_photo_id_foreign
      FOREIGN KEY (photo_id) REFERENCES directus_files(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- purchase_orders → orders (CASCADE)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'purchase_orders_order_id_foreign') THEN
    ALTER TABLE purchase_orders
      ADD CONSTRAINT purchase_orders_order_id_foreign
      FOREIGN KEY (order_id) REFERENCES orders(id)
      ON DELETE CASCADE;
  END IF;
END $$;

-- purchase_orders → directus_files (photo_id)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'purchase_orders_photo_id_foreign') THEN
    ALTER TABLE purchase_orders
      ADD CONSTRAINT purchase_orders_photo_id_foreign
      FOREIGN KEY (photo_id) REFERENCES directus_files(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- return_documents → orders (CASCADE)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'return_documents_order_id_foreign') THEN
    ALTER TABLE return_documents
      ADD CONSTRAINT return_documents_order_id_foreign
      FOREIGN KEY (order_id) REFERENCES orders(id)
      ON DELETE CASCADE;
  END IF;
END $$;

-- return_documents → directus_files (photo_id)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'return_documents_photo_id_foreign') THEN
    ALTER TABLE return_documents
      ADD CONSTRAINT return_documents_photo_id_foreign
      FOREIGN KEY (photo_id) REFERENCES directus_files(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- courier_locations → directus_users (CASCADE)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'courier_locations_courier_foreign') THEN
    ALTER TABLE courier_locations
      ADD CONSTRAINT courier_locations_courier_foreign
      FOREIGN KEY (courier) REFERENCES directus_users(id)
      ON DELETE CASCADE;
  END IF;
END $$;

-- messages → orders (order_uuid, SET NULL)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'messages_order_uuid_foreign') THEN
    ALTER TABLE messages
      ADD CONSTRAINT messages_order_uuid_foreign
      FOREIGN KEY (order_uuid) REFERENCES orders(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- messages → directus_files (document_file)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'messages_document_file_foreign') THEN
    ALTER TABLE messages
      ADD CONSTRAINT messages_document_file_foreign
      FOREIGN KEY (document_file) REFERENCES directus_files(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- attachments → messages (message_id, SET NULL)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'attachments_message_id_foreign') THEN
    ALTER TABLE attachments
      ADD CONSTRAINT attachments_message_id_foreign
      FOREIGN KEY (message_id) REFERENCES messages(message_id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- attachments → orders (order_uuid, SET NULL)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'attachments_order_uuid_foreign') THEN
    ALTER TABLE attachments
      ADD CONSTRAINT attachments_order_uuid_foreign
      FOREIGN KEY (order_uuid) REFERENCES orders(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- attachments → directus_files (document_file)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'attachments_document_file_foreign') THEN
    ALTER TABLE attachments
      ADD CONSTRAINT attachments_document_file_foreign
      FOREIGN KEY (document_file) REFERENCES directus_files(id)
      ON DELETE SET NULL;
  END IF;
END $$;

COMMIT;

-- =====================================================================
-- VERIFICATION QUERIES (run separately after the script completes)
-- =====================================================================

-- 1. Confirm all 18 business collections exist
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public'
--   AND table_type = 'BASE TABLE'
--   AND table_name NOT LIKE 'directus_%'
--   AND table_name NOT LIKE 'spatial_%'
--   AND table_name != 'geometry_columns'
--   AND table_name != 'geography_columns'
-- ORDER BY table_name;
-- Expect: attachments, courier_locations, customers, delivery_proofs,
--         draft_weighings, line_cuts, line_photos, line_return_photos,
--         line_weighings, messages, order_history, order_lines, orders,
--         products, purchase_orders, return_documents, role_permissions,
--         settings  (18 rows)

-- 2. Confirm orders has the 10 return/payment fields
-- SELECT column_name FROM information_schema.columns
-- WHERE table_name = 'orders'
--   AND column_name IN ('pickup','third_party','payment_confirmed','return_received',
--     'return_settle','return_doc','return_inbound','is_replacement',
--     'partial_return','returned_reason')
-- ORDER BY column_name;
-- Expect: 10 rows

-- 3. Confirm role_permissions unique constraint
-- SELECT conname FROM pg_constraint
-- WHERE conrelid = 'role_permissions'::regclass AND contype = 'u';
-- Expect: role_permissions_capability_role_key

-- 4. Confirm all FK constraints (should be ~31)
-- SELECT conname FROM pg_constraint
-- WHERE contype = 'f'
--   AND connamespace = 'public'::regnamespace
-- ORDER BY conname;

-- 5. Confirm settings singleton
-- SELECT * FROM settings;
-- Expect: 1 row with id = 1

-- 6. Confirm user FK constraints
-- SELECT conname FROM pg_constraint
-- WHERE conname IN ('orders_taken_by_foreign','order_history_who_foreign','courier_locations_courier_foreign');
-- Expect: 3 rows
