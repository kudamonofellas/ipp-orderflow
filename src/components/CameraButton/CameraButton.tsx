import { useRef, useState } from "react";
import { Button } from "../Button/Button";
import { Modal } from "../Modal/Modal";
import { useLanguage } from "../../hooks/useLanguage";
import type { IconName } from "../Icon/icons";
import styles from "./CameraButton.module.css";

interface CameraButtonProps {
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  title?: string;
  variant?: "primary" | "secondary" | "tertiary" | "ghost";
  size?: "sm" | "md" | "lg";
  icon?: IconName;
  iconOnly?: boolean;
  disabled?: boolean;
  className?: string;
  children?: React.ReactNode;
  /** @default "image/*" */
  accept?: string;
}

/** Camera-icon button that offers a choice between taking a new photo and
 *  picking an existing one from the gallery, instead of leaving that choice
 *  to whatever the device/browser defaults to when a bare
 *  `<input type="file" accept="image/*">` is clicked (some skip straight to
 *  the camera). The choice is a `Modal` (the shared baseline shell, not a
 *  bespoke dropdown) — a full-screen-friendly confirm step reads better on
 *  mobile than a small anchored popover, and it's what every other
 *  choice/confirm surface in this app already uses. Owns its own hidden
 *  `<input>` — toggling the `capture` attribute right before `.click()` is
 *  what actually drives the choice; the attribute is removed again for the
 *  gallery option since its mere presence is what steers some mobile
 *  browsers straight to the camera. */
export function CameraButton({
  onChange,
  title,
  variant = "tertiary",
  size,
  icon = "camera",
  iconOnly = false,
  disabled = false,
  className,
  children,
  accept = "image/*",
}: CameraButtonProps) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function choose(useCamera: boolean) {
    setOpen(false);
    const el = inputRef.current;
    if (!el) return;
    if (useCamera) el.setAttribute("capture", "environment");
    else el.removeAttribute("capture");
    el.click();
  }

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size}
        icon={icon}
        iconOnly={iconOnly}
        disabled={disabled}
        className={className}
        title={title}
        onClick={() => setOpen(true)}
      >
        {children}
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={t("Add a photo")}
      >
        <div className={styles.optionsStack}>
          <Button
            type="button"
            variant="secondary"
            size="lg"
            buttonStyle="fullWidth"
            icon="camera"
            onClick={() => choose(true)}
          >
            {t("Take Photo")}
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="lg"
            buttonStyle="fullWidth"
            icon="image"
            onClick={() => choose(false)}
          >
            {t("Choose from Gallery")}
          </Button>
        </div>
      </Modal>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        style={{ display: "none" }}
        onChange={onChange}
      />
    </>
  );
}
