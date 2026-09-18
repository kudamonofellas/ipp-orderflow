import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Avatar } from "../Avatar/Avatar";
import { Icon } from "../Icon/Icon";
import { ChangePasswordModal } from "../ChangePasswordModal/ChangePasswordModal";
import { useAuth, useCurrentUserName } from "../../hooks/useAuth";
import { useLanguage } from "../../hooks/useLanguage";
import { useTheme } from "../../hooks/useTheme";
import { getInitials } from "../../lib/initials";
import styles from "./AvatarMenu.module.css";

interface AvatarMenuProps {
  /** Which way the dropdown opens. "up" for the desktop sidebar, whose avatar
   *  sits at the bottom of the viewport. @default "down" */
  placement?: "down" | "up";
  /** Show the light/dark toggle in the menu. The desktop sidebar has its own
   *  theme button in `bottomControls`, so it opts out. @default true */
  showThemeToggle?: boolean;
}

/**
 * Avatar + dropdown account menu — used in two places:
 * - Dashboard's topRow on mobile (theme toggle, change password, log out),
 *   since the Sidebar disappears behind the bottom nav at that breakpoint
 *   (`context/designs/Mobile - Dashboard.png`).
 * - The desktop Sidebar's bottom user block (change password, log out), which
 *   is where Log out now lives — it used to be a standalone button in the
 *   sidebar's control stack.
 *
 * Reuses the same outside-click + Escape-to-close pattern as
 * `NotificationsPopover`.
 */
export function AvatarMenu({
  placement = "down",
  showThemeToggle = true,
}: AvatarMenuProps = {}) {
  const [open, setOpen] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  /** Viewport coords for the "up" placement — see `openMenu` below. */
  const [coords, setCoords] = useState<{ left: number; bottom: number } | null>(
    null,
  );
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

  /**
   * The desktop Sidebar sets `overflow: hidden` (so nav labels don't spill
   * while the width transition runs), which clips an absolutely-positioned
   * menu — it rendered visibly cut off at the sidebar's edge. A fixed-position
   * element escapes ancestor overflow clipping (nothing up the chain creates a
   * containing block for it — `.sidebar` only transitions `width`), but fixed
   * coords are viewport-relative, so the trigger has to be measured. Done here
   * on open rather than in an effect: it's a one-off read at a known moment,
   * and the sidebar is `position: sticky` / full-height, so the trigger can't
   * scroll away while the menu is open.
   */
  function openMenu() {
    if (placement === "up" && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setCoords({
        left: rect.left,
        bottom: window.innerHeight - rect.top + 8,
      });
    }
    setOpen(true);
  }

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  return (
    <div className={styles.container} ref={containerRef}>
      <button
        type="button"
        ref={triggerRef}
        className={styles.trigger}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => (open ? setOpen(false) : openMenu())}
      >
        <Avatar
          initials={getInitials(name) || "??"}
          label={name || (user?.email ?? "")}
          size="md"
        />
      </button>

      {open && (
        <div
          className={`${styles.menu} ${placement === "up" ? styles.menuUp : ""}`}
          style={
            placement === "up" && coords
              ? { left: coords.left, bottom: coords.bottom }
              : undefined
          }
          role="dialog"
          aria-label={t("Account")}
        >
          <div className={styles.userBlock}>
            <span className={styles.userName}>{name || user?.email}</span>
            <span className={styles.userRole}>{role ?? ""}</span>
          </div>
          <div className={styles.separator} />
          {showThemeToggle && (
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
          )}
          <button
            type="button"
            className={styles.item}
            onClick={() => {
              setPwOpen(true);
              setOpen(false);
            }}
          >
            <Icon name="resetPassword" size={18} />
            {t("Change password")}
          </button>
          <button type="button" className={styles.item} onClick={handleLogout}>
            <Icon name="logout" size={18} />
            {t("Log out")}
          </button>
        </div>
      )}

      <ChangePasswordModal open={pwOpen} onClose={() => setPwOpen(false)} />
    </div>
  );
}
