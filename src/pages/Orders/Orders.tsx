import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Card } from "../../components/Card/Card";
import { Icon } from "../../components/Icon/Icon";
import { Button } from "../../components/Button/Button";
import { ChannelSelectModal } from "../../components/ChannelSelectModal/ChannelSelectModal";
import { IntakeModal } from "../../components/IntakeModal/IntakeModal";
import { OrderRows } from "../../components/OrderRows/OrderRows";
import { useCan } from "../../hooks/useAuth";
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
  ...PIPELINE_STAGES.map((s) => ({ key: s.key, label: s.label })),
  { key: "outstanding", label: "Outstanding" },
  { key: "awaiting", label: "Awaiting stock" },
  ...RETURN_STAGES.map((s) => ({ key: s.key, label: s.label })),
  { key: "returned", label: "Returned" },
  { key: "cancelled", label: "Cancelled" },
];

const SORT_OPTIONS = [
  { key: "-order_id", label: "Order ID (Desc)" },
  { key: "order_id", label: "Order ID (Asc)" },
  { key: "-delivery_date", label: "Delivery Date (Desc)" },
  { key: "delivery_date", label: "Delivery Date (Asc)" },
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
  outstanding: { headline: "Outstanding", empty: "No outstanding orders." },
  awaiting: { headline: "Awaiting Stock", empty: "No orders awaiting stock." },
};

/** Full Orders page: searchable, stage-filtered list with expandable rows. */
export function Orders() {
  const navigate = useNavigate();
  const location = useLocation();
  const canCreateOrders = useCan()("createOrders");

  const [stage, setStage] = useState(location.state?.stage || "all");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("-order_id");
  const [stageOpen, setStageOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const stageDropdownRef = useRef<HTMLDivElement>(null);
  const sortDropdownRef = useRef<HTMLDivElement>(null);

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
      state: { prefill: draft, rawText, attachments },
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

  useEffect(() => {
    if (!sortOpen) return;

    function handlePointerDown(event: MouseEvent) {
      if (!sortDropdownRef.current?.contains(event.target as Node)) {
        setSortOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setSortOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [sortOpen]);

  const [prevLocKey, setPrevLocKey] = useState(location.key);
  if (location.key !== prevLocKey) {
    setPrevLocKey(location.key);
    setStage(location.state?.stage || "all");
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, totalPages);
  const rangeStart = total === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const rangeEnd = Math.min(currentPage * pageSize, total);

  return (
    <div className={styles.main}>
      <div className={styles.header}>
        <h1 className={styles.title}>Orders</h1>
        <div className={styles.controls}>
          <div className={styles.dropdownWrapper} ref={stageDropdownRef}>
            <Button
              type="button"
              variant="secondary"
              icon="chevronDown"
              iconPosition="right"
              aria-expanded={stageOpen}
              onClick={() => setStageOpen((o) => !o)}
            >
              {STAGE_OPTIONS.find((o) => o.key === stage)?.label ||
                "All stages"}
            </Button>
            {stageOpen && (
              <div
                className={styles.dropdown}
                role="dialog"
                aria-label="Filter by stage"
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
                    {opt.label}
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
              placeholder="Search # or customer…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              aria-label="Search orders"
            />
          </div>

          {canCreateOrders && (
            <Button
              variant="primary"
              size="md"
              onClick={startNewOrder}
              title="Create a new order"
              icon="add"
            >
              New Order
            </Button>
          )}
        </div>
      </div>

      <Card>
        <div className={styles.headerWrap}>
          <h3 className={styles.heading}>
            {stageCopy.headline} <span className={styles.count}>{total}</span>
          </h3>
          <div className={styles.sortContainer} ref={sortDropdownRef}>
            <Button
              type="button"
              variant="secondary"
              icon="chevronDown"
              iconPosition="right"
              aria-expanded={sortOpen}
              isActive={sortOpen}
              onClick={() => setSortOpen((o) => !o)}
            >
              <span>
                {SORT_OPTIONS.find((o) => o.key === sortBy)?.label ||
                  "Order ID (Desc)"}
              </span>
            </Button>
            {sortOpen && (
              <div
                className={styles.dropdown}
                role="dialog"
                aria-label="Sort options"
              >
                {SORT_OPTIONS.map((opt) => (
                  <Button
                    key={opt.key}
                    type="button"
                    variant="ghost"
                    className={[
                      styles.dropdownItem,
                      sortBy === opt.key ? styles.dropdownItemActive : "",
                    ].join(" ")}
                    onClick={() => {
                      setSortBy(opt.key);
                      setSortOpen(false);
                    }}
                  >
                    {opt.label}
                  </Button>
                ))}
              </div>
            )}
          </div>
        </div>

        {loading ? (
          <div className={styles.muted}>Loading orders…</div>
        ) : error ? (
          <div className={styles.error}>{error}</div>
        ) : orders.length === 0 ? (
          <div className={styles.muted}>{stageCopy.empty}</div>
        ) : (
          <>
            <div style={{ overflowX: "auto" }}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th className={styles.arrowHead} aria-label="Expand" />
                    <th style={{ textAlign: "left" }}>Order ID</th>
                    <th style={{ textAlign: "left" }}>Stage</th>
                    <th style={{ textAlign: "left" }}>Order Date</th>
                    <th style={{ textAlign: "left" }}>Delivery Date</th>
                    <th style={{ textAlign: "left" }}>Sales Rep</th>
                    <th style={{ textAlign: "left" }}>Customer</th>
                    <th style={{ textAlign: "left" }}>Items</th>
                  </tr>
                </thead>
                {orders.map((order: OpenOrder) => (
                  <OrderRows key={order.id} order={order} />
                ))}
              </table>
            </div>

            <footer className={styles.pagination}>
              <span className={styles.pageInfo}>
                Showing {rangeStart}–{rangeEnd} of {total}
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
                  aria-label="Previous page"
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
                  aria-label="Next page"
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
