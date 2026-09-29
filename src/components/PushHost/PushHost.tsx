import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Icon } from "../Icon/Icon";
import { useAuth } from "../../hooks/useAuth";
import { useLanguage } from "../../hooks/useLanguage";
import {
  registerPush,
  refreshPushRegistration,
  isPushSupported,
  type PushTarget,
} from "../../lib/push";
import styles from "./PushHost.module.css";

interface Banner {
  title: string;
  body: string;
  target: PushTarget;
}

const BANNER_MS = 6000;

/** How often a foreground resume is allowed to re-register — Android does
 *  not rotate tokens often, so this is just a safety net against a resume
 *  storm (repeated tab switches) hitting FCM on every one. */
const REFRESH_THROTTLE_MS = 30 * 60 * 1000;

/** Per-device, per-viewer dismissal of the "notifications are off" hint —
 *  a convenience only, so a failed read just means the hint shows again. */
const HINT_DISMISSED_KEY = "ipp.pushHintDismissed";

function hintDismissed(): boolean {
  try {
    return localStorage.getItem(HINT_DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

function dismissHint() {
  try {
    localStorage.setItem(HINT_DISMISSED_KEY, "1");
  } catch {
    // Private mode / blocked storage: the hint simply shows again next time.
  }
}

/**
 * Owns push registration for the signed-in user and renders the in-app
 * banner for notifications that arrive while the app is open (Android draws
 * no tray notification in that case).
 *
 * Mounted once inside the router so a tap can navigate. Does nothing on the
 * web build — `isPushSupported()` is false outside the APK. Logout teardown
 * lives in `RoleContext` instead, because the token row has to be deleted
 * while the session still authenticates.
 */
export function PushHost() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [banner, setBanner] = useState<Banner | null>(null);
  const [showDeniedHint, setShowDeniedHint] = useState(false);
  const timer = useRef<number | null>(null);
  const lastRefresh = useRef(0);

  // A reminder that summarizes several orders carries `route` instead of
  // `orderId`; route wins when both are present (it never is, today).
  const goTo = useCallback(
    (target: PushTarget) => {
      if (target.route) navigate(target.route);
      else if (target.orderId) navigate(`/orders/${target.orderId}`);
    },
    [navigate],
  );

  const showBanner = useCallback(
    (title: string, body: string, target: PushTarget) => {
      setBanner({ title, body, target });
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setBanner(null), BANNER_MS);
    },
    [],
  );

  useEffect(() => {
    if (!user?.id || !isPushSupported()) return;
    void registerPush(user.id, {
      onForeground: showBanner,
      onOpen: goTo,
    }).then((status) => {
      // Android prompts only once, so a declined permission is permanent
      // until the user changes it in system settings — say so rather than
      // letting notifications silently never arrive.
      setShowDeniedHint(status === "denied" && !hintDismissed());
    });
  }, [user?.id, goTo, showBanner]);

  // Re-register on resume: covers a token Android rotated while the app was
  // running, and a user who granted notification permission from Android
  // Settings without logging out and back in first.
  useEffect(() => {
    if (!isPushSupported()) return;
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - lastRefresh.current < REFRESH_THROTTLE_MS) return;
      lastRefresh.current = now;
      void refreshPushRegistration();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  useEffect(() => {
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, []);

  if (showDeniedHint) {
    return (
      <div className={`${styles.banner} ${styles.hint}`} role="status">
        <Icon name="bell" size={18} />
        <div className={styles.text}>
          <p className={styles.title}>{t("Notifications are turned off")}</p>
          <p className={styles.body}>
            {t(
              "Turn them on in Android Settings → Apps → IPP-OrderFlow → Notifications to get order updates for your role.",
            )}
          </p>
        </div>
        <button
          type="button"
          className={styles.close}
          aria-label={t("Dismiss")}
          onClick={() => {
            dismissHint();
            setShowDeniedHint(false);
          }}
        >
          <Icon name="close" size={16} />
        </button>
      </div>
    );
  }

  if (!banner) return null;

  return (
    <div
      className={styles.banner}
      role="status"
      onClick={() => {
        goTo(banner.target);
        setBanner(null);
      }}
    >
      <Icon name="bell" size={18} />
      <div className={styles.text}>
        {banner.title && <p className={styles.title}>{banner.title}</p>}
        {banner.body && <p className={styles.body}>{banner.body}</p>}
      </div>
      <button
        type="button"
        className={styles.close}
        aria-label="Dismiss"
        onClick={(e) => {
          e.stopPropagation();
          setBanner(null);
        }}
      >
        <Icon name="close" size={16} />
      </button>
    </div>
  );
}
