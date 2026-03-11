import { db } from '@/lib/firebase/admin';
import Stripe from 'stripe';
import { verifyAuth, unauthorizedResponse } from '@/lib/auth/serverAuth';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: '2026-02-25.clover',
});

const PLAN_AMOUNTS: Record<string, number> = {
    proving_ground: 12000,  // $120.00 in cents
    long_game: 120000,      // $1,200.00 in cents
};

export async function POST(req: Request) {
    try {
        const uid = await verifyAuth(req);
        if (!uid) return unauthorizedResponse();

        const body = await req.json();
        const { plan, paymentIntentId } = body;

        if (!plan || !paymentIntentId) {
            return Response.json(
                { error: 'Plan and paymentIntentId are required.' },
                { status: 400 }
            );
        }

        const validPlans = ['proving_ground', 'long_game'];
        if (!validPlans.includes(plan)) {
            return Response.json(
                { error: 'Invalid plan.' },
                { status: 400 }
            );
        }

        // ─── Verify PaymentIntent with Stripe ───────────────────────
        const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

        if (paymentIntent.status !== 'succeeded') {
            return Response.json(
                { error: 'Payment has not succeeded.' },
                { status: 400 }
            );
        }

        const expectedAmount = PLAN_AMOUNTS[plan];
        if (paymentIntent.amount !== expectedAmount) {
            return Response.json(
                { error: 'Payment amount does not match the selected plan.' },
                { status: 400 }
            );
        }

        // ─── Compute expiration ─────────────────────────────────────
        const now = new Date();
        const expiry = new Date(now);

        if (plan === 'proving_ground') {
            expiry.setDate(expiry.getDate() + 30);
        } else {
            // long_game: 1 year
            expiry.setFullYear(expiry.getFullYear() + 1);
        }

        const subscribedUntil = expiry.toISOString();

        // ─── Write subscription to Firestore ────────────────────────
        await db.collection('users').doc(uid).set(
            {
                subscription: {
                    status: 'active',
                    plan,
                    paymentIntentId,
                    subscribedAt: now.toISOString(),
                    subscribedUntil,
                    grantedBy: 'stripe',
                },
            },
            { merge: true }
        );

        return Response.json({ success: true, plan, subscribedUntil });
    } catch (error: any) {
        console.error('Subscribe API Error:', error);
        return Response.json(
            { error: error.message || 'An unexpected error occurred.' },
            { status: 500 }
        );
    }
}
