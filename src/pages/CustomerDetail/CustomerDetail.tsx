import { useEffect, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { Card } from "../../components/Card/Card";
import { Button } from "../../components/Button/Button";
import { Avatar } from "../../components/Avatar/Avatar";
import { StatusPill } from "../../components/StatusPill/StatusPill";
import { useAuth } from "../../hooks/useAuth";
import { useLanguage } from "../../hooks/useLanguage";
import { readCustomers, readOrders, readOrderLines } from "../../lib/directus";
import { getInitials } from "../../lib/initials";
import type {
  OrdersCollection,
  OrderLinesCollection,
} from "../../types/directus";
import styles from "./CustomerDetail.module.css";

export function CustomerDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  /** Where "Back" returns to — set by whoever linked here (e.g. an order's
   *  customer-profile card). Falls back to the customers list, same pattern
   *  as OrderDetail's Back button. */
  const backTo = (location.state as { from?: string } | null)?.from ?? "/customers";
  const auth = useAuth();
  const { t } = useLanguage();

  const canEdit = auth.can("manage_customers");
  const seeCredit = auth.can("seeCustomerCredit");
  const canView = auth.can("browseCustomers");

  // Defence-in-depth: the route is already wrapped in <Guarded cap="browseCustomers">
  // (App.tsx), but this survives even if that wrapper is ever dropped in a
  // refactor — same self-guard pattern as ProductEdit.tsx.
  useEffect(() => {
    if (!canView) navigate("/", { replace: true });
  }, [canView, navigate]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Panel State
  const [isPanelOpen, setIsPanelOpen] = useState(true);

  // Customer Form State
  const [name, setName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [contact, setContact] = useState("");
  const [address, setAddress] = useState("");
  const [area, setArea] = useState("");
  const [sales, setSales] = useState("");
  const [channel, setChannel] = useState("");
  const [payTiming, setPayTiming] = useState("upfront");
  const [creditLimit, setCreditLimit] = useState("0");
  const [termDays, setTermDays] = useState("0");

  // Customer dossier
  const [orders, setOrders] = useState<OrdersCollection[]>([]);
  const [lines, setLines] = useState<OrderLinesCollection[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      setLoading(true);
      setError(null);

      const customerRes = await readCustomers({
        filter: { id: { _eq: id } },
      });

      if (cancelled) return;

      if (customerRes.error || !customerRes.data?.[0]) {
        setError(customerRes.error || "Customer not found.");
        setLoading(false);
        return;
      }

      const cust = customerRes.data[0];
      setName(cust.name);
      setCompanyName(cust.company_name ?? "");
      setContact(cust.contact ?? "");
      setAddress(cust.address ?? "");
      setArea(cust.area ?? "");
      setSales(cust.sales ?? "");
      setChannel(cust.channel ?? "");
      setPayTiming(cust.pay_timing ?? "upfront");
      setCreditLimit(String(cust.credit_limit ?? 0));
      setTermDays(String(cust.term_days ?? 0));

      // Fetch customer orders
      const ordersRes = await readOrders({
        filter: { customer_id: { _eq: id } },
        sort: ["-order_date", "-created_at"],
        limit: 100,
      });

      if (cancelled) return;

      if (ordersRes.data && ordersRes.data.length > 0) {
        setOrders(ordersRes.data);
        const orderIds = ordersRes.data.map((o) => o.id);
        const linesRes = await readOrderLines({
          filter: { order_id: { _in: orderIds } },
          limit: -1,
        });
        if (!cancelled && linesRes.data) {
          setLines(linesRes.data);
        }
      }

      setLoading(false);
    }

    loadData();
    return () => {
      cancelled = true;
    };
  }, [id]);

  // Calculate order value
  const getOrderValue = (orderId: string) => {
    return lines
      .filter((l) => l.order_id === orderId && !l.removed)
      .reduce((acc, line) => {
        const q =
          typeof line.qty === "string" ? parseFloat(line.qty) : (line.qty ?? 0);
        const p =
          typeof line.price === "string"
            ? parseFloat(line.price)
            : (line.price ?? 0);
        return acc + q * p;
      }, 0);
  };

  // Calculate customer exposure
  const getExposure = () => {
    return orders
      .filter(
        (o) =>
          !o.cancelled &&
          !["delivered", "cancelled", "returned"].includes(o.stage ?? ""),
      )
      .reduce((acc, o) => acc + getOrderValue(o.id), 0);
  };

  if (loading)
    return <div className={styles.container}>{t("Loading customer details…")}</div>;
  if (error)
    return (
      <div
        className={styles.container}
        style={{ color: "var(--status-danger)" }}
      >
        {t(error)}
      </div>
    );

  const currency = new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  });

  return (
    <div className={styles.container}>
      {/* ── Main Content & Side Panel Grid ── */}
      <div
        className={[
          styles.layoutGrid,
          isPanelOpen ? styles.layoutGridWithPanel : styles.layoutGridFull,
        ].join(" ")}
      >
        {/* ── Main Column ── */}
        <div className={styles.mainColumn}>
          <header className={styles.header}>
            <div className={styles.topActionsRow}>
              <Button
                type="button"
                variant="tertiary"
                icon="chevronLeft"
                onClick={() => navigate(backTo)}
              >
                {t("Back")}
              </Button>
              <div className={styles.actions}>
                {canEdit && (
                  <Button
                    type="button"
                    variant="secondary"
                    icon="edit"
                    onClick={() => navigate(`/customers/${id}/edit`)}
                  >
                    {t("Edit")}
                  </Button>
                )}
              </div>
            </div>
            <div className={styles.titleRow}>
              <div className={styles.customerHeading}>
                <Avatar
                  initials={getInitials(name) || "??"}
                  label={name || ""}
                  size="lg"
                />
                <div className={styles.customerInfo}>
                  <h3 className={styles.title}>{name}</h3>
                  <p>{channel?.toUpperCase() || "—"}</p>
                </div>
              </div>
            </div>
          </header>

          <Card>
            <div className={styles.fields}>
              <div className={styles.row}>
                <div className={styles.field}>
                  <span className={styles.detailLabel}>
                    {t("Restaurant / Outlet Name")} *
                  </span>
                  <span className={styles.detailValue}>{name || "—"}</span>
                </div>
                <div className={styles.field}>
                  <label className={styles.detailLabel}>
                    {t("Company Name (PT / CV for Invoice)")}
                  </label>
                  <span className={styles.detailValue}>
                    {companyName || "—"}
                  </span>
                </div>
              </div>

              <div className={styles.row}>
                <div className={styles.field}>
                  <label className={styles.detailLabel}>{t("Phone / Contact")}</label>
                  <span className={styles.detailValue}>{contact || "—"}</span>
                </div>
                <div className={styles.field}>
                  <label className={styles.detailLabel}>{t("Area")}</label>
                  <span className={styles.detailValue}>{area || "—"}</span>
                </div>
              </div>
              <div className={styles.row}>
                <div className={styles.field}>
                  <label className={styles.detailLabel}>{t("Delivery Address")}</label>
                  <span className={styles.detailValue}>{address || "—"}</span>
                </div>
              </div>
            </div>
          </Card>

          <Card>
            <div className={styles.heading}>{t("Finance")}</div>
            <div className={styles.fields}>
              <div className={styles.row}>
                <div className={styles.field}>
                  <label className={styles.detailLabel}>{t("Sales Rep")}</label>
                  <span className={styles.detailValue}>{sales || "—"}</span>
                </div>
                <div className={styles.field}>
                  <label className={styles.detailLabel}>{t("Payment Timing")}</label>
                  <span className={styles.detailValue}>
                    {payTiming
                      ? payTiming.charAt(0).toUpperCase() + payTiming.slice(1)
                      : "—"}
                  </span>
                </div>
              </div>
              <div className={styles.row}>
                {seeCredit && (
                  <div className={styles.field}>
                    <label className={styles.detailLabel}>
                      {t("Credit Limit (IDR)")}
                    </label>
                    <span className={styles.detailValue}>
                      {creditLimit || "—"}
                    </span>
                  </div>
                )}
                <div className={styles.field}>
                  <label className={styles.detailLabel}>{t("Terms (days)")}</label>
                  <span className={styles.detailValue}>{termDays || "—"}</span>
                </div>
              </div>
            </div>
          </Card>

          {seeCredit && parseInt(creditLimit, 10) > 0 && (
            <Card className={styles.detailsCard}>
              <h3 className={styles.heading}>{t("Credit Profile")}</h3>
              <div className={styles.row}>
                <label className={styles.detailLabel}>
                  {t("Account Exposure (In Flight Orders)")}
                </label>
                <span className={styles.detailValue}>
                  {currency.format(getExposure())}
                </span>
              </div>
              <div className={styles.row}>
                <label className={styles.detailLabel}>{t("Credit Limit")}</label>
                <span className={styles.detailValue}>
                  {currency.format(parseInt(creditLimit, 10))}
                </span>
              </div>
            </Card>
          )}
        </div>

        {/* ── Collapsible Side Panel (Order History) ── */}
        <aside className={styles.sidePanelColumn}>
          <Button
            type="button"
            variant="secondary"
            icon={isPanelOpen ? "chevronRight" : "chevronLeft"}
            iconOnly
            className={styles.panelToggleBtn}
            isActive={isPanelOpen}
            onClick={() => setIsPanelOpen((prev) => !prev)}
            title={isPanelOpen ? t("Collapse side panel") : t("Expand side panel")}
          />

          <div
            className={
              isPanelOpen
                ? styles.sidePanelStickyContent
                : styles.sidePanelStickyContentCollapsed
            }
          >
            <Card className={styles.historyCard}>
              <h3 className={styles.heading}>{t("Order History")}</h3>

              {orders.length > 0 ? (
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>{t("Order ID")}</th>
                      <th>{t("Stage")}</th>
                      <th>{t("Order Date")}</th>
                      <th>{t("Total Value")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((o) => (
                      <tr
                        key={o.id}
                        className={styles.tr}
                        onClick={() =>
                          navigate(`/orders/${o.id}`, {
                            state: { from: `/customers/${id}` },
                          })
                        }
                      >
                        <td>{o.no}</td>
                        <td>
                          <StatusPill
                            status={o.stage || o.status}
                            isReplacement={o.is_replacement === true}
                            isHold={o.hold === true}
                          />
                        </td>
                        <td>
                          {o.order_date
                            ? new Date(o.order_date).toLocaleDateString(
                                "en-US",
                                {
                                  month: "short",
                                  day: "numeric",
                                  year: "numeric",
                                },
                              )
                            : "—"}
                        </td>
                        <td>{currency.format(getOrderValue(o.id))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className={styles.muted}>{t("No order history yet.")}</p>
              )}
            </Card>
          </div>
        </aside>
      </div>
    </div>
  );
}
