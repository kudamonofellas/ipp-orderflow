import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card } from "../../components/Card/Card";
import { Icon } from "../../components/Icon/Icon";
import { Button } from "../../components/Button/Button";
import {
  AddItemModal,
  type AddItemResult,
} from "../../components/AddItemModal/AddItemModal";
import { useAuth, useCurrentUserId } from "../../hooks/useAuth";
import { useLanguage } from "../../hooks/useLanguage";
import { isOrderLocked } from "../../lib/pipeline";
import {
  readOrder,
  readOrderLines,
  readCustomers,
  readProducts,
  readCorrections,
  readLineCuts,
  updateOrder,
  updateOrderLine,
  createOrderLine,
  deleteOrderLine,
  createLineCut,
  updateLineCut,
  deleteLineCut,
  upsertCorrection,
  appendOrderHistory,
} from "../../lib/directus";
import type {
  OrdersCollection,
  OrderLinesCollection,
  CustomersCollection,
  ProductsCollection,
  CorrectionsCollection,
  LineCutsCollection,
} from "../../types/directus";
import styles from "./OrderEdit.module.css";

const UNIT_OPTIONS = ["Loaf", "Box", "Pack", "kg", "gram", "pcs", "ekor"];

const currency = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  minimumFractionDigits: 0,
});

function formatDateInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

interface CutItem {
  id: string;
  text: string;
}

interface EditableLine {
  id: string;
  isNew?: boolean;
  productId: string | null;
  name: string;
  qty: string;
  unit: string;
  price: string;
  cuts: CutItem[];
  /** Normalized `corrections` lookup key — set only when this line came
   *  from AddItemModal's typed "Match" flow, so the save handler below can
   *  learn from it via upsertCorrection. */
  rawText?: string;
}

export function OrderEdit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const auth = useAuth();
  const userId = useCurrentUserId();
  const { t } = useLanguage();

  /* ── data state ── */
  const [order, setOrder] = useState<OrdersCollection | null>(null);
  const [lines, setLines] = useState<OrderLinesCollection[]>([]);
  const [customers, setCustomers] = useState<CustomersCollection[]>([]);
  const [products, setProducts] = useState<ProductsCollection[]>([]);
  const [corrections, setCorrections] = useState<CorrectionsCollection[]>([]);
  const [lineCutsByLine, setLineCutsByLine] = useState<
    Record<string, LineCutsCollection[]>
  >({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /* ── form state ── */
  const [orderNo, setOrderNo] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [company, setCompany] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [deliverDate, setDeliverDate] = useState("");
  const [orderDate, setOrderDate] = useState("");
  const [sales, setSales] = useState("");
  const [contact, setContact] = useState("");
  const [editLines, setEditLines] = useState<EditableLine[]>([]);

  /* ── modal state ── */
  const [isAddItemModalOpen, setIsAddItemModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Same gate as OrderDetail.tsx's own "Edit" button (which is how this page
  // is normally reached) — mirrored here as a self-guard, matching
  // CustomerEdit.tsx/ProductEdit.tsx's pattern. Previously this page had no
  // route guard AND no self-guard: a role without editOrderLines (Warehouse,
  // Production, Courier) could open /orders/:id/edit directly via URL and
  // interact with the whole form — only the final Save button was disabled.
  const stage = order?.stage ?? "intake";
  const canEdit =
    auth.can("editOrderLines") &&
    (!isOrderLocked({
      stage,
      taken_by: order?.taken_by,
      pickup: order?.pickup,
      third_party: order?.third_party,
    }) ||
      auth.can("editAfterLock"));

  useEffect(() => {
    if (!loading && !canEdit) {
      navigate(`/orders/${id}`, { replace: true });
    }
  }, [loading, canEdit, navigate, id]);

  useEffect(() => {
    const orderId = id as string;
    if (!orderId) return;
    let cancelled = false;

    async function loadData() {
      setLoading(true);
      setError(null);

      const [orderRes, linesRes, customersRes, productsRes, correctionsRes] =
        await Promise.all([
          readOrder(orderId),
          readOrderLines({ filter: { order_id: { _eq: orderId } } }),
          readCustomers({ limit: -1 }),
          readProducts({ limit: -1, sort: ["name"] }),
          readCorrections(),
        ]);

      if (cancelled) return;

      if (orderRes.error) {
        setError(`Failed to load order: ${orderRes.error}`);
        setLoading(false);
        return;
      }
      if (linesRes.error) {
        setError(`Failed to load order lines: ${linesRes.error}`);
        setLoading(false);
        return;
      }

      const loadedOrder = orderRes.data;
      const loadedLines = linesRes.data ?? [];
      setOrder(loadedOrder);
      setLines(loadedLines);
      setCustomers(customersRes.data ?? []);
      setProducts(productsRes.data ?? []);
      setCorrections(correctionsRes.data ?? []);

      // Load cuts
      const cutsRes = await readLineCuts(loadedLines.map((l) => l.id));
      const groupedCuts: Record<string, LineCutsCollection[]> = {};
      (cutsRes.data ?? []).forEach((c) => {
        (groupedCuts[c.line_id] ??= []).push(c);
      });
      setLineCutsByLine(groupedCuts);

      // Populate form state
      setCustomerName(loadedOrder?.customer_name ?? "");
      setCustomerId(loadedOrder?.customer_id ?? null);
      setOrderNo(loadedOrder?.no ?? "");
      setCompany(loadedOrder?.customer_legal_name ?? "");
      setCustomerAddress(loadedOrder?.customer_address ?? "");
      setDeliverDate(formatDateInput(loadedOrder?.deliver_at));
      setOrderDate(formatDateInput(loadedOrder?.order_date));
      setSales(loadedOrder?.sales ?? loadedOrder?.sales_rep ?? "");
      setContact(loadedOrder?.customer_contact ?? "");

      setEditLines(
        loadedLines.map((l) => ({
          id: l.id,
          productId: l.product_id ?? null,
          name: l.name,
          qty: String(parseFloat(String(l.qty ?? 1)) || 1),
          unit: l.unit ?? "Loaf",
          price: String(parseFloat(String(l.price ?? 0)) || 0),
          cuts: (groupedCuts[l.id] ?? []).map((c) => ({
            id: c.id,
            text: c.text,
          })),
        })),
      );

      setLoading(false);
    }

    loadData();
    return () => {
      cancelled = true;
    };
  }, [id]);

  function handleCancel() {
    navigate(`/orders/${id}`);
  }

  function handleCustomerSelect(e: React.ChangeEvent<HTMLSelectElement>) {
    const cid = e.target.value;
    setCustomerId(cid || null);
    if (cid) {
      const c = customers.find((cust) => cust.id === cid);
      if (c) {
        setCustomerName(c.name);
        if (c.contact) setContact(c.contact);
        if (c.sales) setSales(c.sales);
      }
    }
  }

  function handleConfirmAddItem(result: AddItemResult) {
    const newLine: EditableLine = {
      id: "new_" + Date.now(),
      isNew: true,
      productId: result.productId,
      name: result.name,
      qty: result.qty,
      unit: result.unit,
      price: "0",
      cuts: [],
      // Threaded through to Save-time so the correction-learning sweep in
      // handleSaveAllEdits picks up manually-matched items too.
      rawText: result.rawText,
    };
    setEditLines((prev) => [...prev, newLine]);
  }

  function handleDeleteLine(lineId: string) {
    setEditLines((prev) => prev.filter((l) => l.id !== lineId));
  }

  function handleAddCutToLine(lineId: string) {
    setEditLines((prev) =>
      prev.map((l) =>
        l.id === lineId
          ? { ...l, cuts: [...l.cuts, { id: "cut_" + Date.now(), text: "" }] }
          : l,
      ),
    );
  }

  function handleDeleteCutFromLine(lineId: string, cutId: string) {
    setEditLines((prev) =>
      prev.map((l) =>
        l.id === lineId
          ? { ...l, cuts: l.cuts.filter((c) => c.id !== cutId) }
          : l,
      ),
    );
  }

  function buildEditSummary(): string {
    const changes: string[] = [];

    if ((order?.no ?? "").trim() !== orderNo.trim()) {
      changes.push(`Order No. ${order?.no || "—"}→${orderNo || "—"}`);
    }
    if ((order?.customer_name ?? "").trim() !== customerName.trim()) {
      changes.push(
        `Customer ${order?.customer_name || "—"}→${customerName || "—"}`,
      );
    }
    if ((order?.customer_legal_name ?? "").trim() !== company.trim()) {
      changes.push(
        `Company ${order?.customer_legal_name || "—"}→${company || "—"}`,
      );
    }
    if ((order?.customer_address ?? "").trim() !== customerAddress.trim()) {
      changes.push(
        `Delivery Address ${order?.customer_address || "—"}→${customerAddress || "—"}`,
      );
    }
    if ((order?.sales ?? order?.sales_rep ?? "").trim() !== sales.trim()) {
      changes.push(
        `Sales ${order?.sales ?? order?.sales_rep ?? "—"}→${sales || "—"}`,
      );
    }
    if ((order?.customer_contact ?? "").trim() !== contact.trim()) {
      changes.push(
        `Contact ${order?.customer_contact || "—"}→${contact || "—"}`,
      );
    }
    if (formatDateInput(order?.deliver_at) !== deliverDate) {
      changes.push(
        `Delivery Date ${formatDateInput(order?.deliver_at) || "—"}→${deliverDate || "—"}`,
      );
    }

    const initialLineMap = new Map(lines.map((l) => [l.id, l]));

    editLines.forEach((el) => {
      if (el.isNew) {
        changes.push(`Added line "${el.name}" (${el.qty} ${el.unit})`);
      } else {
        const orig = initialLineMap.get(el.id);
        if (orig) {
          const origQty = parseFloat(String(orig.qty ?? 0));
          const newQty = parseFloat(el.qty);
          if (origQty !== newQty) {
            changes.push(`Line "${el.name}" qty ${origQty}→${newQty}`);
          }
          if ((orig.unit ?? "") !== el.unit) {
            changes.push(
              `Line "${el.name}" unit ${orig.unit || "—"}→${el.unit}`,
            );
          }
          const origPrice = parseFloat(String(orig.price ?? 0));
          const newPrice = parseFloat(el.price);
          if (origPrice !== newPrice) {
            changes.push(`Line "${el.name}" price ${origPrice}→${newPrice}`);
          }
          if (orig.name !== el.name) {
            changes.push(`Line name ${orig.name}→${el.name}`);
          }
        }
      }
    });

    lines.forEach((l) => {
      if (!editLines.some((el) => el.id === l.id)) {
        changes.push(`Removed line "${l.name}"`);
      }
    });

    editLines.forEach((el) => {
      if (!el.isNew) {
        const origCuts = lineCutsByLine[el.id] ?? [];
        const origCutMap = new Map(origCuts.map((c) => [c.id, c.text]));

        el.cuts.forEach((c) => {
          if (c.id.startsWith("cut_")) {
            if (c.text.trim()) {
              changes.push(`Line "${el.name}" added cut "${c.text.trim()}"`);
            }
          } else {
            const origText = origCutMap.get(c.id);
            if (origText !== undefined && origText.trim() !== c.text.trim()) {
              changes.push(
                `Line "${el.name}" cut "${origText}"→"${c.text.trim()}"`,
              );
            }
          }
        });

        origCuts.forEach((c) => {
          if (!el.cuts.some((ec) => ec.id === c.id)) {
            changes.push(`Line "${el.name}" removed cut "${c.text}"`);
          }
        });
      }
    });

    return changes.length > 0
      ? `Edited — ${changes.join("; ")}`
      : "Order edited (no change)";
  }

  async function handleSaveAllEdits() {
    if (!order) return;
    setSubmitting(true);
    setError(null);

    const summaryText = buildEditSummary();

    try {
      const orderPatch: Record<string, unknown> = {};
      if (orderNo.trim() !== (order.no ?? "")) orderPatch.no = orderNo.trim();
      if (customerName.trim() !== (order.customer_name ?? ""))
        orderPatch.customer_name = customerName.trim();
      if (customerId !== order.customer_id) orderPatch.customer_id = customerId;
      if (company.trim() !== (order.customer_legal_name ?? ""))
        orderPatch.customer_legal_name = company.trim() || null;
      if (customerAddress.trim() !== (order.customer_address ?? ""))
        orderPatch.customer_address = customerAddress.trim() || null;
      if (sales.trim() !== (order.sales ?? order.sales_rep ?? ""))
        orderPatch.sales = sales.trim();
      if (contact.trim() !== (order.customer_contact ?? ""))
        orderPatch.customer_contact = contact.trim();
      if (deliverDate !== formatDateInput(order.deliver_at))
        orderPatch.deliver_at = deliverDate || null;
      if (orderDate !== formatDateInput(order.order_date))
        orderPatch.order_date = orderDate || null;

      if (Object.keys(orderPatch).length > 0) {
        const updateRes = await updateOrder(order.id, orderPatch);
        if (updateRes.error) throw new Error(updateRes.error);
      }

      // Sync order lines
      const initialLineIds = new Set(lines.map((l) => l.id));
      const currentEditLineIds = new Set(
        editLines.filter((l) => !l.isNew).map((l) => l.id),
      );

      // Delete removed lines
      for (const origId of initialLineIds) {
        if (!currentEditLineIds.has(origId)) {
          const delRes = await deleteOrderLine(origId);
          if (delRes.error) throw new Error(delRes.error);
        }
      }

      // Create/Update lines and handle cuts per line
      for (let i = 0; i < editLines.length; i++) {
        const el = editLines[i];
        let targetLineId = el.id;

        if (el.isNew) {
          const createRes = await createOrderLine({
            order_id: order.id,
            product_id: el.productId,
            name: el.name,
            qty: parseFloat(el.qty) || 1,
            unit: el.unit,
            status: "manual",
            sort_order: i,
          });
          if (createRes.error || !createRes.data)
            throw new Error(createRes.error ?? t("Failed to create line"));
          targetLineId = createRes.data.id;
        } else {
          const updateRes = await updateOrderLine(el.id, {
            name: el.name,
            qty: parseFloat(el.qty) || 1,
            unit: el.unit,
            price: parseFloat(el.price) || 0,
            product_id: el.productId,
            sort_order: i,
          });
          if (updateRes.error) throw new Error(updateRes.error);
        }

        // Handle cuts sync for targetLineId
        const origCuts = el.isNew ? [] : (lineCutsByLine[el.id] ?? []);
        const currentCutIds = new Set(
          el.cuts.filter((c) => !c.id.startsWith("cut_")).map((c) => c.id),
        );

        for (const origCut of origCuts) {
          if (!currentCutIds.has(origCut.id)) {
            const delRes = await deleteLineCut(origCut.id);
            if (delRes.error) throw new Error(delRes.error);
          }
        }

        for (const cut of el.cuts) {
          if (cut.id.startsWith("cut_")) {
            if (cut.text.trim()) {
              const cutRes = await createLineCut({
                line_id: targetLineId,
                text: cut.text.trim(),
              });
              if (cutRes.error) throw new Error(cutRes.error);
            }
          } else {
            const orig = origCuts.find((c) => c.id === cut.id);
            if (orig && orig.text.trim() !== cut.text.trim()) {
              const cutRes = await updateLineCut(cut.id, {
                text: cut.text.trim(),
              });
              if (cutRes.error) throw new Error(cutRes.error);
            }
          }
        }
      }

      // Learn from every line added via AddItemModal's typed "Match" flow
      // this save — mirrors OrderNew.tsx's own submit-time sweep. Best
      // effort, same as there: a correction failing to save shouldn't
      // block the actual order edit from completing.
      const correctionTargets = editLines.filter(
        (l) => l.rawText && l.productId,
      );
      if (correctionTargets.length > 0) {
        await Promise.allSettled(
          correctionTargets.map((l) =>
            upsertCorrection(l.rawText!, l.productId!),
          ),
        );
      }

      if (summaryText !== "Order edited (no change)") {
        await appendOrderHistory({
          order_id: order.id,
          what: summaryText,
          who: userId ?? null,
          stage: order.stage ?? "intake",
        });
      }

      setSubmitting(false);
      navigate(`/orders/${order.id}`);
    } catch (err) {
      setSubmitting(false);
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  if (loading)
    return <div className={styles.muted}>{t("Loading order details…")}</div>;
  if (error || !order) {
    return (
      <div className={styles.muted} style={{ color: "var(--state-error)" }}>
        {error || t("Order not found.")}
      </div>
    );
  }

  const editSummary = buildEditSummary();
  const hasEditChanges = editSummary !== "Order edited (no change)";

  return (
    <div className={styles.container}>
      <div className={styles.layoutGrid}>
        <div className={styles.mainColumn}>
          <header className={styles.header}>
            <div className={styles.topActionsRow}>
              <Button
                type="button"
                variant="tertiary"
                icon="chevronLeft"
                onClick={handleCancel}
              >
                {t("Back to order")}
              </Button>
              <div className={styles.actions}>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleCancel}
                  disabled={submitting}
                >
                  {t("Cancel")}
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  disabled={!hasEditChanges || submitting || !canEdit}
                  icon="save"
                  onClick={handleSaveAllEdits}
                >
                  {submitting ? t("Saving…") : t("Save Changes")}
                </Button>
              </div>
            </div>

            <div className={styles.titleRow}>
              <h2 className={styles.title}>
                {t("Order")} {order.no}
              </h2>
            </div>
          </header>

          {error && <div className={styles.error}>{error}</div>}

          {/* Header fields card */}
          <Card className={styles.customerCard}>
            <div className={styles.row}>
              <label className={styles.field}>
                <span className={styles.label}>{t("Order No.")}</span>
                <input
                  type="text"
                  className={styles.input}
                  value={orderNo}
                  onChange={(e) => setOrderNo(e.target.value)}
                />
              </label>
              <label className={styles.field}>
                <span className={styles.label}>{t("Delivery Date")}</span>
                <input
                  type="date"
                  className={styles.input}
                  value={deliverDate}
                  onChange={(e) => {
                    setDeliverDate(e.target.value);
                  }}
                  disabled={submitting}
                />
              </label>
            </div>
            <div className={styles.row}>
              <label className={styles.field}>
                <span className={styles.label}>
                  {t("Customer / Restaurant")}
                </span>
                <select
                  className={styles.select}
                  value={customerId ?? ""}
                  onChange={handleCustomerSelect}
                >
                  <option value="">{t("— Select customer —")}</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.field}>
                <span className={styles.label}>
                  {t("Company")}{" "}
                  <span className={styles.caption}>
                    {t("(PT / CV — for the invoice)")}
                  </span>
                </span>
                <input
                  type="text"
                  className={styles.input}
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  disabled={submitting}
                  placeholder={t("e.g. PT En Prima Food & Beverages")}
                />
              </label>
            </div>
            <div className={styles.row}>
              <label className={styles.field}>
                <span className={styles.label}>{t("Customer Contact")}</span>
                <input
                  type="text"
                  className={styles.input}
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                />
              </label>
              <label className={styles.field}>
                <span className={styles.label}>{t("Sales Rep")}</span>
                <input
                  type="text"
                  className={styles.input}
                  value={sales}
                  onChange={(e) => setSales(e.target.value)}
                />
              </label>
            </div>
            <label className={styles.field}>
              <span className={styles.label}>{t("Delivery Address")}</span>
              <textarea
                className={styles.input}
                style={{
                  justifyContent: "flex-start",
                  alignItems: "flex-start",
                  minHeight: "100px",
                }}
                value={customerAddress}
                onChange={(e) => setCustomerAddress(e.target.value)}
                disabled={submitting}
                placeholder={t("Delivery address")}
              />
            </label>
          </Card>

          {/* Items card */}
          <Card>
            <div className={styles.heading}>
              <span>{t("Items")}</span>
              <span className={styles.count}>{editLines.length}</span>
            </div>

            <div className={styles.itemsList}>
              {editLines.map((line) => (
                <div key={line.id} className={styles.itemRow}>
                  <div className={styles.twoColumnsRow}>
                    <div className={styles.column}>
                      <div className={styles.itemHeaderRow}>
                        <input
                          type="number"
                          min="0"
                          step="any"
                          className={styles.editInput}
                          style={{ width: 80 }}
                          value={line.qty}
                          onChange={(e) => {
                            const val = e.target.value;
                            setEditLines((prev) =>
                              prev.map((l) =>
                                l.id === line.id ? { ...l, qty: val } : l,
                              ),
                            );
                          }}
                        />
                        <select
                          className={styles.editSelect}
                          style={{ maxWidth: 100 }}
                          value={line.unit}
                          onChange={(e) => {
                            const val = e.target.value;
                            setEditLines((prev) =>
                              prev.map((l) =>
                                l.id === line.id ? { ...l, unit: val } : l,
                              ),
                            );
                          }}
                        >
                          {UNIT_OPTIONS.map((u) => (
                            <option key={u} value={u}>
                              {u}
                            </option>
                          ))}
                        </select>

                        <select
                          className={styles.editSelect}
                          style={{ flex: 1 }}
                          value={line.productId ?? "__custom__"}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val === "__custom__") {
                              setEditLines((prev) =>
                                prev.map((l) =>
                                  l.id === line.id
                                    ? { ...l, productId: null }
                                    : l,
                                ),
                              );
                            } else {
                              const prod = products.find((p) => p.id === val);
                              setEditLines((prev) =>
                                prev.map((l) =>
                                  l.id === line.id
                                    ? {
                                        ...l,
                                        productId: val,
                                        name: prod?.name ?? l.name,
                                      }
                                    : l,
                                ),
                              );
                            }
                          }}
                        >
                          <option value="__custom__">
                            {t("— Custom Product —")}
                          </option>
                          {products.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      {!line.productId && (
                        <input
                          type="text"
                          className={styles.editInput}
                          placeholder={t("Item name")}
                          value={line.name}
                          onChange={(e) => {
                            const val = e.target.value;
                            setEditLines((prev) =>
                              prev.map((l) =>
                                l.id === line.id ? { ...l, name: val } : l,
                              ),
                            );
                          }}
                        />
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      iconOnly
                      icon="trash"
                      className={styles.deleteBtn}
                      onClick={() => handleDeleteLine(line.id)}
                    />
                  </div>

                  {/* Cuts */}
                  <div
                    style={{
                      marginLeft: 28,
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                    }}
                  >
                    {line.cuts.map((cut) => (
                      <div key={cut.id} className={styles.editCutRow}>
                        <Icon
                          name="knife"
                          size={14}
                          style={{ color: "var(--text-muted)" }}
                        />
                        <span
                          style={{
                            fontSize: "var(--text-label)",
                            color: "var(--text-secondary)",
                          }}
                        >
                          {t("cutting")}
                        </span>
                        <input
                          type="text"
                          className={styles.editInput}
                          style={{ flex: 1, maxWidth: 260 }}
                          placeholder={t("e.g. yakiniku pack per 200g")}
                          value={cut.text}
                          onChange={(e) => {
                            const val = e.target.value;
                            setEditLines((prev) =>
                              prev.map((l) =>
                                l.id === line.id
                                  ? {
                                      ...l,
                                      cuts: l.cuts.map((c) =>
                                        c.id === cut.id
                                          ? { ...c, text: val }
                                          : c,
                                      ),
                                    }
                                  : l,
                              ),
                            );
                          }}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          icon="trash"
                          iconOnly
                          onClick={() =>
                            handleDeleteCutFromLine(line.id, cut.id)
                          }
                        />
                      </div>
                    ))}
                    <Button
                      type="button"
                      variant="tertiary"
                      size="sm"
                      icon="add"
                      style={{ alignSelf: "flex-start" }}
                      onClick={() => handleAddCutToLine(line.id)}
                    >
                      {t("Add cutting")}
                    </Button>
                  </div>

                  {/* Price Row */}
                  <div className={styles.itemTotalRow}>
                    <span>{t("Price:")}</span>
                    <div className={styles.priceCalc}>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        className={styles.editInput}
                        style={{ width: 110, textAlign: "right" }}
                        value={line.price}
                        placeholder="0"
                        onChange={(e) => {
                          const val = e.target.value;
                          setEditLines((prev) =>
                            prev.map((l) =>
                              l.id === line.id ? { ...l, price: val } : l,
                            ),
                          );
                        }}
                      />
                      <span style={{ textAlign: "left", width: "32px" }}>
                        x {line.qty}
                      </span>
                      <span className={styles.lineTotalPrice}>
                        {currency.format(
                          (parseFloat(line.price) || 0) *
                            (parseFloat(line.qty) || 0),
                        )}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <Button
              type="button"
              variant="secondary"
              buttonStyle="fullWidth"
              size="lg"
              icon="add"
              onClick={() => setIsAddItemModalOpen(true)}
              style={{
                marginTop: "var(--space-md)",
                height: 44,
                fontWeight: 600,
              }}
            >
              {t("Add Item")}
            </Button>
          </Card>
        </div>
      </div>

      <AddItemModal
        open={isAddItemModalOpen}
        products={products}
        unitOptions={UNIT_OPTIONS}
        corrections={corrections}
        onClose={() => setIsAddItemModalOpen(false)}
        onConfirm={handleConfirmAddItem}
      />
    </div>
  );
}
