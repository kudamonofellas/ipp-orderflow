/**
 * Directus collection schemas.
 *
 * These mirror the actual columns in the VPS Directus instance (see
 * context/schema/snapshot.json). Only the fields the frontend reads are typed
 * here — extend as more panels get wired.
 *
 * Types are derived from the zod schemas in src/lib/schemas.ts so there's a
 * single source of truth for the boundary validation shape.
 */

import type { z } from 'zod';
import type {
  CorrectionsCollectionSchema,
  CustomersCollectionSchema,
  MessagesCollectionSchema,
  OrderHistoryCollectionSchema,
  OrderLinesCollectionSchema,
  OrdersCollectionSchema,
  ProductsCollectionSchema,
} from '../lib/schemas';

export type OrdersCollection = z.infer<typeof OrdersCollectionSchema>;
export type MessagesCollection = z.infer<typeof MessagesCollectionSchema>;
export type CustomersCollection = z.infer<typeof CustomersCollectionSchema>;
export type ProductsCollection = z.infer<typeof ProductsCollectionSchema>;
export type OrderLinesCollection = z.infer<typeof OrderLinesCollectionSchema>;
export type OrderHistoryCollection = z.infer<typeof OrderHistoryCollectionSchema>;
export type CorrectionsCollection = z.infer<typeof CorrectionsCollectionSchema>;
