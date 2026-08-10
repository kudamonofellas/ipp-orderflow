import { Button } from "../Button/Button";
import styles from "./ImageDetailsModal.module.css";

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
  deleteLabel = "Delete Image",
}: ImageDetailsModalProps) {
  if (!open) return null;

  return (
    <div className={styles.modalBackdrop} onClick={onClose}>
      <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <span>{title}</span>
          <div className={styles.modalActions}>
            {onDelete && (
              <Button
                type="button"
                variant="secondary"
                icon="trash"
                iconOnly
                title={deleteLabel}
                style={{
                  color: "var(--bg-surface)",
                  backgroundColor: "transparent",
                  border: "1px solid",
                  borderColor: "var(--bg-surface)",
                  borderRadius: "var(--space-3xl)",
                }}
                onClick={() => {
                  onDelete();
                }}
              />
            )}
            <Button
              type="button"
              size="md"
              icon="close"
              iconOnly
              style={{
                color: "var(--bg-surface)",
                backgroundColor: "transparent",
                border: "1px solid",
                borderColor: "var(--bg-surface)",
                borderRadius: "var(--space-3xl)",
              }}
              onClick={onClose}
            ></Button>
          </div>
        </div>
        <div className={styles.modalBody}>
          <img
            src={url}
            alt={title || "Detail preview"}
            className={styles.modalImage}
          />
        </div>
      </div>
    </div>
  );
}
