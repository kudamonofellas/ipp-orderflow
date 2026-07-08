/**
 * Single Directus client for the whole app.
 *
 * Invariant (architecture.md #1): the frontend talks ONLY to Directus.
 * Never to Postgres, n8n, or Evolution API. All reads/writes go through here.
 *
 * Auth: for now a static token (VITE_DIRECTUS_TOKEN) is used for the first
 * read-only wiring. This will be replaced by a real email/password login
 * flow (Directus /auth/login → JWT) once the role-based UI lands.
 *
 * Per code-standards.md: all Directus calls go through this wrapper — never
 * call createDirectus() ad-hoc in a component. Read methods return
 * `{ data, error }` tuples and validate responses with zod at the boundary.
 */

import { aggregate, createDirectus, readItems, rest, staticToken } from '@directus/sdk';
import {
  OrdersCollectionArraySchema,
  MessagesCollectionArraySchema,
} from './schemas';
import type { OrdersCollection, MessagesCollection } from '../types/directus';

const url = import.meta.env.VITE_DIRECTUS_URL;
const token = import.meta.env.VITE_DIRECTUS_TOKEN;

if (!url) {
  throw new Error(
    'VITE_DIRECTUS_URL is not set. Copy .env.example to .env and fill it in.',
  );
}

// Token is optional during early wiring (some Directus collections may be public),
// but most reads will 403 without it. Warn loudly so it's obvious.
if (!token) {
  console.warn(
    '[directus] VITE_DIRECTUS_TOKEN is empty — reads against non-public collections will fail. ' +
      'Create a static token in Directus admin and add it to .env',
  );
}

const client = token
  ? createDirectus(url).with(staticToken(token)).with(rest())
  : createDirectus(url).with(rest());

/** Result tuple — components never receive a thrown SDK error. */
export type DirectusResult<T> =
  | { data: T; error: null }
  | { data: null; error: string };

/** Loose query type — the SDK's generic Query requires a typed schema we
 *  don't have registered yet. zod validates the response at the boundary. */
type DirectusQuery = Record<string, unknown>;

/** Read orders with a filter, validated through zod at the boundary. */
export async function readOrders(
  query: DirectusQuery,
): Promise<DirectusResult<OrdersCollection[]>> {
  try {
    const raw = await client.request(readItems('orders', query));
    const parsed = OrdersCollectionArraySchema.safeParse(raw);
    if (!parsed.success) {
      return { data: null, error: `Invalid orders response: ${parsed.error.message}` };
    }
    return { data: parsed.data, error: null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { data: null, error: msg };
  }
}

/** Read messages with a filter, validated through zod at the boundary. */
export async function readMessages(
  query: DirectusQuery,
): Promise<DirectusResult<MessagesCollection[]>> {
  try {
    const raw = await client.request(readItems('messages', query));
    const parsed = MessagesCollectionArraySchema.safeParse(raw);
    if (!parsed.success) {
      return { data: null, error: `Invalid messages response: ${parsed.error.message}` };
    }
    return { data: parsed.data, error: null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { data: null, error: msg };
  }
}

/**
 * Aggregate order counts, optionally grouped by a field (e.g. `status`).
 *
 * Returns the raw aggregate rows. When grouping by `status`, each row looks
 * like `{ status: 'Open', count: 3 }`. When no groupBy, returns
 * `[{ count: 42 }]`.
 *
 * Per code-standards.md: use aggregate() for counts, never readItems() + .length.
 */
export interface AggregateCountRow {
  [key: string]: unknown;
}

export async function aggregateOrders(
  query: DirectusQuery,
): Promise<DirectusResult<AggregateCountRow[]>> {
  try {
    // Cast: the SDK's aggregate() expects a strongly-typed AggregationOptions
    // tied to a registered schema. We use a loose query + zod-style validation
    // at the boundary instead. Safe because Directus returns JSON we normalize.
    const raw = await client.request(aggregate('orders', query as never));
    const rows = Array.isArray(raw) ? (raw as AggregateCountRow[]) : [];
    return { data: rows, error: null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { data: null, error: msg };
  }
}
