import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Card } from "../../components/Card/Card";
import { Icon } from "../../components/Icon/Icon";
import { Button } from "../../components/Button/Button";
import {
  AddItemModal,
  type AddItemResult,
} from "../../components/AddItemModal/AddItemModal";
import {
  useAuth,
  useCurrentUserId,
  useCurrentUserName,
} from "../../hooks/useAuth";
import { useLanguage } from "../../hooks/useLanguage";
import { useDialog } from "../../hooks/useDialog";
import {
  appendOrderHistory,
  createAttachment,
  createLineCut,
  createOrder,
  createOrderLines,
  createCustomer,
  getNextOrderNo,
  readCorrections,
  readCustomers,
  readOrders,
  readProducts,
  updateOrder,
  uploadFile,
  upsertCorrection,
  type CreateOrderLineInput,
  type ParsedOrderDraft,
  type ParsedOrderLine,
} from "../../lib/directus";
import { matchCustomer } from "../../lib/customerMatch";
import type {
  CorrectionsCollection,
  CustomersCollection,
  ProductsCollection,
} from "../../types/directus";
import { dateCode, buildOrderNo, parseOrderNo } from "../../lib/orderNo";
import styles from "./OrderNew.module.css";

interface NewOrderLocationState {
  prefill?: ParsedOrderDraft | null;
  rawText?: string;
  attachments?: File[];
  /** Where to return to on cancel / after create — the page this flow was
   *  started from (Orders list or Dashboard). Falls back to "/orders" when
   *  absent (e.g. a direct link), rather than relying on browser history
   *  depth (see OrderDetail's Back button for the same pattern). */
  from?: string;
}

interface CutItem {
  id: string;
  text: string;
}

interface LineDraft {
  id: string;
  productId: string | "";
  freeText: string;
  qty: string;
  unit: string;
  price: string;
  cuts: CutItem[];
  parseStatus?: ParsedOrderLine["status"];
  learned?: boolean;
  rawText?: string;
}

const UNITS = ["kg", "gram", "pack", "pcs", "box", "ekor", "loaf"] as const;

let lineSeq = 0;
function newLineId() {
  lineSeq += 1;
  return `line-${lineSeq}`;
}
function emptyLine(): LineDraft {
  return {
    id: newLineId(),
    productId: "",
    freeText: "",
    qty: "1",
    unit: "pcs",
    price: "",
    cuts: [],
  };
}
function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

const currency = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  minimumFractionDigits: 0,
});

/** Full page: pick/create a customer + add product lines, optionally prefilled
 *  from the WhatsApp intake parser (via router state — see Dashboard.tsx's
 *  handleParsed). Mirrors OrderDetail's layout (sticky header, side panel) so
 *  creating an order feels like the same surface as editing one. */
export function OrderNew() {
  const navigate = useNavigate();
  const location = useLocation();
  const { prefill, rawText, attachments, from } =
    (location.state as NewOrderLocationState) || {};
  const returnTo = from ?? "/orders";

  const can = useAuth().can;
  const { t } = useLanguage();
  const { alert } = useDialog();
  const currentUserName = useCurrentUserName();
  const userId = useCurrentUserId();
  const allowed = can("createOrders");

  const [isPanelOpen, setIsPanelOpen] = useState(true);

  const [orderNoValue, setOrderNoValue] = useState("");
  const [orderNoTouched, setOrderNoTouched] = useState(false);
  const [existingOrders, setExistingOrders] = useState<
    {
      id: string;
      no: string;
      customer_name: string | null;
      stage: string | null;
    }[]
  >([]);
  // The existing order this new one will supersede once created — set by
  // tapping "Replace it" on the duplicate-number banner below. Cleared
  // whenever the order number is edited by hand or the delivery date
  // changes (a new date means a different set of existing orders, so a
  // stale replaceId from before no longer means anything).
  const [replaceId, setReplaceId] = useState<string | null>(null);

  const [customers, setCustomers] = useState<CustomersCollection[]>([]);
  const [products, setProducts] = useState<ProductsCollection[]>([]);
  const [corrections, setCorrections] = useState<CorrectionsCollection[]>([]);
  const [loadingOpts, setLoadingOpts] = useState(false);

  const [dateGuessed, setDateGuessed] = useState(false);
  const [multiCustomer, setMultiCustomer] = useState(false);

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [company, setCompany] = useState("");
  const [deliverDate, setdeliverDate] = useState("");
  const [sales, setSales] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()]);

  const [isAddItemModalOpen, setIsAddItemModalOpen] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadOptions() {
      setLoadingOpts(true);
      if (currentUserName) setSales(currentUserName);
      const [c, p, corr] = await Promise.all([
        readCustomers({
          fields: ["id", "name", "channel", "contact", "area"],
          limit: -1,
          sort: ["name"],
        }),
        readProducts({
          fields: ["id", "name", "catch_weight", "oos"],
          filter: { oos: { _neq: true } },
          limit: -1,
          sort: ["name"],
        }),
        readCorrections(),
      ]);
      if (cancelled) return;
      if (c.error === null) setCustomers(c.data);
      if (p.error === null) setProducts(p.data);
      if (corr.error === null) setCorrections(corr.data);

      setLoadingOpts(false);

      if (prefill && !cancelled) {
        if (prefill.customerTyped) setCustomerName(prefill.customerTyped);
        if (prefill.phone) setCustomerPhone(prefill.phone);
        if (prefill.address) setCustomerAddress(prefill.address);
        if (prefill.company) setCompany(prefill.company);
        if (prefill.deliver) setdeliverDate(prefill.deliver.slice(0, 10));
        setDateGuessed(!!prefill.dateGuessed);
        setMultiCustomer(!!prefill.multiCustomer);

        if (prefill.ref && prefill.deliver) {
          const seq = parseInt(prefill.ref, 10);
          if (Number.isFinite(seq) && seq > 0) {
            setOrderNoValue(buildOrderNo(dateCode(prefill.deliver), seq));
            setOrderNoTouched(true);
          }
        }

        if (prefill.sales) setSales(prefill.sales);
        if (prefill.lines && prefill.lines.length > 0 && p.data) {
          const productMap = new Map(p.data.map((pr) => [pr.id, pr.name]));
          setLines(
            prefill.lines.map((pl) => ({
              id: newLineId(),
              productId:
                pl.productId && productMap.has(pl.productId)
                  ? pl.productId
                  : "",
              freeText: pl.productId ? "" : pl.name,
              qty: String(pl.qty ?? 1),
              unit: pl.unit || "kg",
              price: pl.price ? String(pl.price) : "",
              cuts: [],
              parseStatus: pl.status,
              learned: pl.learned,
              rawText: pl.raw,
            })),
          );
        }
      }
    }
    loadOptions();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserName]); // prefill is a one-shot value from navigation state — deliberately not a dep

  useEffect(() => {
    if (!deliverDate) return;
    const dc = dateCode(deliverDate);
    let cancelled = false;
    async function refresh() {
      const res = await readOrders({
        fields: ["id", "no", "customer_name", "stage"],
        filter: { no: { _starts_with: dc } },
        limit: -1,
      });
      if (cancelled) return;
      setExistingOrders(
        (res.data ?? [])
          .filter((o): o is typeof o & { id: string; no: string } => !!o.no)
          .map((o) => ({
            id: o.id,
            no: o.no as string,
            customer_name: o.customer_name ?? null,
            stage: o.stage ?? null,
          })),
      );
      // A new date means a different set of existing orders — a replaceId
      // chosen against the previous date's duplicate no longer applies.
      setReplaceId(null);
      if (!orderNoTouched) {
        const noRes = await getNextOrderNo(dc);
        if (!cancelled && noRes.error === null) setOrderNoValue(noRes.data);
      }
    }
    refresh();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deliverDate]);

  const dcOf = deliverDate ? dateCode(deliverDate) : "";
  const parsedEntered = parseOrderNo(orderNoValue);
  const usedSeqs = new Set(
    existingOrders
      .map((o) => parseOrderNo(o.no))
      .filter((p): p is NonNullable<typeof p> => !!p && p.dateCode === dcOf)
      .map((p) => p.seq),
  );
  let lowestFreeSeq = 1;
  while (usedSeqs.has(lowestFreeSeq)) lowestFreeSeq++;
  const expectedNo = dcOf ? buildOrderNo(dcOf, lowestFreeSeq) : "";
  const dupOrder = existingOrders.find((o) => o.no === orderNoValue) ?? null;
  const badNo = orderNoValue !== "" && !/^\d{9}$/.test(orderNoValue);
  const seqGap =
    !dupOrder &&
    !badNo &&
    dcOf &&
    parsedEntered?.dateCode === dcOf &&
    parsedEntered.seq !== lowestFreeSeq;
  // Ported from the prototype's `deliverPast` (Dev-Intake.jsx:154) — a
  // gentle hint only, never blocking Create, same as the prototype.
  const today0 = new Date();
  today0.setHours(0, 0, 0, 0);
  const deliverPast = !!deliverDate && new Date(deliverDate) < today0;
  const deliverDateLabel = deliverDate
    ? new Date(deliverDate).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
      })
    : "";

  const productNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of products) m.set(p.id, p.name);
    return m;
  }, [products]);

  const customerMatch = useMemo(
    () => matchCustomer(customerName, customerPhone, customers),
    [customerName, customerPhone, customers],
  );

  function handleCustomerNameChange(name: string) {
    setCustomerName(name);
    const exact = customers.find(
      (c) => c.name.trim().toLowerCase() === name.trim().toLowerCase(),
    );
    if (exact) {
      if (!customerPhone && exact.contact) setCustomerPhone(exact.contact);
      if (!customerAddress && exact.address) setCustomerAddress(exact.address);
      if (!sales && exact.sales) setSales(exact.sales);
      if (!company && exact.company_name) setCompany(exact.company_name);
    }
  }

  function acceptCustomerMatch(customer: CustomersCollection) {
    setCustomerName(customer.name);
    if (!customerPhone && customer.contact) setCustomerPhone(customer.contact);
    if (!customerAddress && customer.address)
      setCustomerAddress(customer.address);
    if (!sales && customer.sales) setSales(customer.sales);
    if (!company && customer.company_name) setCompany(customer.company_name);
  }

  function updateLine(id: string, patch: Partial<LineDraft>) {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }

  function removeLine(id: string) {
    setLines((prev) =>
      prev.length === 1 ? prev : prev.filter((l) => l.id !== id),
    );
  }

  function handleAddCutToLine(lineId: string) {
    setLines((prev) =>
      prev.map((l) =>
        l.id === lineId
          ? { ...l, cuts: [...l.cuts, { id: "cut_" + Date.now(), text: "" }] }
          : l,
      ),
    );
  }

  function handleDeleteCutFromLine(lineId: string, cutId: string) {
    setLines((prev) =>
      prev.map((l) =>
        l.id === lineId
          ? { ...l, cuts: l.cuts.filter((c) => c.id !== cutId) }
          : l,
      ),
    );
  }

  function handleAddMatchedItem(result: AddItemResult) {
    setLines((prev) => [
      ...prev,
      {
        id: newLineId(),
        productId: result.productId ?? "",
        freeText: result.productId ? "" : result.name,
        qty: result.qty,
        unit: result.unit,
        price: "",
        cuts: [],
        // Threaded through to Create-time so the existing
        // upsertCorrection sweep below learns from manually-matched
        // items too, not just WhatsApp-paste prefill lines.
        rawText: result.rawText,
        learned: result.learned,
        parseStatus: result.learned ? "recognized" : undefined,
      },
    ]);
  }

  function cancel() {
    if (submitting) return;
    navigate(returnTo);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!allowed) {
      setError(t("Your role doesn't have permission to create orders."));
      return;
    }
    if (!customerName.trim()) {
      setError(t("Enter a customer / restaurant name."));
      return;
    }
    if (badNo) {
      setError(t("Order number format is invalid."));
      return;
    }
    if (dupOrder && !replaceId) {
      setError(`Order #${orderNoValue} already exists.`);
      return;
    }
    const trimmedName = customerName.trim();
    const cleanLines = lines
      .map((l) => ({
        ...l,
        qtyNum: parseFloat(l.qty),
        name: l.productId
          ? (productNameById.get(l.productId) ?? "")
          : l.freeText.trim(),
      }))
      .filter(
        (l) => l.name.length > 0 && l.qtyNum > 0 && Number.isFinite(l.qtyNum),
      );
    if (cleanLines.length === 0) {
      setError(
        t("Add at least one line with a name and a quantity greater than 0."),
      );
      return;
    }

    setSubmitting(true);
    setError(null);

    // "Replace it" was tapped on the duplicate-number banner — the old
    // order must be renamed off #orderNoValue (its `no` field is unique in
    // Directus, so both couldn't hold the same value even briefly) and
    // cancelled *before* the new order is created with that number, or the
    // create below would 409 on the same constraint. Cancel, not delete —
    // this app has no order-delete anywhere; cancelling keeps the audit
    // trail and stays reversible via the existing Restore flow, unlike the
    // prototype's in-memory hard delete.
    if (replaceId) {
      const beingReplaced = existingOrders.find((o) => o.id === replaceId);
      const replaceRes = await updateOrder(replaceId, {
        no: `${orderNoValue}-REPL${Date.now().toString(36)}`,
        cancelled: true,
        stage: "cancelled",
        cancelled_from: beingReplaced?.stage ?? "intake",
        undo_snapshot: null,
      });
      if (replaceRes.error) {
        setError(
          `Failed to replace order #${orderNoValue}: ${replaceRes.error}`,
        );
        setSubmitting(false);
        return;
      }
      await appendOrderHistory({
        order_id: replaceId,
        what: `Cancelled — replaced by a new order (was #${orderNoValue})`,
        who: userId,
        stage: "cancelled",
      });
    }

    let resolvedCustomerId: string;
    if (customerMatch.type === "exact" && customerMatch.customer) {
      resolvedCustomerId = customerMatch.customer.id;
    } else {
      const newCustRes = await createCustomer({
        name: trimmedName,
        company_name: company.trim() || null,
        channel: "horeca",
        contact: customerPhone.trim() || null,
        address: customerAddress.trim() || null,
        sales: sales || null,
      });
      if (newCustRes.error !== null || newCustRes.data === null) {
        setError(`Failed to create customer: ${newCustRes.error ?? "unknown"}`);
        setSubmitting(false);
        return;
      }
      resolvedCustomerId = newCustRes.data.id;
      setCustomers((prev) => [...prev, newCustRes.data!]);
    }

    const orderRes = await createOrder({
      no: orderNoValue,
      customer_id: resolvedCustomerId,
      customer_name: trimmedName,
      customer_contact: customerPhone.trim() || null,
      customer_address: customerAddress.trim() || null,
      customer_legal_name: company.trim() || null,
      channel: "horeca",
      stage: "intake",
      status: "Open",
      sales: sales || null,
      deliver_at: deliverDate || null,
      order_date: todayISO(),
      notes: notes || null,
    });
    if (orderRes.error !== null || orderRes.data === null) {
      setError(`Failed to create order: ${orderRes.error ?? "unknown"}`);
      setSubmitting(false);
      return;
    }
    const orderId = orderRes.data.id;

    const lineInputs: CreateOrderLineInput[] = cleanLines.map((l, i) => ({
      order_id: orderId,
      product_id: l.productId || null,
      name: l.name,
      qty: l.qtyNum,
      unit: l.unit,
      status: l.productId ? "recognized" : "manual",
      sort_order: i,
    }));
    const linesRes = await createOrderLines(lineInputs);
    if (linesRes.error !== null) {
      setError(
        `Order created but lines failed: ${linesRes.error}. Order id ${orderId}.`,
      );
      setSubmitting(false);
      navigate(`/orders/${orderId}`, {
        replace: true,
        state: { from: returnTo },
      });
      return;
    }

    const cutInputs: { line_id: string; text: string; sort_order: number }[] =
      [];
    cleanLines.forEach((l, i) => {
      const savedLine = linesRes.data?.[i];
      if (!savedLine) return;
      l.cuts.forEach((c, ci) => {
        const text = c.text.trim();
        if (text)
          cutInputs.push({ line_id: savedLine.id, text, sort_order: ci });
      });
    });
    if (cutInputs.length > 0) {
      const cutResults = await Promise.allSettled(
        cutInputs.map((c) => createLineCut(c)),
      );
      const failedCuts = cutResults.filter(
        (r) =>
          r.status === "rejected" ||
          (r.status === "fulfilled" && r.value.error !== null),
      ).length;
      if (failedCuts > 0) {
        alert(
          `Order created, but ${failedCuts} cutting instruction(s) failed to save. You can add them from the order page.`,
          { title: t("Some cutting instructions didn't save") },
        );
      }
    }

    const correctionPromises = cleanLines
      .filter((l) => l.productId && l.rawText)
      .map((l) => upsertCorrection(l.rawText!, l.productId));
    await Promise.allSettled(correctionPromises);

    if (attachments && attachments.length > 0) {
      const attachmentResults = await Promise.allSettled(
        attachments.map(async (file) => {
          const uploadRes = await uploadFile(file);
          if (uploadRes.error || !uploadRes.data)
            throw new Error(uploadRes.error ?? "upload failed");
          return createAttachment({
            order_uuid: orderId,
            doc_type: "PO",
            label: file.name || "PO",
            document_file: uploadRes.data.id,
            created_by: userId ?? undefined,
          });
        }),
      );
      const failedCount = attachmentResults.filter(
        (r) => r.status === "rejected",
      ).length;
      if (failedCount > 0) {
        alert(
          `Order created, but ${failedCount} attachment(s) failed to upload. You can add them from the order page.`,
          { title: t("Some attachments didn't upload") },
        );
      }
    }

    await appendOrderHistory({
      order_id: orderId,
      what: "Order created",
      who: null,
      stage: "intake",
    });

    setSubmitting(false);
    // Go straight into the freshly created order — the natural next step,
    // and consistent with clicking an order anywhere else in the app.
    // `replace: true` + carrying `from` forward: the just-submitted form
    // shouldn't linger in history, and Back from OrderDetail should return
    // to wherever this flow started (Orders or Dashboard), not here.
    navigate(`/orders/${orderId}`, {
      replace: true,
      state: { from: returnTo },
    });
  }

  return (
    <div className={styles.container}>
      <div
        className={[
          styles.layoutGrid,
          isPanelOpen ? styles.layoutGridWithPanel : styles.layoutGridFull,
        ].join(" ")}
      >
        <div className={styles.mainColumn}>
          <header className={styles.header}>
            <div className={styles.titleSection}>
              <Button
                type="button"
                variant="tertiary"
                icon="chevronLeft"
                onClick={cancel}
              >
                {t("Back")}
              </Button>
              <h3 className={styles.title}>{t("New Order")}</h3>
            </div>
            <div className={styles.actions}>
              <Button
                type="button"
                variant="secondary"
                onClick={cancel}
                disabled={submitting}
              >
                <Icon name="close" size={16} /> {t("Cancel")}
              </Button>
              <Button
                type="submit"
                form="new-order-form"
                variant="primary"
                icon="save"
                disabled={
                  submitting ||
                  !allowed ||
                  loadingOpts ||
                  (!!dupOrder && !replaceId)
                }
              >
                {" "}
                {submitting ? t("Creating…") : t("Create order")}
              </Button>
            </div>
          </header>

          {!allowed && (
            <p className={styles.error} role="alert">
              {t("Your role doesn't have permission to create orders.")}
            </p>
          )}
          {loadingOpts && (
            <p className={styles.muted}>{t("Loading customers + products…")}</p>
          )}

          <form
            id="new-order-form"
            className={styles.form}
            onSubmit={handleSubmit}
          >
            {multiCustomer && (
              <p className={styles.error} role="alert">
                {t(
                  "This looks like more than one customer's order — please enter them as separate orders.",
                )}
              </p>
            )}

            {error && (
              <p className={styles.error} role="alert">
                {error}
              </p>
            )}

            <Card className={styles.customerCard}>
              {badNo && (
                <p className={`${styles.hint} ${styles.banner}`}>
                  {t("Order no. should look like")} {dcOf || "YYMMDD"}NNN (
                  {t("9 digits")}).
                </p>
              )}
              {dupOrder && !replaceId && (
                <div
                  className={`${styles.hint} ${styles.banner} ${styles.bannerWarning}`}
                >
                  <Icon name="alert" size={15} />
                  <span>
                    {t("Order")} #{orderNoValue} {t("already exists")}
                    {dupOrder.customer_name
                      ? ` (${dupOrder.customer_name})`
                      : ""}
                    . {t("Duplicate?")}
                  </span>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setOrderNoValue(expectedNo);
                      setOrderNoTouched(true);
                    }}
                  >
                    {t("Use")} #{expectedNo}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setReplaceId(dupOrder.id)}
                  >
                    {t("Replace it")}
                  </Button>
                </div>
              )}
              {replaceId && (
                <div
                  className={`${styles.hint} ${styles.banner} ${styles.bannerInfo}`}
                >
                  <Icon name="alert" size={15} />
                  <span>
                    {t("Will replace the existing")} #{orderNoValue}.
                  </span>
                  <Button
                    type="button"
                    variant="tertiary"
                    size="sm"
                    onClick={() => setReplaceId(null)}
                    style={{ backgroundColor: "transparent" }}
                  >
                    {t("Undo")}
                  </Button>
                </div>
              )}
              {seqGap && (
                <div className={`${styles.hint} ${styles.banner}`}>
                  <span>
                    {t("The next open queue number is")} #{expectedNo} —{" "}
                    {t("but you entered")} #{orderNoValue}.{" "}
                    {t("Typo, or keep it?")}
                  </span>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setOrderNoValue(expectedNo);
                      setOrderNoTouched(true);
                    }}
                  >
                    {t("Use")} #{expectedNo}
                  </Button>
                </div>
              )}
              {deliverPast && (
                <div
                  className={`${styles.hint} ${styles.banner} ${styles.bannerWarning}`}
                >
                  <Icon name="alert" size={15} />
                  <span>
                    {t("Delivery date")} {deliverDateLabel}{" "}
                    {t("is in the past — is this a typo?")}
                  </span>
                </div>
              )}
              <div className={styles.row}>
                <label className={styles.field}>
                  <span className={styles.label}>{t("Order No.")}</span>
                  <input
                    type="text"
                    className={styles.input}
                    value={orderNoValue}
                    onChange={(e) => {
                      setOrderNoValue(e.target.value.replace(/\D/g, ""));
                      setOrderNoTouched(true);
                      setReplaceId(null);
                    }}
                    disabled={submitting || !allowed}
                    placeholder="YYMMDDNNN"
                  />
                </label>
                <label className={styles.field}>
                  <span className={styles.label}>{t("Delivery Date")}</span>
                  <input
                    type="date"
                    className={styles.input}
                    value={deliverDate}
                    onChange={(e) => {
                      setdeliverDate(e.target.value);
                      setDateGuessed(false);
                    }}
                    disabled={submitting || !allowed}
                  />
                  {dateGuessed && (
                    <p
                      className={styles.secondary}
                      style={{ color: "var(--state-warning)" }}
                    >
                      {t("Delivery date was guessed — please check.")}
                    </p>
                  )}
                </label>
              </div>
              <div className={styles.row}>
                <label className={styles.field}>
                  <span className={styles.label}>
                    {t("Customer / Restaurant")} *
                  </span>
                  <input
                    type="text"
                    className={styles.input}
                    list="customer-suggestions"
                    value={customerName}
                    onChange={(e) => handleCustomerNameChange(e.target.value)}
                    disabled={submitting || !allowed}
                    placeholder={t("Type or select a customer")}
                    required
                  />
                  <datalist id="customer-suggestions">
                    {customers.map((c) => (
                      <option key={c.id} value={c.name} />
                    ))}
                  </datalist>
                  {customerMatch.type === "exact" && (
                    <div
                      className={styles.secondary}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "var(--space-xs)",
                        color: "var(--state-success)",
                      }}
                    >
                      <Icon name="check" /> {t("Existing customer.")}
                    </div>
                  )}
                  {customerMatch.type === "new" && customerName.trim() && (
                    <div className={styles.secondary}>
                      {t("New customer —")} <b>{customerName.trim()}</b>{" "}
                      {t("will be saved.")}
                    </div>
                  )}
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
                    disabled={submitting || !allowed}
                    placeholder="e.g. PT En Prima Food & Beverages"
                  />
                </label>
              </div>

              {customerMatch.type === "fuzzy" && customerMatch.customer && (
                <div className={styles.matchBanner} data-tone="warning">
                  {t("Did you mean")} <b>{customerMatch.customer.name}</b>?{" "}
                  {t("Looks like the same customer.")}
                  <button
                    type="button"
                    className={styles.addLineBtn}
                    style={{ marginLeft: 8 }}
                    onClick={() => acceptCustomerMatch(customerMatch.customer!)}
                  >
                    {t("Use")} {customerMatch.customer.name}
                  </button>
                </div>
              )}
              {customerMatch.type === "phone" && customerMatch.customer && (
                <div className={styles.matchBanner} data-tone="success">
                  {t("Matched by phone number to")}{" "}
                  <b>{customerMatch.customer.name}</b>.
                  <button
                    type="button"
                    className={styles.addLineBtn}
                    style={{ marginLeft: 8 }}
                    onClick={() => acceptCustomerMatch(customerMatch.customer!)}
                  >
                    {t("Use")} {customerMatch.customer.name}
                  </button>
                </div>
              )}

              <div className={styles.row}>
                <label className={styles.field}>
                  <span className={styles.label}>{t("Customer Contact")}</span>
                  <input
                    type="text"
                    className={styles.input}
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    disabled={submitting || !allowed}
                    placeholder={t("WhatsApp / phone")}
                  />
                </label>
                <label className={styles.field}>
                  <span className={styles.label}>{t("Sales Rep")}</span>
                  <input
                    type="text"
                    className={styles.input}
                    value={sales}
                    onChange={(e) => setSales(e.target.value)}
                    disabled={submitting || !allowed}
                    placeholder={t("Auto-filled from your name")}
                  />
                </label>
              </div>
              <label className={styles.field}>
                <span className={styles.label}>
                  {t("Delivery Address")}{" "}
                  <span className={styles.caption}>({t("Optional")})</span>
                </span>
                <textarea
                  className={styles.input}
                  style={{
                    justifyContent: "flex-start",
                    alignItems: "flex-start",
                    minHeight: "100px",
                  }}
                  value={customerAddress}
                  onChange={(e) => setCustomerAddress(e.target.value)}
                  disabled={submitting || !allowed}
                  placeholder={t("Delivery address")}
                />
              </label>

              <label className={styles.field}>
                <span className={styles.label}>
                  {t("Notes")}{" "}
                  <span className={styles.caption}>({t("Optional")})</span>
                </span>
                <textarea
                  className={styles.input}
                  style={{
                    justifyContent: "flex-start",
                    alignItems: "flex-start",
                    minHeight: "100px",
                  }}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  disabled={submitting || !allowed}
                  placeholder={t("Any note for this order...")}
                />
              </label>
            </Card>

            <Card>
              <div className={styles.heading}>
                {t("Items")}{" "}
                <span className={styles.count}>{lines.length}</span>
              </div>
              <div className={styles.itemsList}>
                {lines.map((l, i) => (
                  <div className={styles.itemRow}>
                    <div className={styles.twoColumnsRow}>
                      <div className={styles.column}>
                        <div className={styles.itemHeaderRow}>
                          <input
                            type="number"
                            min="0"
                            step="0.5"
                            className={styles.input}
                            style={{ maxWidth: "80px" }}
                            value={l.qty}
                            onChange={(e) =>
                              updateLine(l.id, { qty: e.target.value })
                            }
                            placeholder={t("Qty")}
                            disabled={submitting || !allowed}
                          />
                          <select
                            className={styles.select}
                            style={{ maxWidth: 100 }}
                            value={l.unit}
                            onChange={(e) =>
                              updateLine(l.id, { unit: e.target.value })
                            }
                            disabled={submitting || !allowed}
                          >
                            {UNITS.map((u) => (
                              <option key={u} value={u}>
                                {u}
                              </option>
                            ))}
                          </select>
                          <select
                            className={styles.select}
                            value={l.productId}
                            onChange={(e) =>
                              updateLine(l.id, {
                                productId: e.target.value,
                                freeText: "",
                                parseStatus: undefined,
                                learned: undefined,
                              })
                            }
                            disabled={submitting || !allowed}
                          >
                            <option value="">{t("— Custom Product —")}</option>
                            {products.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        {!l.productId && (
                          <input
                            type="text"
                            className={styles.editInput}
                            placeholder={t("Item name")}
                            value={l.freeText}
                            onChange={(e) =>
                              updateLine(l.id, { freeText: e.target.value })
                            }
                          />
                        )}
                        {l.parseStatus && (
                          <span
                            className={styles.statusChip}
                            data-status={l.learned ? "learned" : l.parseStatus}
                          >
                            {l.learned ? t("learned") : t(l.parseStatus)}
                          </span>
                        )}
                      </div>
                      <Button
                        type="button"
                        variant="tertiary"
                        size="md"
                        icon="trash"
                        iconOnly
                        onClick={() => removeLine(l.id)}
                        disabled={submitting || !allowed || lines.length === 1}
                        aria-label={`Remove line ${i + 1}`}
                        className={styles.deleteBtn}
                      ></Button>
                    </div>

                    {/* Cutting instructions */}
                    <div
                      style={{
                        marginLeft: 28,
                        display: "flex",
                        flexDirection: "column",
                        gap: 6,
                      }}
                    >
                      {l.cuts.map((cut) => (
                        <div key={cut.id} className={styles.cutRow}>
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
                            className={styles.input}
                            style={{ flex: 1, maxWidth: 220 }}
                            value={cut.text}
                            placeholder={t("e.g. yakiniku pack per 200g")}
                            onChange={(e) => {
                              const val = e.target.value;
                              setLines((prev) =>
                                prev.map((ln) =>
                                  ln.id === l.id
                                    ? {
                                        ...ln,
                                        cuts: ln.cuts.map((c) =>
                                          c.id === cut.id
                                            ? { ...c, text: val }
                                            : c,
                                        ),
                                      }
                                    : ln,
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
                              handleDeleteCutFromLine(l.id, cut.id)
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
                        onClick={() => handleAddCutToLine(l.id)}
                        disabled={submitting || !allowed}
                      >
                        {t("Add cutting")}
                      </Button>
                    </div>

                    {/* Price & Qty Row */}
                    <div className={styles.itemPriceRow}>
                      <span>{t("Total")}</span>
                      <div className={styles.priceCalc}>
                        <input
                          type="number"
                          min="0"
                          step="any"
                          className={styles.input}
                          style={{ width: 110, textAlign: "right" }}
                          value={l.price}
                          placeholder="0"
                          disabled={submitting || !allowed}
                          onChange={(e) =>
                            updateLine(l.id, { price: e.target.value })
                          }
                        />
                        <span
                          style={{
                            textAlign: "left",
                            width: "32px",
                            whiteSpace: "nowrap",
                          }}
                        >
                          x {l.qty}
                        </span>
                        <span className={styles.lineTotalPrice}>
                          {currency.format(
                            (parseFloat(l.price) || 0) *
                              (parseFloat(l.qty) || 0),
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
          </form>
        </div>

        <aside className={styles.sidePanelColumn}>
          <Button
            type="button"
            variant="secondary"
            icon={isPanelOpen ? "chevronRight" : "chevronLeft"}
            iconOnly
            className={styles.panelToggleBtn}
            isActive={isPanelOpen}
            onClick={() => setIsPanelOpen((prev) => !prev)}
            title={
              isPanelOpen ? t("Collapse side panel") : t("Expand side panel")
            }
          />

          <div
            className={[
              styles.sidePanelStickyContent,
              !isPanelOpen ? styles.sidePanelStickyContentCollapsed : "",
            ].join(" ")}
          >
            <Card className={styles.notesCard}>
              <h3 className={styles.heading}>
                {t("Original WhatsApp message")}
              </h3>
              {rawText && rawText.trim() ? (
                <pre className={styles.pre}>{rawText}</pre>
              ) : (
                <p className={styles.muted}>
                  {t("No pasted message — entered manually.")}
                </p>
              )}
              {attachments && attachments.length > 0 && (
                <div className={styles.attachmentsNote}>
                  <p className={styles.muted}>
                    {attachments.length}{" "}
                    {t("attachment(s) will be added as PO document(s):")}
                  </p>
                  <ul>
                    {attachments.map((f, i) => (
                      <li key={i}>{f.name}</li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>
          </div>
        </aside>
      </div>
      <AddItemModal
        open={isAddItemModalOpen}
        products={products}
        unitOptions={[...UNITS]}
        corrections={corrections}
        onClose={() => setIsAddItemModalOpen(false)}
        onConfirm={handleAddMatchedItem}
      />
    </div>
  );
}
