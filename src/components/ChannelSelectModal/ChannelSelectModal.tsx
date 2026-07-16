import { useEffect } from 'react';
import { Icon } from '../Icon/Icon';
import styles from './ChannelSelectModal.module.css';

interface ChannelSelectModalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (channel: 'horeca') => void;
}

/**
 * Step 1 of the "Add New Order" flow.
 * User picks the sales channel before continuing to the intake form.
 * Meatfellas is flagged as "Soon" and is not selectable.
 */
export function ChannelSelectModal({ open, onClose, onSelect }: ChannelSelectModalProps) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className={styles.overlay}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label="Select channel"
    >
      <div className={styles.dialog}>
        <div className={styles.header}>
          <div className={styles.headerText}>
            <h2 className={styles.title}>Add New Order</h2>
            <p className={styles.subtitle}>Select the sales channel to continue.</p>
          </div>
          <button
            id="channel-select-close"
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="Close"
          >
            <Icon name="close" size={18} />
          </button>
        </div>

        <div className={styles.channels}>
          {/* Horeca — B2B (active) */}
          <button
            id="channel-select-horeca"
            className={styles.channelCard}
            onClick={() => onSelect('horeca')}
          >
            <span className={`${styles.channelBadge} ${styles.b2b}`}>B2B</span>
            <h3 className={styles.channelName}>Horeca</h3>
            <p className={styles.channelDesc}>
              Hotels, restaurants &amp; cafés — buy whole, cut to order.
            </p>
          </button>

          {/* Meatfellas — B2C (soon) */}
          <button
            id="channel-select-meatfellas"
            className={`${styles.channelCard} ${styles.disabled}`}
            disabled
            aria-disabled="true"
          >
            <span className={styles.soonBadge}>Soon</span>
            <span className={`${styles.channelBadge} ${styles.b2c}`}>B2C</span>
            <h3 className={styles.channelName}>Meatfellas</h3>
            <p className={styles.channelDesc}>
              Retail &amp; online shop — Tokopedia, Shopee, walk-in.
            </p>
          </button>
        </div>
      </div>
    </div>
  );
}
