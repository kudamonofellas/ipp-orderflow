import { useEffect, useRef, useState } from 'react';
import { Icon } from '../Icon/Icon';
import { notificationGroups } from '../../data/mockDashboard';
import styles from './NotificationsPopover.module.css';

/**
 * Bell icon button + dropdown popover listing notifications.
 * Replaces the dashboard's right-column notifications panel so it no longer
 * takes page real estate. Closes on outside click or Escape.
 */
export function NotificationsPopover() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const unreadCount = notificationGroups.reduce(
    (total, group) => total + group.entries.length,
    0,
  );

  return (
    <div className={styles.container} ref={containerRef}>
      <button
        type="button"
        className={styles.iconButton}
        aria-label="Notifications"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
      >
        <Icon name="notification" size={20} />
        {unreadCount > 0 && <span className={styles.notifDot} aria-hidden="true" />}
      </button>

      {open && (
        <div className={styles.popover} role="dialog" aria-label="Notifications">
          <header className={styles.header}>
            <h3 className={styles.heading}>Notifications</h3>
            {unreadCount > 0 && (
              <span className={styles.badge}>{unreadCount} new</span>
            )}
          </header>

          <div className={styles.scroll}>
            {notificationGroups.map((group) => (
              <section key={group.date} className={styles.group}>
                <p className={styles.date}>{group.date}</p>
                <ul className={styles.list}>
                  {group.entries.map((entry) => (
                    <li key={entry.id} className={styles.item}>
                      <span className={styles.time}>{entry.time}</span>
                      <span className={styles.text}>
                        Order <strong>{entry.orderId}</strong> {entry.action}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
