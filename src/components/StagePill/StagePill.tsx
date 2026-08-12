import type { CSSProperties } from "react";
import styles from "./StagePill.module.css";

interface StagePillProps {
  count: number;
  label: string;
  /** When true the pill is rendered in its role colour (role-owned stage). */
  highlight?: boolean;
  /** The owning role's colour token (e.g. `statusColor(stage)` from lib/pipeline.ts) — only used when `highlight` is true. Falls back to `--accent-primary` when omitted. */
  color?: string;
  onClick?: () => void;
}

/** Clickable dashboard stage pill: stacked count (top) + label (below). */
export function StagePill({
  count,
  label,
  highlight = false,
  color,
  onClick,
}: StagePillProps) {
  // `--stage-color` backs both the persistent highlight colour and its
  // :hover intensification in CSS (a dynamic per-item colour can't live in
  // a static pseudo-class rule otherwise).
  const style: CSSProperties | undefined =
    highlight && color
      ? ({ "--stage-color": color } as CSSProperties)
      : undefined;

  return (
    <button
      type="button"
      className={[styles.pill, highlight ? styles.pillHighlight : ""]
        .filter(Boolean)
        .join(" ")}
      style={style}
      onClick={onClick}
    >
      <span className={styles.count} style={style ? { color } : undefined}>
        {count}
      </span>
      <span className={styles.label} style={style ? { color } : undefined}>
        {label}
      </span>
    </button>
  );
}
