/**
 * Zod schemas for validating Directus API responses at the boundary.
 *
 * Per code-standards.md: "Validate unknown external input at system boundaries
 * (Directus API responses) before trusting it. Use a schema validator (zod)
 * at the Directus SDK boundary."
 *
 * These mirror the collection shapes in src/types/directus.ts. The types are
 * derived from the schemas so there's a single source of truth.
 */

import { z } from "zod";

/** Directus serializes NUMERIC / INT columns as strings in JSON responses,
 *  so numeric fields accept both string and number. z.coerce.number() would
 *  drop nulls; this union keeps nullability intact. */
const numeric = z.union([z.number(), z.string()]).nullable().optional();

/** A single GPS fix — `orders.pickup_geo`/`deliver_geo`. Best-effort: null
 *  whenever the courier denied location permission or capture failed. */
export const GeoStampSchema = z.object({
  lat: z.number(),
  lng: z.number(),
  at: z.string(),
});

/** `customers.address_geo` — a fixed reference pin for this customer's
 *  delivery address (no `at`, unlike `GeoStampSchema` — this isn't an event,
 *  it's a stored location). Bootstrapped from a courier's first confirmed
 *  `deliver_geo`, or set/corrected manually in Customer Edit. */
export const LatLngSchema = z.object({
  lat: z.number(),
  lng: z.number(),
});

/** `orders.undo_snapshot` — the pre-delivery state, written on advancing to
 *  `delivered`, consumed (and cleared) by the quiet "Undo" action. */
export const UndoSnapshotSchema = z.object({
  prevStage: z.string(),
  changedFields: z.record(z.string(), z.unknown()),
  /** The delivery_proofs row this confirm created — archived (not deleted)
   *  when Undo restores the pre-delivery state. */
  proofId: z.string().nullable().optional(),
  who: z.string().nullable(),
  at: z.string(),
});

/**
 * Directus `orders` collection row.
 *
 * Extended with the target-schema fields (no, customer_id, stage, channel,
 * sales, deliver_at, taken_by, return/payment flags). Legacy fields
 * (status, customer_name, order_items, …) stay optional so reads
 * that don't select the new fields still validate.
 *
 * `no` is the single order-number field — the legacy duplicate `order_id`
 * column has been retired from the app (see context/schema/target-db-schema.md).
 */
export const OrdersCollectionSchema = z.object({
  id: z.string(),
  no: z.string().nullable().optional(),
  customer_id: z.string().nullable().optional(),
  taken_by: z.string().nullable().optional(),
  stage: z.string().nullable().optional(),
  status: z.string().nullable().optional(),
  channel: z.string().nullable().optional(),
  order_date: z.string().nullable().optional(),
  deliver_at: z.string().nullable().optional(),
  delivered_at: z.string().nullable().optional(),
  delivery_date: z.string().nullable().optional(),
  sales: z.string().nullable().optional(),
  sales_rep: z.string().nullable().optional(),
  sales_phone_number: z.string().nullable().optional(),
  customer_name: z.string().nullable().optional(),
  customer_legal_name: z.string().nullable().optional(),
  customer_contact: z.string().nullable().optional(),
  customer_email: z.string().nullable().optional(),
  customer_address: z.string().nullable().optional(),
  requested_weight: z.string().nullable().optional(),
  actual_weight: z.string().nullable().optional(),
  order_items: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  cancelled: z.boolean().nullable().optional(),
  cancelled_from: z.string().nullable().optional(),
  hold: z.boolean().nullable().optional(),
  cutting_started: z.boolean().nullable().optional(),
  cutting_started_at: z.string().nullable().optional(),
  cutting_started_by: z.string().nullable().optional(),
  /** Set when a weighed-unit line is added/changed after Cold Storage and
   *  the order is sent back to weigh it — the stage to return to once
   *  re-weighed, so the order doesn't re-run stages it already passed. */
  reweigh_from: z.string().nullable().optional(),
  pickup: z.boolean().nullable().optional(),
  ready_for_pickup: z.boolean().nullable().optional(),
  ready_at: z.string().nullable().optional(),
  third_party: z.boolean().nullable().optional(),
  courier_service: z.string().nullable().optional(),
  courier_tracking_ref: z.string().nullable().optional(),
  payment_confirmed: z.boolean().nullable().optional(),
  payment_confirmed_at: z.string().nullable().optional(),
  /** Finance-gate fields — `method`/`timing` mirror the prototype's payment
   *  object, flattened onto `orders` per this app's convention (see
   *  `cod_reconciled`/`cod_received_at`). `timing` is `'upfront' | 'terms'`
   *  only — COD is deliberately excluded, the delivery-time COD outcome
   *  capture (`delivery_proofs.cash_collected` etc.) is COD's single source
   *  of truth. */
  payment_method: z.string().nullable().optional(),
  payment_timing: z.string().nullable().optional(),
  payment_amount: numeric,
  payment_bank_ref: z.string().nullable().optional(),
  payment_due_date: z.string().nullable().optional(),
  payment_paid_at: z.string().nullable().optional(),
  cod_reconciled: z.boolean().nullable().optional(),
  cod_received_at: z.string().nullable().optional(),
  pickup_geo: GeoStampSchema.nullable().optional(),
  deliver_geo: GeoStampSchema.nullable().optional(),
  undo_snapshot: UndoSnapshotSchema.nullable().optional(),
  docs_returned: z.boolean().nullable().optional(),
  return_received: z.boolean().nullable().optional(),
  return_received_at: z.string().nullable().optional(),
  return_settle: z.string().nullable().optional(),
  return_doc: z.string().nullable().optional(),
  return_inbound: z.boolean().nullable().optional(),
  is_replacement: z.boolean().nullable().optional(),
  partial_return: z.boolean().nullable().optional(),
  returned_reason: z.string().nullable().optional(),
  created_at: z.string().nullable().optional(),
  updated_at: z.string().nullable().optional(),
});

/** Directus `customers` collection row. */
export const CustomersCollectionSchema = z.object({
  id: z.string(),
  name: z.string(),
  company_name: z.string().nullable().optional(),
  channel: z.string().nullable().optional(),
  contact: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  address_geo: LatLngSchema.nullable().optional(),
  area: z.string().nullable().optional(),
  sales: z.string().nullable().optional(),
  credit_limit: numeric,
  term_days: numeric,
  pay_timing: z.string().nullable().optional(),
  pay_method: z.string().nullable().optional(),
  created_at: z.string().nullable().optional(),
  updated_at: z.string().nullable().optional(),
});

/** Directus `products` collection row. */
export const ProductsCollectionSchema = z.object({
  id: z.string(),
  name: z.string(),
  accurate_name: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  origin: z.string().nullable().optional(),
  grade: z.string().nullable().optional(),
  brand: z.string().nullable().optional(),
  form: z.string().nullable().optional(),
  pack: z.string().nullable().optional(),
  catch_weight: z.boolean().nullable().optional(),
  fixed_pack: z.boolean().nullable().optional(),
  ppn: z.string().nullable().optional(),
  oos: z.boolean().nullable().optional(),
  date_created: z.string().nullable().optional(),
  date_updated: z.string().nullable().optional(),
});

/**
 * Directus `attachments` collection row.
 *
 * WhatsApp-sourced rows (message_id set) come from the n8n OCR pipeline.
 * Manually-logged document entries (message_id null) use number/note/
 * created_by/label instead — added via ALTER TABLE, not yet in snapshot.json.
 */
export const AttachmentsCollectionSchema = z.object({
  id: z.union([z.number(), z.string()]).transform(String).nullable().optional(),
  message_id: z.string().nullable().optional(),
  order_uuid: z.string().nullable().optional(),
  sender_phone: z.string().nullable().optional(),
  doc_type: z.string().nullable().optional(),
  file_path: z.string().nullable().optional(),
  document_file: z.string().nullable().optional(),
  caption: z.string().nullable().optional(),
  ocr_text: z.string().nullable().optional(),
  created_at: z.string().nullable().optional(),
  // added via ALTER TABLE — not yet in snapshot.json
  number: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
  created_by: z.string().nullable().optional(),
  label: z.string().nullable().optional(),
  // added via ALTER TABLE 2026-08-11 — links a delivery-proof photo to the
  // delivery_proofs row (attempt) it belongs to; null for non-proof rows.
  proof_id: z.string().nullable().optional(),
});

/** Directus `order_lines` collection row. */
export const OrderLinesCollectionSchema = z.object({
  id: z.string(),
  order_id: z.string().nullable().optional(),
  product_id: z.string().nullable().optional(),
  name: z.string(),
  qty: numeric,
  unit: z.string().nullable().optional(),
  weight: numeric,
  price: numeric,
  status: z.string().nullable().optional(),
  delivered: numeric,
  returned: numeric,
  sent: numeric,
  short: z.boolean().nullable().optional(),
  removed: z.boolean().nullable().optional(),
  weigh_photo: z.string().nullable().optional(),
  returned_weigh_photo: z.string().nullable().optional(),
  sort_order: numeric,
  // Snapshot of `returned` taken when a replacement is settled before the
  // goods physically come back — see OrderDetail.tsx's Incoming Return card.
  inbound_return: numeric,
  // Per-line confirm flag for the Customer Return / Incoming Return receive
  // step — independent of other lines on the same order (see the
  // per-line-box UI in OrderDetail.tsx).
  return_verified: z.boolean().nullable().optional(),
  return_verified_at: z.string().nullable().optional(),
});

/** Directus `order_history` collection row (append-only). */
export const OrderHistoryCollectionSchema = z.object({
  id: z.union([z.number(), z.string()]).transform(String).nullable().optional(),
  order_id: z.string().nullable().optional(),
  at: z.string().nullable().optional(),
  what: z.string(),
  who: z.string().nullable().optional(),
  stage: z.string().nullable().optional(),
});

/** Directus `line_weighings` collection row — one row per scale reading on a weighed line. */
export const LineWeighingsCollectionSchema = z.object({
  id: z.string(),
  line_id: z.string(),
  weight: numeric,
  photo_id: z.string().nullable().optional(),
  created_at: z.string().nullable().optional(),
});
export const LineWeighingsCollectionArraySchema = z.array(
  LineWeighingsCollectionSchema,
);

/** Directus `line_photos` collection row — general item photos on non-weighed lines. */
export const LinePhotosCollectionSchema = z.object({
  id: z.string(),
  line_id: z.string(),
  photo_id: z.string(),
  sort_order: z.number().nullable().optional(),
});
export const LinePhotosCollectionArraySchema = z.array(
  LinePhotosCollectionSchema,
);

/** Directus `line_cuts` collection row — cutting instructions per order line. */
export const LineCutsCollectionSchema = z.object({
  id: z.string(),
  line_id: z.string(),
  text: z.string(),
  done: z.boolean().nullable().optional(),
  sort_order: z.number().nullable().optional(),
});
export const LineCutsCollectionArraySchema = z.array(LineCutsCollectionSchema);

export const LineWeighingPhotosCollectionSchema = z.object({
  id: z.string(),
  weighing_id: z.string(),
  photo_id: z.string(),
  sort_order: z.number().nullable().optional(),
});
export const LineWeighingPhotosCollectionArraySchema = z.array(
  LineWeighingPhotosCollectionSchema,
);

/** Directus `line_return_photos` collection row — return-evidence photos per
 *  line: the courier's refusal-evidence at delivery, and the warehouse's
 *  scale/condition photos when receiving the goods back in (both write here;
 *  distinguished only by which stage the order was at when captured). */
export const LineReturnPhotosCollectionSchema = z.object({
  id: z.string(),
  line_id: z.string(),
  photo_id: z.string(),
  sort_order: z.number().nullable().optional(),
});
export const LineReturnPhotosCollectionArraySchema = z.array(
  LineReturnPhotosCollectionSchema,
);

/** Directus `return_documents` collection row — Accurate return-note / signed DO/SI evidence. */
export const ReturnDocumentsCollectionSchema = z.object({
  id: z.string(),
  order_id: z.string(),
  kind: z.string(),
  photo_id: z.string().nullable().optional(),
  created_at: z.string().nullable().optional(),
});
export const ReturnDocumentsCollectionArraySchema = z.array(
  ReturnDocumentsCollectionSchema,
);

/** Directus `courier_locations` collection row — one GPS ping, keyed by `user_created` (the courier). */
export const CourierLocationsCollectionSchema = z.object({
  id: z.string(),
  lat: numeric,
  lng: numeric,
  at: z.string().nullable().optional(),
  user_created: z.string().nullable().optional(),
});
export const CourierLocationsCollectionArraySchema = z.array(
  CourierLocationsCollectionSchema,
);

/** Directus `corrections` collection row (learned product-match corrections). */
export const CorrectionsCollectionSchema = z.object({
  id: z.string(),
  token_key: z.string(),
  product_id: z.string(),
  created_by: z.string().nullable().optional(),
  date_created: z.string().nullable().optional(),
  times_used: z.number().nullable().optional(),
});
export const CorrectionsCollectionArraySchema = z.array(
  CorrectionsCollectionSchema,
);

/** Directus `delivery_proofs` collection row — courier's 3-photo proof set + COD flag. */
export const DeliveryProofsCollectionSchema = z.object({
  id: z.string(),
  order_id: z.string().nullable().optional(),
  cond_photo: z.string().nullable().optional(),
  recv_photo: z.string().nullable().optional(),
  signed_photo: z.string().nullable().optional(),
  cod: z.boolean().nullable().optional(),
  name: z.string().nullable().optional(),
  archived: z.boolean().nullable().optional(),
  created_at: z.string().nullable().optional(),
  /** Rupiah amount actually collected on this attempt (COD orders only).
   *  Null = not recorded yet; 0 = recorded as nothing collected. */
  cash_collected: numeric,
});
export const DeliveryProofsCollectionArraySchema = z.array(
  DeliveryProofsCollectionSchema,
);

/** Directus `settings` collection row — singleton operational settings (id is always 1). */
export const SettingsCollectionSchema = z.object({
  id: z.number(),
  require_photo: z.boolean().nullable().optional(),
  tol_below_pct: z.number().nullable().optional(),
  tol_above_pct: z.number().nullable().optional(),
  dispatch_proof_required: z.boolean().nullable().optional(),
  lang: z.string().nullable().optional(),
  updated_at: z.string().nullable().optional(),
});

/** Directus `directus_users` row — only the fields OrderDetail needs to
 *  resolve order_history.who / created_by UUIDs into display names. */
export const UserBriefSchema = z.object({
  id: z.string(),
  first_name: z.string().nullable().optional(),
  last_name: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
});
export const UserBriefArraySchema = z.array(UserBriefSchema);

/** Array validators for list responses. */
export const OrdersCollectionArraySchema = z.array(OrdersCollectionSchema);
export const CustomersCollectionArraySchema = z.array(
  CustomersCollectionSchema,
);
export const ProductsCollectionArraySchema = z.array(ProductsCollectionSchema);
export const OrderLinesCollectionArraySchema = z.array(
  OrderLinesCollectionSchema,
);
export const OrderHistoryCollectionArraySchema = z.array(
  OrderHistoryCollectionSchema,
);
export const AttachmentsCollectionArraySchema = z.array(
  AttachmentsCollectionSchema,
);
