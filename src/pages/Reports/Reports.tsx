import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "../../components/Card/Card";
import { Icon } from "../../components/Icon/Icon";
import { Button } from "../../components/Button/Button";
import { SortableTh } from "../../components/SortableTh/SortableTh";
import { StatCard } from "../../components/StatCard/StatCard";
import { useCan } from "../../hooks/useAuth";
import { useLanguage } from "../../hooks/useLanguage";
import {
  useReports,
  type ReportRange,
  type ReportRangeType,
} from "../../hooks/useReports";
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
  const navigate = useNavigate();
  const canView = useCan()("accessReports");
  const { t } = useLanguage();

  // Defence-in-depth: the route is already wrapped in <Guarded cap="accessReports">
  // (App.tsx), but this survives even if that wrapper is ever dropped in a
  // refactor — same self-guard pattern as ProductEdit.tsx.
  useEffect(() => {
    if (!canView) navigate("/", { replace: true });
  }, [canView, navigate]);

  const [range, setRange] = useState<ReportRange>({ type: "30d" });
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerSort, setCustomerSort] = useState("-orders");

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
    cycleTime,
  } = useReports(range);

  const cleanPct =
    fulfillment.total === 0
      ? 0
      : Math.round((fulfillment.clean / fulfillment.total) * 100);
  const closeShortPct =
    fulfillment.total === 0
      ? 0
      : Math.round((fulfillment.closeShort / fulfillment.total) * 100);
  const backOrderedPct =
    fulfillment.total === 0
      ? 0
      : Math.round((fulfillment.backOrdered / fulfillment.total) * 100);
  const donutGradient = `conic-gradient(var(--accent-primary) 0% ${cleanPct}%, var(--state-warning) ${cleanPct}% ${cleanPct + closeShortPct}%, var(--state-success) ${cleanPct + closeShortPct}% 100%)`;

  const weightPct = weightVariance?.avgVariancePct ?? 0;
  const weightTrendIcon =
    weightPct > 0
      ? "arrowBigUpDash"
      : weightPct < 0
        ? "arrowBigDownDash"
        : null;
  const weightTrendClass =
    weightPct > 0 ? styles.positive : weightPct < 0 ? styles.negative : "";
  const [weightWhole, weightDecimal] = Math.abs(weightPct)
    .toFixed(1)
    .split(".");

  const customerSortDesc = customerSort.startsWith("-");
  const customerSortKey = (
    customerSortDesc ? customerSort.slice(1) : customerSort
  ) as "customerName" | "orders" | "weighedKg";
  // "Top 5" always ranks by a volume metric (descending); the header sort
  // then only orders those five. Sorting by name ranks by orders.
  const rankKey =
    customerSortKey === "customerName" ? "orders" : customerSortKey;
  const filteredCustomers = customerVolume
    .filter((c) =>
      c.customerName
        .toLowerCase()
        .includes(customerSearch.trim().toLowerCase()),
    )
    .sort((a, b) => b[rankKey] - a[rankKey])
    .slice(0, 5)
    .sort((a, b) => {
      const cmp =
        customerSortKey === "customerName"
          ? a.customerName.localeCompare(b.customerName)
          : a[customerSortKey] - b[customerSortKey];
      return customerSortDesc ? -cmp : cmp;
    });
  const maxOrders = Math.max(1, ...filteredCustomers.map((c) => c.orders));
  const maxWeighedKg = Math.max(
    1,
    ...filteredCustomers.map((c) => c.weighedKg),
  );

  return (
    <div className={styles.container}>
      <div className={styles.sectionsContainer}>
        <div className={styles.header}>
          <div className={styles.titleSection}>
            <h2 className={styles.title}>{t("Reports")}</h2>
          </div>
          <div className={styles.rangeRow}>
            {RANGE_OPTIONS.map((opt) => (
              <Button
                key={opt.key}
                type="button"
                variant={range.type === opt.key ? "primary" : "secondary"}
                size="md"
                onClick={() => {
                  if (opt.key === "month")
                    setRange({ type: "month", month: range.month ?? "" });
                  else if (opt.key === "range")
                    setRange({
                      type: "range",
                      from: range.from ?? "",
                      to: range.to ?? "",
                    });
                  else setRange({ type: opt.key });
                }}
              >
                {t(opt.label)}
              </Button>
            ))}
          </div>
          {range.type === "month" && (
            <div className={styles.rangePickRow}>
              <div className={styles.rangePick}>
                <label htmlFor="month-picker" className={styles.detailLabel}>
                  {t("Select month")}
                </label>
                <input
                  id="month-picker"
                  type="month"
                  className={styles.editInput}
                  value={range.month ?? ""}
                  onChange={(e) =>
                    setRange({ type: "month", month: e.target.value })
                  }
                />
              </div>
            </div>
          )}
          {range.type === "range" && (
            <div className={styles.rangePickRow}>
              <div className={styles.rangePick}>
                <label htmlFor="range-start" className={styles.detailLabel}>
                  {t("Start")}
                </label>
                <input
                  id="range-start"
                  type="date"
                  className={styles.editInput}
                  value={range.from ?? ""}
                  onChange={(e) =>
                    setRange({
                      type: "range",
                      from: e.target.value,
                      to: range.to,
                    })
                  }
                />
              </div>
              <div className={styles.rangePick}>
                <label htmlFor="range-end" className={styles.detailLabel}>
                  {t("End")}
                </label>
                <input
                  id="range-end"
                  type="date"
                  className={styles.editInput}
                  value={range.to ?? ""}
                  onChange={(e) =>
                    setRange({
                      type: "range",
                      from: range.from,
                      to: e.target.value,
                    })
                  }
                />
              </div>
            </div>
          )}
        </div>

        {loading ? (
          <div className={styles.muted}>{t("Loading reports…")}</div>
        ) : error ? (
          <div className={styles.error}>{error}</div>
        ) : (
          <>
            <div className={styles.statsRow}>
              <StatCard
                value={numberFmt.format(totalOrders)}
                label={t("Total Orders")}
              />
              <StatCard
                value={numberFmt.format(delivered)}
                label={t("Delivered")}
              />
              <StatCard
                value={numberFmt.format(returned)}
                label={t("Returned")}
              />
              <StatCard
                value={numberFmt.format(cancelled)}
                label={t("Canceled")}
              />
            </div>

            <div className={styles.threeCol}>
              <Card className={`${styles.statCard} ${styles.onTimeCard}`}>
                <h3 className={styles.cardHeading}>{t("On-time Delivery")}</h3>
                {onTime === null ? (
                  <p className={styles.noData}>{t("No data in this period")}</p>
                ) : (
                  <div className={styles.cardContainer}>
                    <div className={styles.onTimeStat}>
                      <span className={styles.onTimeValue}>
                        {Math.round(
                          (onTime.onTimeCount /
                            (onTime.onTimeCount + onTime.lateCount)) *
                            100,
                        )}
                        <span className={styles.percentSign}>%</span>
                      </span>
                      <span className={styles.onTimeLabel}>
                        {onTime.onTimeCount} {t("on time")} · {onTime.lateCount}{" "}
                        {t("late")}
                      </span>
                    </div>
                  </div>
                )}
              </Card>

              <Card className={`${styles.statCard} ${styles.weightCard}`}>
                <h3 className={styles.cardHeading}>
                  {t("Weight Variance / Shrinkage")}
                </h3>
                {weightVariance === null ? (
                  <p className={styles.noData}>{t("No data in this period")}</p>
                ) : (
                  <div className={styles.cardContainer}>
                    <div className={styles.onTimeStat}>
                      <span
                        className={`${styles.onTimeValue} ${weightTrendClass}`}
                      >
                        {weightTrendIcon && (
                          <Icon
                            name={weightTrendIcon}
                            size={28}
                            className={styles.trendIcon}
                          />
                        )}
                        {weightWhole}
                        <span className={styles.decimalPart}>
                          .{weightDecimal}
                        </span>
                        <span className={styles.percentSign}>%</span>
                      </span>
                      <span className={styles.onTimeLabel}>
                        {t("avg. across")} {weightVariance.sampleCount}{" "}
                        {t("weighed lines")}
                      </span>
                    </div>
                  </div>
                )}
              </Card>

              <Card className={`${styles.statCard} ${styles.fulfillmentCard}`}>
                <h3 className={styles.cardHeading}>{t("Fulfillment")}</h3>
                {fulfillment.total === 0 ? (
                  <p className={styles.noData}>{t("No data in this period")}</p>
                ) : (
                  <div className={styles.donutRow}>
                    <div className={styles.donutWrap}>
                      <div
                        className={styles.donutRing}
                        style={{ background: donutGradient }}
                      />
                      <div className={styles.donutHole} />
                    </div>
                    <ul className={styles.legend}>
                      <li>
                        <span
                          className={styles.legendDot}
                          style={{ background: "var(--accent-primary)" }}
                        />
                        <span className={styles.legendLabel}>{t("Clean")}</span>
                        <span className={styles.legendValue}>
                          <span className={styles.legendCount}>
                            {fulfillment.clean}
                          </span>
                          <span className={styles.legendPercentage}>
                            ({cleanPct}%)
                          </span>
                        </span>
                      </li>
                      <li>
                        <span
                          className={styles.legendDot}
                          style={{ background: "var(--state-warning)" }}
                        />
                        <span className={styles.legendLabel}>
                          {t("Close short")}
                        </span>
                        <span className={styles.legendValue}>
                          <span className={styles.legendCount}>
                            {fulfillment.closeShort}
                          </span>
                          <span className={styles.legendPercentage}>
                            ({closeShortPct}%)
                          </span>
                        </span>
                      </li>
                      <li>
                        <span
                          className={styles.legendDot}
                          style={{ background: "var(--state-success)" }}
                        />
                        <span className={styles.legendLabel}>
                          {t("Back-ordered")}
                        </span>
                        <span className={styles.legendValue}>
                          <span className={styles.legendCount}>
                            {fulfillment.backOrdered}
                          </span>
                          <span className={styles.legendPercentage}>
                            ({backOrderedPct}%)
                          </span>
                        </span>
                      </li>
                    </ul>
                  </div>
                )}
              </Card>
            </div>

            <div>
              <h2 className={styles.sectionHeading}>
                {t("Receivables (Terms)")}
              </h2>
              <div className={styles.statsRowTwo}>
                <StatCard
                  value={numberFmt.format(termsOutstanding)}
                  label={t("Terms Outstanding")}
                />
                <StatCard
                  value={numberFmt.format(termsOverdue)}
                  label={t("Overdue")}
                />
              </div>
            </div>

            <Card>
              <div className={styles.volumeHeader}>
                <h3 className={styles.cardHeading}>
                  {t("Volume by customers (Top 5)")}
                </h3>
                <div className={styles.volumeControls}>
                  <div className={styles.search}>
                    <Icon
                      name="search"
                      size={16}
                      className={styles.searchIcon}
                    />
                    <input
                      type="search"
                      className={styles.searchInput}
                      placeholder={t("Search customer")}
                      value={customerSearch}
                      onChange={(e) => setCustomerSearch(e.target.value)}
                      aria-label={t("Search customer")}
                    />
                  </div>
                </div>
              </div>

              {filteredCustomers.length === 0 ? (
                <p className={styles.noData}>
                  {t("No customers in this period.")}
                </p>
              ) : (
                <div className={styles.volumeTable}>
                  <div className={styles.volumeTableScroll}>
                    <div className={styles.volumeHeadRow}>
                      <SortableTh
                        as="div"
                        className={styles.thead}
                        label={t("Customer")}
                        sortKey="customerName"
                        activeSort={customerSort}
                        onSort={setCustomerSort}
                      />
                      <SortableTh
                        as="div"
                        className={styles.thead}
                        label={t("Orders")}
                        sortKey="orders"
                        activeSort={customerSort}
                        onSort={setCustomerSort}
                      />
                      <SortableTh
                        as="div"
                        className={styles.thead}
                        label={t("Weighed kg")}
                        sortKey="weighedKg"
                        activeSort={customerSort}
                        onSort={setCustomerSort}
                      />
                    </div>
                    {filteredCustomers.map((c) => (
                      <div key={c.customerName} className={styles.volumeRow}>
                        <span className={styles.volumeName}>
                          {c.customerName}
                        </span>
                        <div className={styles.volumeBarCell}>
                          <div className={styles.volumeBarTrack}>
                            <div
                              className={styles.volumeBarFillOrders}
                              style={{
                                width: `${(c.orders / maxOrders) * 100}%`,
                              }}
                            />
                          </div>
                          <span className={styles.volumeBarValue}>
                            {c.orders}
                          </span>
                        </div>
                        <div className={styles.volumeBarCell}>
                          <div className={styles.volumeBarTrack}>
                            {c.weighedKg > 0 && (
                              <div
                                className={styles.volumeBarFillWeight}
                                style={{
                                  width: `${(c.weighedKg / maxWeighedKg) * 100}%`,
                                }}
                              />
                            )}
                          </div>
                          <span className={styles.volumeBarValue}>
                            {c.weighedKg > 0
                              ? `${c.weighedKg.toFixed(1)} kg`
                              : "- kg"}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>

            <div>
              <h2 className={styles.sectionHeading}>
                {t("Demand by product (Top 5)")}
              </h2>
              {productDemand.length === 0 ? (
                <p className={styles.noData}>
                  {t("No product demand in this period.")}
                </p>
              ) : (
                <div className={styles.demandGrid}>
                  {productDemand.map((group) => {
                    const maxQty = Math.max(1, ...group.rows.map((r) => r.qty));
                    return (
                      <Card key={group.unit}>
                        <h4 className={styles.demandHeading}>
                          <Icon
                            name={UNIT_ICONS[group.unit] ?? "box"}
                            size={16}
                          />
                          {UNIT_LABELS[group.unit]
                            ? t(UNIT_LABELS[group.unit])
                            : `${t("Sold by")} ${group.unit}`}
                        </h4>
                        <div className={styles.demandList}>
                          {group.rows.slice(0, 5).map((row) => (
                            <div key={row.name} className={styles.demandRow}>
                              <span className={styles.demandName}>
                                {row.name}
                              </span>
                              <div className={styles.demandBarTrack}>
                                <div
                                  className={styles.demandBarFill}
                                  style={{
                                    width: `${(row.qty / maxQty) * 100}%`,
                                  }}
                                />
                              </div>
                              <span className={styles.demandQty}>
                                {row.qty % 1 === 0
                                  ? row.qty
                                  : row.qty.toFixed(1)}{" "}
                                {group.unit}
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

            <div>
              <h2 className={styles.sectionHeading}>
                {t("Cycle time per stage")}
              </h2>
              {cycleTime.measured === 0 ? (
                <Card>
                  <p className={styles.muted}>{t("No data in this period")}</p>
                </Card>
              ) : (
                <Card>
                  {cycleTime.slowest && (
                    <p
                      className={styles.noData}
                      style={{ marginBottom: "var(--space-sm)" }}
                    >
                      {t("Bottleneck")}:{" "}
                      <strong style={{ color: "var(--state-warning)" }}>
                        {t(cycleTime.slowest.label)}
                      </strong>{" "}
                      — {cycleTime.slowest.avgHours.toFixed(1)}h {t("avg")}
                    </p>
                  )}
                  <div className={styles.demandList}>
                    {cycleTime.stages.map((s) => {
                      const maxHours = Math.max(
                        1,
                        ...cycleTime.stages.map((x) => x.avgHours),
                      );
                      const isSlow = cycleTime.slowest?.stage === s.stage;
                      return (
                        <div key={s.stage} className={styles.demandRow}>
                          <span className={styles.demandName}>
                            {t(s.label)}
                          </span>
                          <div className={styles.demandBarTrack}>
                            <div
                              className={styles.demandBarFill}
                              style={{
                                width: `${(s.avgHours / maxHours) * 100}%`,
                                background: isSlow
                                  ? "var(--state-warning)"
                                  : undefined,
                              }}
                            />
                          </div>
                          <span className={styles.demandQty}>
                            {s.n ? `${s.avgHours.toFixed(1)}h` : "—"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <p
                    className={styles.noData}
                    style={{ marginTop: "var(--space-sm)" }}
                  >
                    {t("Average hours an order sits in each stage")}
                  </p>
                </Card>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
