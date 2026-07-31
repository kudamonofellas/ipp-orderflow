import type { CustomersCollection } from '../types/directus';

export type CustomerMatchType = 'exact' | 'phone' | 'fuzzy' | 'new' | 'none';

export interface CustomerMatchResult {
    type: CustomerMatchType;
    customer: CustomersCollection | null;
}

const normName = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
const tightKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const normPhone = (s: string) => {
    let d = s.replace(/\D/g, '');
    if (d.startsWith('62')) d = '0' + d.slice(2);
    return d;
};

export function matchCustomer(
    name: string,
    phone: string,
    customers: CustomersCollection[],
): CustomerMatchResult {
    const nm = normName(name || '');
    const tk = tightKey(name || '');
    const ph = normPhone(phone || '');

    if (nm) {
        const exact = customers.find((c) => normName(c.name) === nm);
        if (exact) return { type: 'exact', customer: exact };
    }
    if (ph) {
        const byPhone = customers.find((c) => c.contact && normPhone(c.contact) === ph);
        if (byPhone) return { type: 'phone', customer: byPhone };
    }
    if (tk.length >= 3) {
        const tight = customers.find((c) => tightKey(c.name) === tk);
        if (tight) return { type: 'fuzzy', customer: tight };
    }
    const tokset = nm ? [...new Set(nm.split(' ').filter(Boolean))] : [];
    if (tokset.length) {
        const subset = (a: string[], b: string[]) =>
            a.every((w) => b.some((x) => x === w || x.startsWith(w) || w.startsWith(x)));
        const hits = customers.filter((c) => {
            const ct = [...new Set(normName(c.name).split(' ').filter(Boolean))];
            if (!ct.length) return false;
            return subset(tokset, ct) || subset(ct, tokset);
        });
        if (hits.length === 1) return { type: 'fuzzy', customer: hits[0] };
    }
    return { type: name && name.trim() ? 'new' : 'none', customer: null };
}