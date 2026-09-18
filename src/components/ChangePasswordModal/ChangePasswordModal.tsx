import { useState } from "react";
import { Modal } from "../Modal/Modal";
import { Button } from "../Button/Button";
import { changePassword } from "../../lib/directus";
import { useLanguage } from "../../hooks/useLanguage";
import styles from "./ChangePasswordModal.module.css";

interface ChangePasswordModalProps {
  open: boolean;
  onClose: () => void;
  /** Fired after the password was actually changed, for a toast/confirmation. */
  onChanged?: () => void;
}

/**
 * Self-service password change for the signed-in user. Reachable from the
 * avatar menu (desktop sidebar + mobile Dashboard header) and from Settings.
 *
 * Built on the shared `Modal` shell rather than its own overlay, so the
 * backdrop/card/footer chrome stays identical to every other modal.
 * Backdrop-dismiss is disabled — this is a form, and losing three typed
 * fields to a stray click outside it is a bad trade.
 */
export function ChangePasswordModal({
  open,
  onClose,
  onChanged,
}: ChangePasswordModalProps) {
  // Gate the whole form behind `open` so it unmounts on close. That is what
  // clears the typed passwords and any error between openings — a reset
  // effect would do the same thing but cause an extra render pass, and lint
  // (rightly) rejects setState-in-effect.
  if (!open) return null;
  return (
    <ChangePasswordForm onClose={onClose} onChanged={onChanged} />
  );
}

function ChangePasswordForm({
  onClose,
  onChanged,
}: Omit<ChangePasswordModalProps, "open">) {
  const { t } = useLanguage();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Set only when Save comes back rejected — the current password can only be
  // confirmed server-side, so it's checked once on submit rather than while
  // typing. Kept separate from `error` so it renders under its own field
  // instead of the modal's general error slot, and so editing that field
  // clears it without disturbing other errors.
  const [wrongCurrent, setWrongCurrent] = useState(false);

  const mismatch = confirm.length > 0 && next !== confirm;
  const canSave =
    current.length > 0 &&
    next.length > 0 &&
    next === confirm &&
    !wrongCurrent &&
    !saving;

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    const res = await changePassword(current, next);
    setSaving(false);
    if (res.error) {
      if (res.error === "CURRENT_PASSWORD_INCORRECT") {
        setWrongCurrent(true);
      } else {
        setError(`${t("Couldn't change the password")}: ${res.error}`);
      }
      return;
    }
    onChanged?.();
    onClose();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={t("Change password")}
      closeOnBackdrop={false}
      footer={
        <>
          <Button
            type="button"
            variant="primary"
            buttonStyle="fullWidth"
            size="lg"
            onClick={handleSave}
            disabled={!canSave}
          >
            {saving ? t("Saving…") : t("Save")}
          </Button>
          <Button
            type="button"
            variant="secondary"
            buttonStyle="fullWidth"
            size="lg"
            onClick={onClose}
            disabled={saving}
          >
            {t("Cancel")}
          </Button>
        </>
      }
    >
      <form
        className={styles.form}
        onSubmit={(e) => {
          e.preventDefault();
          void handleSave();
        }}
      >
        <label className={styles.field}>
          <span className={styles.label}>{t("Current password")}</span>
          <input
            className={styles.input}
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => {
              setCurrent(e.target.value);
              // The old value was rejected; any edit makes that verdict stale.
              setWrongCurrent(false);
            }}
            disabled={saving}
          />
          {wrongCurrent && (
            <span className={styles.error}>
              {t("Current password is incorrect.")}
            </span>
          )}
        </label>

        <label className={styles.field}>
          <span className={styles.label}>{t("New password")}</span>
          <input
            className={styles.input}
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            disabled={saving}
          />
        </label>

        <label className={styles.field}>
          <span className={styles.label}>{t("Re-enter new password")}</span>
          <input
            className={styles.input}
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            disabled={saving}
          />
          {mismatch && (
            <span className={styles.hint}>{t("Passwords don't match.")}</span>
          )}
        </label>

        {error && <p className={styles.error}>{error}</p>}

        {/* Lets Enter submit the form without a visible duplicate button. */}
        <button type="submit" className={styles.hiddenSubmit} aria-hidden />
      </form>
    </Modal>
  );
}
