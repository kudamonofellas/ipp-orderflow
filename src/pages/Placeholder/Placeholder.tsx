import styles from './Placeholder.module.css';

interface PlaceholderProps {
  title: string;
}

/** Temporary route stub for pages not yet built. */
export function Placeholder({ title }: PlaceholderProps) {
  return (
    <div className={styles.wrap}>
      <h1>{title}</h1>
      <p className={styles.note}>This section is not built yet.</p>
    </div>
  );
}
