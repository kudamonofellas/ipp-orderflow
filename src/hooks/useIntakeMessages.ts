/**
 * Dashboard "WhatsApp Intake" panel: recent inbound messages that haven't
 * been triaged into an order yet (`order_id` still null). Once staff turns
 * a message into an order (via the existing IntakeModal paste-and-parse
 * flow), it drops off this list.
 */

import { useEffect, useState } from 'react';
import { readMessages } from '../lib/directus';
import type { IntakeMessage } from '../types/dashboard';

/** Recent untriaged messages only — this is a triage queue, not a full log. */
const FEED_LIMIT = 20;
const PREVIEW_LENGTH = 80;

function buildPreview(text: string): string {
  const trimmed = text.trim();
  return trimmed.length > PREVIEW_LENGTH
    ? `${trimmed.slice(0, PREVIEW_LENGTH)}…`
    : trimmed;
}

interface UseIntakeMessagesResult {
  messages: IntakeMessage[];
  loading: boolean;
  error: string | null;
}

export function useIntakeMessages(): UseIntakeMessagesResult {
  const [messages, setMessages] = useState<IntakeMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      const res = await readMessages({
        filter: { order_id: { _null: true } },
        fields: ['id', 'message_id', 'sender_number', 'content', 'caption', 'created_at'],
        sort: ['-created_at'],
        limit: FEED_LIMIT,
      });

      if (cancelled) return;

      if (res.error !== null) {
        setError(`Failed to load intake messages: ${res.error}`);
        setLoading(false);
        return;
      }

      const rows = res.data ?? [];
      setMessages(
        rows.map((row) => {
          const text = row.content || row.caption || '';
          return {
            id: String(row.id),
            preview: buildPreview(text),
            customer: row.sender_number || 'Unknown sender',
          };
        }),
      );
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return { messages, loading, error };
}
