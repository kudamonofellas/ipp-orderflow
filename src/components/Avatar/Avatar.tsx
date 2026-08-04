import styles from './Avatar.module.css';

interface AvatarProps {
  /** Initials fallback, e.g. "MF". */
  initials: string;
  /** Accessible label describing who the avatar represents. */
  label?: string;
  size?: 'sm' | 'md' | 'lg';
}

const SIZE_MAP: Record<NonNullable<AvatarProps['size']>, { box: number; font: number }> = {
  sm: { box: 28, font: 12 },
  md: { box: 40, font: 16 },
  lg: { box: 56, font: 20 },
};

/** Circular initials avatar. Matches the Avatar baseline in ui-registry.md. */
export function Avatar({ initials, label, size = 'md' }: AvatarProps) {
  const { box, font } = SIZE_MAP[size];

  return (
    <span
      className={styles.avatar}
      style={{ width: box, height: box, fontSize: font }}
      role="img"
      aria-label={label ?? initials}
    >
      {initials}
    </span>
  );
}
