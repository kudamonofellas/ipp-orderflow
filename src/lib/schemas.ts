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

import { z } from 'zod';

/**
 * Directus `orders` collection row.
 *
 * Extended with the target-schema fields (no, customer_id, stage, channel,
 * sales, deliver_at, taken_by, return/payment flags). Legacy fields
 * (order_id, status, customer_name, order_items, …) stay optional so reads
 * that don't select the new fields still validate.
 */
export const OrdersCollectionSchema = z.object({
  id: z.string(),
  order_id: z.string().nullable().optional(),
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
  cutting_started: z.boolean().nullable().optional(),
  pickup: z.boolean().nullable().optional(),
  third_party: z.boolean().nullable().optional(),
  payment_confirmed: z.boolean().nullable().optional(),
  return_received: z.boolean().nullable().optional(),
  return_settle: z.string().nullable().optional(),
  return_doc: z.string().nullable().optional(),
  return_inbound: z.boolean().nullable().optional(),
  is_replacement: z.boolean().nullable().optional(),
  partial_return: z.boolean().nullable().optional(),
  returned_reason: z.string().nullable().optional(),
  created_at: z.string().nullable().optional(),
  updated_at: z.string().nullable().optional(),
});

/** Directus `messages` collection row. */
export const MessagesCollectionSchema = z.object({
  id: z.number(),
  message_id: z.string(),
  sender_number: z.string().nullable().optional(),
  content: z.string().nullable().optional(),
  caption: z.string().nullable().optional(),
  has_attachment: z.boolean().optional(),
  is_edited: z.boolean().optional(),
  is_deleted: z.boolean().optional(),
  order_uuid: z.string().nullable().optional(),
  order_id: z.string().nullable().optional(),
  created_at: z.string().nullable().optional(),
});

/** Directus serializes NUMERIC / INT columns as strings in JSON responses,
 *  so numeric fields accept both string and number. z.coerce.number() would
 *  drop nulls; this union keeps nullability intact. */
const numeric = z.union([z.number(), z.string()]).nullable().optional();
/** Directus `customers` collection row. */
export const CustomersCollectionSchema = z.object({
  id: z.string(),
  name: z.string(),
  company_name: z.string().nullable().optional(),
  channel: z.string().nullable().optional(),
  contact: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
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
  active: z.boolean().nullable().optional(),
  created_at: z.string().nullable().optional(),
  updated_at: z.string().nullable().optional(),
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
  short: z.boolean().nullable().optional(),
  removed: z.boolean().nullable().optional(),
  weigh_photo: z.string().nullable().optional(),
  returned_weigh_photo: z.string().nullable().optional(),
  sort_order: numeric,
});

/** Directus `order_history` collection row (append-only). */
export const OrderHistoryCollectionSchema = z.object({
  id: z.number().nullable().optional(),
  order_id: z.string().nullable().optional(),
  at: z.string().nullable().optional(),
  what: z.string(),
  who: z.string().nullable().optional(),
  stage: z.string().nullable().optional(),
});

/** Directus `corrections` collection row (learned product-match corrections). */
export const CorrectionsCollectionSchema = z.object({
  id: z.string(),
  token_key: z.string(),
  product_id: z.string(),
  created_by: z.string().nullable().optional(),
  date_created: z.string().nullable().optional(),
  times_used: z.number().nullable().optional(),
});

/** Array validators for list responses. */
export const OrdersCollectionArraySchema = z.array(OrdersCollectionSchema);
export const MessagesCollectionArraySchema = z.array(MessagesCollectionSchema);
export const CustomersCollectionArraySchema = z.array(CustomersCollectionSchema);
export const ProductsCollectionArraySchema = z.array(ProductsCollectionSchema);
export const OrderLinesCollectionArraySchema = z.array(OrderLinesCollectionSchema);
export const CorrectionsCollectionArraySchema = z.array(CorrectionsCollectionSchema);
export const OrderHistoryCollectionArraySchema = z.array(OrderHistoryCollectionSchema);
