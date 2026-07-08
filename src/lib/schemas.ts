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

/** Directus `orders` collection row. */
export const OrdersCollectionSchema = z.object({
  id: z.string(),
  order_id: z.string().nullable().optional(),
  status: z.string().nullable().optional(),
  order_date: z.string().nullable().optional(),
  delivery_date: z.string().nullable().optional(),
  customer_name: z.string().nullable().optional(),
  sales_rep: z.string().nullable().optional(),
  order_items: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
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

/** Array validators for list responses. */
export const OrdersCollectionArraySchema = z.array(OrdersCollectionSchema);
export const MessagesCollectionArraySchema = z.array(MessagesCollectionSchema);
