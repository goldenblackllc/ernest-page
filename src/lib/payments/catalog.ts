/**
 * What Earnest Page sells (MANIFESTO.md §8). Prices are USD cents.
 * Shared by the purchase routes, the webhook and the purchase UI.
 * The single-session price is a founding price: when it changes, change it here.
 */

export type CreditProductId = 'single' | 'pack3';

export interface CreditProduct {
    id: CreditProductId;
    credits: number;
    amountCents: number;
}

export const CREDIT_PRODUCTS: Record<CreditProductId, CreditProduct> = {
    single: { id: 'single', credits: 1, amountCents: 100_00 },
    pack3: { id: 'pack3', credits: 3, amountCents: 250_00 },
};

export const MEMBERSHIP = {
    amountCents: 1_000_00,
    interval: 'month' as const,
    /** Stripe price lookup key; the price is created on first use (see lib/payments/stripe.ts). */
    lookupKey: 'earnest_membership_monthly',
    productName: 'Earnest Page Membership',
};

export const CURRENCY = 'usd';

/**
 * The seller shown on receipts. The EIN is deliberately left off: US consumer
 * receipts don't need it. Set taxId only if a jurisdiction requires one.
 */
export const SELLER = {
    name: 'Earnest Page',
    legalName: 'Golden Black LLC',
    address: '347 Russell St\nCarlisle, MA 01741',
    taxId: '',
};

export function isCreditProduct(id: unknown): id is CreditProductId {
    return typeof id === 'string' && Object.prototype.hasOwnProperty.call(CREDIT_PRODUCTS, id);
}

/** Price of one session from a product, in cents (used for per-session refunds). */
export function unitPriceCents(product: CreditProduct): number {
    return Math.round(product.amountCents / product.credits);
}
