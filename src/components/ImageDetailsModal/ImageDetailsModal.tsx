import { Icon } from '../Icon/Icon';
import { Button } from '../Button/Button';
import styles from './ImageDetailsModal.module.css';

interface ImageDetailsModalProps {
  open: boolean;
  title: string;
  url: string;
  onClose: () => void;
  onDelete?: () => void;
  deleteLabel?: string;
}

export function ImageDetailsModal({
  open,
  title,
  url,
  onClose,
  onDelete,
  deleteLabel = 'Delete Image',
}: ImageDetailsModalProps) {
  if (!open) return null;

  return (
    <div className={styles.modalBackdrop} onClick={onClose}>
      <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <span>{title}</span>
          <Button
            type="button"
            size="sm"
            iconOnly
            style={{
              color: 'var(--bg-surface)',
              backgroundColor: 'transparent',
              border: '1px solid',
              borderColor: 'var(--bg-surface)',
              borderRadius: 'var(--space-3xl)',
            }}
            onClick={onClose}
          >
            <Icon name="close" size={16} />
          </Button>
        </div>
        <div className={styles.modalBody}>
          <img src={url} alt={title || 'Detail preview'} className={styles.modalImage} />
        </div>
        <div className={styles.modalFooter}>
          {onDelete && (
            <Button
              type="button"
              variant="secondary"
              style={{
                color: 'var(--bg-surface)',
                backgroundColor: 'transparent',
                borderColor: 'var(--bg-surface)',
              }}
              onClick={() => {
                onDelete();
              }}
            >
              <Icon name="trash" size={16} /> {deleteLabel}
            </Button>
          )}
          <Button type="button" variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
