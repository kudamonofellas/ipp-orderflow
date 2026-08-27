import type { ChangeEvent } from "react";
import { Icon } from "../Icon/Icon";
import type { IconName } from "../Icon/icons";
import buttonStyles from "../Button/Button.module.css";
import styles from "./PhotoUploadButton.module.css";

export interface PhotoUploadButtonPhoto {
  id: string;
  fileId: string;
  url: string;
}

export interface PhotoUploadButtonProps {
  photos: PhotoUploadButtonPhoto[];
  onUpload: (e: ChangeEvent<HTMLInputElement>) => void;
  onRemove?: (photoId: string) => void;
  onOpenImage?: (photo: PhotoUploadButtonPhoto) => void;
  /** @default "camera" */
  icon?: IconName;
  /** Optional visible text next to the icon. */
  label?: string;
  /** @default "secondary" */
  variant?: "primary" | "secondary" | "tertiary" | "ghost";
  /** @default "md" */
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  title?: string;
}

/** A single control that looks like `Button` (same classes, so hover/active/
 *  size/variant all match exactly) but doubles as a photo well: once photos
 *  are attached, their thumbnails render inline inside the same bordered
 *  control instead of in a separate `.thumbnailsContainer` next to it.
 *  `isActive`-equivalent styling (Button's `.active` modifier) kicks in
 *  automatically once there's at least one photo. A native `<label>` with a
 *  single labelable child (the hidden file input) — not a nested `<Button>`,
 *  which is the fragile two-labelable-elements pattern this app moved away
 *  from (see `ui-registry.md`, 2026-08-24). */
export function PhotoUploadButton({
  photos,
  onUpload,
  onRemove,
  onOpenImage,
  icon = "camera",
  label,
  variant = "secondary",
  size = "md",
  disabled = false,
  title,
}: PhotoUploadButtonProps) {
  const isActive = photos.length > 0;
  const iconSize = size === "sm" ? 16 : size === "lg" ? 24 : 20;

  return (
    <label
      title={title}
      className={[
        buttonStyles.button,
        buttonStyles[variant],
        buttonStyles[size],
        isActive ? buttonStyles.active : "",
        styles.wrapper,
        disabled ? styles.disabled : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className={styles.row}>
        <Icon name={icon} size={iconSize} className={buttonStyles.icon} />
        {label && <span>{label}</span>}
      </div>
      {photos.length > 0 && (
        <span className={styles.thumbnails}>
          {photos.map((p) => (
            <span
              key={p.id}
              className={styles.thumbnailItem}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onOpenImage?.(p);
              }}
            >
              <img
                src={p.url}
                alt=""
                className={styles.thumbnailImg}
                style={{ flexShrink: 0 }}
              />
              {onRemove && (
                <span
                  className={styles.thumbnailHoverTrash}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onRemove(p.id);
                  }}
                >
                  <Icon name="trash" size={11} />
                </span>
              )}
            </span>
          ))}
        </span>
      )}
      <input
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={onUpload}
        disabled={disabled}
      />
    </label>
  );
}
