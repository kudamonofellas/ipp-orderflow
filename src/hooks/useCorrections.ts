/**
 * Data hook for the Owner Settings "Intake Learning" review list — the
 * intake parser's learned `token_key -> product_id` corrections, resolved to
 * a display-friendly product name and creator name for the review table.
 */

import { useEffect, useState } from "react";
import {
  readCorrections,
  deleteCorrection,
  readProducts,
  readAllUsers,
} from "../lib/directus";

export interface CorrectionRow {
  id: string;
  tokenKey: string;
  productName: string;
  timesUsed: number;
  createdBy: string;
  dateCreated: string | null;
}

interface UseCorrectionsResult {
  rows: CorrectionRow[];
  loading: boolean;
  error: string | null;
  deletingIds: Set<string>;
  remove: (id: string) => Promise<{ error: string | null }>;
  reload: () => void;
}

export function useCorrections(): UseCorrectionsResult {
  const [rows, setRows] = useState<CorrectionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(() => new Set());
  const [nonce, setNonce] = useState(0);

  const reload = () => setNonce((n) => n + 1);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      const correctionsRes = await readCorrections();
      if (cancelled) return;
      if (correctionsRes.error) {
        setError(`Failed to load corrections: ${correctionsRes.error}`);
        setLoading(false);
        return;
      }
      const corrections = correctionsRes.data ?? [];
      if (corrections.length === 0) {
        setRows([]);
        setLoading(false);
        return;
      }

      const productIds = [...new Set(corrections.map((c) => c.product_id).filter(Boolean))];
      const [productsRes, usersRes] = await Promise.all([
        productIds.length === 0
          ? Promise.resolve({ data: [], error: null })
          : readProducts({
              filter: { id: { _in: productIds } },
              fields: ["id", "name"],
              limit: -1,
            }),
        readAllUsers(),
      ]);
      if (cancelled) return;

      const nameByProductId = new Map((productsRes.data ?? []).map((p) => [p.id, p.name]));
      const nameByUserId = new Map(
        (usersRes.data ?? []).map((u) => [
          u.id,
          `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim() || u.email || u.id,
        ]),
      );

      const built: CorrectionRow[] = corrections.map((c) => ({
        id: c.id,
        tokenKey: c.token_key,
        productName: nameByProductId.get(c.product_id) ?? c.product_id,
        timesUsed: c.times_used ?? 0,
        createdBy: c.created_by ? (nameByUserId.get(c.created_by) ?? c.created_by) : "—",
        dateCreated: c.date_created ?? null,
      }));

      setRows(built);
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [nonce]);

  async function remove(id: string): Promise<{ error: string | null }> {
    setDeletingIds((prev) => new Set(prev).add(id));
    const res = await deleteCorrection(id);
    setDeletingIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    if (res.error) return { error: res.error };
    setRows((prev) => prev.filter((r) => r.id !== id));
    return { error: null };
  }

  return { rows, loading, error, deletingIds, remove, reload };
}
