-- Restores the column defaults that Directus 10.13.0 schema-apply cannot emit correctly.
-- It quotes gen_random_uuid()/CURRENT_DATE as string literals instead of raw SQL, so those
-- defaults are stripped from snapshot-apply.json and re-added here after the apply succeeds.
-- (now() / CURRENT_TIMESTAMP defaults apply fine and are NOT included.)

ALTER TABLE "corrections" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "customers" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "delivery_proofs" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "line_cuts" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "line_photos" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "line_return_photos" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "line_weighing_photos" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "line_weighings" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "order_lines" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "orders" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "orders" ALTER COLUMN "delivery_date" SET DEFAULT CURRENT_DATE;
ALTER TABLE "return_documents" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "role_permissions" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
