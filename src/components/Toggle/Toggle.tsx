import styles from "./Toggle.module.css";

interface ToggleProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
  /** @default 'md' */
  size?: "sm" | "md" | "lg";
}

/** Pill switch. `label` is the accessible name (visually hidden — pair with visible copy beside it). */
export function Toggle({ checked, onChange, label, disabled = false, size = "md" }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={[styles.toggle, styles[size], checked ? styles.toggleOn : ""]
        .filter(Boolean)
        .join(" ")}
      onClick={() => onChange(!checked)}
    >
      <span className={styles.knob} />
    </button>
  );
}
