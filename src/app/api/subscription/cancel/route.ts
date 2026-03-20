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

        const now = new Date();

        // ─── ARCHANGEL (Stripe Subscription) ───────────────────
        if (subscription.stripeSubscriptionId) {
            const subscribedAt = new Date(subscription.subscribedAt);
            const daysSinceSubscription = Math.floor(
                (now.getTime() - subscribedAt.getTime()) / (1000 * 60 * 60 * 24)
            );
            const isWithinGracePeriod = daysSinceSubscription <= 7;

            if (isWithinGracePeriod) {
                // Immediate cancel + refund
                try {
                    await stripe.subscriptions.cancel(subscription.stripeSubscriptionId);
                    // Refund the latest invoice
                    const stripeSub = await stripe.subscriptions.retrieve(subscription.stripeSubscriptionId);
                    if (stripeSub.latest_invoice) {
                        const invoiceId = typeof stripeSub.latest_invoice === 'string'
                            ? stripeSub.latest_invoice
                            : stripeSub.latest_invoice.id;
                        const invoice = await stripe.invoices.retrieve(invoiceId) as any;
                        if (invoice.payment_intent) {
                            const piId = typeof invoice.payment_intent === 'string'
                                ? invoice.payment_intent
                                : invoice.payment_intent.id;
                            await stripe.refunds.create({ payment_intent: piId });
                            console.log(`[Cancel] Refund issued for user ${uid}`);
                        }
                    }
                } catch (refundError: any) {
                    console.error(`[Cancel] Refund failed for user ${uid}:`, refundError.message);
                }

                await db.collection('users').doc(uid).set(
                    {
                        subscription: {
                            ...subscription,
                            status: 'canceled',
                            canceledAt: now.toISOString(),
                            refunded: true,
                        },
                    },
                    { merge: true }
                );

                return NextResponse.json({
                    success: true,
                    refunded: true,
                    accessUntil: now.toISOString(),
                });
            } else {
                // Cancel at period end — user keeps access until current billing cycle ends
                await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
                    cancel_at_period_end: true,
                });

                await db.collection('users').doc(uid).set(
                    {
                        subscription: {
                            ...subscription,
                            cancelAtPeriodEnd: true,
                            canceledAt: now.toISOString(),
                        },
                    },
                    { merge: true }
                );

                const accessUntil = subscription.currentPeriodEnd || subscription.subscribedUntil;

                console.log(`[Cancel] Subscription set to cancel at period end for user ${uid}`);

                return NextResponse.json({
                    success: true,
                    refunded: false,
                    accessUntil,
                });
            }
        }

        // ─── LEGACY (PaymentIntent-based: proving_ground, long_game) ──
        const subscribedAt = new Date(subscription.subscribedAt);
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
