import Stripe from 'stripe';
import { CURRENCY, MEMBERSHIP } from './catalog';

let client: Stripe | null = null;

/** Server-side Stripe client. Throws if STRIPE_SECRET_KEY is missing or isn't a secret key. */
export function getStripe(): Stripe {
    if (client) return client;
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key || !(key.startsWith('sk_') || key.startsWith('rk_'))) {
        throw new Error('STRIPE_SECRET_KEY is missing or is not a secret key');
    }
    client = new Stripe(key);
    return client;
}

let membershipPriceId: string | null = null;

/** The monthly membership price, created in Stripe on first use (looked up by lookup key). */
export async function getMembershipPriceId(stripe: Stripe): Promise<string> {
    if (membershipPriceId) return membershipPriceId;
    const existing = await stripe.prices.list({ lookup_keys: [MEMBERSHIP.lookupKey], active: true, limit: 1 });
    if (existing.data[0]) {
        membershipPriceId = existing.data[0].id;
        return membershipPriceId;
    }
    const price = await stripe.prices.create({
        currency: CURRENCY,
        unit_amount: MEMBERSHIP.amountCents,
        recurring: { interval: MEMBERSHIP.interval },
        lookup_key: MEMBERSHIP.lookupKey,
        transfer_lookup_key: true,
        product_data: { name: MEMBERSHIP.productName },
    });
    membershipPriceId = price.id;
    return membershipPriceId;
}
