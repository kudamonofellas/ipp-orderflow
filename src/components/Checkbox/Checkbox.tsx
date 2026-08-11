import { Icon } from "../Icon/Icon";
import styles from "./Checkbox.module.css";

interface CheckboxProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** Accessible name — visually hidden; pair with visible copy beside it if needed (see Toggle). */
  label: string;
  disabled?: boolean;
  /** @default 'md' */
  size?: "sm" | "md";
  className?: string;
}

/** Icon-button checkbox (tick on a bordered square), not a native `<input>`. */
export function Checkbox({
  checked,
  onChange,
  label,
  disabled = false,
  size = "md",
  className,
}: CheckboxProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={[
        styles.checkbox,
        styles[size],
        checked ? styles.checkboxOn : "",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={() => onChange(!checked)}
    >
      {checked && <Icon name="tick" size={size === "sm" ? 12 : 14} />}
    </button>
  );
}
