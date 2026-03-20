import Stripe from 'stripe';
import { db, FieldValue } from '@/lib/firebase/admin';
import { checkRateLimit, rateLimitResponse } from '@/lib/rateLimit';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: '2026-02-25.clover',
});

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET!;

// 20 webhook calls per minute per IP
const WEBHOOK_LIMIT = { maxRequests: 20, windowMs: 60_000 };

// Session tier → number of credits granted
const SESSION_CREDITS: Record<string, number> = {
    session_single: 1,
    session_3pack: 3,
    session_gift: 1,
};

// Session tier → amount in cents (for purchase record)
const SESSION_AMOUNTS: Record<string, number> = {
    session_single: 2000,
    session_3pack: 5000,
    session_gift: 2000,
};

export async function POST(req: Request) {
    // Rate limit by IP to prevent replay flooding
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const rl = checkRateLimit(`webhook-ip:${ip}`, WEBHOOK_LIMIT);
    if (!rl.allowed) return rateLimitResponse(rl.resetMs);

    const body = await req.text();
    const signature = req.headers.get('stripe-signature');

    if (!signature) {
        return Response.json({ error: 'Missing signature.' }, { status: 400 });
    }

    let event: Stripe.Event;

    try {
        event = stripe.webhooks.constructEvent(body, signature, WEBHOOK_SECRET);
    } catch (err: any) {
        console.error('Webhook signature verification failed:', err.message);
        return Response.json({ error: 'Invalid signature.' }, { status: 400 });
    }

    // ─── Handle payment_intent.succeeded (session purchases) ───
    if (event.type === 'payment_intent.succeeded') {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        const { uid, plan } = paymentIntent.metadata;

        if (!uid || !plan) {
            console.warn('Webhook: PaymentIntent missing uid/plan metadata, skipping.');
            return Response.json({ received: true });
        }

        // Check if already processed (idempotent)
        const userDoc = await db.collection('users').doc(uid).get();
        const existing = userDoc.data();

        // ─── SESSION PURCHASE ──────────────────────────────────
        if (plan.startsWith('session_')) {
            const credits = SESSION_CREDITS[plan];
            if (!credits) {
                console.warn(`Webhook: Unknown session plan "${plan}", skipping.`);
                return Response.json({ received: true });
            }

            // Gift sessions: credit is held in the gift code, not granted to the buyer
            if (plan === 'session_gift') {
                console.log(`Webhook: Gift payment received for user ${uid} — credit held for gift code.`);
                return Response.json({ received: true });
            }

            // Check idempotency against session_purchases
            const existingPurchases = existing?.session_purchases || [];
            if (existingPurchases.some((p: any) => p.id === paymentIntent.id)) {
                return Response.json({ received: true, note: 'Already processed.' });
            }

            // Increment credits and log purchase
            await db.collection('users').doc(uid).set(
                {
                    session_credits: FieldValue.increment(credits),
                    total_sessions_purchased: FieldValue.increment(credits),
                    session_purchases: FieldValue.arrayUnion({
                        id: paymentIntent.id,
                        type: plan,
                        amount: SESSION_AMOUNTS[plan] || paymentIntent.amount,
                        credits,
                        purchasedAt: new Date().toISOString(),
                    }),
                },
                { merge: true }
            );

            console.log(`Webhook: Added ${credits} session credit(s) for user ${uid} (${plan})`);
            return Response.json({ received: true });
        }

        // ─── LEGACY SUBSCRIPTION PURCHASE (proving_ground, long_game) ──
        if (existing?.subscription?.paymentIntentId === paymentIntent.id) {
            return Response.json({ received: true, note: 'Already processed.' });
        }

        // Compute expiration
        const now = new Date();
        const expiry = new Date(now);

        if (plan === 'proving_ground') {
            expiry.setDate(expiry.getDate() + 30);
        } else {
            // long_game: 1 year
            expiry.setFullYear(expiry.getFullYear() + 1);
        }

        const subscribedUntil = expiry.toISOString();

        // Write subscription
        await db.collection('users').doc(uid).set(
            {
                subscription: {
                    status: 'active',
                    plan,
                    paymentIntentId: paymentIntent.id,
                    subscribedAt: now.toISOString(),
                    subscribedUntil,
                    grantedBy: 'stripe',
                },
            },
            { merge: true }
        );

        console.log(`Webhook: Activated ${plan} for user ${uid}`);
    }

    // ─── Handle invoice.payment_succeeded (Archangel subscription renewals) ──
    if (event.type === 'invoice.payment_succeeded') {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = (invoice as any).subscription as string | null;

        if (!subscriptionId) {
            return Response.json({ received: true });
        }

        // Retrieve the subscription to get metadata and period info
        const stripeSub = await stripe.subscriptions.retrieve(subscriptionId);
        const uid = stripeSub.metadata?.uid;

        if (!uid) {
            console.warn('Webhook: invoice.payment_succeeded — subscription missing uid metadata, skipping.');
            return Response.json({ received: true });
        }

        const currentPeriodEnd = new Date(stripeSub.items.data[0]?.current_period_end
            ? stripeSub.items.data[0].current_period_end * 1000
            : (stripeSub as any).current_period_end * 1000
        ).toISOString();

        // Idempotency: check if we already processed this invoice
        const userDoc = await db.collection('users').doc(uid).get();
        const existingSub = userDoc.data()?.subscription;
        if (existingSub?.lastInvoiceId === invoice.id) {
            return Response.json({ received: true, note: 'Already processed.' });
        }

        await db.collection('users').doc(uid).set(
            {
                subscription: {
                    status: 'active',
                    plan: 'archangel',
                    stripeSubscriptionId: subscriptionId,
                    stripeCustomerId: invoice.customer as string,
                    subscribedAt: existingSub?.subscribedAt || new Date().toISOString(),
                    currentPeriodEnd,
                    cancelAtPeriodEnd: stripeSub.cancel_at_period_end,
                    grantedBy: 'stripe',
                    lastInvoiceId: invoice.id,
                },
            },
            { merge: true }
        );

        console.log(`Webhook: Archangel renewal succeeded for user ${uid}, next period ends ${currentPeriodEnd}`);
    }

    // ─── Handle invoice.payment_failed (card declined on renewal) ──
    if (event.type === 'invoice.payment_failed') {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = (invoice as any).subscription as string | null;

        if (!subscriptionId) {
            return Response.json({ received: true });
        }

        const stripeSub = await stripe.subscriptions.retrieve(subscriptionId);
        const uid = stripeSub.metadata?.uid;

        if (!uid) {
            console.warn('Webhook: invoice.payment_failed — subscription missing uid metadata, skipping.');
            return Response.json({ received: true });
        }

        await db.collection('users').doc(uid).set(
            {
                subscription: {
                    status: 'past_due',
                    paymentFailedAt: new Date().toISOString(),
                },
            },
            { merge: true }
        );

        console.log(`Webhook: Payment failed for user ${uid} on subscription ${subscriptionId}`);
    }

    // ─── Handle customer.subscription.deleted (subscription fully expired) ──
    if (event.type === 'customer.subscription.deleted') {
        const stripeSub = event.data.object as Stripe.Subscription;
        const uid = stripeSub.metadata?.uid;

        if (!uid) {
            console.warn('Webhook: customer.subscription.deleted — missing uid metadata, skipping.');
            return Response.json({ received: true });
        }

        await db.collection('users').doc(uid).set(
            {
                subscription: {
                    status: 'expired',
                    expiredAt: new Date().toISOString(),
                },
            },
            { merge: true }
        );

        console.log(`Webhook: Subscription expired for user ${uid}`);
    }

    return Response.json({ received: true });
}
