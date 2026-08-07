import { useNavigate } from "react-router-dom";
import { Card } from "../../components/Card/Card";
import { Icon } from "../../components/Icon/Icon";
import { Button } from "../../components/Button/Button";
import { Toggle } from "../../components/Toggle/Toggle";
import { useAuth, useCurrentUserName } from "../../hooks/useAuth";
import { useSettings } from "../../hooks/useSettings";
import styles from "./Settings.module.css";

const NOT_AVAILABLE = "Not available yet — this feature has no backing implementation.";

/** Full Settings page — Account, Intake Learning, Cold Storage, Dispatch, General, and Data sections. */
export function Settings() {
  const navigate = useNavigate();
  const { role, logout } = useAuth();
  const name = useCurrentUserName();
  const { settings, learnedMatches, loading, error, update } = useSettings();

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>Settings</h1>

      <section>
        <h2 className={styles.sectionHeading}>Account</h2>
        <Card>
          <span className={styles.accountName}>{name || "—"}</span>
          <span className={styles.accountRole}>{role ?? ""}</span>
        </Card>
      </section>

      <section>
        <h2 className={styles.sectionHeading}>Intake Learning</h2>
        <Card>
          <div className={styles.row}>
            <Icon name="ai" size={20} className={styles.rowIcon} />
            <div className={styles.rowInfo}>
              <span className={styles.rowTitle}>{learnedMatches} learned matches</span>
              <span className={styles.rowNote}>
                Shared knowledge base — every correction your team makes is kept and reused. Cannot be cleared.
              </span>
            </div>
          </div>
        </Card>
      </section>

      {loading ? (
        <div className={styles.muted}>Loading settings…</div>
      ) : error ? (
        <div className={styles.error}>{error}</div>
      ) : (
        <>
          <section>
            <h2 className={styles.sectionHeading}>Cold Storage</h2>
            <Card className={styles.stackedCard}>
              <div className={styles.toggleRow}>
                <div className={styles.rowInfo}>
                  <span className={styles.rowTitle}>Require a proof photo on every item</span>
                  <span className={styles.rowNote}>Warehouse must attach at least one photo per item before releasing.</span>
                </div>
                <Toggle
                  label="Require a proof photo on every item"
                  checked={settings?.require_photo === true}
                  onChange={(next) => update({ require_photo: next })}
                />
              </div>

              <div className={styles.toleranceBlock}>
                <span className={styles.rowTitle}>Weigh tolerance vs the order</span>
                <div className={styles.toleranceGrid}>
                  <label className={styles.toleranceField}>
                    <span className={styles.toleranceLabel}>Flag if below by (%)</span>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={settings?.tol_below_pct ?? 10}
                      onChange={(e) => update({ tol_below_pct: Number(e.target.value) })}
                    />
                  </label>
                  <label className={styles.toleranceField}>
                    <span className={styles.toleranceLabel}>Flag if above by (%)</span>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={settings?.tol_above_pct ?? 10}
                      onChange={(e) => update({ tol_above_pct: Number(e.target.value) })}
                    />
                  </label>
                </div>
                <span className={styles.rowNote}>A weighed total outside this range shows a gentle hint — it does not block.</span>
              </div>
            </Card>
          </section>

          <section>
            <h2 className={styles.sectionHeading}>Dispatch</h2>
            <Card>
              <div className={styles.toggleRow}>
                <div className={styles.rowInfo}>
                  <span className={styles.rowTitle}>Require delivery proof photos</span>
                  <span className={styles.rowNote}>
                    Courier must attach condition, received-by &amp; signed-invoice photos before marking delivered. Off = photos optional.
                  </span>
                </div>
                <Toggle
                  label="Require delivery proof photos"
                  checked={settings?.dispatch_proof_required === true}
                  onChange={(next) => update({ dispatch_proof_required: next })}
                />
              </div>
            </Card>
          </section>

          <section>
            <h2 className={styles.sectionHeading}>General</h2>
            <Card>
              <div className={styles.row}>
                <Icon name="language" size={20} className={styles.rowIcon} />
                <div className={styles.rowInfo}>
                  <span className={styles.rowTitle}>Language</span>
                  <span className={styles.rowNote}>Sets the default UI language for the whole team.</span>
                </div>
                <div className={styles.langButtons}>
                  <Button
                    type="button"
                    variant={(settings?.lang ?? "en") === "en" ? "primary" : "secondary"}
                    size="sm"
                    onClick={() => update({ lang: "en" })}
                  >
                    English
                  </Button>
                  <Button
                    type="button"
                    variant={settings?.lang === "id" ? "primary" : "secondary"}
                    size="sm"
                    onClick={() => update({ lang: "id" })}
                  >
                    Bahasa
                  </Button>
                </div>
              </div>
            </Card>
          </section>
        </>
      )}

      <section>
        <h2 className={styles.sectionHeading}>Data</h2>
        <div className={styles.dataStack}>
          <Button
            type="button"
            variant="secondary"
            buttonStyle="fullWidth"
            icon="download"
            onClick={() => window.alert(NOT_AVAILABLE)}
          >
            Backup everything (Download)
          </Button>
          <div className={styles.dataRow}>
            <Button
              type="button"
              variant="secondary"
              buttonStyle="fullWidth"
              icon="restore"
              onClick={() => window.alert(NOT_AVAILABLE)}
            >
              Restore from Backup
            </Button>
            <Button
              type="button"
              variant="secondary"
              buttonStyle="fullWidth"
              icon="export"
              onClick={() => window.alert(NOT_AVAILABLE)}
            >
              Export all orders (CSV)
            </Button>
          </div>
          <span className={styles.rowNote}>
            Full backup = orders, customers, settings + all photos in one file. Columns follow your role.
          </span>

          <div className={styles.divider} />

          <Button type="button" variant="secondary" buttonStyle="fullWidth" icon="logout" onClick={handleLogout}>
            Logout
          </Button>
        </div>
      </section>
    </div>
  );
}
