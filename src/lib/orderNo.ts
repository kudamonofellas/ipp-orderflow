/** YYMMDD date code from an ISO date string (delivery date), e.g. "2026-07-30" → "260730". */
export function dateCode(iso: string): string {
    const d = new Date(iso);
    const yy = String(d.getFullYear()).slice(-2);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yy}${mm}${dd}`;
}

/** Split "260730005" into its date-code + sequence parts. Format: 6-digit date + 3-digit seq, no separator. */
export function parseOrderNo(no: string): { dateCode: string; seq: number } | null {
    const m = String(no || '').trim().match(/^(\d{6})(\d{3})$/);
    if (!m) return null;
    return { dateCode: m[1], seq: parseInt(m[2], 10) };
}

export function buildOrderNo(dc: string, seq: number): string {
    return `${dc}${String(seq).padStart(3, '0')}`;
}