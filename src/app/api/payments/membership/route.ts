import type Stripe from 'stripe';
import { verifyAuth, unauthorizedResponse } from '@/lib/auth/serverAuth';
import { checkRateLimit, rateLimitResponse } from '@/lib/rateLimit';
import { readAccess } from '@/lib/access/accessStore';
import { getStripe, getMembershipPriceId } from '@/lib/payments/stripe';
import { getOrCreateCustomer, listCards } from '@/lib/payments/billing';
import { MEMBERSHIP } from '@/lib/payments/catalog';
import { membershipActive } from '@functions/lib/access/sessionAccess';

/**
 * POST /api/payments/membership  { paymentMethodId? }
 * Starts a monthly membership. With a new card it returns the first invoice's
 * client secret for the in-app Payment Element (the card is saved on the
 * membership). With a saved card it charges right away and returns
 * { status, clientSecret } so the client can finish any bank check.
 * The webhook (invoice.paid) activates it. Requires a billing email.
 */
export async function POST(req: Request) {
    try {
        const uid = await verifyAuth(req);
        if (!uid) return unauthorizedResponse();

        const rl = checkRateLimit(`payments:${uid}`, { maxRequests: 10, windowMs: 60_000 });
        if (!rl.allowed) return rateLimitResponse(rl.resetMs);

        const { paymentMethodId } = await req.json().catch(() => ({}));
        const { access } = await readAccess(uid);
        if (membershipActive(access.membership, Date.now())) {
            return Response.json({ error: 'Membership is already active' }, { status: 409 });
        }
        if (!access.billing_email) return Response.json({ error: 'Email required', reason: 'email_required' }, { status: 400 });

        const stripe = getStripe();
        const customer = await getOrCreateCustomer(stripe, uid, access);
        const price = await getMembershipPriceId(stripe);

        const savedCard = typeof paymentMethodId === 'string' && paymentMethodId ? paymentMethodId : null;
        if (savedCard && !(await listCards(stripe, customer)).some(c => c.id === savedCard)) {
            return Response.json({ error: 'Unknown card' }, { status: 404 });
        }

        const subscription = await stripe.subscriptions.create({
            customer,
            items: [{ price }],
            // A saved card is charged now; a new card is confirmed in the Payment Element.
            payment_behavior: savedCard ? 'allow_incomplete' : 'default_incomplete',
            ...(savedCard ? { default_payment_method: savedCard } : {}),
            payment_settings: { save_default_payment_method: 'on_subscription', payment_method_types: ['card'] },
            metadata: { uid },
            expand: ['latest_invoice.confirmation_secret'],
        });

        const invoice = subscription.latest_invoice as Stripe.Invoice | null;
        const clientSecret = invoice?.confirmation_secret?.client_secret || null;
        if (!savedCard && !clientSecret) throw new Error(`Subscription ${subscription.id} has no confirmation secret`);

        return Response.json({ status: subscription.status, clientSecret, amountCents: MEMBERSHIP.amountCents });
    } catch (error) {
        console.error('[Payments] Membership error:', error);
        return Response.json({ error: 'Membership could not be started.' }, { status: 500 });
    }
}
