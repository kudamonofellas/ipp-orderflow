import { useEffect, useState } from 'react';
import { Icon } from '../Icon/Icon';
import { Button } from '../Button/Button';
import { useLanguage } from '../../hooks/useLanguage';
import { normalizeItemToken } from '../../lib/itemToken';
import type { ProductsCollection, CorrectionsCollection } from '../../types/directus';
import styles from './AddItemModal.module.css';

export interface AddItemResult {
    qty: string;
    unit: string;
    name: string;
    productId: string | null;
    /** Normalized lookup key for the `corrections` table — set only when
     *  the result came from typed free text (the "Match" button), never
     *  from the plain manual qty/unit/product row. Callers should persist
     *  `upsertCorrection(rawText, productId)` on save so the same free
     *  text auto-matches next time. */
    rawText?: string;
    /** True when this result came from a previously learned correction
     *  rather than the plain substring/word-overlap heuristic. */
    learned?: boolean;
}

interface AddItemModalProps {
    open: boolean;
    products: ProductsCollection[];
    unitOptions: string[];
    /** Previously learned token→product corrections, consulted before the
     *  substring/word-overlap fallback so a manually-fixed match "sticks"
     *  for the same or similar free text next time. */
    corrections: CorrectionsCollection[];
    onClose: () => void;
    onConfirm: (result: AddItemResult) => void;
}

function defaultResult(products: ProductsCollection[], unitOptions: string[]): AddItemResult {
    const firstUnit = unitOptions.find((u) => u.toLowerCase() === 'pcs') ?? unitOptions[0] ?? 'pcs';
    const firstProduct = products[0];
    return {
        qty: '1',
        unit: firstUnit,
        name: firstProduct?.name ?? '',
        productId: firstProduct?.id ?? null,
    };
}

/**
 * Free-text "type or paste an item, match it against the catalog" modal —
 * but also usable purely manually, without ever typing anything. The
 * qty/unit/product row is always visible, seeded with sensible defaults
 * (qty 1, first unit, first product); pressing Match overwrites it with
 * the parsed result. Shared between OrderNew and OrderDetail's edit mode —
 * callers own their own line-draft shape; this only ever returns a
 * generic result via onConfirm.
 */
export function AddItemModal({ open, products, unitOptions, corrections, onClose, onConfirm }: AddItemModalProps) {
    const { t } = useLanguage();
    const [addItemText, setAddItemText] = useState('');
    const [matchedItem, setMatchedItem] = useState<AddItemResult>(() => defaultResult(products, unitOptions));
    const [isManual, setIsManual] = useState(true);

    // Fresh manual default every time the modal opens
    useEffect(() => {
        if (open) {
            setAddItemText('');
            setMatchedItem(defaultResult(products, unitOptions));
            setIsManual(true);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    if (!open) return null;

    function parseFreeTextLine(text: string, productsList: ProductsCollection[]): AddItemResult {
        const trimmed = text.trim();
        if (!trimmed) return defaultResult(productsList, unitOptions);

        const match = trimmed.match(/^(\d+(?:\.\d+)?)\s*([a-zA-Z]+)?\s*(.*)$/);
        let qty = '1';
        let unit = unitOptions.find((u) => u.toLowerCase() === 'pcs') ?? unitOptions[0] ?? 'pcs';
        let searchName = trimmed;

        if (match) {
            qty = match[1] || '1';
            const unitCandidate = (match[2] || '').toLowerCase();
            const rest = (match[3] || '').trim();

            const unitMap: Record<string, string> = {
                kg: 'kg', kilo: 'kg', kilos: 'kg',
                gram: 'gram', g: 'gram', gr: 'gram',
                loaf: 'Loaf', loaves: 'Loaf',
                box: 'Box', boxes: 'Box',
                pack: 'Pack', packs: 'Pack',
                pcs: 'pcs', pc: 'pcs', ekor: 'ekor',
            };
            const mapped = unitMap[unitCandidate];
            const resolved = mapped && unitOptions.find((u) => u.toLowerCase() === mapped.toLowerCase());
            if (resolved) {
                unit = resolved;
                searchName = rest || searchName;
            } else if (rest) {
                searchName = `${unitCandidate} ${rest}`.trim();
            }
        }

        // A learned correction wins outright — this is how the manual
        // Add-Item flow gets smarter the more it's used, mirroring the
        // WhatsApp-paste parser's own "learned correction wins" rule.
        const key = normalizeItemToken(searchName || trimmed);
        let matchedProduct: ProductsCollection | undefined;
        let learned = false;
        if (key) {
            const hit = corrections.find((c) => c.token_key === key);
            if (hit) {
                matchedProduct = productsList.find((p) => p.id === hit.product_id);
                if (matchedProduct) learned = true;
            }
        }

        if (!matchedProduct && searchName) {
            const sLower = searchName.toLowerCase();
            matchedProduct = productsList.find((p) => p.name.toLowerCase() === sLower);
            if (!matchedProduct) {
                matchedProduct = productsList.find((p) => p.name.toLowerCase().includes(sLower) || sLower.includes(p.name.toLowerCase()));
            }
            if (!matchedProduct) {
                const words = sLower.split(/\s+/).filter(Boolean);
                matchedProduct = productsList.find((p) => words.every((w) => p.name.toLowerCase().includes(w)));
            }
        }

        return {
            qty,
            unit,
            name: matchedProduct ? matchedProduct.name : (searchName || trimmed),
            productId: matchedProduct ? matchedProduct.id : null,
            rawText: key || undefined,
            learned,
        };
    }

    function handleMatchItem() {
        if (!addItemText.trim()) return;
        setMatchedItem(parseFreeTextLine(addItemText, products));
        setIsManual(false);
    }

    function handleConfirm() {
        onConfirm(matchedItem);
        handleClose();
    }

    function handleClose() {
        setAddItemText('');
        setMatchedItem(defaultResult(products, unitOptions));
        setIsManual(true);
        onClose();
    }

    return (
        <div className={styles.modalBackdrop} onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}>
            <div className={styles.addItemModalCard}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span className={styles.title}>{t('Add new item')}</span>
                    <Button type="button" variant="tertiary" iconOnly size="sm" onClick={handleClose}>
                        <Icon name="close" size={18} />
                    </Button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <label className={styles.subtitle}>
                        {t('Type or paste the item here:')}
                    </label>
                    <textarea
                        className={styles.addItemTextarea}
                        placeholder={'e.g. "2 kg short rib" or "1 Box Wagyu Striploin"'}
                        value={addItemText}
                        onChange={(e) => setAddItemText(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey && addItemText.trim()) {
                                e.preventDefault();
                                handleMatchItem();
                            }
                        }}
                        autoFocus
                    />
                    <Button type="button" variant="primary" size="lg" buttonStyle="fullWidth" disabled={!addItemText.trim()} onClick={handleMatchItem}>
                        <Icon name="ai" size={16} /> {t('Match')}
                    </Button>
                </div>

                {!isManual && <hr className={styles.matchDivider} />}
                <div className={styles.subtitle}>
                    {isManual ? t('or add manually:') : t('Matched result — review and adjust:')}
                    {!isManual && matchedItem.learned && (
                        <span style={{ color: 'var(--state-success)', marginLeft: 8, fontWeight: 600 }}>
                            ✓ {t('learned match')}
                        </span>
                    )}
                </div>
                <div className={styles.matchedResultRow}>
                    <input
                        type="number" className={styles.editInput} style={{ width: 70, textAlign: 'center', flexShrink: 0 }}
                        value={matchedItem.qty} min="0" step="0.5"
                        onChange={(e) => setMatchedItem((prev) => ({ ...prev, qty: e.target.value }))}
                    />
                    <select
                        className={styles.editSelect} style={{ width: 90, flexShrink: 0 }} value={matchedItem.unit}
                        onChange={(e) => setMatchedItem((prev) => ({ ...prev, unit: e.target.value }))}
                    >
                        {unitOptions.map((u) => <option key={u} value={u}>{u}</option>)}
                    </select>
                    <select
                        className={styles.editSelect} style={{ flex: 1, minWidth: 0 }} value={matchedItem.productId ?? '__custom__'}
                        onChange={(e) => {
                            const val = e.target.value;
                            // A hand-picked product is no longer "the learned
                            // result" — clear the badge so it doesn't keep
                            // claiming credit for a manual correction.
                            if (val === '__custom__') {
                                setMatchedItem((prev) => ({ ...prev, productId: null, learned: false }));
                            } else {
                                const prod = products.find((p) => p.id === val);
                                setMatchedItem((prev) => ({ ...prev, productId: val, name: prod?.name ?? prev.name, learned: false }));
                            }
                        }}
                    >
                        <option value="__custom__">{t('— No match (custom) —')}</option>
                        {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                </div>

                {!matchedItem.productId && (
                    <input
                        type="text" className={styles.editInput} placeholder={t('Item name (custom)')}
                        value={matchedItem.name}
                        onChange={(e) => setMatchedItem((prev) => ({ ...prev, name: e.target.value }))}
                    />
                )}

                <div className={styles.modalActionsRow}>
                    <Button
                        type="button" variant="primary" size="lg" buttonStyle="fullWidth"
                        onClick={handleConfirm} disabled={!matchedItem.name.trim()} style={{ fontWeight: 600 }}
                    >
                        {t('Add to order')}
                    </Button>
                    <Button type="button" variant="secondary" size="lg" buttonStyle="fullWidth" onClick={handleClose}>{t('Cancel')}</Button>
                </div>
            </div>
        </div>
    );
}