import type { ButtonHTMLAttributes, ReactNode } from "react";
import styles from "./Button.module.css";
import { Icon } from "../Icon/Icon";
import type { IconName } from "../Icon/icons";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children?: ReactNode;
  variant?: "primary" | "secondary" | "tertiary" | "ghost";
  size?: "sm" | "md" | "lg";
  buttonStyle?: "default" | "fullWidth";
  iconOnly?: boolean;
  isActive?: boolean;
  icon?: IconName;
  iconPosition?: "left" | "right";
  iconClassName?: string;
  /** Alignment of the icon+label content within the button box — most
   *  useful paired with `buttonStyle="fullWidth"`, where centered content
   *  otherwise floats in the middle of the extra space.
   *  @default "center" */
  align?: "left" | "center";
}

const ICON_SIZES = {
  sm: 16,
  md: 20,
  lg: 24,
} as const;

export function Button({
  children,
  variant = "primary",
  size = "md",
  className,
  style,
  type = "button",
  buttonStyle = "default",
  iconOnly = false,
  isActive = false,
  icon,
  iconPosition = "left",
  iconClassName,
  align = "center",
  ...rest
}: ButtonProps) {
  const styleClass =
    buttonStyle === "fullWidth"
      ? styles["full-width"] || styles.fullWidth
      : styles.default;

  const classes = [
    styles.button,
    styles[variant],
    styles[size],
    styleClass,
    iconOnly && styles.iconOnly,
    className,
    isActive ? styles.active : "",
    align === "left" ? styles.alignLeft : "",
  ]
    .filter(Boolean)
    .join(" ");

  const iconElement = icon ? (
    <Icon
      name={icon}
      size={ICON_SIZES[size]}
      className={`${styles.icon} ${iconClassName || ""}`}
    />
  ) : null;

  return (
    <button type={type} className={classes} style={style} {...rest}>
      {iconPosition === "left" && iconElement}
      {!iconOnly && children}
      {iconPosition === "right" && iconElement}
    </button>
  );
}
