import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Card } from "../../components/Card/Card";
import { Icon } from "../../components/Icon/Icon";
import { Button } from "../../components/Button/Button";
import { ChannelSelectModal } from "../../components/ChannelSelectModal/ChannelSelectModal";
import { IntakeModal } from "../../components/IntakeModal/IntakeModal";
import { OrderRows } from "../../components/OrderRows/OrderRows";
import { SortableTh } from "../../components/SortableTh/SortableTh";
import { useCan } from "../../hooks/useAuth";
import { useLanguage } from "../../hooks/useLanguage";
import { useOrders } from "../../hooks/useOrders";
import { PIPELINE_STAGES, RETURN_STAGES } from "../../lib/pipeline";
import type { OpenOrder } from "../../types/dashboard";
import type { ParsedOrderDraft } from "../../lib/directus";
import styles from "./Orders.module.css";

const STAGE_OPTIONS = [
  { key: "all", label: "All stages" },
  { key: "active", label: "In progress" },
  { key: "pending-docs", label: "Signed DO/SI not returned yet" },
  { key: "completed", label: "Completed" },
  { key: "late", label: "Past delivery date" },
  { key: "today", label: "New Today" },
  ...PIPELINE_STAGES.map((s) => ({ key: s.key, label: s.label })),
  { key: "outstanding", label: "Outstanding" },
  { key: "awaiting", label: "Awaiting stock" },
  ...RETURN_STAGES.map((s) => ({ key: s.key, label: s.label })),
  { key: "returned", label: "Returned" },
  { key: "cancelled", label: "Cancelled" },
];

/** Drives the table headline + empty-state copy based on the selected stage filter. */
const STAGE_COPY: Record<string, { headline: string; empty: string }> = {
  all: { headline: "All Orders", empty: "No orders." },
  active: { headline: "In Progress Orders", empty: "No in progress orders." },
  "pending-docs": {
    headline: "Signed DO/SI Not Returned Yet",
    empty: "No orders awaiting signed DO/SI.",
  },
  completed: { headline: "Completed Orders", empty: "No completed orders." },
  late: { headline: "Past Delivery Date", empty: "No overdue orders." },
  today: { headline: "New Orders Today", empty: "No orders created today." },
  intake: { headline: "New Orders", empty: "No new orders." },
  cold: {
    headline: "Cold Storage Picking",
    empty: "No orders in cold storage picking.",
  },
  finance: {
    headline: "Finance Review",
    empty: "No orders on finance review.",
  },
  production: { headline: "Processing", empty: "No orders in processing." },
  packing: { headline: "Packing", empty: "No orders in packing." },
  finalise: {
    headline: "Print DO/SI",
    empty: "No orders waiting to print DO/SI.",
  },
  dispatch: { headline: "Dispatched", empty: "No dispatched orders." },
  delivered: { headline: "Delivered", empty: "No delivered orders." },
  cancelled: { headline: "Cancelled", empty: "No cancelled orders." },
  returned: { headline: "Returned", empty: "No returned orders." },
  awaiting_return: {
    headline: "Awaiting Return",
    empty: "No orders awaiting return.",
  },
  admin_action: {
    headline: "Admin Action Required",
    empty: "No returns need admin action.",
  },
  awaiting_signed_doc: {
    headline: "Awaiting Signed DO/SI",
    empty: "No returns awaiting a signed DO/SI.",
  },
  replacement_transit: {
    headline: "Replacement in Transit",
    empty: "No replacements in transit.",
  },
  outstanding: { headline: "Outstanding", empty: "No outstanding orders." },
  awaiting: { headline: "Awaiting Stock", empty: "No orders awaiting stock." },
};

/** Full Orders page: searchable, stage-filtered list with expandable rows. */
export function Orders() {
  const navigate = useNavigate();
  const location = useLocation();
  const canCreateOrders = useCan()("createOrders");
  const { t } = useLanguage();

  // Stage + search are the single source of truth in the URL (not component
  // state) — so a dashboard deep-link, the stage dropdown, a bookmark, and
  // browser Back/Forward all stay in sync. Ported from the prototype's
  // `Dev-Orders.jsx:17` pattern (prototype-audit.md calls this out as the
  // strongest architectural idea in the prototype).
  const [searchParams, setSearchParams] = useSearchParams();
  const stage = searchParams.get("stage") || "all";
  const search = searchParams.get("search") || "";

  function setStage(next: string) {
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev);
      if (next === "all") params.delete("stage");
      else params.set("stage", next);
      return params;
    });
  }

  function setSearch(next: string) {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        if (next) params.set("search", next);
        else params.delete("search");
        return params;
      },
      // Every keystroke would otherwise push a new history entry.
      { replace: true },
    );
  }

  const [sortBy, setSortBy] = useState("no");
  const [stageOpen, setStageOpen] = useState(false);
  const stageDropdownRef = useRef<HTMLDivElement>(null);

  // "Items" has no backing DB column (it's a joined line count) — sorting it
  // is client-side, on just the current page, shadowing the server `sortBy`.
  const [itemsSort, setItemsSort] = useState<string | null>(null);
  const activeSort = itemsSort ?? sortBy;

  function handleSort(nextKey: string) {
    if (nextKey.replace(/^-/, "") === "items") {
      setItemsSort(nextKey);
      return;
    }
    setItemsSort(null);
    setSortBy(nextKey);
  }

  // Multi-step "Add New Order" flow: step 0: idle, step 1: channel selection, step 2: intake
  const [orderStep, setOrderStep] = useState<0 | 1 | 2>(0);

  function startNewOrder() {
    setOrderStep(1);
  }
  function closeAll() {
    setOrderStep(0);
  }
  function handleChannelSelect(_channel: "horeca") {
    void _channel;
    setOrderStep(2);
  }
  function handleParsed(
    draft: ParsedOrderDraft,
    rawText: string,
    attachments: File[],
  ) {
    setOrderStep(0);
    navigate("/orders/new", {
      state: { prefill: draft, rawText, attachments, from: location.pathname },
    });
  }

  const {
    orders = [],
    loading,
    error,
    total = 0,
    page = 1,
    pageSize = 20,
    setPage,
  } = useOrders(stage, search, sortBy);

  const displayOrders = itemsSort
    ? [...orders].sort((a, b) => {
        const diff = a.lines.length - b.lines.length;
        return itemsSort.startsWith("-") ? -diff : diff;
      })
    : orders;

  const stageCopy = STAGE_COPY[stage] ?? STAGE_COPY.all;

  useEffect(() => {
    if (!stageOpen) return;

    function handlePointerDown(event: MouseEvent) {
      if (!stageDropdownRef.current?.contains(event.target as Node)) {
        setStageOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setStageOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [stageOpen]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, totalPages);
  const rangeStart = total === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const rangeEnd = Math.min(currentPage * pageSize, total);

  return (
    <div className={styles.main}>
      <div className={styles.header}>
        <h1 className={styles.title}>{t("Orders")}</h1>
        <div className={styles.controls}>
          <div className={styles.dropdownWrapper} ref={stageDropdownRef}>
            <Button
              type="button"
              variant="secondary"
              icon="chevronDown"
              iconPosition="right"
              style={{
                width: "240px",
                justifyContent: "space-between",
              }}
              aria-expanded={stageOpen}
              onClick={() => setStageOpen((o) => !o)}
            >
              {t(STAGE_OPTIONS.find((o) => o.key === stage)?.label ||
                "All stages")}
            </Button>
            {stageOpen && (
              <div
                className={styles.dropdown}
                role="dialog"
                aria-label={t("Filter by stage")}
              >
                {STAGE_OPTIONS.map((opt) => (
                  <Button
                    key={opt.key}
                    type="button"
                    variant="ghost"
                    className={[
                      styles.dropdownItem,
                      stage === opt.key ? styles.dropdownItemActive : "",
                    ].join(" ")}
                    onClick={() => {
                      setStage(opt.key);
                      setStageOpen(false);
                      setPage(1);
                    }}
                  >
                    {t(opt.label)}
                  </Button>
                ))}
              </div>
            )}
          </div>

          <div className={styles.search}>
            <Icon name="search" size={18} className={styles.searchIcon} />
            <input
              type="search"
              className={styles.searchInput}
              placeholder={t("Search # or customer…")}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              aria-label={t("Search orders")}
            />
          </div>

          {canCreateOrders && (
            <Button
              variant="primary"
              size="md"
              onClick={startNewOrder}
              title={t("Create a new order")}
              icon="add"
            >
              {t("New Order")}
            </Button>
          )}
        </div>
      </div>

      <Card>
        <div className={styles.headerWrap}>
          <h3 className={styles.heading}>
            {t(stageCopy.headline)} <span className={styles.count}>{total}</span>
          </h3>
        </div>

        {loading ? (
          <div className={styles.muted}>{t("Loading orders…")}</div>
        ) : error ? (
          <div className={styles.error}>{error}</div>
        ) : orders.length === 0 ? (
          <div className={styles.muted}>{t(stageCopy.empty)}</div>
        ) : (
          <>
            <div style={{ overflowX: "auto" }}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th className={styles.arrowHead} aria-label={t("Expand")} />
                    <SortableTh label={t("Order ID")} sortKey="no" activeSort={activeSort} onSort={handleSort} />
                    <SortableTh label={t("Stage")} sortKey="stage" activeSort={activeSort} onSort={handleSort} />
                    <SortableTh label={t("Order Date")} sortKey="order_date" activeSort={activeSort} onSort={handleSort} />
                    <SortableTh label={t("Delivery Date")} sortKey="delivery_date" activeSort={activeSort} onSort={handleSort} />
                    <SortableTh label={t("Sales Rep")} sortKey="sales" activeSort={activeSort} onSort={handleSort} />
                    <SortableTh label={t("Customer")} sortKey="customer_name" activeSort={activeSort} onSort={handleSort} />
                    <SortableTh label={t("Items")} sortKey="items" activeSort={activeSort} onSort={handleSort} />
                  </tr>
                </thead>
                {displayOrders.map((order: OpenOrder) => (
                  <OrderRows key={order.id} order={order} />
                ))}
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
                  icon="chevronLeft"
                  iconOnly
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
                  icon="chevronRight"
                  iconOnly
                  onClick={() => setPage?.(currentPage + 1)}
                  disabled={currentPage >= totalPages}
                  aria-label={t("Next page")}
                />
              </div>
            </footer>
          </>
        )}
      </Card>

      <ChannelSelectModal
        open={orderStep === 1}
        onClose={closeAll}
        onSelect={handleChannelSelect}
      />

      <IntakeModal
        open={orderStep === 2}
        channel="horeca"
        onClose={closeAll}
        onParsed={handleParsed}
      />
    </div>
  );
}
