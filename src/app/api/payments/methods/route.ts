import { verifyAuth, unauthorizedResponse } from '@/lib/auth/serverAuth';
import { checkRateLimit, rateLimitResponse } from '@/lib/rateLimit';
import { readAccess } from '@/lib/access/accessStore';
import { getStripe } from '@/lib/payments/stripe';
import { getOrCreateCustomer, listCards, setDefaultCard } from '@/lib/payments/billing';
import { membershipActive } from '@functions/lib/access/sessionAccess';

/**
 * GET  /api/payments/methods                         saved cards, default first
 * POST /api/payments/methods { action: 'add', makeDefault? }   SetupIntent client secret
 *                            { action: 'default', paymentMethodId }
 *                            { action: 'remove', paymentMethodId }
 * A new card is saved by the webhook (setup_intent.succeeded).
 * The default card can't be removed while a membership is active.
 */
export async function GET(req: Request) {
    try {
        const uid = await verifyAuth(req);
        if (!uid) return unauthorizedResponse();

        const { access } = await readAccess(uid);
        if (!access.stripe_customer_id) return Response.json({ cards: [] });
        return Response.json({ cards: await listCards(getStripe(), access.stripe_customer_id) });
    } catch (error) {
        console.error('[Payments] Methods error:', error);
        return Response.json({ error: 'Cards could not be loaded.' }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const uid = await verifyAuth(req);
        if (!uid) return unauthorizedResponse();

        const rl = checkRateLimit(`payments:${uid}`, { maxRequests: 10, windowMs: 60_000 });
        if (!rl.allowed) return rateLimitResponse(rl.resetMs);

        const body = await req.json().catch(() => ({}));
        const stripe = getStripe();
        const { access } = await readAccess(uid);
        const membership = membershipActive(access.membership, Date.now()) ? access.membership! : null;

        if (body.action === 'add') {
            const customer = await getOrCreateCustomer(stripe, uid, access);
            const intent = await stripe.setupIntents.create({
                customer,
                // Nothing that redirects away from the app.
                automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
                usage: 'off_session',
                metadata: {
                    uid,
                    purpose: 'add_card',
                    make_default: body.makeDefault ? 'true' : 'false',
                    subscription_id: membership?.subscription_id || '',
                },
            });
            return Response.json({ clientSecret: intent.client_secret });
        }

        const customerId = access.stripe_customer_id;
        const paymentMethodId = body.paymentMethodId;
        if (!customerId || typeof paymentMethodId !== 'string') return Response.json({ error: 'Unknown card' }, { status: 400 });

        const cards = await listCards(stripe, customerId);
        const card = cards.find(c => c.id === paymentMethodId);
        if (!card) return Response.json({ error: 'Unknown card' }, { status: 404 });

        if (body.action === 'default') {
            await setDefaultCard(stripe, customerId, card.id, membership?.subscription_id);
            return Response.json({ cards: await listCards(stripe, customerId) });
        }

        if (body.action === 'remove') {
            if (card.isDefault && membership) {
                return Response.json({ error: 'Choose another default card first', reason: 'membership_default' }, { status: 409 });
            }
            await stripe.paymentMethods.detach(card.id);
            return Response.json({ cards: await listCards(stripe, customerId) });
        }

        return Response.json({ error: 'Unknown action' }, { status: 400 });
    } catch (error) {
        console.error('[Payments] Methods error:', error);
        return Response.json({ error: 'Card could not be changed.' }, { status: 500 });
    }
}
