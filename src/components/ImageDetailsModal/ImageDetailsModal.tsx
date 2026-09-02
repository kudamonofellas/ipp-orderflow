import { useEffect } from "react";
import { Button } from "../Button/Button";
import styles from "./ImageDetailsModal.module.css";

interface ImageDetailsModalProps {
  open: boolean;
  title: string;
  url: string;
  onClose: () => void;
  onDelete?: () => void;
  deleteLabel?: string;
  /** Slideshow navigation — all three are only meaningful together, when
   *  the modal was opened from a `Thumbnails` gallery with more than one
   *  photo. `currentIndex`/`total` drive the "N / M" counter. */
  onPrev?: () => void;
  onNext?: () => void;
  currentIndex?: number;
  total?: number;
}

export function ImageDetailsModal({
  open,
  title,
  url,
  onClose,
  onDelete,
  deleteLabel = "Delete Image",
  onPrev,
  onNext,
  currentIndex,
  total,
}: ImageDetailsModalProps) {
  const hasMultiple = !!onPrev && !!onNext && (total ?? 0) > 1;

  // Left/Right arrow keys page the slideshow, Escape closes — only wired
  // while the modal is actually open, so keystrokes elsewhere in the app
  // are untouched.
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") onPrev?.();
      else if (e.key === "ArrowRight") onNext?.();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose, onPrev, onNext]);

  if (!open) return null;

  return (
    <div className={styles.modalBackdrop} onClick={onClose}>
      <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <span>
            {title}
            {hasMultiple && (
              <span className={styles.modalCounter}>
                {(currentIndex ?? 0) + 1} / {total}
              </span>
            )}
          </span>
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
          {hasMultiple && (
            <Button
              type="button"
              icon="chevronLeft"
              iconOnly
              aria-label="Previous image"
              className={`${styles.navButton} ${styles.navButtonPrev}`}
              style={{
                color: "var(--bg-surface)",
                backgroundColor: "rgba(0, 0, 0, 0.4)",
                border: "1px solid var(--bg-surface)",
                borderRadius: "var(--radius-full)",
              }}
              onClick={onPrev}
            />
          )}
          <img
            src={url}
            alt={title || "Detail preview"}
            className={styles.modalImage}
          />
          {hasMultiple && (
            <Button
              type="button"
              icon="chevronRight"
              iconOnly
              aria-label="Next image"
              className={`${styles.navButton} ${styles.navButtonNext}`}
              style={{
                color: "var(--bg-surface)",
                backgroundColor: "rgba(0, 0, 0, 0.4)",
                border: "1px solid var(--bg-surface)",
                borderRadius: "var(--radius-full)",
              }}
              onClick={onNext}
            />
          )}
        </div>
      </div>
    </div>
  );
}
