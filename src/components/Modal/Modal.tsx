import type { ReactNode } from "react";
import styles from "./Modal.module.css";

interface ModalProps {
  open: boolean;
  onClose?: () => void;
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
  /** @default true */
  closeOnBackdrop?: boolean;
}

/** Generic modal shell — overlay + card, per ui-registry.md's Modal baseline. */
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  closeOnBackdrop = true,
}: ModalProps) {
  if (!open) return null;

  return (
    <div
      className={styles.backdrop}
      onClick={() => closeOnBackdrop && onClose?.()}
    >
      <div
        className={styles.card}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        {title && <div className={styles.title}>{title}</div>}
        <div className={styles.body}>{children}</div>
        {footer && <div className={styles.footer}>{footer}</div>}
      </div>
    </div>
  );
}
