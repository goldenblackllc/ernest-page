/**
 * Stripe glue for payments: customers, membership state and webhook events.
 * Everything a user sees is our own UI (Payment Element); no Stripe-hosted pages.
 */
import type Stripe from 'stripe';
import type { AccessState, Membership } from '@functions/lib/access/sessionAccess';
import { CREDIT_PRODUCTS, isCreditProduct } from './catalog';
import { grantCredits, saveMembership, saveStripeCustomerId } from '@/lib/access/accessStore';

/**
 * The user's Stripe customer, created on first purchase. A stored id that
 * doesn't exist in the current Stripe mode (a test-mode customer seen by live
 * keys, or a deleted one) is replaced instead of failing the purchase.
 */
export async function getOrCreateCustomer(stripe: Stripe, uid: string, access: AccessState): Promise<string> {
    if (access.stripe_customer_id) {
        const existing = await stripe.customers.retrieve(access.stripe_customer_id).catch((error: { code?: string }) => {
            if (error?.code === 'resource_missing') return null;
            throw error;
        });
        if (existing && !('deleted' in existing && existing.deleted)) return existing.id;
        console.warn(`[Payments] Stripe customer ${access.stripe_customer_id} for ${uid} is missing in this mode; creating a new one`);
    }
    const customer = await stripe.customers.create(
        { metadata: { uid }, ...(access.billing_email ? { email: access.billing_email } : {}) },
        { idempotencyKey: `customer-${uid}-${access.stripe_customer_id || 'new'}` },
    );
    await saveStripeCustomerId(uid, customer.id);
    return customer.id;
}

export interface SavedCard {
    id: string;
    brand: string;
    last4: string;
    expMonth: number;
    expYear: number;
    isDefault: boolean;
}

function idOf(value: string | { id: string } | null | undefined): string | null {
    return typeof value === 'string' ? value : value?.id || null;
}

/**
 * The customer's saved payment methods, default first. Normally cards (Apple
 * Pay and Google Pay save as cards); any other type is listed by its type so
 * nothing saved is ever invisible.
 */
export async function listCards(stripe: Stripe, customerId: string): Promise<SavedCard[]> {
    const [customer, methods] = await Promise.all([
        stripe.customers.retrieve(customerId),
        stripe.customers.listPaymentMethods(customerId, { limit: 20 }),
    ]);
    const defaultId = 'deleted' in customer && customer.deleted ? null : idOf(customer.invoice_settings?.default_payment_method);
    return methods.data
        .map(pm => ({
            id: pm.id,
            brand: pm.card?.brand || pm.type,
            last4: pm.card?.last4 || '',
            expMonth: pm.card?.exp_month || 0,
            expYear: pm.card?.exp_year || 0,
            isDefault: pm.id === defaultId,
        }))
        .sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
}

/** Make a card the default for future charges, including an active membership. */
export async function setDefaultCard(stripe: Stripe, customerId: string, paymentMethodId: string, subscriptionId?: string | null) {
    await stripe.customers.update(customerId, { invoice_settings: { default_payment_method: paymentMethodId } });
    if (subscriptionId) await stripe.subscriptions.update(subscriptionId, { default_payment_method: paymentMethodId });
}

/** Make a card the default only if the customer has none yet. */
async function defaultIfNone(stripe: Stripe, customerId: string, paymentMethodId: string) {
    const customer = await stripe.customers.retrieve(customerId);
    if ('deleted' in customer && customer.deleted) return;
    if (!customer.invoice_settings?.default_payment_method) {
        await stripe.customers.update(customerId, { invoice_settings: { default_payment_method: paymentMethodId } });
    }
}

export interface BillingItem {
    /** PaymentIntent id; also the receipt id */
    id: string;
    /** ms */
    createdAt: number;
    item: 'single' | 'pack3' | 'membership';
    amountCents: number;
    refundedCents: number;
    currency: string;
    card: { brand: string; last4: string } | null;
}

/** A successful charge as shown in billing history and on receipts. */
export function toBillingItem(pi: Stripe.PaymentIntent): BillingItem {
    const charge = typeof pi.latest_charge === 'object' ? pi.latest_charge : null;
    const product = pi.metadata?.product;
    const card = charge?.payment_method_details?.card;
    return {
        id: pi.id,
        createdAt: pi.created * 1000,
        item: pi.metadata?.kind === 'credits' && isCreditProduct(product) ? product : 'membership',
        amountCents: pi.amount_received || pi.amount,
        refundedCents: charge?.amount_refunded || 0,
        currency: pi.currency,
        card: card ? { brand: card.brand || 'card', last4: card.last4 || '' } : null,
    };
}

function membershipStatus(status: Stripe.Subscription.Status): Membership['status'] {
    if (status === 'active' || status === 'trialing') return 'active';
    if (status === 'past_due') return 'past_due';
    if (status === 'incomplete') return 'incomplete';
    return 'canceled';
}

export function membershipFromSubscription(sub: Stripe.Subscription) {
    const periodEnd = Math.max(0, ...sub.items.data.map(i => i.current_period_end || 0));
    return {
        status: membershipStatus(sub.status),
        subscription_id: sub.id,
        current_period_end: periodEnd * 1000,
        cancel_at_period_end: !!sub.cancel_at_period_end,
    };
}

function subscriptionIdOf(invoice: Stripe.Invoice): string | null {
    const sub = invoice.parent?.subscription_details?.subscription;
    return typeof sub === 'string' ? sub : sub?.id || null;
}

/**
 * Apply one webhook event. Returns a short description for logs.
 * Throws on failure so the webhook answers 500 and Stripe retries.
 */
export async function handleStripeEvent(stripe: Stripe, event: Stripe.Event): Promise<string> {
    switch (event.type) {
        case 'payment_intent.succeeded': {
            const pi = event.data.object;
            const uid = pi.metadata?.uid;
            const productId = pi.metadata?.product;
            if (pi.metadata?.kind !== 'credits' || !uid || !isCreditProduct(productId)) return 'ignored: not a credit purchase';
            const product = CREDIT_PRODUCTS[productId];
            const result = await grantCredits(uid, pi.id, product, pi.amount_received || pi.amount);
            // A card saved with this purchase becomes the default if there is none.
            const customer = idOf(pi.customer);
            const pm = idOf(pi.payment_method);
            if (pi.setup_future_usage && customer && pm) await defaultIfNone(stripe, customer, pm);
            return result.granted ? `granted ${product.credits} credit(s)` : 'already granted';
        }

        case 'invoice.paid': {
            const invoice = event.data.object;
            const subId = subscriptionIdOf(invoice);
            if (!subId) return 'ignored: invoice without subscription';
            const sub = await stripe.subscriptions.retrieve(subId);
            const uid = sub.metadata?.uid;
            if (!uid) return 'ignored: subscription without uid';
            await saveMembership(uid, { ...membershipFromSubscription(sub), first_invoice_id: invoice.id });
            const customer = idOf(sub.customer);
            const pm = idOf(sub.default_payment_method);
            if (customer && pm) await defaultIfNone(stripe, customer, pm);
            return 'membership paid';
        }

        case 'customer.subscription.updated':
        case 'customer.subscription.deleted': {
            const sub = event.data.object;
            const uid = sub.metadata?.uid;
            if (!uid) return 'ignored: subscription without uid';
            // An unpaid first attempt stays out of the user's record until invoice.paid.
            if (sub.status === 'incomplete' || sub.status === 'incomplete_expired') return 'ignored: not paid yet';
            await saveMembership(uid, membershipFromSubscription(sub));
            return `membership ${sub.status}`;
        }

        case 'setup_intent.succeeded': {
            // A card added in Billing (from /api/payments/methods).
            const si = event.data.object;
            const pm = idOf(si.payment_method);
            const customer = idOf(si.customer);
            if (si.metadata?.purpose !== 'add_card' || !pm || !customer) return 'ignored: not a card added in Billing';
            if (si.metadata.make_default === 'true') {
                await setDefaultCard(stripe, customer, pm, si.metadata.subscription_id || null);
                return 'card added as default';
            }
            await defaultIfNone(stripe, customer, pm);
            return 'card added';
        }

        default:
            return `ignored: ${event.type}`;
    }
}
