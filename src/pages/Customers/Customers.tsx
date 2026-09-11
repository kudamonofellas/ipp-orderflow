import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "../../components/Button/Button";
import { Icon } from "../../components/Icon/Icon";
import { useAuth } from "../../hooks/useAuth";
import { useLanguage } from "../../hooks/useLanguage";
import { Avatar } from "../../components/Avatar/Avatar";
import { SortableTh } from "../../components/SortableTh/SortableTh";
import { getInitials } from "../../lib/initials";
import {
  readCustomers,
  aggregateCustomers,
  createCustomer,
  updateCustomer,
} from "../../lib/directus";
import { customersToCSV, parseCustomerCSV, downloadText } from "../../lib/csv";
import type { CustomersCollection } from "../../types/directus";
import styles from "./Customers.module.css";

const PAGE_SIZE = 20;

/** Customers list page: searchable table of all customer records. */
export function Customers() {
  const navigate = useNavigate();
  const auth = useAuth();
  const { t } = useLanguage();
  const canManage = auth.can("manage_customers");
  const canView = auth.can("browseCustomers");
  // Exporting customers dumps their contacts/addresses — gate it on
  // contact-visibility too, not just exportCSV (matches the prototype's
  // combined `exportCSV && seeCustomerContact` check).
  const canExport = auth.can("exportCSV") && auth.can("seeCustomerContact");
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  // Defence-in-depth: the route is already wrapped in <Guarded cap="browseCustomers">
  // (App.tsx), but this survives even if that wrapper is ever dropped in a
  // refactor — same self-guard pattern as ProductEdit.tsx.
  useEffect(() => {
    if (!canView) navigate("/", { replace: true });
  }, [canView, navigate]);

  const [customers, setCustomers] = useState<CustomersCollection[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  // Sort lives in the URL (?sort=...), same as Orders.tsx — so it survives
  // Back navigation from a customer's detail page.
  const [searchParams, setSearchParams] = useSearchParams();
  const sortBy = searchParams.get("sort") || "name";
  function setSortBy(next: string) {
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev);
      if (next === "name") params.delete("sort");
      else params.set("sort", next);
      return params;
    });
  }
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);

      const filter: Record<string, unknown> = {};
      if (search.trim()) {
        filter["_or"] = [
          { name: { _icontains: search.trim() } },
          { company_name: { _icontains: search.trim() } },
          { contact: { _icontains: search.trim() } },
          { area: { _icontains: search.trim() } },
        ];
      }

      const [dataRes, countRes] = await Promise.all([
        readCustomers({
          filter,
          limit: PAGE_SIZE,
          offset: (page - 1) * PAGE_SIZE,
          sort: [sortBy],
          fields: [
            "id",
            "name",
            "company_name",
            "channel",
            "contact",
            "area",
            "pay_method",
            "term_days",
          ],
        }),
        aggregateCustomers({
          aggregate: { count: "*" },
          ...(Object.keys(filter).length ? { query: { filter } } : {}),
        }),
      ]);

      if (dataRes.error) {
        setError(dataRes.error);
      } else {
        setCustomers(dataRes.data ?? []);
        if (countRes.error) {
          // Count failed independently of the data fetch — don't block the
          // list from rendering, but don't silently claim a total of 0 either.
          console.warn("Failed to fetch customer count:", countRes.error);
          setTotal(dataRes.data?.length ?? 0);
        } else {
          const countValue = Number(countRes.data?.[0]?.count ?? 0);
          setTotal(Number.isNaN(countValue) ? 0 : countValue);
        }
      }
      setLoading(false);
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(load, search ? 300 : 0);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search, page, sortBy, refreshNonce]);

  async function handleExport() {
    setExporting(true);
    const res = await readCustomers({
      limit: -1,
      fields: [
        "id",
        "name",
        "company_name",
        "area",
        "contact",
        "address",
        "sales",
        "pay_timing",
        "pay_method",
        "term_days",
        "credit_limit",
      ],
    });
    setExporting(false);
    if (res.error || !res.data) {
      window.alert(`Failed to export: ${res.error}`);
      return;
    }
    downloadText(
      `ipp-customers-${new Date().toISOString().slice(0, 10)}.csv`,
      customersToCSV(res.data),
    );
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const text = await file.text();
      const existingRes = await readCustomers({ limit: -1 });
      if (existingRes.error || !existingRes.data) {
        window.alert(
          `Couldn't read the current customer list: ${existingRes.error}`,
        );
        return;
      }
      const rows = parseCustomerCSV(text, existingRes.data);
      let created = 0;
      let updated = 0;
      let failed = 0;
      for (const row of rows) {
        const res = row.id
          ? await updateCustomer(row.id, row.patch)
          : await createCustomer(row.patch);
        if (res.error) failed++;
        else if (row.id) updated++;
        else created++;
      }
      window.alert(
        `Imported · ${rows.length} customers (${created} new, ${updated} updated${failed > 0 ? `, ${failed} failed` : ""})`,
      );
      setRefreshNonce((n) => n + 1);
    } catch {
      window.alert("Couldn't read that CSV file.");
    } finally {
      setImporting(false);
      e.target.value = "";
    }
  }

  // Reset to page 1 when search changes
  const handleSearch = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  const handleSort = (next: string) => {
    setSortBy(next);
    setPage(1);
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const rangeStart = total === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(currentPage * PAGE_SIZE, total);

  return (
    <main className={styles.main}>
      <div className={styles.sectionsContainer}>
        <div className={styles.header}>
          <div className={styles.titleSection}>
            <h2 className={styles.title}>{t("Customers")}</h2>

            {!loading && (
              <span className={styles.count}>{total.toLocaleString()}</span>
            )}
          </div>
          <div className={styles.controls}>
            <div className={styles.search}>
              <Icon name="search" size={16} className={styles.searchIcon} />
              <input
                id="customers-search"
                type="search"
                placeholder={t("Search name, company, area…")}
                className={styles.searchInput}
                value={search}
                onChange={(e) => handleSearch(e.target.value)}
              />
            </div>
            <div className={styles.exportImportRow}>
              {canExport && (
                <Button
                  type="button"
                  variant="secondary"
                  icon="download"
                  className={styles.halfButton}
                  onClick={handleExport}
                  disabled={exporting}
                >
                  {exporting ? t("Exporting…") : t("Export")}
                </Button>
              )}
              {canManage && (
                <Button
                  type="button"
                  variant="secondary"
                  icon="upload"
                  className={styles.halfButton}
                  onClick={() => importInputRef.current?.click()}
                  disabled={importing}
                >
                  {importing ? t("Importing…") : t("Import")}
                </Button>
              )}
              <input
                ref={importInputRef}
                type="file"
                accept=".csv,text/csv"
                style={{ display: "none" }}
                onChange={handleImportFile}
              />
            </div>
            {canManage && (
              <Button
                type="button"
                variant="primary"
                icon="add"
                className={styles.newCustomerButton}
                onClick={() => navigate("/customers/new")}
              >
                {t("New Customer")}
              </Button>
            )}
          </div>
        </div>

        <div className={styles.tableWrapper}>
          <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <SortableTh
                  label={t("Name / Company")}
                  sortKey="name"
                  activeSort={sortBy}
                  onSort={handleSort}
                  className={`${styles.th} ${styles.colName}`}
                />
                <SortableTh
                  label={t("Channel")}
                  sortKey="channel"
                  activeSort={sortBy}
                  onSort={handleSort}
                  className={`${styles.th} ${styles.colChannel}`}
                />
                <th className={`${styles.th} ${styles.colContact}`}>
                  {t("Contact")}
                </th>
                <SortableTh
                  label={t("Area")}
                  sortKey="area"
                  activeSort={sortBy}
                  onSort={handleSort}
                  className={`${styles.th} ${styles.colArea}`}
                />
                <SortableTh
                  label={t("Payment")}
                  sortKey="pay_method"
                  activeSort={sortBy}
                  onSort={handleSort}
                  className={`${styles.th} ${styles.colPayment}`}
                />
                <SortableTh
                  label={t("Term")}
                  sortKey="term_days"
                  activeSort={sortBy}
                  onSort={handleSort}
                  className={`${styles.th} ${styles.colTerm}`}
                />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr className={styles.stateRow}>
                  <td colSpan={6}>{t("Loading customers…")}</td>
                </tr>
              ) : error ? (
                <tr className={styles.stateRow}>
                  <td colSpan={6}>Error: {error}</td>
                </tr>
              ) : customers.length === 0 ? (
                <tr className={styles.stateRow}>
                  <td colSpan={6}>{t("No customers found")}</td>
                </tr>
              ) : (
                customers.map((c) => (
                  <tr
                    className={`${styles.orderRow} ${styles.clickable}`}
                    key={c.id}
                    onClick={() => navigate(`/customers/${c.id}`)}
                  >
                    <td className={`${styles.td} ${styles.colName}`}>
                      <div className={styles.nameCell}>
                        <Avatar
                          initials={getInitials(c.name) || "??"}
                          label={c.name || ""}
                          size="md"
                        />

                        <span
                          style={{ display: "flex", flexDirection: "column" }}
                        >
                          <span className={styles.name}>{c.name}</span>
                          {c.company_name && (
                            <span className={styles.company}>
                              {c.company_name}
                            </span>
                          )}
                        </span>
                      </div>
                    </td>
                    <td className={`${styles.td} ${styles.colChannel}`}>
                      {c.channel ? (
                        <span
                          className={styles.channelPill}
                          data-channel={c.channel}
                        >
                          {c.channel}
                        </span>
                      ) : (
                        <span className={styles.channelPill}>—</span>
                      )}
                    </td>
                    <td className={`${styles.td} ${styles.colContact}`}>
                      {c.contact ?? "—"}
                    </td>
                    <td className={`${styles.td} ${styles.colArea}`}>
                      {c.area ?? "—"}
                    </td>
                    <td className={`${styles.td} ${styles.colPayment}`}>
                      {c.pay_method ?? "—"}
                    </td>
                    <td className={`${styles.td} ${styles.colTerm}`}>
                      {c.term_days != null ? `${c.term_days}d` : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          </div>

          <footer className={styles.pagination}>
            <span className={styles.pageInfo}>
              {t("Showing")} {rangeStart}–{rangeEnd} {t("of")} {total}
            </span>
            <div className={styles.pageControls}>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                iconOnly
                icon="chevronLeft"
                onClick={() => setPage?.(currentPage - 1)}
                disabled={currentPage <= 1}
                aria-label={t("Previous page")}
              />
              <span className={styles.pageIndicator}>
                {currentPage} / {totalPages}
              </span>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                iconOnly
                icon="chevronRight"
                onClick={() => setPage?.(currentPage + 1)}
                disabled={currentPage >= totalPages}
                aria-label={t("Next page")}
              />
            </div>
          </footer>
        </div>
      </div>
    </main>
  );
}
