import { Icon as Iconify } from '@iconify/react';
import { ICONS, type IconName } from './icons';

/**
 * Central icon component. Wraps Iconify + the offline HugeIcons set so every
 * component references icons through one surface (mirrors the old lucide
 * import pattern). Icon set: @iconify-json/hugeicons.
 *
 * Usage: <Icon name="dashboard" size={16} />
 *
 * The name→id registry (and the IconName type) lives in ./icons.ts.
 */

interface IconProps {
  name: IconName;
  /** Pixel size (width + height). Defaults to 20. */
  size?: number;
  className?: string;
  style?: React.CSSProperties;
  /** Accessible label. When omitted the icon is decorative (aria-hidden). */
  label?: string;
}

export function Icon({ name, size = 20, className, style, label }: IconProps) {
  return (
    <Iconify
      icon={ICONS[name]}
      width={size}
      height={size}
      className={className}
      style={style}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? 'img' : undefined}
    />
  );
}
