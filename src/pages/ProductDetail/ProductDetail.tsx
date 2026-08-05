import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card } from "../../components/Card/Card";
import { Button } from "../../components/Button/Button";
import { useAuth } from "../../hooks/useAuth";
import {
  readProducts,
  deleteProduct,
  readOrderLines,
} from "../../lib/directus";
import styles from "./ProductDetail.module.css";

/** Read-only product dossier. Edit/Delete in the header, gated to `manage_products`. */
export function ProductDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const auth = useAuth();

  const isNew = id === "new";
  const canManage = auth.can("manage_products");

  const [loading, setLoading] = useState(!isNew);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [usedBy, setUsedBy] = useState(0);

  const [name, setName] = useState("");
  const [accurateName, setAccurateName] = useState("");
  const [category, setCategory] = useState("");
  const [origin, setOrigin] = useState("");
  const [grade, setGrade] = useState("");
  const [brand, setBrand] = useState("");
  const [catchWeight, setCatchWeight] = useState(false);
  const [oos, setOos] = useState(false);

  useEffect(() => {
    if (isNew) return;
    let cancelled = false;

    async function loadData() {
      setLoading(true);
      setError(null);

      const productRes = await readProducts({
        filter: { id: { _eq: id } },
      });

      if (cancelled) return;

      if (productRes.error || !productRes.data?.[0]) {
        setError(productRes.error || "Product not found.");
        setLoading(false);
        return;
      }

      const p = productRes.data[0];
      setName(p.name);
      setAccurateName(p.accurate_name ?? "");
      setCategory(p.category ?? "");
      setOrigin(p.origin ?? "");
      setGrade(p.grade ?? "");
      setBrand(p.brand ?? "");
      setCatchWeight(!!p.catch_weight);
      setOos(!!p.oos);

      const linesRes = await readOrderLines({
        filter: { product_id: { _eq: id } },
        limit: 1,
        fields: ["id"],
      });

      if (!cancelled && linesRes.data) {
        setUsedBy(linesRes.data.length);
      }

      setLoading(false);
    }

    loadData();
    return () => {
      cancelled = true;
    };
  }, [id, isNew]);

  const handleDelete = async () => {
    if (usedBy > 0) {
      window.alert("Product is used by active orders and cannot be deleted.");
      return;
    }
    if (!window.confirm("Are you sure you want to delete this product?"))
      return;
    if (!id) return;

    setDeleting(true);
    const res = await deleteProduct(id);
    setDeleting(false);

    if (res.error) {
      window.alert(`Failed to delete product: ${res.error}`);
    } else {
      navigate("/products");
    }
  };

  if (loading)
    return <div className={styles.container}>Loading product details…</div>;
  if (error)
    return (
      <div className={styles.container} style={{ color: "var(--state-error)" }}>
        {error}
      </div>
    );

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.titleSection}>
          <Button
            type="button"
            variant="tertiary"
            icon="chevronLeft"
            onClick={() => navigate("/products")}
          >
            Back
          </Button>
          <div className={styles.headingRow}>
            <h2 className={styles.title}>{isNew ? "New Product" : name}</h2>

            {!isNew && accurateName && (
              <span>
                <p className={styles.subtitle}>{accurateName.toUpperCase()}</p>
              </span>
            )}
            <span
              style={{
                display: "flex",
                gap: "var(--space-md)",
                paddingTop: "var(--space-md)",
              }}
            >
              <span
                className={`${styles.pill} ${oos ? styles.pillDanger : ""}`}
              >
                {oos ? "Out of stock" : "In-stock"}
              </span>

              {catchWeight && (
                <span className={styles.pillNeutral}>Catch-weight</span>
              )}
            </span>
          </div>
        </div>
        {canManage && (
          <div className={styles.actions}>
            {!isNew && (
              <Button
                type="button"
                variant="secondary"
                icon="trash"
                onClick={handleDelete}
                disabled={deleting}
              >
                {deleting ? "Deleting…" : "Delete"}
              </Button>
            )}
            <Button
              type="button"
              variant="secondary"
              icon="edit"
              onClick={() => navigate(`/products/${id}/edit`)}
            >
              Edit
            </Button>
          </div>
        )}
      </header>

      <Card>
        <div className={styles.fields}>
          <div className={styles.row}>
            <div className={styles.field}>
              <span className={styles.detailLabel}>Category</span>
              <span className={styles.detailValue}>{category || "—"}</span>
            </div>
            <div className={styles.field}>
              <span className={styles.detailLabel}>Origin</span>
              <span className={styles.detailValue}>{origin || "—"}</span>
            </div>
          </div>
          <div className={styles.row}>
            <div className={styles.field}>
              <span className={styles.detailLabel}>Grade</span>
              <span className={styles.detailValue}>{grade || "—"}</span>
            </div>
            <div className={styles.field}>
              <span className={styles.detailLabel}>Brand</span>
              <span className={styles.detailValue}>{brand || "—"}</span>
            </div>
          </div>

          {!isNew && usedBy > 0 && (
            <p
              style={{
                margin: 0,
                fontSize: "13px",
                color: "var(--text-muted)",
              }}
            >
              Product is currently used by {usedBy} active order(s).
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}
