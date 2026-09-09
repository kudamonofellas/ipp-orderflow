import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Avatar } from "../Avatar/Avatar";
import { Icon } from "../Icon/Icon";
import { useAuth, useCurrentUserName } from "../../hooks/useAuth";
import { useLanguage } from "../../hooks/useLanguage";
import { useTheme } from "../../hooks/useTheme";
import { getInitials } from "../../lib/initials";
import styles from "./AvatarMenu.module.css";

/**
 * Avatar + dropdown menu (dark mode toggle, log out) — the mobile
 * counterpart to the Sidebar's own bottom section, which disappears behind
 * the bottom nav below the mobile breakpoint. Placed in Dashboard's topRow,
 * next to the notifications bell, per the mobile design
 * (`context/designs/Mobile - Dashboard.png`). Reuses the same outside-click
 * + Escape-to-close pattern as `NotificationsPopover`.
 */
export function AvatarMenu() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { user, role, logout } = useAuth();
  const name = useCurrentUserName();
  const { theme, toggle: toggleTheme } = useTheme();
  const { t } = useLanguage();

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  return (
    <div className={styles.container} ref={containerRef}>
      <button
        type="button"
        className={styles.trigger}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
      >
        <Avatar
          initials={getInitials(name) || "??"}
          label={name || (user?.email ?? "")}
          size="md"
        />
      </button>

      {open && (
        <div className={styles.menu} role="dialog" aria-label={t("Account")}>
          <div className={styles.userBlock}>
            <span className={styles.userName}>{name || user?.email}</span>
            <span className={styles.userRole}>{role ?? ""}</span>
          </div>
          <div className={styles.separator} />
          <button
            type="button"
            className={styles.item}
            onClick={() => {
              toggleTheme();
              setOpen(false);
            }}
          >
            <Icon name={theme === "dark" ? "sun" : "moon"} size={18} />
            {theme === "dark" ? t("Light mode") : t("Dark mode")}
          </button>
          <button
            type="button"
            className={styles.item}
            onClick={handleLogout}
          >
            <Icon name="logout" size={18} />
            {t("Log out")}
          </button>
        </div>
      )}
    </div>
  );
}
