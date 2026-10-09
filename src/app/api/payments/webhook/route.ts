import { getStripe } from '@/lib/payments/stripe';
import { handleStripeEvent } from '@/lib/payments/billing';

/**
 * POST /api/payments/webhook
 * Stripe events (verified with STRIPE_WEBHOOK_SECRET): payment_intent.succeeded
 * grants credits, invoice.paid and customer.subscription.* keep the membership
 * current, setup_intent.succeeded swaps the membership card. No user auth:
 * the signature is the authentication. A 500 makes Stripe retry.
 */
export async function POST(req: Request) {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    const signature = req.headers.get('stripe-signature');
    if (!secret || !signature) return Response.json({ error: 'Invalid signature' }, { status: 400 });

    let stripe;
    let event;
    try {
        stripe = getStripe();
        event = stripe.webhooks.constructEvent(await req.text(), signature, secret);
    } catch (error) {
        console.error('[Payments] Webhook signature error:', error);
        return Response.json({ error: 'Invalid signature' }, { status: 400 });
    }

    try {
        const outcome = await handleStripeEvent(stripe, event);
        console.log(`[Payments] ${event.type} ${event.id}: ${outcome}`);
        return Response.json({ received: true });
    } catch (error) {
        console.error(`[Payments] Webhook ${event.type} ${event.id} failed:`, error);
        return Response.json({ error: 'Webhook handling failed' }, { status: 500 });
    }
}
