import Stripe from 'stripe';
import { db, FieldValue } from '@/lib/firebase/admin';
import { verifyAuth, unauthorizedResponse } from '@/lib/auth/serverAuth';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: '2026-02-25.clover',
});

// Session tier → number of credits granted (same map as webhook)
const SESSION_CREDITS: Record<string, number> = {
    session_single: 1,
    session_3pack: 3,
};

// Session tier → amount in cents (for purchase record)
const SESSION_AMOUNTS: Record<string, number> = {
    session_single: 2000,
    session_3pack: 5000,
};

/**
 * POST /api/confirm-purchase
 *
 * Called by the client immediately after Stripe confirms payment on the frontend.
 * Verifies the PaymentIntent with Stripe's API, then atomically credits Firestore.
 * Idempotent — if the webhook already credited the account, this is a no-op.
 */
export async function POST(req: Request) {
    try {
        const uid = await verifyAuth(req);
        if (!uid) return unauthorizedResponse();

        const { paymentIntentId } = await req.json();

        if (!paymentIntentId || typeof paymentIntentId !== 'string') {
            return Response.json({ error: 'Missing paymentIntentId.' }, { status: 400 });
        }

        // ─── Verify with Stripe directly ───────────────────────
        const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

        if (paymentIntent.status !== 'succeeded') {
            return Response.json(
                { error: 'Payment has not succeeded.', status: paymentIntent.status },
                { status: 402 }
            );
        }

        // Verify the PaymentIntent belongs to this user
        if (paymentIntent.metadata?.uid !== uid) {
            return Response.json({ error: 'Payment does not belong to this user.' }, { status: 403 });
        }

        const plan = paymentIntent.metadata?.plan;
        if (!plan || !plan.startsWith('session_')) {
            return Response.json({ error: 'Not a session purchase.' }, { status: 400 });
        }

        // Gift sessions are handled separately — credit goes to the gift code, not the buyer
        if (plan === 'session_gift') {
            return Response.json({ confirmed: true, credits: 0, note: 'Gift — credit held for recipient.' });
        }

        const credits = SESSION_CREDITS[plan];
        if (!credits) {
            return Response.json({ error: `Unknown session plan "${plan}".` }, { status: 400 });
        }

        // ─── Idempotency check (same as webhook) ──────────────
        const userDoc = await db.collection('users').doc(uid).get();
        const existingPurchases = userDoc.data()?.session_purchases || [];

        if (existingPurchases.some((p: any) => p.id === paymentIntentId)) {
            // Already processed (by webhook or a previous call) — return success without re-crediting
            const currentCredits = userDoc.data()?.session_credits || 0;
            return Response.json({ confirmed: true, credits: currentCredits, alreadyProcessed: true });
        }

        // ─── Credit the account ────────────────────────────────
        await db.collection('users').doc(uid).set(
            {
                session_credits: FieldValue.increment(credits),
                total_sessions_purchased: FieldValue.increment(credits),
                session_purchases: FieldValue.arrayUnion({
                    id: paymentIntentId,
                    type: plan,
                    amount: SESSION_AMOUNTS[plan] || paymentIntent.amount,
                    credits,
                    purchasedAt: new Date().toISOString(),
                }),
            },
            { merge: true }
        );

        // Read back the updated credit count
        const updatedDoc = await db.collection('users').doc(uid).get();
        const updatedCredits = updatedDoc.data()?.session_credits || credits;

        console.log(`ConfirmPurchase: Added ${credits} credit(s) for user ${uid} (${plan})`);

        return Response.json({ confirmed: true, credits: updatedCredits });
    } catch (error: any) {
        console.error('Confirm Purchase Error:', error);
        return Response.json(
            { error: error.message || 'Failed to confirm purchase.' },
            { status: 500 }
        );
    }
}
