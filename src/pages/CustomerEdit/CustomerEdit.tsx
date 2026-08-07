import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card } from "../../components/Card/Card";
import { Button } from "../../components/Button/Button";
import { useAuth } from "../../hooks/useAuth";
import { useLanguage } from "../../hooks/useLanguage";
import {
  readCustomers,
  updateCustomer,
  createCustomer,
} from "../../lib/directus";
import styles from "./CustomerEdit.module.css";

export function CustomerEdit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const auth = useAuth();
  const { t } = useLanguage();

  const isNew = id === "new";
  const canEdit = auth.can("manage_customers");

  const [loading, setLoading] = useState(!isNew);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // ── Loaded (original) values — used for change detection ──
  const [origName, setOrigName] = useState("");
  const [origCompanyName, setOrigCompanyName] = useState("");
  const [origChannel, setOrigChannel] = useState("horeca");
  const [origContact, setOrigContact] = useState("");
  const [origAddress, setOrigAddress] = useState("");
  const [origArea, setOrigArea] = useState("");
  const [origSales, setOrigSales] = useState("");
  const [origPayTiming, setOrigPayTiming] = useState("upfront");
  const [origPayMethod, setOrigPayMethod] = useState("transfer");
  const [origCreditLimit, setOrigCreditLimit] = useState("0");
  const [origTermDays, setOrigTermDays] = useState("0");

  // ── Working copy ──
  const [name, setName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [channel, setChannel] = useState("horeca");
  const [contact, setContact] = useState("");
  const [address, setAddress] = useState("");
  const [area, setArea] = useState("");
  const [sales, setSales] = useState("");
  const [payTiming, setPayTiming] = useState("upfront");
  const [payMethod, setPayMethod] = useState("transfer");
  const [creditLimit, setCreditLimit] = useState("0");
  const [termDays, setTermDays] = useState("0");

  useEffect(() => {
    if (isNew) return;
    let cancelled = false;

    async function loadData() {
      setLoading(true);
      setError(null);

      const res = await readCustomers({ filter: { id: { _eq: id } } });
      if (cancelled) return;

      if (res.error || !res.data?.[0]) {
        setError(res.error || "Customer not found.");
        setLoading(false);
        return;
      }

      const c = res.data[0];

      // Populate originals
      setOrigName(c.name);
      setOrigCompanyName(c.company_name ?? "");
      setOrigChannel(c.channel ?? "horeca");
      setOrigContact(c.contact ?? "");
      setOrigAddress(c.address ?? "");
      setOrigArea(c.area ?? "");
      setOrigSales(c.sales ?? "");
      setOrigPayTiming(c.pay_timing ?? "upfront");
      setOrigPayMethod(c.pay_method ?? "transfer");
      setOrigCreditLimit(String(c.credit_limit ?? 0));
      setOrigTermDays(String(c.term_days ?? 0));

      // Populate working copies
      setName(c.name);
      setCompanyName(c.company_name ?? "");
      setChannel(c.channel ?? "horeca");
      setContact(c.contact ?? "");
      setAddress(c.address ?? "");
      setArea(c.area ?? "");
      setSales(c.sales ?? "");
      setPayTiming(c.pay_timing ?? "upfront");
      setPayMethod(c.pay_method ?? "transfer");
      setCreditLimit(String(c.credit_limit ?? 0));
      setTermDays(String(c.term_days ?? 0));

      setLoading(false);
    }

    loadData();
    return () => {
      cancelled = true;
    };
  }, [id, isNew]);

  // ── Redirect unauthorized users away ──
  useEffect(() => {
    if (!loading && !canEdit) {
      navigate(isNew ? "/customers" : `/customers/${id}`, { replace: true });
    }
  }, [loading, canEdit, navigate, id, isNew]);

  // ── Change detection ──
  const hasChanges =
    name.trim() !== origName.trim() ||
    companyName.trim() !== origCompanyName.trim() ||
    channel !== origChannel ||
    contact.trim() !== origContact.trim() ||
    address.trim() !== origAddress.trim() ||
    area.trim() !== origArea.trim() ||
    sales.trim() !== origSales.trim() ||
    payTiming !== origPayTiming ||
    payMethod !== origPayMethod ||
    creditLimit !== origCreditLimit ||
    termDays !== origTermDays;

  const canSave = hasChanges && !!name.trim() && !saving;

  function handleCancel() {
    navigate(isNew ? "/customers" : `/customers/${id}`);
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave) return;

    setSaving(true);
    const payload = {
      name: name.trim(),
      company_name: companyName.trim() || null,
      channel,
      contact: contact.trim() || null,
      address: address.trim() || null,
      area: area.trim() || null,
      sales: sales.trim() || null,
      pay_timing: payTiming,
      pay_method: payMethod,
      credit_limit: parseInt(creditLimit.replace(/[^\d]/g, ""), 10) || 0,
      term_days: parseInt(termDays, 10) || 0,
    };

    let res;
    if (isNew) {
      res = await createCustomer({ id: "c-" + Date.now().toString(36), ...payload });
    } else if (id) {
      res = await updateCustomer(id, payload);
    }

    setSaving(false);

    if (res?.error) {
      setError(`Failed to save: ${res.error}`);
    } else {
      navigate(isNew ? "/customers" : `/customers/${id}`);
    }
  };

  if (loading) return <div className={styles.container}>{t("Loading…")}</div>;
  if (error)
    return (
      <div className={styles.container} style={{ color: "var(--state-error)" }}>
        {t(error)}
      </div>
    );

  return (
    <div className={styles.container}>
      <div className={styles.mainColumn}>
        {/* ── Sticky Header ── */}
        <header className={styles.header}>
          <div className={styles.titleSection}>
            <Button
              type="button"
              variant="tertiary"
              icon="chevronLeft"
              onClick={handleCancel}
            >
              {t("Back to customer")}
            </Button>
            <div className={styles.titleRow}>
              <h2 className={styles.title}>{t("Edit Customer")}</h2>
            </div>
          </div>
          <div className={styles.actions}>
            <Button
              type="button"
              variant="secondary"
              onClick={handleCancel}
              disabled={saving}
            >
              {t("Cancel")}
            </Button>
            <Button
              type="button"
              variant="primary"
              icon="save"
              disabled={!canSave}
              onClick={handleSave}
            >
              {saving ? t("Saving…") : t("Save Changes")}
            </Button>
          </div>
        </header>

        {error && <div className={styles.error}>{t(error)}</div>}

        {/* ── Identity ── */}
        <Card>
          <h3 className={styles.heading}>{t("Customer Details")}</h3>
          <div className={styles.fields}>
            <div className={styles.row}>
              <label className={styles.field}>
                <span className={styles.label}>{t("Restaurant / Outlet Name")} *</span>
                <input
                  type="text"
                  className={styles.input}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  autoFocus={isNew}
                  placeholder="e.g. Toko Makmur"
                  disabled={saving}
                />
              </label>
              <label className={styles.field}>
                <span className={styles.label}>{t("Company Name (PT / CV for Invoice)")}</span>
                <input
                  type="text"
                  className={styles.input}
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="e.g. PT En Prima Food & Beverages"
                  disabled={saving}
                />
              </label>
            </div>
            <div className={styles.row}>
              <label className={styles.field}>
                <span className={styles.label}>{t("Channel")}</span>
                <select
                  className={styles.select}
                  value={channel}
                  onChange={(e) => setChannel(e.target.value)}
                  disabled={saving}
                >
                  <option value="horeca">{t("Horeca")}</option>
                  <option value="b2b">{t("B2B")}</option>
                  <option value="retail">{t("Retail")}</option>
                  <option value="other">{t("Other")}</option>
                </select>
              </label>
              <label className={styles.field}>
                <span className={styles.label}>{t("Area")}</span>
                <input
                  type="text"
                  className={styles.input}
                  value={area}
                  onChange={(e) => setArea(e.target.value)}
                  placeholder="e.g. Jakarta Selatan"
                  disabled={saving}
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
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                disabled={saving}
                placeholder="Delivery address"
              />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>{t("Phone / Contact")}</span>
              <input
                type="text"
                className={styles.input}
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                placeholder="e.g. +62 812..."
                disabled={saving}
              />
            </label>
          </div>
        </Card>

        {/* ── Finance ── */}
        <Card>
          <h3 className={styles.heading}>{t("Finance")}</h3>
          <div className={styles.fields}>

            <div className={styles.row}>
              <label className={styles.field}>
                <span className={styles.label}>{t("Sales Rep")}</span>
                <input
                  type="text"
                  className={styles.input}
                  value={sales}
                  onChange={(e) => setSales(e.target.value)}
                  placeholder="e.g. Budi"
                  disabled={saving}
                />
              </label>
              <label className={styles.field}>
                <span className={styles.label}>{t("Payment Timing")}</span>
                <select
                  className={styles.select}
                  value={payTiming}
                  onChange={(e) => setPayTiming(e.target.value)}
                  disabled={saving}
                >
                  <option value="upfront">{t("Upfront")}</option>
                  <option value="cod">{t("COD")}</option>
                  <option value="terms">{t("Terms")}</option>
                </select>
              </label>
            </div>
            <div className={styles.row}>
              <label className={styles.field}>
                <span className={styles.label}>{t("Payment Method")}</span>
                <select
                  className={styles.select}
                  value={payMethod}
                  onChange={(e) => setPayMethod(e.target.value)}
                  disabled={saving}
                >
                  <option value="transfer">{t("Transfer")}</option>
                  <option value="cash">{t("Cash")}</option>
                  <option value="giro">{t("Giro")}</option>
                </select>
              </label>
              <label className={styles.field}>
                <span className={styles.label}>{t("Credit Limit (IDR)")}</span>
                <input
                  type="text"
                  inputMode="numeric"
                  className={styles.input}
                  value={creditLimit}
                  onChange={(e) =>
                    setCreditLimit(e.target.value.replace(/[^\d]/g, ""))
                  }
                  placeholder="0"
                  disabled={saving}
                />
              </label>
            </div>
            <div className={styles.row}>
              <label className={styles.field}>
                <span className={styles.label}>{t("Terms (days)")}</span>
                <input
                  type="number"
                  className={styles.input}
                  value={termDays}
                  onChange={(e) => setTermDays(e.target.value)}
                  placeholder="0"
                  disabled={saving}
                />
              </label>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
