import Stripe from 'stripe';
import { db } from '@/lib/firebase/admin';
import { verifyAuth, unauthorizedResponse } from '@/lib/auth/serverAuth';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: '2026-02-25.clover',
});

/**
 * POST /api/archangel/resubscribe
 *
 * Reactivates an Archangel subscription that was canceled (cancel_at_period_end)
 * but has not yet expired. Removes the cancellation so it renews normally.
 */
export async function POST(req: Request) {
    try {
        const uid = await verifyAuth(req);
        if (!uid) return unauthorizedResponse();

        const userDoc = await db.collection('users').doc(uid).get();
        const sub = userDoc.data()?.subscription;

        if (!sub?.stripeSubscriptionId) {
            return Response.json(
                { error: 'No subscription found to reactivate.' },
                { status: 400 }
            );
        }

        // Check the subscription is still valid in Stripe
        const stripeSub = await stripe.subscriptions.retrieve(sub.stripeSubscriptionId);

        if (stripeSub.status === 'canceled') {
            return Response.json(
                { error: 'Subscription has already expired. Please start a new subscription.' },
                { status: 400 }
            );
        }

        if (!stripeSub.cancel_at_period_end) {
            return Response.json(
                { error: 'Subscription is already active.' },
                { status: 400 }
            );
        }

        // Remove cancel_at_period_end
        await stripe.subscriptions.update(sub.stripeSubscriptionId, {
            cancel_at_period_end: false,
        });

        // Update Firestore
        await db.collection('users').doc(uid).set(
            {
                subscription: {
                    ...sub,
                    status: 'active',
                    cancelAtPeriodEnd: false,
                    canceledAt: null,
                },
            },
            { merge: true }
        );

        console.log(`[Resubscribe] Reactivated subscription for user ${uid}`);

        return Response.json({ success: true });
    } catch (error: any) {
        console.error('Resubscribe Error:', error);
        return Response.json(
            { error: error.message || 'Failed to resubscribe.' },
            { status: 500 }
        );
    }
}
