import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "../../components/Card/Card";
import { Button } from "../../components/Button/Button";
import { useAuth } from "../../hooks/useAuth";
import { useLanguage } from "../../hooks/useLanguage";
import { createCustomer } from "../../lib/directus";
import { parseLatLng } from "../../lib/latlng";
import type { LatLng } from "../../types/directus";
import styles from "./CustomerNew.module.css";

/** Create-a-customer form — layout ported from `CustomerEdit.tsx`, minus the
 *  load-existing/change-detection machinery an edit needs but a fresh record
 *  never does. */
export function CustomerNew() {
  const navigate = useNavigate();
  const auth = useAuth();
  const { t } = useLanguage();

  const canEdit = auth.can("manage_customers");

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [channel, setChannel] = useState("horeca");
  const [contact, setContact] = useState("");
  const [address, setAddress] = useState("");
  const [addressGeoInput, setAddressGeoInput] = useState("");
  const [area, setArea] = useState("");
  const [sales, setSales] = useState("");
  const [payTiming, setPayTiming] = useState("upfront");
  const [payMethod, setPayMethod] = useState("transfer");
  const [creditLimit, setCreditLimit] = useState("0");
  const [termDays, setTermDays] = useState("0");

  // Defence-in-depth — the button that reaches this page is already gated on
  // `manage_customers` (Customers.tsx), same self-guard pattern as every
  // other Edit/New page in this app.
  useEffect(() => {
    if (!canEdit) navigate("/customers", { replace: true });
  }, [canEdit, navigate]);

  const canSave = !!name.trim() && !saving;

  function handleCancel() {
    navigate("/customers");
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave) return;

    const trimmedGeo = addressGeoInput.trim();
    let addressGeo: LatLng | null = null;
    if (trimmedGeo) {
      const parsed = parseLatLng(trimmedGeo);
      if (!parsed) {
        setError(
          "Couldn't read that as coordinates — paste \"lat, lng\" or a Google Maps link with coordinates in it.",
        );
        return;
      }
      addressGeo = parsed;
    }

    setSaving(true);
    // No client-generated `id` — `customers.id` is a real Postgres `uuid`
    // column (`default_value: gen_random_uuid()`); a non-UUID string here
    // fails the column's type check, which Directus reports as a
    // misleading 403 "You don't have permission to access this" rather
    // than a validation error. Confirmed live via curl. Let the DB assign
    // the id, matching `OrderNew.tsx`'s own inline customer-creation path.
    const res = await createCustomer({
      name: name.trim(),
      company_name: companyName.trim() || null,
      channel,
      contact: contact.trim() || null,
      address: address.trim() || null,
      address_geo: addressGeo,
      area: area.trim() || null,
      sales: sales.trim() || null,
      pay_timing: payTiming,
      pay_method: payMethod,
      credit_limit: parseInt(creditLimit.replace(/[^\d]/g, ""), 10) || 0,
      term_days: parseInt(termDays, 10) || 0,
    });

    setSaving(false);

    if (res.error) {
      setError(`Failed to create customer: ${res.error}`);
    } else {
      navigate(res.data ? `/customers/${res.data.id}` : "/customers");
    }
  };

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
              {t("Back to customers")}
            </Button>
            <div className={styles.titleRow}>
              <h2 className={styles.title}>{t("New Customer")}</h2>
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
              {saving ? t("Creating…") : t("Create Customer")}
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
                  autoFocus
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
              <span className={styles.label}>{t("Delivery Location Pin")}</span>
              <input
                type="text"
                className={styles.input}
                value={addressGeoInput}
                onChange={(e) => setAddressGeoInput(e.target.value)}
                disabled={saving}
                placeholder="-6.914744, 107.609810 or paste a Google Maps link"
              />
              <span className={styles.hint}>
                {t(
                  "Used to verify a courier's drop-off distance on the order page. Leave blank if unknown — it gets set automatically from the customer's first confirmed delivery.",
                )}
              </span>
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
