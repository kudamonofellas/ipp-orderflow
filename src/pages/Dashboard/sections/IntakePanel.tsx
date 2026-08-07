import { Card } from "../../../components/Card/Card";
import { useLanguage } from "../../../hooks/useLanguage";
import type { IntakeMessage } from "../../../types/dashboard";
import styles from "./IntakePanel.module.css";

interface IntakePanelProps {
  messages: IntakeMessage[];
  loading?: boolean;
  error?: string | null;
}

/** WhatsApp Intake panel: triage message preview cards. */
export function IntakePanel({ messages, loading, error }: IntakePanelProps) {
  const { t } = useLanguage();
  return (
    <Card className={styles.card}>
      <h3 className={styles.heading}>{t('WhatsApp Intake')}</h3>
      {loading ? (
        <p className={styles.empty}>{t('Loading…')}</p>
      ) : error ? (
        <p className={styles.empty}>{error}</p>
      ) : messages.length === 0 ? (
        <p className={styles.empty}>{t('No untriaged messages.')}</p>
      ) : (
        <ul className={styles.list}>
          {messages.map((msg) => (
            <li key={msg.id} className={styles.item}>
              {msg.body ? (
                <p className={styles.body}>{msg.body}</p>
              ) : (
                <p className={styles.preview}>{msg.preview}</p>
              )}
              <p className={styles.handle}>{msg.customer}</p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
