import styles from './Avatar.module.css';

interface AvatarProps {
  /** Initials fallback, e.g. "MF". */
  initials: string;
  /** Accessible label describing who the avatar represents. */
  label?: string;
  size?: number;
}

/** Circular initials avatar. Matches the Avatar baseline in ui-registry.md. */
export function Avatar({ initials, label, size = 40 }: AvatarProps) {
  return (
    <span
      className={styles.avatar}
      style={{ width: size, height: size }}
      role="img"
      aria-label={label ?? initials}
    >
      {initials}
    </span>
  );
}
