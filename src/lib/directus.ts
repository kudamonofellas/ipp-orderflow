/**
 * Single Directus client for the whole app.
 *
 * Invariant (architecture.md #1): the frontend talks ONLY to Directus.
 * Never to Postgres, n8n, or Evolution API. All reads/writes go through here.
 *
 * Auth: email/password login via the `authentication('json')` composable.
 * Tokens (access + refresh) are persisted in `localStorage` so a page
 * reload keeps the user signed in until they explicitly sign out. The SDK
 * reads from this storage on mount and auto-refreshes when the access token
 * expires. A static-token fallback is kept so early read-only wiring
 * (VITE_DIRECTUS_TOKEN) keeps working during the migration.
 *
 * Per code-standards.md: all Directus calls go through this wrapper — never
 * call createDirectus() ad-hoc in a component. All methods return
 * `{ data, error }` tuples and validate responses with zod at the boundary.
 */

import {
  aggregate,
  authentication,
  createDirectus,
  createItem,
  createItems,
  readItem,
  readItems,
  readUser,
  rest,
  staticToken,
  updateItem,
  deleteItem,
  uploadFiles,
  readUsers,
} from '@directus/sdk';
import {
  CustomersCollectionSchema,
  CustomersCollectionArraySchema,
  CorrectionsCollectionSchema,
  MessagesCollectionArraySchema,
  OrderHistoryCollectionSchema,
  OrderHistoryCollectionArraySchema,
  OrderLinesCollectionSchema,
  OrderLinesCollectionArraySchema,
  OrdersCollectionArraySchema,
  OrdersCollectionSchema,
  ProductsCollectionSchema,
  ProductsCollectionArraySchema,
  AttachmentsCollectionSchema,
  AttachmentsCollectionArraySchema,
  UserBriefArraySchema,
  LineCutsCollectionArraySchema,
  LineCutsCollectionSchema,
  LineWeighingsCollectionSchema,
  LineWeighingsCollectionArraySchema,
  LinePhotosCollectionSchema,
  LinePhotosCollectionArraySchema,
  LineWeighingPhotosCollectionSchema,
  LineWeighingPhotosCollectionArraySchema
} from './schemas';
import type {
  CorrectionsCollection,
  CustomersCollection,
  MessagesCollection,
  OrderHistoryCollection,
  OrderLinesCollection,
  OrdersCollection,
  ProductsCollection,
  AttachmentsCollection,
  UserBrief,
  LineCutsCollection,
  LineWeighingsCollection,
  LinePhotosCollection,
  LineWeighingPhotosCollection
} from '../types/directus';
import {
  buildOrderNo,
  parseOrderNo
} from './orderNo';

const url = import.meta.env.VITE_DIRECTUS_URL;
const staticTokenValue = import.meta.env.VITE_DIRECTUS_TOKEN;

if (!url) {
  throw new Error(
    'VITE_DIRECTUS_URL is not set. Copy .env.example to .env and fill it in.',
  );
}

/**
 * sessionStorage-backed token storage for the SDK's `authentication()` composable.
 *
 * The SDK defaults to in-memory storage, which is lost on reload. By providing
 * a sessionStorage-backed storage, the SDK can rehydrate the access + refresh
 * tokens after a page reload within the same tab, and auto-refresh when the
 * access token expires. Closing the tab clears sessionStorage (logs out).
 *
 * This is auth state only — no business data (orders, customers, etc.) is
 * stored here, so architecture.md invariant #2 is not violated.
 */
const SESSION_KEY = 'ipp_auth_tokens';

interface AuthTokens {
  access_token: string | null;
  refresh_token: string | null;
  expires: number | null;
  expires_at: number | null;
}

const localAuthStorage = {
  async get(): Promise<AuthTokens | null> {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as AuthTokens;
    } catch {
      return null;
    }
  },
  async set(values: AuthTokens | null): Promise<void> {
    try {
      if (values === null || values.access_token === null) {
        localStorage.removeItem(SESSION_KEY);
      } else {
        localStorage.setItem(SESSION_KEY, JSON.stringify(values));
      }
    } catch {
      // localStorage might be unavailable (private mode) — silently ignore
    }
  },
};

/**
 * Two client shapes:
 * - `authClient` — has `authentication('json')` + `rest()`. Used for login,
 *   logout, refresh, and all authenticated reads/writes. Tokens are persisted
 *   in localStorage so reloads within the same tab keep the user signed in.
 *
 *   `autoRefresh: false` — we deliberately disable the SDK's background
 *   auto-refresh. When auto-refresh is enabled and the refresh token is
 *   invalid/expired, the SDK calls `p()` (clear all tokens) before throwing,
 *   wiping the valid access token from storage. Subsequent requests then go
 *   out without auth and Directus returns 500 for write operations.
 *   RoleContext handles rehydration on mount; the save pre-flight readMe()
 *   check catches expired sessions before any writes are attempted.
 *
 * - `tokenClient` — `staticToken()` + `rest()`. Used only when the app is
 *   configured with a long-lived static token (early read-only wiring).
 */
const authClient = createDirectus(url)
  .with(authentication('json', { storage: localAuthStorage, autoRefresh: false }))
  .with(rest());

const tokenClient = staticTokenValue
  ? createDirectus(url).with(staticToken(staticTokenValue)).with(rest())
  : null;

/** The active client: prefer the authenticated client (login sets its token). */
export function getClient() {
  return authClient;
}

/** Result tuple — components never receive a thrown SDK error. */
export type DirectusResult<T> =
  | { data: T; error: null }
  | { data: null; error: string };

/** Loose query type — the SDK's generic Query requires a typed schema we
 *  don't have registered yet. zod validates the response at the boundary. */
type DirectusQuery = Record<string, unknown>;

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/* ============================================================ Auth ===== */

export interface LoginResult {
  access_token: string;
  refresh_token: string;
  expires: number;
}

export async function login(
  email: string,
  password: string,
): Promise<DirectusResult<LoginResult>> {
  try {
    const result = await authClient.login({ email, password });
    // Explicitly set the token on the client so subsequent rest() requests
    // (readMe, readOrders, etc.) include the Authorization header. The SDK's
    // authentication() composable should do this automatically, but in some
    // browser environments the token isn't attached to the very next request
    // without an explicit setToken() call.
    if (result.access_token) {
      authClient.setToken(result.access_token);
    }
    return {
      data: {
        access_token: result.access_token ?? '',
        refresh_token: result.refresh_token ?? '',
        expires: result.expires ?? 0,
      },
      error: null,
    };
  } catch (err) {
    return { data: null, error: errMsg(err) };
  }
}

export async function logout(): Promise<DirectusResult<true>> {
  try {
    await authClient.logout();
  } catch {
    // Even if the server logout fails, clear local state
  }
  clearAuthStorage();
  return { data: true, error: null };
}

export async function refresh(): Promise<DirectusResult<true>> {
  try {
    await authClient.refresh();
    return { data: true, error: null };
  } catch (err) {
    return { data: null, error: errMsg(err) };
  }
}

/** The currently signed-in Directus user, with their role expanded. */
export interface DirectusUser {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  role: { id: string; name: string } | null;
}

export async function readMe(): Promise<DirectusResult<DirectusUser>> {
  try {
    const raw = await authClient.request(
      readUser('me', {
        fields: ['id', 'first_name', 'last_name', 'email', 'role.id', 'role.name'],
      }),
    );
    const user = raw as unknown as DirectusUser;
    return { data: user, error: null };
  } catch (err) {
    return { data: null, error: errMsg(err) };
  }
}

/** True if the auth client currently holds a valid (non-expired) access token. */
export function hasToken(): boolean {
  const t = authClient.getToken() as unknown;
  if (typeof t === 'string' && (t as string).length > 0) return true;
  // Fall back to localStorage (the SDK may not have rehydrated into memory yet)
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as AuthTokens;
    if (!parsed.access_token) return false;
    // If we have a refresh token, we can attempt a refresh even if access token
    // is expired — so return true to let the caller try rehydration.
    if (parsed.refresh_token) return true;
    // No refresh token: check if access token is still valid.
    if (parsed.expires_at && Date.now() >= parsed.expires_at) return false;
    return true;
  } catch {
    return false;
  }
}

/** Clear all auth state from sessionStorage (used by logout). */
export function clearAuthStorage(): void {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    // ignore
  }
}

/**
 * Synchronously read the current access token, for building authenticated
 * asset URLs (e.g. <img src>). Browsers never attach an Authorization
 * header to plain <img>/<a> requests, so Directus's `?access_token=`
 * query-param form is used instead — this keeps files gated behind the
 * real role's permissions rather than requiring the Public role to have
 * Read access on the File Library.
 *
 * Mirrors hasToken()'s fallback: prefer the SDK's in-memory token if
 * synchronously available, else read the persisted value directly.
 */
export function getAccessTokenSync(): string | null {
  const t = authClient.getToken() as unknown;
  if (typeof t === 'string' && t.length > 0) return t;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthTokens;
    return parsed.access_token ?? null;
  } catch {
    return null;
  }
}

/** Build an authenticated URL for a Directus file/asset. Use this instead
 *  of hand-building `${VITE_DIRECTUS_URL}/assets/${id}` anywhere in the app. */
export function getAssetUrl(fileId: string): string {
  const token = getAccessTokenSync();
  const base = `${url}/assets/${fileId}`;
  return token ? `${base}?access_token=${encodeURIComponent(token)}` : base;
}

/* ============================================================ Reads === */

/** Read orders with a filter, validated through zod at the boundary. */
export async function readOrders(
  query: DirectusQuery,
): Promise<DirectusResult<OrdersCollection[]>> {
  try {
    const raw = await getClient().request(readItems('orders', query));
    const parsed = OrdersCollectionArraySchema.safeParse(raw);
    if (!parsed.success) {
      return { data: null, error: `Invalid orders response: ${parsed.error.message}` };
    }
    return { data: parsed.data, error: null };
  } catch (err) {
    return { data: null, error: errMsg(err) };
  }
}

/** Read a single order by id, validated through zod at the boundary. */
export async function readOrder(
  id: string,
  query: DirectusQuery = {},
): Promise<DirectusResult<OrdersCollection>> {
  try {
    const raw = await getClient().request(readItem('orders', id, query));
    const parsed = OrdersCollectionSchema.safeParse(raw);
    if (!parsed.success) {
      return { data: null, error: `Invalid order response: ${parsed.error.message}` };
    }
    return { data: parsed.data, error: null };
  } catch (err) {
    return { data: null, error: errMsg(err) };
  }
}

/** Read messages with a filter, validated through zod at the boundary. */
export async function readMessages(
  query: DirectusQuery,
): Promise<DirectusResult<MessagesCollection[]>> {
  try {
    const raw = await getClient().request(readItems('messages', query));
    const parsed = MessagesCollectionArraySchema.safeParse(raw);
    if (!parsed.success) {
      return { data: null, error: `Invalid messages response: ${parsed.error.message}` };
    }
    return { data: parsed.data, error: null };
  } catch (err) {
    return { data: null, error: errMsg(err) };
  }
}

/** Read customers with a filter, validated through zod at the boundary. */
export async function readCustomers(
  query: DirectusQuery = {},
): Promise<DirectusResult<CustomersCollection[]>> {
  try {
    const raw = await getClient().request(readItems('customers', query));
    const parsed = CustomersCollectionArraySchema.safeParse(raw);
    if (!parsed.success) {
      return { data: null, error: `Invalid customers response: ${parsed.error.message}` };
    }
    return { data: parsed.data, error: null };
  } catch (err) {
    return { data: null, error: errMsg(err) };
  }
}

/** Read products with a filter, validated through zod at the boundary. */
export async function readProducts(
  query: DirectusQuery = {},
): Promise<DirectusResult<ProductsCollection[]>> {
  try {
    const raw = await getClient().request(readItems('products', query));
    const parsed = ProductsCollectionArraySchema.safeParse(raw);
    if (!parsed.success) {
      return { data: null, error: `Invalid products response: ${parsed.error.message}` };
    }
    return { data: parsed.data, error: null };
  } catch (err) {
    return { data: null, error: errMsg(err) };
  }
}

/** Read order lines with a filter, validated through zod at the boundary. */
export async function readOrderLines(
  query: DirectusQuery,
): Promise<DirectusResult<OrderLinesCollection[]>> {
  try {
    const raw = await getClient().request(readItems('order_lines', query));
    const parsed = OrderLinesCollectionArraySchema.safeParse(raw);
    if (!parsed.success) {
      return { data: null, error: `Invalid order_lines response: ${parsed.error.message}` };
    }
    return { data: parsed.data, error: null };
  } catch (err) {
    return { data: null, error: errMsg(err) };
  }
}

/**
 * Aggregate order counts, optionally grouped by a field (e.g. `stage`).
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
    const raw = await getClient().request(aggregate('orders', query as never));
    const rows = Array.isArray(raw) ? (raw as AggregateCountRow[]) : [];
    return { data: rows, error: null };
  } catch (err) {
    return { data: null, error: errMsg(err) };
  }
}

/**
 * Aggregate customer counts (e.g. total matching a filter for pagination).
 *
 * Per code-standards.md: use aggregate() for counts, never readItems() + .length.
 */
export async function aggregateCustomers(
  query: DirectusQuery,
): Promise<DirectusResult<AggregateCountRow[]>> {
  try {
    const raw = await getClient().request(aggregate('customers', query as never));
    const rows = Array.isArray(raw) ? (raw as AggregateCountRow[]) : [];
    return { data: rows, error: null };
  } catch (err) {
    return { data: null, error: errMsg(err) };
  }
}

/**
 * Aggregate product counts (e.g. total matching a filter for pagination).
 *
 * Per code-standards.md: use aggregate() for counts, never readItems() + .length.
 */
export async function aggregateProducts(
  query: DirectusQuery,
): Promise<DirectusResult<AggregateCountRow[]>> {
  try {
    const raw = await getClient().request(aggregate('products', query as never));
    const rows = Array.isArray(raw) ? (raw as AggregateCountRow[]) : [];
    return { data: rows, error: null };
  } catch (err) {
    return { data: null, error: errMsg(err) };
  }
}

/**
 * Compute the next sequential order number for the current year.
 *
 * Reads the max existing `no` for `IPP-<year>-NNNN` rows and returns the next.
 * If no rows exist yet this year, returns `IPP-<year>-0001`. The caller must
 * still rely on the DB UNIQUE constraint to catch a race; on conflict we
 * surface the error to the form.
 */
export async function getNextOrderNo(dateCode: string): Promise<DirectusResult<string>> {
  try {
    const raw = await getClient().request(
      readItems('orders', {
        fields: ['no'],
        filter: { no: { _starts_with: dateCode } },
        limit: -1,
      }),
    );
    const rows = (raw as { no: string | null }[]) ?? [];
    const used = new Set(
      rows
        .map((r) => (r.no ? parseOrderNo(r.no) : null))
        .filter((p): p is { dateCode: string; seq: number } => !!p && p.dateCode === dateCode)
        .map((p) => p.seq),
    );
    let seq = 1;
    while (used.has(seq)) seq++;
    return { data: buildOrderNo(dateCode, seq), error: null };
  } catch (err) {
    return { data: null, error: errMsg(err) };
  }
}

/* ========================================================== Writes ===== */

/** Shape for creating a new order row (mirrors the target schema). */
export interface CreateOrderInput {
  no: string;
  order_id: string;
  customer_id: string;
  customer_name?: string | null;
  customer_contact?: string | null;
  customer_address?: string | null;
  customer_legal_name?: string | null;
  channel: string;
  stage: string;
  status?: string;
  sales: string | null;
  deliver_at: string | null;
  order_date: string;
  notes?: string | null;
}

export async function createOrder(
  input: CreateOrderInput,
): Promise<DirectusResult<OrdersCollection>> {
  try {
    const raw = await getClient().request(createItem('orders', input as never));
    const parsed = OrdersCollectionSchema.safeParse(raw);
    if (!parsed.success) {
      return { data: null, error: `Invalid order response: ${parsed.error.message}` };
    }
    return { data: parsed.data, error: null };
  } catch (err) {
    return { data: null, error: errMsg(err) };
  }
}

/** Shape for one order line (mirrors the target schema). */
export interface CreateOrderLineInput {
  order_id: string;
  product_id: string | null;
  name: string;
  qty: number;
  unit: string;
  status: string;
  sort_order: number;
}

/** Create multiple order lines in one call. */
export async function createOrderLines(
  lines: CreateOrderLineInput[],
): Promise<DirectusResult<OrderLinesCollection[]>> {
  try {
    const cleanLines = lines.map((l) =>
      sanitizeUuidFields(l as unknown as Record<string, unknown>, ['product_id', 'order_id', 'weigh_photo', 'returned_weigh_photo'])
    );
    const raw = await getClient().request(createItems('order_lines', cleanLines as never));
    const parsed = OrderLinesCollectionArraySchema.safeParse(raw);
    if (!parsed.success) {
      return { data: null, error: `Invalid order_lines response: ${parsed.error.message}` };
    }
    return { data: parsed.data, error: null };
  } catch (err) {
    return { data: null, error: errMsg(err) };
  }
}

/** Shape for an order_history row (append-only). */
export interface CreateOrderHistoryInput {
  order_id: string;
  what: string;
  who: string | null;
  stage: string | null;
}

/** Append one row to order_history. Never UPDATE or DELETE (architecture.md). */
export async function appendOrderHistory(
  input: CreateOrderHistoryInput,
): Promise<DirectusResult<OrderHistoryCollection>> {
  try {
    const raw = await getClient().request(createItem('order_history', input as never));
    const parsed = OrderHistoryCollectionSchema.safeParse(raw);
    if (!parsed.success) {
      return { data: null, error: `Invalid order_history response: ${parsed.error.message}` };
    }
    return { data: parsed.data, error: null };
  } catch (err) {
    return { data: null, error: errMsg(err) };
  }
}

/** Read order history for a single order by order_id, validated through zod. */
export async function readOrderHistory(
  orderId: string,
): Promise<DirectusResult<OrderHistoryCollection[]>> {
  try {
    const raw = await getClient().request(
      readItems('order_history', {
        filter: { order_id: { _eq: orderId } } as never,
        sort: ['at'] as never,
        limit: -1,
      }),
    );
    const parsed = OrderHistoryCollectionArraySchema.safeParse(raw);
    if (!parsed.success) {
      return { data: null, error: `Invalid order_history response: ${parsed.error.message}` };
    }
    return { data: parsed.data, error: null };
  } catch (err) {
    return { data: null, error: errMsg(err) };
  }
}

export async function readAllUsers(): Promise<DirectusResult<UserBrief[]>> {
  try {
    const raw = await getClient().request(
      readUsers({ fields: ['id', 'first_name', 'last_name', 'email'], limit: -1 } as never),
    );
    const parsed = UserBriefArraySchema.safeParse(raw);
    if (!parsed.success) {
      return { data: null, error: `Invalid users response: ${parsed.error.message}` };
    }
    return { data: parsed.data, error: null };
  } catch (err) {
    return { data: null, error: errMsg(err) };
  }
}

/* ============================================================ Attachments === */

/**
 * Read all attachments for an order — both WhatsApp-sourced rows (message_id set)
 * and manually-logged document entries (message_id null, number/note/label set).
 * Sorted newest-first.
 */
export async function readAttachments(
  orderId: string,
): Promise<DirectusResult<AttachmentsCollection[]>> {
  try {
    const raw = await getClient().request(
      readItems('attachments', {
        filter: { order_uuid: { _eq: orderId } } as never,
        sort: ['-created_at'] as never,
        limit: -1,
      }),
    );
    const parsed = AttachmentsCollectionArraySchema.safeParse(raw);
    if (!parsed.success) {
      return { data: null, error: `Invalid attachments response: ${parsed.error.message}` };
    }
    return { data: parsed.data, error: null };
  } catch (err) {
    return { data: null, error: errMsg(err) };
  }
}

/**
 * Shape for a manually-logged document entry.
 * message_id is intentionally absent (stays null in DB) to distinguish from
 * WhatsApp-sourced attachments.
 */



export interface CreateAttachmentInput {
  order_uuid: string;
  doc_type: string;        // 'DO' | 'SI' | 'Return Note' | 'Other'
  number?: string;         // document number e.g. "DO-2026-0042"
  note?: string;           // admin free-text note
  label?: string;          // display label e.g. "Signed Invoice"
  document_file?: string;  // uuid from directus_files after uploadFile()
  created_by?: string;     // directus user uuid from useCurrentUserId()
}

export async function createAttachment(
  input: CreateAttachmentInput,
): Promise<DirectusResult<AttachmentsCollection>> {
  try {
    const raw = await getClient().request(createItem('attachments', input as never));
    const parsed = AttachmentsCollectionSchema.safeParse(raw);
    if (!parsed.success) {
      return { data: null, error: `Invalid attachment response: ${parsed.error.message}` };
    }
    return { data: parsed.data, error: null };
  } catch (err) {
    return { data: null, error: errMsg(err) };
  }
}

export async function deleteAttachment(id: number | string): Promise<DirectusResult<void>> {
  try {
    await getClient().request(deleteItem('attachments', id));
    return { data: undefined, error: null };
  } catch (err) {
    return { data: null, error: errMsg(err) };
  }
}

/**
 * Upload a file to Directus Files and return its uuid.
 * Pass the returned id as `document_file` in createAttachment().
 */
export async function uploadFile(
  file: File,
  folder?: string,
): Promise<DirectusResult<{ id: string }>> {
  try {
    const formData = new FormData();
    formData.append('file', file);
    if (folder) formData.append('folder', folder);
    const raw = await getClient().request(uploadFiles(formData));
    const result = raw as unknown as { id: string };
    if (!result?.id) {
      return { data: null, error: 'File upload returned no id' };
    }
    return { data: { id: result.id }, error: null };
  } catch (err) {
    return { data: null, error: errMsg(err) };
  }
}

function isUuid(val: unknown): boolean {
  return typeof val === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
}

function sanitizeUuidFields<T extends Record<string, unknown>>(obj: T, fields: string[]): T {
  const copy = { ...obj };
  for (const f of fields) {
    if (f in copy) {
      const v = copy[f];
      if (v !== null && v !== undefined && !isUuid(v)) {
        (copy as Record<string, unknown>)[f] = null;
      }
    }
  }
  return copy;
}

/** Patch an order (e.g. stage transition). Used by later pipeline units. */
export async function updateOrder(
  id: string,
  patch: Record<string, unknown>,
): Promise<DirectusResult<OrdersCollection>> {
  try {
    const cleanPatch = sanitizeUuidFields(patch, ['customer_id', 'taken_by']);
    const raw = await getClient().request(updateItem('orders', id, cleanPatch as never));
    const parsed = OrdersCollectionSchema.safeParse(raw);
    if (!parsed.success) {
      return { data: null, error: `Invalid order response: ${parsed.error.message}` };
    }
    return { data: parsed.data, error: null };
  } catch (err) {
    return { data: null, error: errMsg(err) };
  }
}

export async function updateOrderLine(
  id: string,
  patch: Record<string, unknown>,
): Promise<DirectusResult<OrderLinesCollection>> {
  try {
    const cleanPatch = sanitizeUuidFields(patch, ['product_id', 'order_id', 'weigh_photo', 'returned_weigh_photo']);
    const raw = await getClient().request(updateItem('order_lines', id, cleanPatch as never));
    const parsed = OrderLinesCollectionSchema.safeParse(raw);
    if (!parsed.success) {
      return { data: null, error: `Invalid order_line response: ${parsed.error.message}` };
    }
    return { data: parsed.data, error: null };
  } catch (err) {
    return { data: null, error: errMsg(err) };
  }
}

export async function createOrderLine(
  input: CreateOrderLineInput,
): Promise<DirectusResult<OrderLinesCollection>> {
  try {
    const cleanInput = sanitizeUuidFields(input as unknown as Record<string, unknown>, ['product_id', 'order_id', 'weigh_photo', 'returned_weigh_photo']);
    const raw = await getClient().request(createItem('order_lines', cleanInput as never));
    const parsed = OrderLinesCollectionSchema.safeParse(raw);
    if (!parsed.success) {
      return { data: null, error: `Invalid order_line response: ${parsed.error.message}` };
    }
    return { data: parsed.data, error: null };
  } catch (err) {
    return { data: null, error: errMsg(err) };
  }
}

export async function deleteOrderLine(id: string): Promise<DirectusResult<void>> {
  try {
    await getClient().request(deleteItem('order_lines', id));
    return { data: undefined, error: null };
  } catch (err) {
    return { data: null, error: errMsg(err) };
  }
}

/** Read all cuts for a set of order_line ids (one query for the whole order). */
export async function readLineCuts(
  lineIds: string[],
): Promise<DirectusResult<LineCutsCollection[]>> {
  if (lineIds.length === 0) return { data: [], error: null };
  try {
    const raw = await getClient().request(
      readItems('line_cuts', {
        filter: { line_id: { _in: lineIds } } as never,
        sort: ['sort_order'] as never,
        limit: -1,
      }),
    );
    const parsed = LineCutsCollectionArraySchema.safeParse(raw);
    if (!parsed.success) {
      return { data: null, error: `Invalid line_cuts response: ${parsed.error.message}` };
    }
    return { data: parsed.data, error: null };
  } catch (err) {
    return { data: null, error: errMsg(err) };
  }
}

export async function createLineCut(
  input: { line_id: string; text: string; sort_order?: number },
): Promise<DirectusResult<LineCutsCollection>> {
  try {
    const raw = await getClient().request(createItem('line_cuts', input as never));
    const parsed = LineCutsCollectionSchema.safeParse(raw);
    if (!parsed.success) {
      return { data: null, error: `Invalid line_cuts response: ${parsed.error.message}` };
    }
    return { data: parsed.data, error: null };
  } catch (err) {
    return { data: null, error: errMsg(err) };
  }
}

export async function updateLineCut(
  id: string,
  patch: Partial<{ text: string; done: boolean; sort_order: number }>,
): Promise<DirectusResult<LineCutsCollection>> {
  try {
    const raw = await getClient().request(updateItem('line_cuts', id, patch as never));
    const parsed = LineCutsCollectionSchema.safeParse(raw);
    if (!parsed.success) {
      return { data: null, error: `Invalid line_cuts response: ${parsed.error.message}` };
    }
    return { data: parsed.data, error: null };
  } catch (err) {
    return { data: null, error: errMsg(err) };
  }
}

export async function deleteLineCut(id: string): Promise<DirectusResult<void>> {
  try {
    await getClient().request(deleteItem('line_cuts', id));
    return { data: undefined, error: null };
  } catch (err) {
    return { data: null, error: errMsg(err) };
  }
}

export async function readLineWeighings(
  lineIds: string[],
): Promise<DirectusResult<LineWeighingsCollection[]>> {
  if (lineIds.length === 0) return { data: [], error: null };
  try {
    const raw = await getClient().request(
      readItems('line_weighings', {
        filter: { line_id: { _in: lineIds } } as never,
        sort: ['created_at'] as never,
        limit: -1,
      }),
    );
    const parsed = LineWeighingsCollectionArraySchema.safeParse(raw);
    if (!parsed.success) return { data: null, error: `Invalid line_weighings response: ${parsed.error.message}` };
    return { data: parsed.data, error: null };
  } catch (err) {
    return { data: null, error: errMsg(err) };
  }
}

export async function createLineWeighing(
  input: { line_id: string; weight?: number | null; photo_id?: string | null },
): Promise<DirectusResult<LineWeighingsCollection>> {
  try {
    const raw = await getClient().request(createItem('line_weighings', input as never));
    const parsed = LineWeighingsCollectionSchema.safeParse(raw);
    if (!parsed.success) return { data: null, error: `Invalid line_weighings response: ${parsed.error.message}` };
    return { data: parsed.data, error: null };
  } catch (err) {
    return { data: null, error: errMsg(err) };
  }
}

export async function updateLineWeighing(
  id: string,
  patch: Partial<{ weight: number | null; photo_id: string | null }>,
): Promise<DirectusResult<LineWeighingsCollection>> {
  try {
    const raw = await getClient().request(updateItem('line_weighings', id, patch as never));
    const parsed = LineWeighingsCollectionSchema.safeParse(raw);
    if (!parsed.success) return { data: null, error: `Invalid line_weighings response: ${parsed.error.message}` };
    return { data: parsed.data, error: null };
  } catch (err) {
    return { data: null, error: errMsg(err) };
  }
}

export async function deleteLineWeighing(id: string): Promise<DirectusResult<void>> {
  try {
    await getClient().request(deleteItem('line_weighings', id));
    return { data: undefined, error: null };
  } catch (err) {
    return { data: null, error: errMsg(err) };
  }
}

export async function readLinePhotos(
  lineIds: string[],
): Promise<DirectusResult<LinePhotosCollection[]>> {
  if (lineIds.length === 0) return { data: [], error: null };
  try {
    const raw = await getClient().request(
      readItems('line_photos', {
        filter: { line_id: { _in: lineIds } } as never,
        sort: ['sort_order'] as never,
        limit: -1,
      }),
    );
    const parsed = LinePhotosCollectionArraySchema.safeParse(raw);
    if (!parsed.success) return { data: null, error: `Invalid line_photos response: ${parsed.error.message}` };
    return { data: parsed.data, error: null };
  } catch (err) {
    return { data: null, error: errMsg(err) };
  }
}

export async function createLinePhoto(
  input: { line_id: string; photo_id: string; sort_order?: number },
): Promise<DirectusResult<LinePhotosCollection>> {
  try {
    const raw = await getClient().request(createItem('line_photos', input as never));
    const parsed = LinePhotosCollectionSchema.safeParse(raw);
    if (!parsed.success) return { data: null, error: `Invalid line_photos response: ${parsed.error.message}` };
    return { data: parsed.data, error: null };
  } catch (err) {
    return { data: null, error: errMsg(err) };
  }
}

export async function deleteLinePhoto(id: string): Promise<DirectusResult<void>> {
  try {
    await getClient().request(deleteItem('line_photos', id));
    return { data: undefined, error: null };
  } catch (err) {
    return { data: null, error: errMsg(err) };
  }
}

export async function readLineWeighingPhotos(
  weighingIds: string[],
): Promise<DirectusResult<LineWeighingPhotosCollection[]>> {
  if (weighingIds.length === 0) return { data: [], error: null };
  try {
    const raw = await getClient().request(
      readItems('line_weighing_photos', {
        filter: { weighing_id: { _in: weighingIds } } as never,
        sort: ['sort_order'] as never,
        limit: -1,
      }),
    );
    const parsed = LineWeighingPhotosCollectionArraySchema.safeParse(raw);
    if (!parsed.success) return { data: null, error: `Invalid line_weighing_photos response: ${parsed.error.message}` };
    return { data: parsed.data, error: null };
  } catch (err) {
    return { data: null, error: errMsg(err) };
  }
}

export async function createLineWeighingPhoto(
  input: { weighing_id: string; photo_id: string; sort_order?: number },
): Promise<DirectusResult<LineWeighingPhotosCollection>> {
  try {
    const raw = await getClient().request(createItem('line_weighing_photos', input as never));
    const parsed = LineWeighingPhotosCollectionSchema.safeParse(raw);
    if (!parsed.success) return { data: null, error: `Invalid line_weighing_photos response: ${parsed.error.message}` };
    return { data: parsed.data, error: null };
  } catch (err) {
    return { data: null, error: errMsg(err) };
  }
}

export async function deleteLineWeighingPhoto(id: string): Promise<DirectusResult<void>> {
  try {
    await getClient().request(deleteItem('line_weighing_photos', id));
    return { data: undefined, error: null };
  } catch (err) {
    return { data: null, error: errMsg(err) };
  }
}

/** Patch a product (e.g. toggle active/OOS). Roles: Warehouse, Admin, Owner. */
export async function updateProduct(
  id: string,
  patch: Record<string, unknown>,
): Promise<DirectusResult<ProductsCollection>> {
  try {
    const raw = await getClient().request(updateItem('products', id, patch as never));
    const parsed = ProductsCollectionSchema.safeParse(raw);
    if (!parsed.success) {
      return { data: null, error: `Invalid product response: ${parsed.error.message}` };
    }
    return { data: parsed.data, error: null };
  } catch (err) {
    return { data: null, error: errMsg(err) };
  }
}

/* ============================================================ Parse API === */

/**
 * The structured draft returned by the shared parsing service.
 * Mirrors the output shape of the server-side port of recognize.js.
 */
export interface ParsedOrderDraft {
  customerTyped: string | null;
  customerId: string | null;
  customerMatch: 'exact' | 'phone' | 'fuzzy' | 'new' | 'none' | null;
  company: string | null;
  deliver: string | null;
  dateGuessed: boolean;
  multiCustomer: boolean;
  paymentMethod: string | null;
  address: string | null;
  phone: string | null;
  ref: string | null;
  sales: string | null;
  lines: ParsedOrderLine[];
}

export interface ParsedOrderLine {
  raw: string;
  qty: number;
  unit: string;
  productId: string | null;
  name: string;
  status: 'recognized' | 'probable' | 'unrecognized';
  cuts: string[];
  price: string | null;
  learned: boolean;
}

/** Raw shape actually returned by order-api's /parse-order — nested customer/product
 *  objects, not the flat ids ParsedOrderDraft expects. Normalized below. */
interface RawParsedOrderLine {
  raw: string;
  qty: number;
  unit: string;
  product: { id: string; name: string } | null;
  status: 'recognized' | 'probable' | 'unrecognized';
  cuts: string[];
  price: number | string | null;
  learned: boolean;
}

interface RawParsedOrderDraft {
  customer: { id: string | null; name: string } | null;
  customerTyped: string | null;
  customerMatch: 'exact' | 'phone' | 'fuzzy' | 'new' | 'none' | null;
  deliver: string | null;
  dateGuessed: boolean;
  multiCustomer: boolean;
  paymentMethod: string | null;
  address: string | null;
  phone: string | null;
  ref: string | null;
  sales: string | null;
  company: string | null;
  lines: RawParsedOrderLine[];
}

export async function parseOrderText(
  text: string,
): Promise<DirectusResult<ParsedOrderDraft>> {
  try {
    const internalToken = import.meta.env.VITE_INTERNAL_TOKEN;
    const isDev = import.meta.env.DEV;
    const url = isDev ? '/order-api/parse-order' : `${import.meta.env.VITE_DIRECTUS_URL}/order-api/parse-order`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-token': internalToken ?? '',
      },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { data: null, error: `Parse API error ${res.status}: ${body}` };
    }
    const raw = (await res.json()) as RawParsedOrderDraft;

    const data: ParsedOrderDraft = {
      customerTyped: raw.customerTyped ?? raw.customer?.name ?? null,
      customerId: raw.customer?.id ?? null,
      customerMatch: raw.customerMatch,
      deliver: raw.deliver,
      dateGuessed: raw.dateGuessed,
      multiCustomer: raw.multiCustomer ?? false,
      paymentMethod: raw.paymentMethod,
      address: raw.address,
      phone: raw.phone,
      ref: raw.ref,
      sales: raw.sales,
      company: raw.company ?? null,
      lines: (raw.lines ?? []).map((l) => ({
        raw: l.raw,
        qty: l.qty,
        unit: l.unit,
        productId: l.product?.id ?? null,
        name: l.product?.name ?? l.raw,
        status: l.status,
        cuts: l.cuts ?? [],
        price: l.price != null ? String(l.price) : null,
        learned: l.learned ?? false,
      })),
    };

    return { data, error: null };
  } catch (err) {
    return { data: null, error: errMsg(err) };
  }
}



/* =========================================================== Corrections === */

/**
 * Upsert a learned correction into the Directus `corrections` table.
 * If a row with this token_key already exists, update product_id and increment
 * times_used. Otherwise create a new row.
 *
 * Called when Admin manually assigns a product to a parser-unrecognized line
 * so that future parses benefit from the correction globally.
 */
export async function upsertCorrection(
  tokenKey: string,
  productId: string,
): Promise<DirectusResult<CorrectionsCollection>> {
  try {
    // Check for existing correction with the same token_key
    const existing = (await getClient().request(
      readItems('corrections', {
        filter: { token_key: { _eq: tokenKey } } as never,
        limit: 1,
        fields: ['id', 'times_used'] as never,
      }),
    )) as Array<{ id: string; times_used: number | null }>;

    if (existing && existing.length > 0) {
      const row = existing[0];
      const raw = await getClient().request(
        updateItem('corrections', row.id, {
          product_id: productId,
          times_used: (row.times_used ?? 0) + 1,
        } as never),
      );
      const parsed = CorrectionsCollectionSchema.safeParse(raw);
      if (!parsed.success) {
        return { data: null, error: `Invalid corrections response: ${parsed.error.message}` };
      }
      return { data: parsed.data, error: null };
    }

    // Create new correction
    const raw = await getClient().request(
      createItem('corrections', {
        token_key: tokenKey,
        product_id: productId,
        times_used: 1,
      } as never),
    );
    const parsed = CorrectionsCollectionSchema.safeParse(raw);
    if (!parsed.success) {
      return { data: null, error: `Invalid corrections response: ${parsed.error.message}` };
    }
    return { data: parsed.data, error: null };
  } catch (err) {
    return { data: null, error: errMsg(err) };
  }
}

/* ============================================================ Customers CRUD === */

export async function createCustomer(
  input: Omit<CustomersCollection, 'id' | 'created_at' | 'updated_at'> & { id?: string },
): Promise<DirectusResult<CustomersCollection>> {
  try {
    const raw = await getClient().request(createItem('customers', input as never));
    const parsed = CustomersCollectionSchema.safeParse(raw);
    if (!parsed.success) {
      return { data: null, error: `Invalid customer response: ${parsed.error.message}` };
    }
    return { data: parsed.data, error: null };
  } catch (err) {
    return { data: null, error: errMsg(err) };
  }
}

export async function updateCustomer(
  id: string,
  patch: Partial<CustomersCollection>,
): Promise<DirectusResult<CustomersCollection>> {
  try {
    const raw = await getClient().request(updateItem('customers', id, patch as never));
    const parsed = CustomersCollectionSchema.safeParse(raw);
    if (!parsed.success) {
      return { data: null, error: `Invalid customer response: ${parsed.error.message}` };
    }
    return { data: parsed.data, error: null };
  } catch (err) {
    return { data: null, error: errMsg(err) };
  }
}

export async function deleteCustomer(id: string): Promise<DirectusResult<void>> {
  try {
    await getClient().request(deleteItem('customers', id));
    return { data: undefined, error: null };
  } catch (err) {
    return { data: null, error: errMsg(err) };
  }
}

/* ============================================================ Products CRUD === */

export async function createProduct(
  input: Omit<ProductsCollection, 'id' | 'created_at' | 'updated_at'> & { id?: string },
): Promise<DirectusResult<ProductsCollection>> {
  try {
    const raw = await getClient().request(createItem('products', input as never));
    const parsed = ProductsCollectionSchema.safeParse(raw);
    if (!parsed.success) {
      return { data: null, error: `Invalid product response: ${parsed.error.message}` };
    }
    return { data: parsed.data, error: null };
  } catch (err) {
    return { data: null, error: errMsg(err) };
  }
}

export async function deleteProduct(id: string): Promise<DirectusResult<void>> {
  try {
    await getClient().request(deleteItem('products', id));
    return { data: undefined, error: null };
  } catch (err) {
    return { data: null, error: errMsg(err) };
  }
}

/* ===== Static-token fallback (kept for early read-only wiring) ======== */

/**
 * If a static token is configured, expose a read-only `tokenClient` for paths
 * that have not migrated to login yet. Returns null when no token is set.
 */
export function getTokenClient() {
  return tokenClient;
}