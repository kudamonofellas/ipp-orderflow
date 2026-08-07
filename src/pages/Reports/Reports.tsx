import { useState } from "react";
import { Card } from "../../components/Card/Card";
import { Icon } from "../../components/Icon/Icon";
import { Button } from "../../components/Button/Button";
import { StatCard } from "../../components/StatCard/StatCard";
import { useReports, type ReportRange, type ReportRangeType } from "../../hooks/useReports";
import type { IconName } from "../../components/Icon/icons";
import styles from "./Reports.module.css";

const RANGE_OPTIONS: { key: ReportRangeType; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "30d", label: "30 days" },
  { key: "90d", label: "90 days" },
  { key: "all", label: "All" },
  { key: "month", label: "Month" },
  { key: "range", label: "Range" },
];

const UNIT_ICONS: Record<string, IconName> = {
  kg: "weight",
  gram: "weight",
  loaf: "loaf",
  box: "box",
  pack: "pack",
  pcs: "pack",
  ekor: "pack",
};

const UNIT_LABELS: Record<string, string> = {
  kg: "Sold by kg",
  gram: "Sold by gram",
  loaf: "Sold by loaf",
  box: "Sold by box",
  pack: "Sold by pack",
  pcs: "Sold by pcs",
  ekor: "Sold by ekor",
};

const numberFmt = new Intl.NumberFormat("en-US");

/** Full Reports page — order stats, fulfillment, receivables, volume, and demand, per date range. */
export function Reports() {
  const [range, setRange] = useState<ReportRange>({ type: "30d" });
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerSort, setCustomerSort] = useState<"orders" | "weighedKg">("orders");
  const [sortOpen, setSortOpen] = useState(false);

  const {
    loading,
    error,
    totalOrders,
    delivered,
    returned,
    cancelled,
    onTime,
    fulfillment,
    weightVariance,
    termsOutstanding,
    termsOverdue,
    customerVolume,
    productDemand,
  } = useReports(range);

  const cleanPct = fulfillment.total === 0 ? 0 : Math.round((fulfillment.clean / fulfillment.total) * 100);
  const closeShortPct =
    fulfillment.total === 0 ? 0 : Math.round((fulfillment.closeShort / fulfillment.total) * 100);
  const backOrderedPct =
    fulfillment.total === 0 ? 0 : Math.round((fulfillment.backOrdered / fulfillment.total) * 100);
  const donutGradient = `conic-gradient(var(--accent-primary) 0% ${cleanPct}%, var(--state-warning) ${cleanPct}% ${cleanPct + closeShortPct}%, var(--state-success) ${cleanPct + closeShortPct}% 100%)`;

  const filteredCustomers = customerVolume
    .filter((c) => c.customerName.toLowerCase().includes(customerSearch.trim().toLowerCase()))
    .sort((a, b) => b[customerSort] - a[customerSort]);
  const maxOrders = Math.max(1, ...filteredCustomers.map((c) => c.orders));
  const maxWeighedKg = Math.max(1, ...filteredCustomers.map((c) => c.weighedKg));

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>Reports</h1>

      <div className={styles.rangeRow}>
        {RANGE_OPTIONS.map((opt) => (
          <Button
            key={opt.key}
            type="button"
            variant={range.type === opt.key ? "primary" : "secondary"}
            size="sm"
            onClick={() => {
              if (opt.key === "month") setRange({ type: "month", month: range.month ?? "" });
              else if (opt.key === "range") setRange({ type: "range", from: range.from ?? "", to: range.to ?? "" });
              else setRange({ type: opt.key });
            }}
          >
            {opt.label}
          </Button>
        ))}
        {range.type === "month" && (
          <input
            type="month"
            className={styles.inlinePicker}
            value={range.month ?? ""}
            onChange={(e) => setRange({ type: "month", month: e.target.value })}
            aria-label="Select month"
          />
        )}
        {range.type === "range" && (
          <>
            <input
              type="date"
              className={styles.inlinePicker}
              value={range.from ?? ""}
              onChange={(e) => setRange({ type: "range", from: e.target.value, to: range.to })}
              aria-label="Range start"
            />
            <input
              type="date"
              className={styles.inlinePicker}
              value={range.to ?? ""}
              onChange={(e) => setRange({ type: "range", from: range.from, to: e.target.value })}
              aria-label="Range end"
            />
          </>
        )}
      </div>

      {loading ? (
        <div className={styles.muted}>Loading reports…</div>
      ) : error ? (
        <div className={styles.error}>{error}</div>
      ) : (
        <>
          <div className={styles.statsRow}>
            <StatCard value={numberFmt.format(totalOrders)} label="Total Orders" />
            <StatCard value={numberFmt.format(delivered)} label="Delivered" />
            <StatCard value={numberFmt.format(returned)} label="Returned" />
            <StatCard value={numberFmt.format(cancelled)} label="Canceled" />
          </div>

          <div className={styles.twoCol}>
            <Card>
              <h3 className={styles.cardHeading}>On-time Delivery</h3>
              {onTime === null ? (
                <p className={styles.noData}>No data in this period</p>
              ) : (
                <div className={styles.onTimeStat}>
                  <span className={styles.onTimeValue}>
                    {Math.round((onTime.onTimeCount / (onTime.onTimeCount + onTime.lateCount)) * 100)}%
                  </span>
                  <span className={styles.onTimeLabel}>
                    {onTime.onTimeCount} on time · {onTime.lateCount} late
                  </span>
                </div>
              )}
            </Card>

            <Card>
              <h3 className={styles.cardHeading}>Fulfillment</h3>
              {fulfillment.total === 0 ? (
                <p className={styles.noData}>No data in this period</p>
              ) : (
                <div className={styles.donutRow}>
                  <div className={styles.donutWrap}>
                    <div className={styles.donutRing} style={{ background: donutGradient }} />
                    <div className={styles.donutHole} />
                  </div>
                  <ul className={styles.legend}>
                    <li>
                      <span className={styles.legendDot} style={{ background: "var(--accent-primary)" }} />
                      Clean ({cleanPct}%)
                      <span className={styles.legendCount}>{fulfillment.clean}</span>
                    </li>
                    <li>
                      <span className={styles.legendDot} style={{ background: "var(--state-warning)" }} />
                      Close short ({closeShortPct}%)
                      <span className={styles.legendCount}>{fulfillment.closeShort}</span>
                    </li>
                    <li>
                      <span className={styles.legendDot} style={{ background: "var(--state-success)" }} />
                      Back-ordered ({backOrderedPct}%)
                      <span className={styles.legendCount}>{fulfillment.backOrdered}</span>
                    </li>
                  </ul>
                </div>
              )}
            </Card>
          </div>

          <div>
            <h2 className={styles.sectionHeading}>Receivables (Terms)</h2>
            <div className={styles.statsRowTwo}>
              <StatCard value={numberFmt.format(termsOutstanding)} label="Terms Outstanding" />
              <StatCard value={numberFmt.format(termsOverdue)} label="Overdue" />
            </div>
          </div>

          <Card>
            <h3 className={styles.cardHeading}>Weight Variance / Shrinkage</h3>
            {weightVariance === null ? (
              <p className={styles.noData}>No data in this period</p>
            ) : (
              <div className={styles.onTimeStat}>
                <span className={styles.onTimeValue}>
                  {weightVariance.avgVariancePct >= 0 ? "+" : ""}
                  {weightVariance.avgVariancePct.toFixed(1)}%
                </span>
                <span className={styles.onTimeLabel}>avg. across {weightVariance.sampleCount} weighed lines</span>
              </div>
            )}
          </Card>

          <Card>
            <div className={styles.volumeHeader}>
              <h3 className={styles.cardHeading}>Volume by customers</h3>
              <div className={styles.volumeControls}>
                <div className={styles.search}>
                  <Icon name="search" size={16} className={styles.searchIcon} />
                  <input
                    type="search"
                    className={styles.searchInput}
                    placeholder="Search customer"
                    value={customerSearch}
                    onChange={(e) => setCustomerSearch(e.target.value)}
                    aria-label="Search customer"
                  />
                </div>
                <div className={styles.sortWrapper}>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    icon="chevronDown"
                    iconPosition="right"
                    onClick={() => setSortOpen((o) => !o)}
                    aria-expanded={sortOpen}
                  >
                    {customerSort === "orders" ? "Orders" : "Weighed kg"}
                  </Button>
                  {sortOpen && (
                    <div className={styles.sortDropdown} role="dialog" aria-label="Sort by">
                      {(["orders", "weighedKg"] as const).map((key) => (
                        <Button
                          key={key}
                          type="button"
                          variant="ghost"
                          className={styles.sortItem}
                          onClick={() => {
                            setCustomerSort(key);
                            setSortOpen(false);
                          }}
                        >
                          {key === "orders" ? "Orders" : "Weighed kg"}
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {filteredCustomers.length === 0 ? (
              <p className={styles.noData}>No customers in this period.</p>
            ) : (
              <div className={styles.volumeTable}>
                <div className={styles.volumeHeadRow}>
                  <span>Customer</span>
                  <span>Orders</span>
                  <span>Weighed kg</span>
                </div>
                {filteredCustomers.map((c) => (
                  <div key={c.customerName} className={styles.volumeRow}>
                    <span className={styles.volumeName}>{c.customerName}</span>
                    <div className={styles.volumeBarCell}>
                      <div className={styles.volumeBarTrack}>
                        <div
                          className={styles.volumeBarFillOrders}
                          style={{ width: `${(c.orders / maxOrders) * 100}%` }}
                        />
                      </div>
                      <span className={styles.volumeBarValue}>{c.orders}</span>
                    </div>
                    <div className={styles.volumeBarCell}>
                      <div className={styles.volumeBarTrack}>
                        {c.weighedKg > 0 && (
                          <div
                            className={styles.volumeBarFillWeight}
                            style={{ width: `${(c.weighedKg / maxWeighedKg) * 100}%` }}
                          />
                        )}
                      </div>
                      <span className={styles.volumeBarValue}>
                        {c.weighedKg > 0 ? `${c.weighedKg.toFixed(1)} kg` : "- kg"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <div>
            <h2 className={styles.sectionHeading}>Demand by product</h2>
            {productDemand.length === 0 ? (
              <p className={styles.noData}>No product demand in this period.</p>
            ) : (
              <div className={styles.demandGrid}>
                {productDemand.map((group) => {
                  const maxQty = Math.max(1, ...group.rows.map((r) => r.qty));
                  return (
                    <Card key={group.unit}>
                      <h4 className={styles.demandHeading}>
                        <Icon name={UNIT_ICONS[group.unit] ?? "box"} size={16} />
                        {UNIT_LABELS[group.unit] ?? `Sold by ${group.unit}`}
                      </h4>
                      <div className={styles.demandList}>
                        {group.rows.slice(0, 5).map((row) => (
                          <div key={row.name} className={styles.demandRow}>
                            <span className={styles.demandName}>{row.name}</span>
                            <div className={styles.demandBarTrack}>
                              <div
                                className={styles.demandBarFill}
                                style={{ width: `${(row.qty / maxQty) * 100}%` }}
                              />
                            </div>
                            <span className={styles.demandQty}>
                              {row.qty % 1 === 0 ? row.qty : row.qty.toFixed(1)} {group.unit}
                            </span>
                          </div>
                        ))}
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
