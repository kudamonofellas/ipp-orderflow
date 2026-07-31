import type { ButtonHTMLAttributes, ReactNode } from 'react';
import styles from './Button.module.css';
import { Icon } from '../Icon/Icon';
import type { IconName } from '../Icon/icons';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children?: ReactNode; // Made optional for cases where only an icon is rendered
  variant?: 'primary' | 'secondary' | 'tertiary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  buttonStyle?: 'default' | 'fullWidth';
  iconOnly?: boolean;
  isActive?: boolean;
  /** Name of the icon from the icon registry */
  icon?: IconName;
  /** Position of the icon relative to the text label. Defaults to 'left' */
  iconPosition?: 'left' | 'right';
}

// Optional helper to scale icon size according to button size
const ICON_SIZES = {
  sm: 16,
  md: 20,
  lg: 24,
} as const;

/** Shared button. Matches the Button baseline in ui-registry.md. */
export function Button({
  children,
  variant = 'primary',
  size = 'md',
  className,
  type = 'button',
  buttonStyle = 'default',
  iconOnly = false,
  isActive = false,
  icon,
  iconPosition = 'left',
  ...rest
}: ButtonProps) {
  // Map 'fullWidth' prop to CSS module class safely
  const styleClass =
    buttonStyle === 'fullWidth'
      ? styles['full-width'] || styles.fullWidth
      : styles.default;

  const classes = [
    styles.button,
    styles[variant],
    styles[size],
    styleClass,
    iconOnly && styles.iconOnly,
    className,
    isActive ? styles.active : '',
  ]
    .filter(Boolean)
    .join(' ');

  const iconElement = icon ? (
    <Icon name={icon} size={ICON_SIZES[size]} />
  ) : null;

  return (
    <button type={type} className={classes} {...rest}>
      {iconPosition === 'left' && iconElement}
      {!iconOnly && children}
      {iconPosition === 'right' && iconElement}
    </button>
  );
}