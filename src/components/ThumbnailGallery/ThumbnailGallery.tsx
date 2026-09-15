import type { CSSProperties } from "react";
import { Icon } from "../Icon/Icon";
import styles from "./ThumbnailGallery.module.css";

/** How many real, individually-clickable tiles the "auto"/"compact" modes
 *  will ever render — beyond this everything folds into the last tile's
 *  "N+ See all" badge. Keeps the CSS "quantity query" breakpoint list below
 *  finite and matches the approved cap (see ThumbnailGallery.module.css). */
const MAX_VISIBLE = 6;

export type ThumbnailGalleryAlign = "left" | "right";
export type ThumbnailGalleryCollapse = "auto" | "compact" | "expanded";

export interface ThumbnailGalleryItem {
  key: string;
  url: string;
}

export interface ThumbnailGalleryProps {
  items: ThumbnailGalleryItem[];
  /** Opens the full viewer at this item's index. */
  onOpen: (index: number) => void;
  /** Omit to render read-only tiles (no hover/trash delete affordance). */
  onDelete?: (index: number) => void;
  deleteLabel?: string;
  seeAllLabel?: string;
  /** Desktop alignment of the row within its parent. Defaults to "right"
   *  to match the original OrderDetail styling this component is based on. */
  align?: ThumbnailGalleryAlign;
  /** Overrides `align` at the mobile breakpoint (≤768px). Omit to keep the
   *  same alignment on mobile as desktop. */
  mobileAlign?: ThumbnailGalleryAlign;
  /** "auto" (default): stays a single uncollapsed row until the parent's
   *  actual available width can't fit every tile, then collapses via a
   *  pure-CSS container-query "quantity query" (no ResizeObserver — see
   *  module.css comment for why that was deliberately avoided).
   *  "compact": always exactly one tile, "{total-1}+ See all".
   *  "expanded": always show every tile inline, never collapses. */
  collapse?: ThumbnailGalleryCollapse;
  /** Overrides `collapse` at the mobile breakpoint (≤768px). Omit to keep
   *  the same collapse behavior on mobile as desktop. */
  mobileCollapse?: ThumbnailGalleryCollapse;
  /** Applied to the outer wrapper — e.g. an indent margin for a nested row. */
  style?: CSSProperties;
}

export function ThumbnailGallery({
  items,
  onOpen,
  onDelete,
  deleteLabel = "Delete image",
  seeAllLabel = "See all",
  align = "right",
  mobileAlign,
  collapse = "auto",
  mobileCollapse,
  style,
}: ThumbnailGalleryProps) {
  if (items.length === 0) return null;

  // "expanded" (desktop or mobile) needs every item actually in the DOM;
  // otherwise only the auto/compact cap is ever reachable, since neither
  // mode's CSS reveals a tile past MAX_VISIBLE.
  const needsAll = collapse === "expanded" || mobileCollapse === "expanded";
  const renderCount = needsAll ? items.length : Math.min(items.length, MAX_VISIBLE);
  const visible = items.slice(0, renderCount);

  return (
    <div
      className={styles.wrapper}
      style={style}
      data-collapse={collapse}
      data-mobile-collapse={mobileCollapse}
      data-align={align}
      data-align-mobile={mobileAlign}
    >
      <div className={styles.thumbnailsContainer}>
        {visible.map((item, i) => {
          const position = i + 1; // 1-indexed "how many tiles shown up to here"
          const remaining = items.length - position;
          return (
            <div
              key={item.key}
              className={styles.thumbnailItem}
              onClick={() => onOpen(i)}
            >
              <img src={item.url} alt="" className={styles.thumbnailImg} />
              {remaining > 0 && (
                <div className={styles.thumbnailCountBadge}>
                  <span className={styles.thumbnailCountNumber}>
                    {remaining}+
                  </span>
                  {seeAllLabel}
                </div>
              )}
              {onDelete && (
                <div
                  className={styles.thumbnailHoverTrash}
                  title={deleteLabel}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(i);
                  }}
                >
                  <Icon name="trash" size={14} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
