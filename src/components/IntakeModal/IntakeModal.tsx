import { useEffect, useRef, useState } from 'react';
import { Icon } from '../Icon/Icon';
import { parseOrderText, type ParsedOrderDraft } from '../../lib/directus';
import styles from './IntakeModal.module.css';

interface IntakeModalProps {
  open: boolean;
  channel: 'horeca';
  onClose: () => void;
  /** Called after a successful parse — hands off the draft to the next step. */
  onParsed: (draft: ParsedOrderDraft, rawText: string) => void;
}

/**
 * Step 2 of the "Add New Order" flow.
 *
 * Admin pastes a raw WhatsApp group message (or types order text). Tapping
 * "Parse & Continue" POSTs to /order-api/parse-order and hands off the
 * structured draft to NewOrderModal for review/prefill.
 *
 * If parse fails, the user can still tap "Skip" to open a blank NewOrderModal.
 */
export function IntakeModal({ open, channel, onClose, onParsed }: IntakeModalProps) {
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<File[]>([]);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      // reset when closed
      setText('');
      setAttachments([]);
      setError(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !parsing) onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose, parsing]);

  if (!open) return null;

  async function handleParse() {
    const trimmed = text.trim();
    if (!trimmed) {
      setError('Paste a WhatsApp message first.');
      return;
    }
    setParsing(true);
    setError(null);
    const res = await parseOrderText(trimmed);
    setParsing(false);
    if (res.error || !res.data) {
      setError(`Parse failed: ${res.error ?? 'empty response'}`);
      return;
    }
    onParsed(res.data, trimmed);
  }

  function handleSkip() {
    // Open NewOrderModal blank (no prefill) — pass empty draft
    onParsed(
      {
        customerTyped: null,
        customerId: null,
        customerMatch: null,
        deliver: null,
        dateGuessed: false,
        paymentMethod: null,
        address: null,
        phone: null,
        ref: null,
        sales: null,
        lines: [],
      },
      '',
    );
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    setAttachments((prev) => [...prev, ...files]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function removeAttachment(index: number) {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  }

  return (
    <div
      className={styles.overlay}
      onClick={(e) => { if (e.target === e.currentTarget && !parsing) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label="WhatsApp intake"
    >
      <div className={styles.dialog}>
        <div className={styles.header}>
          <div className={styles.headerText}>
            <h2 className={styles.title}>
              WhatsApp Intake
              <span className={styles.channelBadge}>
                {channel === 'horeca' ? 'Horeca' : channel}
              </span>
            </h2>
            <p className={styles.subtitle}>
              Paste the customer's WhatsApp order message to auto-fill the order form.
            </p>
          </div>
          <button
            id="intake-close"
            className={styles.closeBtn}
            onClick={onClose}
            disabled={parsing}
            aria-label="Close"
          >
            <Icon name="close" size={18} />
          </button>
        </div>

        <div className={styles.body}>
          <div>
            <label htmlFor="intake-text" className={styles.label}>
              Order Message
            </label>
            <textarea
              id="intake-text"
              className={styles.textarea}
              placeholder={
                'Example:\n\nToko Makmur\nDelivery: besok\n- Salmon 5kg\n- Tuna fillet 3kg\n- Udang 1kg'
              }
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={parsing}
              spellCheck={false}
            />
            <p className={styles.hint}>
              The message will be parsed automatically. You can review and correct every line before saving.
            </p>
          </div>

          {/* Attachment upload */}
          <div>
            <span className={styles.label}>Attachments (optional)</span>
            <div className={styles.attachRow}>
              <button
                id="intake-attach"
                type="button"
                className={styles.attachBtn}
                onClick={() => fileInputRef.current?.click()}
                disabled={parsing}
              >
                <Icon name="attach" size={16} />
                Add file
              </button>
              {attachments.length > 0 && (
                <div className={styles.attachList}>
                  {attachments.map((f, i) => (
                    <span key={i} className={styles.attachChip} title={f.name}>
                      {f.name}
                      <button
                        type="button"
                        className={styles.attachChipRemove}
                        onClick={() => removeAttachment(i)}
                        aria-label={`Remove ${f.name}`}
                      >
                        <Icon name="close" size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              style={{ display: 'none' }}
              onChange={handleFileChange}
            />
          </div>

          {error && <div className={styles.errorBox}>{error}</div>}
        </div>

        <div className={styles.footer}>
          <button
            id="intake-skip"
            type="button"
            className={styles.cancelBtn}
            onClick={handleSkip}
            disabled={parsing}
          >
            Skip — enter manually
          </button>
          <button
            id="intake-parse"
            type="button"
            className={styles.parseBtn}
            onClick={handleParse}
            disabled={parsing || !text.trim()}
          >
            {parsing ? (
              <><span className={styles.spinner} /> Parsing…</>
            ) : (
              <>
                <Icon name="whatsapp" size={16} />
                Parse &amp; Continue
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
