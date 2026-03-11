import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { db } from '@/lib/firebase/admin';
import { getAuth } from 'firebase-admin/auth';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: '2026-02-25.clover',
});

export async function POST(req: Request) {
    try {
        // Verify Firebase auth token
        const authHeader = req.headers.get('authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const token = authHeader.split('Bearer ')[1];
        const decoded = await getAuth().verifyIdToken(token);
        const uid = decoded.uid;

        // Get the user's subscription
        const userDoc = await db.collection('users').doc(uid).get();
        const userData = userDoc.data();
        const subscription = userData?.subscription;

        if (!subscription || subscription.status !== 'active') {
            return NextResponse.json({ error: 'No active subscription found.' }, { status: 400 });
        }

        const subscribedAt = new Date(subscription.subscribedAt);
        const now = new Date();
        const daysSinceSubscription = Math.floor(
            (now.getTime() - subscribedAt.getTime()) / (1000 * 60 * 60 * 24)
        );
        const isWithinGracePeriod = daysSinceSubscription <= 7;

        // Attempt Stripe refund if within grace period
        if (isWithinGracePeriod && subscription.paymentIntentId) {
            try {
                await stripe.refunds.create({
                    payment_intent: subscription.paymentIntentId,
                });
                console.log(`[Cancel] Refund issued for user ${uid}, PI: ${subscription.paymentIntentId}`);
            } catch (refundError: any) {
                console.error(`[Cancel] Refund failed for user ${uid}:`, refundError.message);
                // Continue with cancellation even if refund fails
                // (e.g., already refunded, payment not yet captured, etc.)
            }
        }

        // Update subscription status
        await db.collection('users').doc(uid).set(
            {
                subscription: {
                    ...subscription,
                    status: 'canceled',
                    canceledAt: now.toISOString(),
                    refunded: isWithinGracePeriod,
                },
            },
            { merge: true }
        );

        console.log(
            `[Cancel] Subscription canceled for user ${uid}. Refunded: ${isWithinGracePeriod}. Days since sub: ${daysSinceSubscription}`
        );

        return NextResponse.json({
            success: true,
            refunded: isWithinGracePeriod,
            accessUntil: isWithinGracePeriod ? now.toISOString() : subscription.subscribedUntil,
        });
    } catch (error: any) {
        console.error('[Cancel] Error:', error.message);
        return NextResponse.json({ error: error.message || 'Cancellation failed.' }, { status: 500 });
    }
}
