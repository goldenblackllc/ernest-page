import Stripe from 'stripe';
import { db, FieldValue } from '@/lib/firebase/admin';
import { verifyAuth, unauthorizedResponse } from '@/lib/auth/serverAuth';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: '2026-02-25.clover',
});

/**
 * POST /api/refund-session
 * Self-service refund for a session purchase.
 * Body: { paymentIntentId: string }
 * Refunds directly via Stripe, verified by checking the payment intent's metadata.
 */
export async function POST(req: Request) {
    try {
        const uid = await verifyAuth(req);
        if (!uid) return unauthorizedResponse();

        const { paymentIntentId } = await req.json();
        if (!paymentIntentId) {
            return Response.json({ error: 'Payment ID is required.' }, { status: 400 });
        }

        // ─── Fetch the payment intent from Stripe ───────────────
        let paymentIntent: Stripe.PaymentIntent;
        try {
            paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
        } catch {
            return Response.json({ error: 'Payment not found.' }, { status: 404 });
        }

        // Verify this payment belongs to this user
        if (paymentIntent.metadata?.uid !== uid) {
            return Response.json({ error: 'Unauthorized.' }, { status: 403 });
        }

        // Check it was successful
        if (paymentIntent.status !== 'succeeded') {
            return Response.json({ error: 'This payment cannot be refunded.' }, { status: 400 });
        }

        // Check if already refunded
        if (paymentIntent.amount_received <= 0) {
            return Response.json({ error: 'This payment has already been refunded.' }, { status: 400 });
        }

        // Check purchase age — only within 7 days
        const paymentDate = new Date(paymentIntent.created * 1000);
        const daysSince = Math.floor((Date.now() - paymentDate.getTime()) / (1000 * 60 * 60 * 24));
        if (daysSince > 7) {
            return Response.json(
                { error: 'Refunds are available within 7 days of purchase.' },
                { status: 400 }
            );
        }

        // ─── Trust tier check ───────────────────────────────────
        const userDoc = await db.collection('users').doc(uid).get();
        const data = userDoc.data() || {};
        const totalPurchased = data.total_sessions_purchased || 0;
        const refundCount = data.refund_count || 0;

        const getRefundsAllowed = (total: number, refunds: number): number => {
            const ratio = total > 0 ? refunds / total : 0;
            if (ratio > 0.4 && total >= 3) return 0;
            if (total <= 3) return 1;
            if (total <= 15) return Math.floor(total / 5);
            return Math.floor(total / 3);
        };

        const refundsAllowed = getRefundsAllowed(totalPurchased, refundCount);
        if (refundCount >= refundsAllowed) {
            return Response.json(
                { error: 'You\'ve reached your refund limit. Contact support for assistance.' },
                { status: 400 }
            );
        }

        // ─── Process Stripe refund ──────────────────────────────
        try {
            await stripe.refunds.create({
                payment_intent: paymentIntentId,
            });
        } catch (stripeError: any) {
            // Check if already refunded via Stripe
            if (stripeError.code === 'charge_already_refunded') {
                return Response.json({ error: 'This payment has already been refunded.' }, { status: 400 });
            }
            console.error('Stripe refund error:', stripeError);
            return Response.json(
                { error: 'Refund failed. Please contact support.' },
                { status: 500 }
            );
        }

        // ─── Update Firestore ───────────────────────────────────
        await db.collection('users').doc(uid).update({
            refund_count: FieldValue.increment(1),
        });

        const amount = `$${(paymentIntent.amount / 100).toFixed(2)}`;

        return Response.json({
            success: true,
            message: `Refund of ${amount} processed successfully.`,
            amount,
        });
    } catch (error: any) {
        console.error('Refund Session Error:', error);
        return Response.json(
            { error: error.message || 'Failed to process refund.' },
            { status: 500 }
        );
    }
}
