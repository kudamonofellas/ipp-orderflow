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
          // A tile only carries a badge if items exist past it — i.e. if it
          // would be a cut-off point at some width. Which one is actually
          // showing its badge at any moment is CSS's call (see module.css).
          const isCutoff = items.length > i + 1;
          // The badge counts every photo the viewer can't see, INCLUDING this
          // tile's own — its overlay covers the photo underneath completely,
          // so a lone collapsed tile out of 3 reads "3", not "2". The number
          // is exact rather than a lower bound, so it carries no "+".
          const hiddenCount = items.length - i;
          return (
            <div
              key={item.key}
              className={styles.thumbnailItem}
              onClick={() => onOpen(i)}
            >
              <img src={item.url} alt="" className={styles.thumbnailImg} />
              {isCutoff && (
                <div className={styles.thumbnailCountBadge}>
                  <span className={styles.thumbnailCountNumber}>
                    {hiddenCount}
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
