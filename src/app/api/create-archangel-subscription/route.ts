import Stripe from 'stripe';
import { db } from '@/lib/firebase/admin';
import { verifyAuth, unauthorizedResponse } from '@/lib/auth/serverAuth';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: '2026-02-25.clover',
});

const PRICE_ID = process.env.STRIPE_ARCHANGEL_PRICE_ID!;

/**
 * POST /api/create-archangel-subscription
 *
 * Creates (or reuses) a Stripe Customer for the authenticated user,
 * then creates a Stripe Subscription in `incomplete` state so the
 * client can confirm the first payment via Stripe Elements.
 *
 * Returns { clientSecret, subscriptionId }.
 */
export async function POST(req: Request) {
    try {
        const uid = await verifyAuth(req);
        if (!uid) return unauthorizedResponse();

        // ─── Find or create Stripe Customer ────────────────────
        const userDoc = await db.collection('users').doc(uid).get();
        const userData = userDoc.data();
        let customerId = userData?.subscription?.stripeCustomerId;

        if (!customerId) {
            const customer = await stripe.customers.create({
                metadata: { uid },
            });
            customerId = customer.id;
        }

        // ─── Create Subscription (incomplete until first payment) ──
        const subscription = await stripe.subscriptions.create({
            customer: customerId,
            items: [{ price: PRICE_ID }],
            payment_behavior: 'default_incomplete',
            payment_settings: {
                save_default_payment_method: 'on_subscription',
            },
            metadata: { uid, plan: 'archangel' },
            expand: ['latest_invoice.payment_intent'],
        });

        // Extract the clientSecret from the first invoice's PaymentIntent
        const invoice = subscription.latest_invoice as Stripe.Invoice & { payment_intent: Stripe.PaymentIntent };
        const paymentIntent = invoice.payment_intent;

        if (!paymentIntent?.client_secret) {
            return Response.json(
                { error: 'Failed to initialize payment.' },
                { status: 500 }
            );
        }

        // Persist the Stripe Customer ID immediately (even before payment succeeds)
        await db.collection('users').doc(uid).set(
            {
                subscription: {
                    ...(userData?.subscription || {}),
                    stripeCustomerId: customerId,
                },
            },
            { merge: true }
        );

        return Response.json({
            clientSecret: paymentIntent.client_secret,
            subscriptionId: subscription.id,
        });
    } catch (error: any) {
        console.error('Create Archangel Subscription Error:', error);
        return Response.json(
            { error: error.message || 'Failed to create subscription.' },
            { status: 500 }
        );
    }
}
