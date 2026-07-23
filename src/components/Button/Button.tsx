import type { ButtonHTMLAttributes, ReactNode } from 'react';
import styles from './Button.module.css';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'tertiary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  buttonStyle?: 'default' | 'fullWidth';
  iconOnly?: boolean;
  isActive?: boolean;
}

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
  ...rest
}: ButtonProps) {
  // Map 'fullWidth' prop to CSS module class safely
  const styleClass = buttonStyle === 'fullWidth' ? (styles['full-width'] || styles.fullWidth) : styles.default;

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

  return (
    <button type={type} className={classes} {...rest}>
      {children}
    </button>
  );
}