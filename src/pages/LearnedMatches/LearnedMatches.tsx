import { useMemo, useState } from "react";
import { Button } from "../../components/Button/Button";
import { Icon } from "../../components/Icon/Icon";
import { Card } from "../../components/Card/Card";
import { SortableTh } from "../../components/SortableTh/SortableTh";
import { useLanguage } from "../../hooks/useLanguage";
import { useAuth } from "../../hooks/useAuth";
import { useDialog } from "../../hooks/useDialog";
import { useCorrections, type CorrectionRow } from "../../hooks/useCorrections";
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
  const { confirm, alert } = useDialog();
  const canManageSettings = auth.can("manageSettings");
  const { rows, loading, error, deletingIds, remove } = useCorrections();

  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<`${"" | "-"}${SortKey}`>("-timesUsed");

  function handleSort(next: string) {
    setSortBy(next as `${"" | "-"}${SortKey}`);
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

  return (
    <main className={styles.main}>
      <div className={styles.header}>
        <h1 className={styles.title}>{t("Learned Matches")}</h1>
        {!loading && <span className={styles.count}>{rows.length}</span>}

        <div className={styles.controls}>
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
      </div>

      <Card>
        <table className={styles.table}>
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
              {canManageSettings && <th className={styles.th} />}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr className={styles.stateRow}>
                <td colSpan={canManageSettings ? 6 : 5}>
                  {t("Loading learned matches…")}
                </td>
              </tr>
            ) : error ? (
              <tr className={styles.stateRow}>
                <td colSpan={canManageSettings ? 6 : 5}>{error}</td>
              </tr>
            ) : displayRows.length === 0 ? (
              <tr className={styles.stateRow}>
                <td colSpan={canManageSettings ? 6 : 5}>
                  {t("No learned matches yet.")}
                </td>
              </tr>
            ) : (
              displayRows.map((row) => (
                <tr className={styles.tr} key={row.id}>
                  <td className={styles.td}>
                    <span className={styles.token}>"{row.tokenKey}"</span>
                  </td>
                  <td className={styles.td}>{row.productName}</td>
                  <td className={styles.td}>{row.createdBy}</td>
                  <td className={styles.td}>
                    {row.dateCreated
                      ? new Date(row.dateCreated).toLocaleDateString("en-US")
                      : "—"}
                  </td>
                  <td className={styles.td}>
                    {row.timesUsed} {row.timesUsed === 1 ? t("use") : t("uses")}
                  </td>
                  {canManageSettings && (
                    <td className={styles.td}>
                      <Button
                        type="button"
                        variant="tertiary"
                        size="sm"
                        iconOnly
                        icon="trash"
                        title={t("Remove learned match")}
                        disabled={deletingIds.has(row.id)}
                        onClick={() => handleDelete(row)}
                      />
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>
    </main>
  );
}
