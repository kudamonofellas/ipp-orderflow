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
  OrderHistoryCollectionSchema,
  OrderLinesCollectionSchema,
  OrdersCollectionSchema,
  ProductsCollectionSchema,
  AttachmentsCollectionSchema,
  UserBriefSchema,
  LineCutsCollectionSchema,
  LineWeighingsCollectionSchema,
  LinePhotosCollectionSchema,
  LineWeighingPhotosCollectionSchema,
  LineReturnPhotosCollectionSchema,
  ReturnDocumentsCollectionSchema,
  DeliveryProofsCollectionSchema,
  SettingsCollectionSchema,
  CourierLocationsCollectionSchema,
  GeoStampSchema,
  UndoSnapshotSchema,
  LatLngSchema
} from '../lib/schemas';

export type OrdersCollection = z.infer<typeof OrdersCollectionSchema>;
export type CorrectionsCollection = z.infer<typeof CorrectionsCollectionSchema>;
export type GeoStamp = z.infer<typeof GeoStampSchema>;
export type UndoSnapshot = z.infer<typeof UndoSnapshotSchema>;
export type LatLng = z.infer<typeof LatLngSchema>;
export type CustomersCollection = z.infer<typeof CustomersCollectionSchema>;
export type ProductsCollection = z.infer<typeof ProductsCollectionSchema>;
export type OrderLinesCollection = z.infer<typeof OrderLinesCollectionSchema>;
export type OrderHistoryCollection = z.infer<typeof OrderHistoryCollectionSchema>;
export type AttachmentsCollection = z.infer<typeof AttachmentsCollectionSchema>;
export type UserBrief = z.infer<typeof UserBriefSchema>;
export type LineCutsCollection = z.infer<typeof LineCutsCollectionSchema>;
export type LineWeighingsCollection = z.infer<typeof LineWeighingsCollectionSchema>;
export type LinePhotosCollection = z.infer<typeof LinePhotosCollectionSchema>;
export type LineWeighingPhotosCollection = z.infer<typeof LineWeighingPhotosCollectionSchema>;
export type LineReturnPhotosCollection = z.infer<typeof LineReturnPhotosCollectionSchema>;
export type ReturnDocumentsCollection = z.infer<typeof ReturnDocumentsCollectionSchema>;
export type DeliveryProofsCollection = z.infer<typeof DeliveryProofsCollectionSchema>;
export type SettingsCollection = z.infer<typeof SettingsCollectionSchema>;
export type CourierLocationsCollection = z.infer<typeof CourierLocationsCollectionSchema>;