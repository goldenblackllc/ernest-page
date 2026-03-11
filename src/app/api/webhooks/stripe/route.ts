import Stripe from 'stripe';
import { db } from '@/lib/firebase/admin';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: '2026-02-25.clover',
});

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET!;

const PLAN_AMOUNTS: Record<string, number> = {
    proving_ground: 12000,
    long_game: 120000,
};

export async function POST(req: Request) {
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

    // ─── Handle payment_intent.succeeded ────────────────────────
    if (event.type === 'payment_intent.succeeded') {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        const { uid, plan } = paymentIntent.metadata;

        if (!uid || !plan) {
            console.warn('Webhook: PaymentIntent missing uid/plan metadata, skipping.');
            return Response.json({ received: true });
        }

        // Check if subscription already exists (idempotent)
        const userDoc = await db.collection('users').doc(uid).get();
        const existing = userDoc.data()?.subscription;
        if (existing?.paymentIntentId === paymentIntent.id) {
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

    return Response.json({ received: true });
}
