import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "../../components/Button/Button";
import { Icon } from "../../components/Icon/Icon";
import { Card } from "../../components/Card/Card";
import { SortableTh } from "../../components/SortableTh/SortableTh";
import { useLanguage } from "../../hooks/useLanguage";
import { useAuth } from "../../hooks/useAuth";
import { useDialog } from "../../hooks/useDialog";
import { useCorrections, type CorrectionRow } from "../../hooks/useCorrections";
import { readProducts } from "../../lib/directus";
import styles from "./LearnedMatches.module.css";

type SortKey =
  | "tokenKey"
  | "productName"
  | "createdBy"
  | "dateCreated"
  | "timesUsed";

/** Full-page, searchable/sortable table of every learned intake correction —
 *  reached from Settings' "Intake Learning" card ("View all matches"). Pulled
 *  out of Settings so the (potentially long) list has real room, matching the
 *  table-page layout already used by Customers/Products. */
export function LearnedMatches() {
  const { t } = useLanguage();
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const backTo =
    (location.state as { from?: string } | null)?.from ?? "/settings";
  const { confirm, alert } = useDialog();
  const isOwner = auth.role === "Owner";
  const { rows, loading, error, deletingIds, remove, update } =
    useCorrections();

  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<`${"" | "-"}${SortKey}`>("-timesUsed");

  const [products, setProducts] = useState<{ id: string; name: string }[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftToken, setDraftToken] = useState("");
  const [draftProductId, setDraftProductId] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOwner) return;
    let cancelled = false;
    readProducts({ fields: ["id", "name"], sort: ["name"], limit: -1 }).then(
      (res) => {
        if (!cancelled && res.data) setProducts(res.data);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [isOwner]);

  function handleSort(next: string) {
    setSortBy(next as `${"" | "-"}${SortKey}`);
  }

  function startEdit(row: CorrectionRow) {
    setEditingId(row.id);
    setDraftToken(row.tokenKey);
    setDraftProductId(row.productId);
  }

  function cancelEdit() {
    setEditingId(null);
  }

  async function saveEdit(row: CorrectionRow) {
    const token = draftToken.trim();
    if (!token || !draftProductId) {
      alert(t("Token and product are both required."), {
        title: t("Couldn't save match"),
      });
      return;
    }
    // upsertCorrection keys on an exact token_key match, so a duplicate would
    // leave one of the two rows unreachable.
    if (rows.some((r) => r.id !== row.id && r.tokenKey === token)) {
      alert(t('A learned match for "{token}" already exists.').replace("{token}", token), {
        title: t("Couldn't save match"),
      });
      return;
    }
    const productName =
      products.find((p) => p.id === draftProductId)?.name ?? draftProductId;
    setSaving(true);
    const res = await update(row.id, token, draftProductId, productName);
    setSaving(false);
    if (res.error) {
      alert(res.error, { title: t("Couldn't save match") });
      return;
    }
    setEditingId(null);
  }

  async function handleDelete(row: CorrectionRow) {
    if (
      !(await confirm(
        t('Forget the learned match "{token}" → {product}?')
          .replace("{token}", row.tokenKey)
          .replace("{product}", row.productName),
        { title: t("Remove learned match"), danger: true },
      ))
    )
      return;
    const res = await remove(row.id);
    if (res.error) {
      alert(res.error, { title: t("Couldn't remove match") });
    }
  }

  const displayRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = term
      ? rows.filter(
          (r) =>
            r.tokenKey.toLowerCase().includes(term) ||
            r.productName.toLowerCase().includes(term) ||
            r.createdBy.toLowerCase().includes(term),
        )
      : rows;

    const desc = sortBy.startsWith("-");
    const key = (desc ? sortBy.slice(1) : sortBy) as SortKey;
    const sorted = [...filtered].sort((a, b) => {
      const cmp =
        key === "timesUsed"
          ? a.timesUsed - b.timesUsed
          : key === "dateCreated"
            ? (a.dateCreated ?? "").localeCompare(b.dateCreated ?? "")
            : a[key].localeCompare(b[key]);
      return desc ? -cmp : cmp;
    });
    return sorted;
  }, [rows, search, sortBy]);

  const colCount = isOwner ? 6 : 5;

  return (
    <main className={styles.main}>
      <div className={styles.sectionsContainer}>
        <header className={styles.header}>
          <div className={styles.topActionsRow}>
            <Button
              type="button"
              variant="tertiary"
              icon="chevronLeft"
              className={styles.back}
              onClick={() => navigate(backTo)}
            >
              {t("Back")}
            </Button>
            <div className={styles.search}>
              <Icon name="search" size={16} className={styles.searchIcon} />
              <input
                type="search"
                placeholder={t("Search token, product, added by…")}
                className={styles.searchInput}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
          <div className={styles.titleRow}>
            <h1 className={styles.title}>{t("Learned Matches")}</h1>
            {!loading && <span className={styles.count}>{rows.length}</span>}
          </div>
        </header>

        <Card>
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <colgroup>
                <col className={styles.colToken} />
                <col className={styles.colProduct} />
                <col className={styles.colAddedBy} />
                <col className={styles.colDate} />
                <col className={styles.colUses} />
                {isOwner && <col className={styles.colActions} />}
              </colgroup>
              <thead>
                <tr>
                  <SortableTh
                    label={t("Token")}
                    sortKey="tokenKey"
                    activeSort={sortBy}
                    onSort={handleSort}
                    className={styles.th}
                  />
                  <SortableTh
                    label={t("Product")}
                    sortKey="productName"
                    activeSort={sortBy}
                    onSort={handleSort}
                    className={styles.th}
                  />
                  <SortableTh
                    label={t("Added by")}
                    sortKey="createdBy"
                    activeSort={sortBy}
                    onSort={handleSort}
                    className={styles.th}
                  />
                  <SortableTh
                    label={t("Date")}
                    sortKey="dateCreated"
                    activeSort={sortBy}
                    onSort={handleSort}
                    className={styles.th}
                  />
                  <SortableTh
                    label={t("Uses")}
                    sortKey="timesUsed"
                    activeSort={sortBy}
                    onSort={handleSort}
                    className={styles.th}
                  />
                  {isOwner && (
                    <th className={`${styles.th} ${styles.actionsCell}`} />
                  )}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr className={styles.stateRow}>
                    <td colSpan={colCount}>{t("Loading learned matches…")}</td>
                  </tr>
                ) : error ? (
                  <tr className={styles.stateRow}>
                    <td colSpan={colCount}>{error}</td>
                  </tr>
                ) : displayRows.length === 0 ? (
                  <tr className={styles.stateRow}>
                    <td colSpan={colCount}>{t("No learned matches yet.")}</td>
                  </tr>
                ) : (
                  displayRows.map((row) => {
                    const isEditing = editingId === row.id;
                    const locked = editingId !== null && !isEditing;
                    return (
                      <tr className={styles.tr} key={row.id}>
                        <td className={styles.td} title={row.tokenKey}>
                          {isEditing ? (
                            <input
                              type="text"
                              className={styles.editInput}
                              value={draftToken}
                              onChange={(e) => setDraftToken(e.target.value)}
                              disabled={saving}
                              aria-label={t("Token")}
                              autoFocus
                            />
                          ) : (
                            <span className={styles.token}>
                              "{row.tokenKey}"
                            </span>
                          )}
                        </td>
                        <td className={styles.td} title={row.productName}>
                          {isEditing ? (
                            <select
                              className={styles.editInput}
                              value={draftProductId}
                              onChange={(e) =>
                                setDraftProductId(e.target.value)
                              }
                              disabled={saving}
                              aria-label={t("Product")}
                            >
                              {!products.some(
                                (p) => p.id === draftProductId,
                              ) && (
                                <option value={draftProductId}>
                                  {row.productName}
                                </option>
                              )}
                              {products.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.name}
                                </option>
                              ))}
                            </select>
                          ) : (
                            row.productName
                          )}
                        </td>
                        <td className={styles.td} title={row.createdBy}>
                          {row.createdBy}
                        </td>
                        <td className={styles.td}>
                          {row.dateCreated
                            ? new Date(row.dateCreated).toLocaleDateString(
                                "en-US",
                              )
                            : "—"}
                        </td>
                        <td className={styles.td}>
                          {row.timesUsed}{" "}
                          {row.timesUsed === 1 ? t("use") : t("uses")}
                        </td>
                        {isOwner && (
                          <td className={`${styles.td} ${styles.actionsCell}`}>
                            <div className={styles.rowActions}>
                              {isEditing ? (
                                <>
                                  <Button
                                    type="button"
                                    variant="primary"
                                    size="sm"
                                    iconOnly
                                    icon="save"
                                    title={t("Save")}
                                    disabled={saving}
                                    onClick={() => saveEdit(row)}
                                  />
                                  <Button
                                    type="button"
                                    variant="tertiary"
                                    size="sm"
                                    iconOnly
                                    icon="close"
                                    title={t("Cancel")}
                                    disabled={saving}
                                    onClick={cancelEdit}
                                  />
                                </>
                              ) : (
                                <>
                                  <Button
                                    type="button"
                                    variant="tertiary"
                                    size="sm"
                                    iconOnly
                                    icon="edit"
                                    title={t("Edit learned match")}
                                    disabled={
                                      locked || deletingIds.has(row.id)
                                    }
                                    onClick={() => startEdit(row)}
                                  />
                                  <Button
                                    type="button"
                                    variant="tertiary"
                                    size="sm"
                                    iconOnly
                                    icon="trash"
                                    title={t("Remove learned match")}
                                    disabled={
                                      locked || deletingIds.has(row.id)
                                    }
                                    onClick={() => handleDelete(row)}
                                  />
                                </>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </main>
  );
}
