import { Card } from '../../../components/Card/Card';
import type { IntakeMessage } from '../../../types/dashboard';
import styles from './IntakePanel.module.css';

interface IntakePanelProps {
  messages: IntakeMessage[];
}

/** WhatsApp Intake panel: triage message preview cards. */
export function IntakePanel({ messages }: IntakePanelProps) {
  return (
    <Card>
      <h3 className={styles.heading}>WhatsApp Intake</h3>
      <ul className={styles.list}>
        {messages.map((msg) => (
          <li key={msg.id} className={styles.item}>
            {msg.body ? (
              <p className={styles.body}>{msg.body}</p>
            ) : (
              <p className={styles.preview}>{msg.preview}</p>
            )}
            <p className={styles.customer}>{msg.customer}</p>
          </li>
        ))}
      </ul>
    </Card>
  );
}
