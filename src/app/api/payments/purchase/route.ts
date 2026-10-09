import { verifyAuth, unauthorizedResponse } from '@/lib/auth/serverAuth';
import { checkRateLimit, rateLimitResponse } from '@/lib/rateLimit';
import { readAccess } from '@/lib/access/accessStore';
import { getStripe } from '@/lib/payments/stripe';
import { getOrCreateCustomer, listCards } from '@/lib/payments/billing';
import { CREDIT_PRODUCTS, CURRENCY, isCreditProduct } from '@/lib/payments/catalog';

/**
 * POST /api/payments/purchase  { product: 'single' | 'pack3', saveCard?, paymentMethodId? }
 * Buys session credits. With a new card it returns a client secret for the
 * in-app Payment Element (saveCard keeps the card for next time). With a saved
 * card it charges right away and returns { status, clientSecret } so the client
 * can finish any bank check. Credits are granted by the webhook once paid.
 * Requires a billing email (400 { reason: 'email_required' }).
 */
export async function POST(req: Request) {
    try {
        const uid = await verifyAuth(req);
        if (!uid) return unauthorizedResponse();

        const rl = checkRateLimit(`payments:${uid}`, { maxRequests: 10, windowMs: 60_000 });
        if (!rl.allowed) return rateLimitResponse(rl.resetMs);

        const { product, saveCard, paymentMethodId } = await req.json().catch(() => ({}));
        if (!isCreditProduct(product)) return Response.json({ error: 'Unknown product' }, { status: 400 });

        const { access } = await readAccess(uid);
        if (!access.billing_email) return Response.json({ error: 'Email required', reason: 'email_required' }, { status: 400 });

        const stripe = getStripe();
        const customer = await getOrCreateCustomer(stripe, uid, access);
        const item = CREDIT_PRODUCTS[product];
        const base = {
            amount: item.amountCents,
            currency: CURRENCY,
            customer,
            receipt_email: access.billing_email,
            description: item.credits === 1 ? 'Earnest Page session' : `Earnest Page sessions (${item.credits})`,
            metadata: { uid, kind: 'credits', product },
            // Nothing that redirects away from the app.
            automatic_payment_methods: { enabled: true, allow_redirects: 'never' as const },
        };

        if (typeof paymentMethodId === 'string' && paymentMethodId) {
            const cards = await listCards(stripe, customer);
            if (!cards.some(c => c.id === paymentMethodId)) return Response.json({ error: 'Unknown card' }, { status: 404 });
            const intent = await stripe.paymentIntents.create({ ...base, payment_method: paymentMethodId, confirm: true });
            return Response.json({ status: intent.status, clientSecret: intent.client_secret, amountCents: item.amountCents });
        }

        const intent = await stripe.paymentIntents.create({
            ...base,
            ...(saveCard ? { setup_future_usage: 'off_session' as const } : {}),
        });
        return Response.json({ clientSecret: intent.client_secret, amountCents: item.amountCents });
    } catch (error) {
        console.error('[Payments] Purchase error:', error);
        return Response.json({ error: 'Payment could not be started.' }, { status: 500 });
    }
}
