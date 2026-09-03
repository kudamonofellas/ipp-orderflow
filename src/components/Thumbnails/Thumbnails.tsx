import { useLayoutEffect, useRef, useState } from "react";
import styles from "./Thumbnails.module.css";

export interface ThumbnailPhoto {
  url: string;
}

interface ThumbnailsProps<T extends ThumbnailPhoto> {
  photos: T[];
  /** Called with the full photo list + the index clicked. When all photos
   *  fit on one line every thumbnail is individually clickable (its own
   *  index); once collapsed, only the first is shown and always opens at
   *  index 0 — the rest are reached via the modal's own slideshow. */
  onOpen: (photos: T[], index: number) => void;
  /** @default (n) => `${n} more` */
  moreLabel?: (extra: number) => string;
  /** Size of each individual thumbnail box. @default { width: 56, height: 40 } */
  itemSize?: { width: number; height: number };
  className?: string;
  style?: React.CSSProperties;
}

/** Renders every photo inline, one thumbnail each, as long as they all fit
 *  on one line. Only once they'd actually overflow (measured live via
 *  ResizeObserver, not assumed) does it collapse to a single thumbnail with
 *  a hover "N more" overlay — the previous unconditional-collapse approach
 *  wrapped a 2-photo row onto a second line before, and an always-collapsed
 *  single thumbnail hid photos that had plenty of room. Extra photos beyond
 *  the visible ones are reachable via the modal's own prev/next slideshow. */
const DEFAULT_ITEM_SIZE = { width: 56, height: 40 };

export function Thumbnails<T extends ThumbnailPhoto>({
  photos,
  onOpen,
  moreLabel,
  itemSize = DEFAULT_ITEM_SIZE,
  className,
  style,
}: ThumbnailsProps<T>) {
  const rowRef = useRef<HTMLDivElement>(null);
  // Optimistic default: assume it fits until measured, corrected
  // synchronously (before paint) by the layout effect below.
  const [collapsed, setCollapsed] = useState(false);

  useLayoutEffect(() => {
    const el = rowRef.current;
    if (!el) return;

    function measure() {
      // `el` is always laid out with every thumbnail in one no-wrap row
      // (visually hidden when collapsed, but still in the layout — see
      // .fullRow/.hidden below) so this comparison stays accurate as the
      // container is resized in either direction, not just the direction
      // that triggered the last collapse.
      setCollapsed(el!.scrollWidth > el!.clientWidth + 1);
    }

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [photos.length]);

  if (photos.length === 0) return null;
  const extra = photos.length - 1;

  return (
    <div
      className={[styles.container, className].filter(Boolean).join(" ")}
      style={style}
    >
      <div
        ref={rowRef}
        className={[styles.fullRow, collapsed ? styles.hidden : ""]
          .filter(Boolean)
          .join(" ")}
        style={{ height: itemSize.height }}
      >
        {photos.map((p, i) => (
          <div
            key={i}
            className={styles.thumbnailItem}
            style={itemSize}
            onClick={() => onOpen(photos, i)}
          >
            <img src={p.url} alt="" className={styles.thumbnailImg} />
          </div>
        ))}
      </div>
      {collapsed && (
        <div
          className={`${styles.thumbnailItem} ${styles.collapsedOverlay}`}
          style={itemSize}
          onClick={() => onOpen(photos, 0)}
        >
          <img src={photos[0].url} alt="" className={styles.thumbnailImg} />
          {extra > 0 && (
            <div className={styles.moreOverlay}>
              {moreLabel ? moreLabel(extra) : `${extra} more`}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
