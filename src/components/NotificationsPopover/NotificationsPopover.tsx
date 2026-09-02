import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "../Button/Button";
import { useNotifications } from "../../hooks/useNotifications";
import { useNotificationReadState } from "../../hooks/useNotificationReadState";
import type { NotificationEntry } from "../../types/dashboard";
import styles from "./NotificationsPopover.module.css";

/** Cap the bell badge / header count display, per the usual notification-bell convention. */
function formatCount(count: number): string {
  return count > 99 ? "99+" : String(count);
}

/**
 * Bell icon button + dropdown popover listing notifications.
 * Replaces the dashboard's right-column notifications panel so it no longer
 * takes page real estate. Closes on outside click or Escape.
 */
export function NotificationsPopover() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const {
    groups: notificationGroups,
    loading,
    loadingMore,
    hasMore,
    loadMore,
    error,
  } = useNotifications();
  const { isUnread, markAllRead, markRead } = useNotificationReadState();

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

  const unreadCount = notificationGroups.reduce(
    (total, group) => total + group.entries.filter((e) => isUnread(e)).length,
    0,
  );

  const latestEntryAt = notificationGroups.reduce(
    (latest, group) =>
      group.entries.reduce(
        (groupLatest, e) => (e.at > groupLatest ? e.at : groupLatest),
        latest,
      ),
    "",
  );

  /** Fetches the next batch once the list is scrolled within ~80px of the bottom. */
  function handleScroll(event: React.UIEvent<HTMLDivElement>) {
    const el = event.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 80) {
      loadMore();
    }
  }

  function handleEntryClick(entry: NotificationEntry) {
    if (!entry.orderUuid) return;
    markRead(entry.id);
    setOpen(false);
    navigate(`/orders/${entry.orderUuid}`, {
      state: { from: location.pathname },
    });
  }

  return (
    <div className={styles.container} ref={containerRef}>
      <Button
        type="button"
        variant="secondary"
        icon="bell"
        size="md"
        aria-label="Notifications"
        aria-haspopup="dialog"
        isActive={open}
        onClick={() => setOpen((prev) => !prev)}
      >
        {unreadCount > 0 && (
          <span className={styles.notifCount} aria-hidden="true">
            {formatCount(unreadCount)}
          </span>
        )}
      </Button>

      {open && (
        <div
          className={styles.popover}
          role="dialog"
          aria-label="Notifications"
        >
          <header className={styles.header}>
            <div className={styles.titleRow}>
              <h3 className={styles.heading}>Notifications</h3>
              {unreadCount > 0 && (
                <span className={styles.badge}>
                  {formatCount(unreadCount)} new
                </span>
              )}
            </div>
            <Button
              type="button"
              variant="tertiary"
              size="md"
              onClick={() => markAllRead(latestEntryAt)}
              disabled={unreadCount === 0}
            >
              Mark all as read
            </Button>
          </header>

          <div className={styles.scroll} onScroll={handleScroll}>
            {loading ? (
              <p className={styles.empty}>Loading…</p>
            ) : error ? (
              <p className={styles.empty}>{error}</p>
            ) : notificationGroups.length === 0 ? (
              <p className={styles.empty}>No recent activity.</p>
            ) : (
              notificationGroups.map((group) => (
                <section key={group.date} className={styles.group}>
                  <p className={styles.date}>{group.date}</p>
                  <ul className={styles.list}>
                    {group.entries.map((entry) => {
                      const unread = isUnread(entry);
                      return (
                        <li
                          key={entry.id}
                          className={styles.notificationItem}
                          onClick={() => handleEntryClick(entry)}
                        >
                          {unread && (
                            <span
                              className={styles.unreadDot}
                              aria-label="Unread"
                            />
                          )}
                          <div className={styles.notificationHeader}>
                            <span
                              className={
                                unread ? styles.orderId : styles.orderIdRead
                              }
                            >
                              Order {entry.orderId}
                            </span>
                            <span className={styles.time}>{entry.time}</span>
                          </div>
                          <span
                            className={unread ? styles.text : styles.textRead}
                          >
                            {entry.action}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))
            )}
            {!loading && !error && loadingMore && (
              <p className={styles.empty}>Loading more…</p>
            )}
            {!loading &&
              !error &&
              !hasMore &&
              notificationGroups.length > 0 && (
                <p className={styles.empty}>No more activity.</p>
              )}
          </div>
        </div>
      )}
    </div>
  );
}
